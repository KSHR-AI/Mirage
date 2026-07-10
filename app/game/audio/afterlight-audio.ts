import type { Vec3 } from "../core/contracts";
import {
  DEFAULT_AFTERLIGHT_AUDIO_STATE,
  MAX_CUE_AUDIO_VOICES,
  MAX_POLICE_AUDIO_SOURCES,
  computeSpatialAudioMix,
  normalizeAudioState,
  type AfterlightAudioState,
} from "./mix";
import {
  AFTERLIGHT_AUDIO_LOOPS,
  AFTERLIGHT_AUDIO_SAMPLE_URLS,
  AFTERLIGHT_CUE_SAMPLE_PROFILES,
  AFTERLIGHT_FOOTSTEP_SAMPLES,
  selectAfterlightSample,
  type AfterlightAudioBus,
  type AfterlightAudioCue,
} from "./sample-catalog";

export type { AfterlightAudioCue } from "./sample-catalog";

export interface AfterlightCueRequest {
  readonly cue: AfterlightAudioCue;
  readonly intensity?: number;
  readonly position?: Vec3;
  readonly token?: string;
}

interface BusNodes {
  readonly ambience: GainNode;
  readonly master: GainNode;
  readonly music: GainNode;
  readonly sfx: GainNode;
  readonly ui: GainNode;
}

interface LoopVoice {
  readonly gain: GainNode;
  readonly panner: StereoPannerNode | null;
  readonly source: AudioBufferSourceNode;
}

interface LoopVoices {
  readonly ambience: LoopVoice | null;
  readonly engineDrive: LoopVoice | null;
  readonly engineIdle: LoopVoice | null;
  readonly police: readonly LoopVoice[];
}

const MASTER_LEVEL = 0.58;
const MAX_FOOTSTEPS_PER_UPDATE = 2;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function setSmooth(
  parameter: AudioParam,
  value: number,
  now: number,
  timeConstant = 0.08,
): void {
  parameter.cancelScheduledValues(now);
  parameter.setTargetAtTime(value, now, timeConstant);
}

function createBuses(context: AudioContext): BusNodes {
  const master = context.createGain();
  const ambience = context.createGain();
  const music = context.createGain();
  const sfx = context.createGain();
  const ui = context.createGain();
  const compressor = context.createDynamicsCompressor();

  master.gain.value = MASTER_LEVEL;
  ambience.gain.value = 0.72;
  music.gain.value = 0.74;
  sfx.gain.value = 0.9;
  ui.gain.value = 0.78;
  compressor.threshold.value = -16;
  compressor.knee.value = 12;
  compressor.ratio.value = 5;
  compressor.attack.value = 0.004;
  compressor.release.value = 0.16;

  ambience.connect(master);
  music.connect(master);
  sfx.connect(master);
  ui.connect(master);
  master.connect(compressor).connect(context.destination);

  return { ambience, master, music, sfx, ui };
}

async function fetchAudioBuffer(
  context: AudioContext,
  url: string,
): Promise<AudioBuffer | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    return await context.decodeAudioData(await response.arrayBuffer());
  } catch {
    return null;
  }
}

function createLoopVoice(
  context: AudioContext,
  buffer: AudioBuffer,
  destination: AudioNode,
  { offset = 0, spatial = false }: { offset?: number; spatial?: boolean } = {},
): LoopVoice {
  const source = context.createBufferSource();
  const gain = context.createGain();
  const panner = spatial ? context.createStereoPanner() : null;
  source.buffer = buffer;
  source.loop = true;
  gain.gain.value = 0;

  if (panner) source.connect(panner).connect(gain).connect(destination);
  else source.connect(gain).connect(destination);

  source.start(
    context.currentTime,
    buffer.duration > 0 ? offset % buffer.duration : 0,
  );
  return { gain, panner, source };
}

function stopLoop(voice: LoopVoice): void {
  try {
    voice.source.stop();
  } catch {
    // A loop can already be stopped while an async load is being disposed.
  }
  voice.source.disconnect();
  voice.panner?.disconnect();
  voice.gain.disconnect();
}

function busFor(nodes: BusNodes, bus: AfterlightAudioBus): GainNode {
  return nodes[bus];
}

function ambienceGain(state: AfterlightAudioState): number {
  const weatherGain = {
    clear: 0.018,
    drizzle: 0.115,
    fog: 0.036,
    wind: 0.055,
  }[state.weather];
  return weatherGain * (state.blackout ? 0.55 : 1) * (state.paused ? 0.22 : 1);
}

export class AfterlightAudioDirector {
  private buffers = new Map<string, AudioBuffer>();
  private buses: BusNodes | null = null;
  private context: AudioContext | null = null;
  private footstepDistance = 0;
  private lastFootPosition: Vec3 | null = null;
  private loadGeneration = 0;
  private loadPromise: Promise<void> | null = null;
  private loops: LoopVoices | null = null;
  private muted = false;
  private oneShots: AudioBufferSourceNode[] = [];
  private previousMode: AfterlightAudioState["mode"] = "foot";
  private sequence = 0;
  private state: AfterlightAudioState = DEFAULT_AFTERLIGHT_AUDIO_STATE;

  async start(): Promise<void> {
    if (this.context) {
      await this.context.resume();
      await this.loadPromise;
      return;
    }

    const AudioContextConstructor =
      window.AudioContext ??
      (window as typeof window & { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioContextConstructor) return;

    const context = new AudioContextConstructor();
    const buses = createBuses(context);
    const generation = ++this.loadGeneration;
    this.context = context;
    this.buses = buses;
    buses.master.gain.value = this.muted ? 0 : MASTER_LEVEL;
    this.loadPromise = this.loadSamples(context, buses, generation);
    await context.resume();
    await this.loadPromise;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (!this.context || !this.buses) return;
    setSmooth(
      this.buses.master.gain,
      muted ? 0 : MASTER_LEVEL,
      this.context.currentTime,
      0.045,
    );
  }

  setPaused(paused: boolean): void {
    if (this.state.paused === paused) return;
    this.update({ ...this.state, paused });
  }

  update(rawState: AfterlightAudioState): void {
    const state = normalizeAudioState(rawState);
    const previousMode = this.previousMode;
    this.state = state;
    this.previousMode = state.mode;

    if (previousMode !== state.mode) {
      this.cue(state.mode === "vehicle" ? "vehicle-enter" : "vehicle-exit");
    }

    this.updateFootsteps(state);
    if (!this.context || !this.loops) return;

    const now = this.context.currentTime;
    const speed = clamp(state.speedKph / 180, 0, 1);
    const driving = state.mode === "vehicle" && !state.paused ? 1 : 0;
    const enginePressure = clamp(state.engineLoad * 0.68 + speed * 0.32, 0, 1);

    if (this.loops.ambience) {
      setSmooth(this.loops.ambience.gain.gain, ambienceGain(state), now, 0.28);
    }

    if (this.loops.engineIdle) {
      setSmooth(
        this.loops.engineIdle.source.playbackRate,
        0.86 + enginePressure * 0.28,
        now,
        0.06,
      );
      setSmooth(
        this.loops.engineIdle.gain.gain,
        driving * (0.13 - speed * 0.09),
        now,
        0.09,
      );
    }
    if (this.loops.engineDrive) {
      setSmooth(
        this.loops.engineDrive.source.playbackRate,
        0.72 + speed * 0.78 + enginePressure * 0.12,
        now,
        0.06,
      );
      setSmooth(
        this.loops.engineDrive.gain.gain,
        driving * (0.025 + speed * 0.18) * (0.66 + enginePressure * 0.34),
        now,
        0.08,
      );
    }

    this.loops.police.forEach((voice, index) => {
      const emitter = state.police[index];
      const spatial = emitter
        ? computeSpatialAudioMix(
            state.listenerPosition,
            state.listenerYaw,
            emitter.position,
            emitter.intensity,
          )
        : null;
      const wantedGain = state.wantedLevel / 3;
      setSmooth(
        voice.gain.gain,
        (spatial?.gain ?? 0) * wantedGain * (state.paused ? 0.18 : 0.24),
        now,
        0.12,
      );
      if (voice.panner) {
        setSmooth(voice.panner.pan, spatial?.pan ?? 0, now, 0.07);
      }
    });
  }

  cue(request: AfterlightCueRequest | AfterlightAudioCue): void {
    const normalized = typeof request === "string" ? { cue: request } : request;
    if (!this.context || !this.buses || this.muted) return;

    const profile = AFTERLIGHT_CUE_SAMPLE_PROFILES[normalized.cue];
    const path = selectAfterlightSample(
      profile.paths,
      normalized.token,
      this.sequence++,
    );
    if (!this.buffers.has(path)) return;

    this.playOneShot({
      bus: profile.bus,
      gain: profile.gain * clamp(normalized.intensity ?? 1, 0.25, 1.35),
      path,
      playbackRate: profile.playbackRate ?? 1,
      position: normalized.position,
    });
  }

  async dispose(): Promise<void> {
    const context = this.context;
    ++this.loadGeneration;
    this.loadPromise = null;
    this.context = null;
    this.buses = null;
    this.buffers.clear();
    this.lastFootPosition = null;
    this.footstepDistance = 0;

    if (this.loops) {
      if (this.loops.ambience) stopLoop(this.loops.ambience);
      if (this.loops.engineDrive) stopLoop(this.loops.engineDrive);
      if (this.loops.engineIdle) stopLoop(this.loops.engineIdle);
      this.loops.police.forEach(stopLoop);
      this.loops = null;
    }
    for (const source of this.oneShots) {
      try {
        source.stop();
      } catch {
        // A one-shot may have completed between the render frame and disposal.
      }
    }
    this.oneShots = [];
    if (context) await context.close();
  }

  private async loadSamples(
    context: AudioContext,
    buses: BusNodes,
    generation: number,
  ): Promise<void> {
    const decoded = await Promise.all(
      AFTERLIGHT_AUDIO_SAMPLE_URLS.map(async (url) => ({
        buffer: await fetchAudioBuffer(context, url),
        url,
      })),
    );
    if (this.context !== context || this.loadGeneration !== generation) return;

    for (const entry of decoded) {
      if (entry.buffer) this.buffers.set(entry.url, entry.buffer);
    }

    const ambience = this.buffers.get(AFTERLIGHT_AUDIO_LOOPS.ambience);
    const engineDrive = this.buffers.get(AFTERLIGHT_AUDIO_LOOPS.engineDrive);
    const engineIdle = this.buffers.get(AFTERLIGHT_AUDIO_LOOPS.engineIdle);
    const policeSiren = this.buffers.get(AFTERLIGHT_AUDIO_LOOPS.policeSiren);
    this.loops = {
      ambience: ambience
        ? createLoopVoice(context, ambience, buses.ambience)
        : null,
      engineDrive: engineDrive
        ? createLoopVoice(context, engineDrive, buses.sfx)
        : null,
      engineIdle: engineIdle
        ? createLoopVoice(context, engineIdle, buses.sfx)
        : null,
      police: policeSiren
        ? Array.from({ length: MAX_POLICE_AUDIO_SOURCES }, (_, index) =>
            createLoopVoice(context, policeSiren, buses.ambience, {
              offset: index * 1.37,
              spatial: true,
            }),
          )
        : [],
    };
    this.update(this.state);
  }

  private playOneShot({
    bus,
    gain,
    path,
    playbackRate,
    position,
  }: {
    readonly bus: AfterlightAudioBus;
    readonly gain: number;
    readonly path: string;
    readonly playbackRate: number;
    readonly position?: Vec3;
  }): void {
    if (!this.context || !this.buses || this.muted) return;
    const buffer = this.buffers.get(path);
    if (!buffer) return;

    while (this.oneShots.length >= MAX_CUE_AUDIO_VOICES) {
      const oldest = this.oneShots.shift();
      try {
        oldest?.stop();
      } catch {
        // It may have ended naturally before the voice was reclaimed.
      }
    }

    const source = this.context.createBufferSource();
    const panner = this.context.createStereoPanner();
    const gainNode = this.context.createGain();
    const spatial = position
      ? computeSpatialAudioMix(
          this.state.listenerPosition,
          this.state.listenerYaw,
          position,
          1,
          72,
        )
      : { gain: 1, pan: 0 };

    source.buffer = buffer;
    source.playbackRate.value = clamp(playbackRate, 0.5, 1.6);
    panner.pan.value = spatial.pan;
    gainNode.gain.value = gain * spatial.gain;
    source.connect(panner).connect(gainNode).connect(busFor(this.buses, bus));
    this.oneShots.push(source);
    source.onended = () => {
      this.oneShots = this.oneShots.filter((voice) => voice !== source);
      source.disconnect();
      panner.disconnect();
      gainNode.disconnect();
    };
    source.start();
  }

  private updateFootsteps(state: AfterlightAudioState): void {
    const position = state.listenerPosition;
    const previous = this.lastFootPosition;
    this.lastFootPosition = [position[0], position[1], position[2]];

    if (
      !previous ||
      !this.buffers.has(AFTERLIGHT_FOOTSTEP_SAMPLES[0]) ||
      state.mode !== "foot" ||
      state.paused ||
      !state.grounded ||
      state.speedKph < 1.2
    ) {
      this.footstepDistance = 0;
      return;
    }

    const distance = Math.hypot(
      position[0] - previous[0],
      position[2] - previous[2],
    );
    if (distance > 2.5) {
      this.footstepDistance = 0;
      return;
    }

    this.footstepDistance += distance;
    const sprinting = state.speedKph > 14.5;
    const stride = sprinting ? 1.04 : 0.88;
    let steps = 0;
    while (
      this.footstepDistance >= stride &&
      steps < MAX_FOOTSTEPS_PER_UPDATE
    ) {
      this.footstepDistance -= stride;
      const sequence = this.sequence++;
      this.playOneShot({
        bus: "sfx",
        gain: sprinting ? 0.29 : 0.22,
        path: selectAfterlightSample(
          AFTERLIGHT_FOOTSTEP_SAMPLES,
          undefined,
          sequence,
        ),
        playbackRate: 0.96 + (sequence % 5) * 0.02,
      });
      steps += 1;
    }
  }
}
