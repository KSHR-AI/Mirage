import type { Vec3 } from "../core/contracts";
import {
  DEFAULT_AFTERLIGHT_AUDIO_STATE,
  MAX_CUE_AUDIO_VOICES,
  MAX_POLICE_AUDIO_SOURCES,
  computeAfterlightAudioMix,
  computeSpatialAudioMix,
  type AfterlightAudioState,
} from "./mix";
import { DeterministicCuePool } from "./pool";

export type AfterlightAudioCue =
  | "blackout"
  | "cash"
  | "death"
  | "empty"
  | "impact"
  | "mission-complete"
  | "mission-phase"
  | "objective"
  | "reload"
  | "vehicle-enter"
  | "vehicle-exit"
  | "weapon-fire";

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

interface LoopNodes {
  readonly blackout: OscillatorNode;
  readonly blackoutFilter: BiquadFilterNode;
  readonly blackoutGain: GainNode;
  readonly districtNoise: AudioBufferSourceNode;
  readonly districtNoiseFilter: BiquadFilterNode;
  readonly districtNoiseGain: GainNode;
  readonly districtTone: OscillatorNode;
  readonly districtToneGain: GainNode;
  readonly engineHigh: OscillatorNode;
  readonly engineHighFilter: BiquadFilterNode;
  readonly engineHighGain: GainNode;
  readonly engineLow: OscillatorNode;
  readonly engineLowFilter: BiquadFilterNode;
  readonly engineLowGain: GainNode;
  readonly engineMid: OscillatorNode;
  readonly engineMidFilter: BiquadFilterNode;
  readonly engineMidGain: GainNode;
  readonly heartbeat: OscillatorNode;
  readonly heartbeatGain: GainNode;
  readonly pursuit: OscillatorNode;
  readonly pursuitFilter: BiquadFilterNode;
  readonly pursuitGain: GainNode;
  readonly weatherNoise: AudioBufferSourceNode;
  readonly weatherNoiseFilter: BiquadFilterNode;
  readonly weatherNoiseGain: GainNode;
}

interface PoliceVoiceNodes {
  readonly gain: GainNode;
  readonly oscillator: OscillatorNode;
  readonly panner: StereoPannerNode;
}

interface CueVoiceNodes {
  readonly gain: GainNode;
  readonly musicSend: GainNode;
  readonly noise: AudioBufferSourceNode;
  readonly noiseFilter: BiquadFilterNode;
  readonly noiseGain: GainNode;
  readonly oscillator: OscillatorNode;
  readonly panner: StereoPannerNode;
  readonly sfxSend: GainNode;
  readonly toneFilter: BiquadFilterNode;
  readonly toneGain: GainNode;
  readonly uiSend: GainNode;
}

interface CueLayer {
  readonly attack: number;
  readonly bus: keyof Pick<BusNodes, "music" | "sfx" | "ui">;
  readonly duration: number;
  readonly endFrequency?: number;
  readonly filterFrequency?: number;
  readonly filterQ?: number;
  readonly filterType?: BiquadFilterType;
  readonly noiseGain?: number;
  readonly priority: number;
  readonly startFrequency: number;
  readonly toneGain?: number;
  readonly type: OscillatorType;
}

const MASTER_LEVEL = 0.42;
const NOISE_BUFFER_SECONDS = 2.4;

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

function envelope(
  gain: AudioParam,
  now: number,
  peak: number,
  attack: number,
  release: number,
): void {
  gain.cancelScheduledValues(now);
  if (peak <= 0.00011) {
    gain.setValueAtTime(0, now);
    return;
  }
  gain.setValueAtTime(0.0001, now);
  gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), now + attack);
  gain.exponentialRampToValueAtTime(0.0001, now + attack + release);
}

function createNoiseBuffer(
  context: AudioContext,
  seconds: number,
): AudioBuffer {
  const frameCount = Math.ceil(context.sampleRate * seconds);
  const buffer = context.createBuffer(1, frameCount, context.sampleRate);
  const channel = buffer.getChannelData(0);
  let state = 0x2f6e2b1;

  for (let index = 0; index < frameCount; index += 1) {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    channel[index] = ((state >>> 0) / 0xffffffff) * 2 - 1;
  }

  return buffer;
}

function createBuses(context: AudioContext): BusNodes {
  const master = context.createGain();
  const ambience = context.createGain();
  const music = context.createGain();
  const sfx = context.createGain();
  const ui = context.createGain();
  const compressor = context.createDynamicsCompressor();

  master.gain.value = MASTER_LEVEL;
  ambience.gain.value = 0.78;
  music.gain.value = 0.72;
  sfx.gain.value = 0.92;
  ui.gain.value = 0.88;
  compressor.threshold.value = -18;
  compressor.knee.value = 14;
  compressor.ratio.value = 6;
  compressor.attack.value = 0.004;
  compressor.release.value = 0.18;

  ambience.connect(master);
  music.connect(master);
  sfx.connect(master);
  ui.connect(master);
  master.connect(compressor).connect(context.destination);

  return { ambience, master, music, sfx, ui };
}

function createLoopNodes(
  context: AudioContext,
  buses: BusNodes,
  noiseBuffer: AudioBuffer,
): LoopNodes {
  const districtNoise = context.createBufferSource();
  const districtNoiseFilter = context.createBiquadFilter();
  const districtNoiseGain = context.createGain();
  districtNoise.buffer = noiseBuffer;
  districtNoise.loop = true;
  districtNoiseFilter.type = "bandpass";
  districtNoiseGain.gain.value = 0;
  districtNoise
    .connect(districtNoiseFilter)
    .connect(districtNoiseGain)
    .connect(buses.ambience);

  const weatherNoise = context.createBufferSource();
  const weatherNoiseFilter = context.createBiquadFilter();
  const weatherNoiseGain = context.createGain();
  weatherNoise.buffer = noiseBuffer;
  weatherNoise.loop = true;
  weatherNoiseFilter.type = "highpass";
  weatherNoiseGain.gain.value = 0;
  weatherNoise
    .connect(weatherNoiseFilter)
    .connect(weatherNoiseGain)
    .connect(buses.ambience);

  const districtTone = context.createOscillator();
  const districtToneGain = context.createGain();
  districtTone.type = "triangle";
  districtToneGain.gain.value = 0;
  districtTone.connect(districtToneGain).connect(buses.ambience);

  const engineLow = context.createOscillator();
  const engineLowFilter = context.createBiquadFilter();
  const engineLowGain = context.createGain();
  engineLow.type = "sawtooth";
  engineLowFilter.type = "lowpass";
  engineLowFilter.frequency.value = 180;
  engineLowGain.gain.value = 0;
  engineLow.connect(engineLowFilter).connect(engineLowGain).connect(buses.sfx);

  const engineMid = context.createOscillator();
  const engineMidFilter = context.createBiquadFilter();
  const engineMidGain = context.createGain();
  engineMid.type = "triangle";
  engineMidFilter.type = "bandpass";
  engineMidFilter.frequency.value = 420;
  engineMidFilter.Q.value = 0.8;
  engineMidGain.gain.value = 0;
  engineMid.connect(engineMidFilter).connect(engineMidGain).connect(buses.sfx);

  const engineHigh = context.createOscillator();
  const engineHighFilter = context.createBiquadFilter();
  const engineHighGain = context.createGain();
  engineHigh.type = "square";
  engineHighFilter.type = "highpass";
  engineHighFilter.frequency.value = 920;
  engineHighGain.gain.value = 0;
  engineHigh
    .connect(engineHighFilter)
    .connect(engineHighGain)
    .connect(buses.sfx);

  const pursuit = context.createOscillator();
  const pursuitFilter = context.createBiquadFilter();
  const pursuitGain = context.createGain();
  pursuit.type = "triangle";
  pursuitFilter.type = "lowpass";
  pursuitFilter.frequency.value = 180;
  pursuitGain.gain.value = 0;
  pursuit.connect(pursuitFilter).connect(pursuitGain).connect(buses.music);

  const heartbeat = context.createOscillator();
  const heartbeatGain = context.createGain();
  heartbeat.type = "sine";
  heartbeatGain.gain.value = 0;
  heartbeat.connect(heartbeatGain).connect(buses.sfx);

  const blackout = context.createOscillator();
  const blackoutFilter = context.createBiquadFilter();
  const blackoutGain = context.createGain();
  blackout.type = "sawtooth";
  blackoutFilter.type = "lowpass";
  blackoutFilter.frequency.value = 96;
  blackoutGain.gain.value = 0;
  blackout
    .connect(blackoutFilter)
    .connect(blackoutGain)
    .connect(buses.ambience);

  districtNoise.start();
  weatherNoise.start();
  districtTone.start();
  engineLow.start();
  engineMid.start();
  engineHigh.start();
  pursuit.start();
  heartbeat.start();
  blackout.start();

  return {
    blackout,
    blackoutFilter,
    blackoutGain,
    districtNoise,
    districtNoiseFilter,
    districtNoiseGain,
    districtTone,
    districtToneGain,
    engineHigh,
    engineHighFilter,
    engineHighGain,
    engineLow,
    engineLowFilter,
    engineLowGain,
    engineMid,
    engineMidFilter,
    engineMidGain,
    heartbeat,
    heartbeatGain,
    pursuit,
    pursuitFilter,
    pursuitGain,
    weatherNoise,
    weatherNoiseFilter,
    weatherNoiseGain,
  };
}

function createPoliceVoice(
  context: AudioContext,
  buses: BusNodes,
): PoliceVoiceNodes {
  const oscillator = context.createOscillator();
  const panner = context.createStereoPanner();
  const gain = context.createGain();
  oscillator.type = "triangle";
  gain.gain.value = 0;
  oscillator.connect(panner).connect(gain).connect(buses.ambience);
  oscillator.start();
  return { gain, oscillator, panner };
}

function createCueVoice(
  context: AudioContext,
  buses: BusNodes,
  noiseBuffer: AudioBuffer,
): CueVoiceNodes {
  const oscillator = context.createOscillator();
  const toneFilter = context.createBiquadFilter();
  const toneGain = context.createGain();
  const noise = context.createBufferSource();
  const noiseFilter = context.createBiquadFilter();
  const noiseGain = context.createGain();
  const panner = context.createStereoPanner();
  const gain = context.createGain();
  const sfxSend = context.createGain();
  const uiSend = context.createGain();
  const musicSend = context.createGain();

  oscillator.type = "sine";
  oscillator.frequency.value = 220;
  toneFilter.type = "lowpass";
  toneFilter.frequency.value = 1200;
  toneGain.gain.value = 0;
  noise.buffer = noiseBuffer;
  noise.loop = true;
  noiseFilter.type = "bandpass";
  noiseFilter.frequency.value = 640;
  noiseFilter.Q.value = 0.72;
  noiseGain.gain.value = 0;
  gain.gain.value = 1;
  sfxSend.gain.value = 1;
  uiSend.gain.value = 0;
  musicSend.gain.value = 0;

  oscillator.connect(toneFilter).connect(toneGain).connect(panner);
  noise.connect(noiseFilter).connect(noiseGain).connect(panner);
  panner.connect(gain);
  gain.connect(sfxSend).connect(buses.sfx);
  gain.connect(uiSend).connect(buses.ui);
  gain.connect(musicSend).connect(buses.music);

  oscillator.start();
  noise.start();

  return {
    gain,
    musicSend,
    noise,
    noiseFilter,
    noiseGain,
    oscillator,
    panner,
    sfxSend,
    toneFilter,
    toneGain,
    uiSend,
  };
}

function cueLayersFor(
  cue: AfterlightAudioCue,
  intensity: number,
): readonly CueLayer[] {
  const scale = clamp(intensity, 0.4, 1.35);

  switch (cue) {
    case "weapon-fire":
      return [
        {
          attack: 0.003,
          bus: "sfx",
          duration: 0.1,
          endFrequency: 92,
          filterFrequency: 980,
          filterType: "bandpass",
          noiseGain: 0.12 * scale,
          priority: 3,
          startFrequency: 188,
          toneGain: 0.085 * scale,
          type: "sawtooth",
        },
      ];
    case "impact":
      return [
        {
          attack: 0.004,
          bus: "sfx",
          duration: 0.16,
          endFrequency: 44,
          filterFrequency: 260,
          filterQ: 0.52,
          filterType: "lowpass",
          noiseGain: 0.11 * scale,
          priority: 3,
          startFrequency: 92,
          toneGain: 0.07 * scale,
          type: "triangle",
        },
      ];
    case "empty":
      return [
        {
          attack: 0.002,
          bus: "sfx",
          duration: 0.05,
          endFrequency: 640,
          filterFrequency: 2200,
          filterType: "highpass",
          priority: 2,
          startFrequency: 920,
          toneGain: 0.05 * scale,
          type: "square",
        },
      ];
    case "reload":
      return [
        {
          attack: 0.004,
          bus: "sfx",
          duration: 0.12,
          endFrequency: 480,
          filterFrequency: 1560,
          filterType: "highpass",
          noiseGain: 0.05 * scale,
          priority: 1,
          startFrequency: 320,
          toneGain: 0.04 * scale,
          type: "square",
        },
      ];
    case "vehicle-enter":
      return [
        {
          attack: 0.006,
          bus: "sfx",
          duration: 0.18,
          endFrequency: 84,
          priority: 1,
          startFrequency: 124,
          toneGain: 0.06 * scale,
          type: "triangle",
        },
      ];
    case "vehicle-exit":
      return [
        {
          attack: 0.006,
          bus: "sfx",
          duration: 0.14,
          endFrequency: 116,
          priority: 1,
          startFrequency: 84,
          toneGain: 0.05 * scale,
          type: "triangle",
        },
      ];
    case "objective":
      return [
        {
          attack: 0.008,
          bus: "ui",
          duration: 0.12,
          endFrequency: 440,
          priority: 2,
          startFrequency: 440,
          toneGain: 0.055 * scale,
          type: "sine",
        },
        {
          attack: 0.008,
          bus: "ui",
          duration: 0.12,
          endFrequency: 554,
          priority: 2,
          startFrequency: 554,
          toneGain: 0.05 * scale,
          type: "sine",
        },
        {
          attack: 0.008,
          bus: "ui",
          duration: 0.14,
          endFrequency: 659,
          priority: 2,
          startFrequency: 659,
          toneGain: 0.055 * scale,
          type: "sine",
        },
      ];
    case "cash":
      return [
        {
          attack: 0.006,
          bus: "ui",
          duration: 0.08,
          endFrequency: 784,
          priority: 2,
          startFrequency: 784,
          toneGain: 0.05 * scale,
          type: "sine",
        },
        {
          attack: 0.006,
          bus: "ui",
          duration: 0.09,
          endFrequency: 988,
          priority: 2,
          startFrequency: 988,
          toneGain: 0.045 * scale,
          type: "sine",
        },
      ];
    case "mission-phase":
      return [
        {
          attack: 0.01,
          bus: "ui",
          duration: 0.18,
          endFrequency: 196,
          priority: 2,
          startFrequency: 196,
          toneGain: 0.05 * scale,
          type: "triangle",
        },
        {
          attack: 0.01,
          bus: "ui",
          duration: 0.2,
          endFrequency: 294,
          priority: 2,
          startFrequency: 294,
          toneGain: 0.045 * scale,
          type: "triangle",
        },
        {
          attack: 0.01,
          bus: "ui",
          duration: 0.22,
          endFrequency: 392,
          priority: 2,
          startFrequency: 392,
          toneGain: 0.04 * scale,
          type: "triangle",
        },
      ];
    case "mission-complete":
      return [
        {
          attack: 0.012,
          bus: "music",
          duration: 0.26,
          endFrequency: 220,
          priority: 3,
          startFrequency: 220,
          toneGain: 0.06 * scale,
          type: "sine",
        },
        {
          attack: 0.012,
          bus: "music",
          duration: 0.28,
          endFrequency: 330,
          priority: 3,
          startFrequency: 330,
          toneGain: 0.055 * scale,
          type: "sine",
        },
        {
          attack: 0.012,
          bus: "music",
          duration: 0.3,
          endFrequency: 440,
          priority: 3,
          startFrequency: 440,
          toneGain: 0.05 * scale,
          type: "sine",
        },
        {
          attack: 0.012,
          bus: "music",
          duration: 0.34,
          endFrequency: 659,
          priority: 3,
          startFrequency: 659,
          toneGain: 0.055 * scale,
          type: "sine",
        },
      ];
    case "blackout":
      return [
        {
          attack: 0.01,
          bus: "music",
          duration: 1.1,
          endFrequency: 26,
          filterFrequency: 160,
          filterType: "lowpass",
          noiseGain: 0.14 * scale,
          priority: 4,
          startFrequency: 96,
          toneGain: 0.11 * scale,
          type: "sawtooth",
        },
      ];
    case "death":
      return [
        {
          attack: 0.012,
          bus: "music",
          duration: 0.9,
          endFrequency: 42,
          priority: 4,
          startFrequency: 174,
          toneGain: 0.08 * scale,
          type: "sawtooth",
        },
      ];
  }
}

function stopLoopNodes(loops: LoopNodes): void {
  loops.districtNoise.stop();
  loops.weatherNoise.stop();
  loops.districtTone.stop();
  loops.engineLow.stop();
  loops.engineMid.stop();
  loops.engineHigh.stop();
  loops.pursuit.stop();
  loops.heartbeat.stop();
  loops.blackout.stop();
}

function stopPoliceVoices(voices: readonly PoliceVoiceNodes[]): void {
  for (const voice of voices) voice.oscillator.stop();
}

function stopCueVoices(voices: readonly CueVoiceNodes[]): void {
  for (const voice of voices) {
    voice.oscillator.stop();
    voice.noise.stop();
  }
}

export class AfterlightAudioDirector {
  private buses: BusNodes | null = null;
  private context: AudioContext | null = null;
  private cuePool = new DeterministicCuePool(MAX_CUE_AUDIO_VOICES);
  private cueVoices: CueVoiceNodes[] = [];
  private loops: LoopNodes | null = null;
  private muted = false;
  private policeVoices: PoliceVoiceNodes[] = [];
  private state: AfterlightAudioState = DEFAULT_AFTERLIGHT_AUDIO_STATE;

  async start(): Promise<void> {
    if (this.context) {
      await this.context.resume();
      return;
    }

    const AudioContextConstructor =
      window.AudioContext ??
      (window as typeof window & { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;

    if (!AudioContextConstructor) return;

    const context = new AudioContextConstructor();
    const buses = createBuses(context);
    const noiseBuffer = createNoiseBuffer(context, NOISE_BUFFER_SECONDS);
    const loops = createLoopNodes(context, buses, noiseBuffer);
    const policeVoices = Array.from({ length: MAX_POLICE_AUDIO_SOURCES }, () =>
      createPoliceVoice(context, buses),
    );
    const cueVoices = Array.from({ length: MAX_CUE_AUDIO_VOICES }, () =>
      createCueVoice(context, buses, noiseBuffer),
    );

    this.context = context;
    this.buses = buses;
    this.cuePool = new DeterministicCuePool(MAX_CUE_AUDIO_VOICES);
    this.cueVoices = cueVoices;
    this.loops = loops;
    this.policeVoices = policeVoices;
    this.setMuted(this.muted);
    this.update(this.state);
    await context.resume();
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

  update(state: AfterlightAudioState): void {
    this.state = state;
    if (!this.context || !this.loops) return;

    const now = this.context.currentTime;
    const mix = computeAfterlightAudioMix(state);

    setSmooth(
      this.loops.engineLow.frequency,
      mix.engineLowFrequency,
      now,
      0.05,
    );
    setSmooth(
      this.loops.engineLowFilter.frequency,
      160 + mix.engineLowFrequency * 2.4,
      now,
      0.08,
    );
    setSmooth(this.loops.engineLowGain.gain, mix.engineLowGain, now, 0.08);

    setSmooth(
      this.loops.engineMid.frequency,
      mix.engineMidFrequency,
      now,
      0.05,
    );
    setSmooth(
      this.loops.engineMidFilter.frequency,
      260 + mix.engineMidFrequency * 1.9,
      now,
      0.08,
    );
    setSmooth(this.loops.engineMidGain.gain, mix.engineMidGain, now, 0.08);

    setSmooth(
      this.loops.engineHigh.frequency,
      mix.engineHighFrequency,
      now,
      0.045,
    );
    setSmooth(
      this.loops.engineHighFilter.frequency,
      920 + mix.engineHighFrequency * 0.9,
      now,
      0.08,
    );
    setSmooth(this.loops.engineHighGain.gain, mix.engineHighGain, now, 0.08);

    this.loops.districtNoiseFilter.type = "bandpass";
    setSmooth(
      this.loops.districtNoiseFilter.frequency,
      mix.districtNoiseFrequency,
      now,
      0.2,
    );
    setSmooth(this.loops.districtNoiseFilter.Q, mix.districtNoiseQ, now, 0.2);
    setSmooth(
      this.loops.districtNoiseGain.gain,
      mix.districtNoiseGain,
      now,
      0.28,
    );

    setSmooth(
      this.loops.districtTone.frequency,
      mix.districtToneFrequency,
      now,
      0.18,
    );
    setSmooth(
      this.loops.districtToneGain.gain,
      mix.districtToneGain,
      now,
      0.24,
    );

    this.loops.weatherNoiseFilter.type = "highpass";
    setSmooth(
      this.loops.weatherNoiseFilter.frequency,
      mix.weatherNoiseFrequency,
      now,
      0.16,
    );
    setSmooth(this.loops.weatherNoiseFilter.Q, mix.weatherNoiseQ, now, 0.18);
    setSmooth(
      this.loops.weatherNoiseGain.gain,
      mix.weatherNoiseGain,
      now,
      0.22,
    );

    setSmooth(this.loops.pursuit.frequency, mix.pursuitFrequency, now, 0.08);
    setSmooth(
      this.loops.pursuitFilter.frequency,
      160 + mix.pursuitFrequency * 2,
      now,
      0.1,
    );
    setSmooth(this.loops.pursuitGain.gain, mix.pursuitGain, now, 0.2);

    setSmooth(
      this.loops.heartbeat.frequency,
      mix.heartbeatFrequency,
      now,
      0.12,
    );
    setSmooth(this.loops.heartbeatGain.gain, mix.heartbeatGain, now, 0.2);

    setSmooth(this.loops.blackout.frequency, mix.blackoutFrequency, now, 0.12);
    setSmooth(
      this.loops.blackoutFilter.frequency,
      82 + mix.blackoutFrequency * 2.2,
      now,
      0.14,
    );
    setSmooth(this.loops.blackoutGain.gain, mix.blackoutGain, now, 0.28);

    this.policeVoices.forEach((voice, index) => {
      const emitter = mix.police[index];
      const sweep =
        512 + Math.sin(((now + index * 0.19) / 1.14) * Math.PI * 2) * 118;
      setSmooth(voice.oscillator.frequency, sweep, now, 0.04);
      setSmooth(voice.panner.pan, clamp(emitter?.pan ?? 0, -1, 1), now, 0.06);
      setSmooth(voice.gain.gain, emitter?.gain ?? 0, now, 0.12);
    });
  }

  cue(request: AfterlightCueRequest | AfterlightAudioCue): void {
    if (
      !this.context ||
      !this.buses ||
      this.muted ||
      this.cueVoices.length === 0
    ) {
      return;
    }

    const normalized = typeof request === "string" ? { cue: request } : request;
    const layers = cueLayersFor(normalized.cue, normalized.intensity ?? 1);
    const now = this.context.currentTime;
    const spatial =
      normalized.position === undefined
        ? { gain: 1, pan: 0 }
        : computeSpatialAudioMix(
            this.state.listenerPosition,
            this.state.listenerYaw,
            normalized.position,
            normalized.intensity ?? 1,
            64,
          );

    layers.forEach((layer, index) => {
      const allocation = this.cuePool.allocate({
        duration: layer.duration + 0.04,
        now,
        priority: layer.priority,
        token:
          normalized.token === undefined
            ? undefined
            : `${normalized.token}:${index}`,
      });
      if (!allocation) return;
      const voice = this.cueVoices[allocation.voiceIndex];
      this.scheduleCueVoice(
        voice,
        allocation.startTime,
        layer,
        spatial.gain,
        spatial.pan,
      );
    });

    this.buses.master.gain.setValueAtTime(this.muted ? 0 : MASTER_LEVEL, now);
  }

  async dispose(): Promise<void> {
    const context = this.context;
    if (!context) return;

    if (this.loops) stopLoopNodes(this.loops);
    stopPoliceVoices(this.policeVoices);
    stopCueVoices(this.cueVoices);

    this.buses = null;
    this.context = null;
    this.cueVoices = [];
    this.loops = null;
    this.policeVoices = [];
    await context.close();
  }

  private scheduleCueVoice(
    voice: CueVoiceNodes,
    startTime: number,
    layer: CueLayer,
    spatialGain: number,
    pan: number,
  ): void {
    const duration = layer.duration;
    const overallGain = clamp(spatialGain, 0, 1);

    voice.oscillator.type = layer.type;
    voice.sfxSend.gain.setValueAtTime(layer.bus === "sfx" ? 1 : 0, startTime);
    voice.uiSend.gain.setValueAtTime(layer.bus === "ui" ? 1 : 0, startTime);
    voice.musicSend.gain.setValueAtTime(
      layer.bus === "music" ? 1 : 0,
      startTime,
    );
    voice.panner.pan.cancelScheduledValues(startTime);
    voice.panner.pan.setValueAtTime(clamp(pan, -1, 1), startTime);
    voice.gain.gain.cancelScheduledValues(startTime);
    voice.gain.gain.setValueAtTime(1, startTime);

    voice.oscillator.frequency.cancelScheduledValues(startTime);
    voice.oscillator.frequency.setValueAtTime(
      Math.max(1, layer.startFrequency),
      startTime,
    );
    voice.oscillator.frequency.exponentialRampToValueAtTime(
      Math.max(1, layer.endFrequency ?? layer.startFrequency),
      startTime + duration,
    );

    voice.toneFilter.type = layer.filterType ?? "lowpass";
    voice.toneFilter.frequency.cancelScheduledValues(startTime);
    voice.toneFilter.frequency.setValueAtTime(
      layer.filterFrequency ?? 1600,
      startTime,
    );
    voice.toneFilter.Q.cancelScheduledValues(startTime);
    voice.toneFilter.Q.setValueAtTime(layer.filterQ ?? 0.72, startTime);
    envelope(
      voice.toneGain.gain,
      startTime,
      (layer.toneGain ?? 0) * overallGain,
      layer.attack,
      duration,
    );

    voice.noiseFilter.type = layer.filterType ?? "bandpass";
    voice.noiseFilter.frequency.cancelScheduledValues(startTime);
    voice.noiseFilter.frequency.setValueAtTime(
      layer.filterFrequency ?? 720,
      startTime,
    );
    voice.noiseFilter.Q.cancelScheduledValues(startTime);
    voice.noiseFilter.Q.setValueAtTime(layer.filterQ ?? 0.72, startTime);
    envelope(
      voice.noiseGain.gain,
      startTime,
      (layer.noiseGain ?? 0) * overallGain,
      Math.max(0.002, layer.attack * 0.75),
      duration,
    );
  }
}
