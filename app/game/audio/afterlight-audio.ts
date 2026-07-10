import {
  DEFAULT_AFTERLIGHT_AUDIO_STATE,
  computeAfterlightAudioMix,
  type AfterlightAudioState,
} from "./mix";

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

interface LoopNodes {
  readonly cityGain: GainNode;
  readonly cityNoise: AudioBufferSourceNode;
  readonly engine: OscillatorNode;
  readonly engineFilter: BiquadFilterNode;
  readonly engineGain: GainNode;
  readonly engineHarmonic: OscillatorNode;
  readonly engineHarmonicGain: GainNode;
  readonly heartbeat: OscillatorNode;
  readonly heartbeatGain: GainNode;
  readonly pursuit: OscillatorNode;
  readonly pursuitGain: GainNode;
  readonly sirenGain: GainNode;
  readonly sirenHigh: OscillatorNode;
  readonly sirenLow: OscillatorNode;
  readonly windGain: GainNode;
  readonly windNoise: AudioBufferSourceNode;
  readonly blackout: OscillatorNode;
  readonly blackoutGain: GainNode;
}

interface BusNodes {
  readonly ambience: GainNode;
  readonly master: GainNode;
  readonly music: GainNode;
  readonly sfx: GainNode;
  readonly ui: GainNode;
}

const MASTER_LEVEL = 0.42;

function createNoiseBuffer(context: AudioContext, seconds = 2): AudioBuffer {
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
  gain.setValueAtTime(0.0001, now);
  gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), now + attack);
  gain.exponentialRampToValueAtTime(0.0001, now + attack + release);
}

function createLoopNodes(context: AudioContext, buses: BusNodes): LoopNodes {
  const noiseBuffer = createNoiseBuffer(context);

  const cityNoise = context.createBufferSource();
  const cityFilter = context.createBiquadFilter();
  const cityGain = context.createGain();
  cityNoise.buffer = noiseBuffer;
  cityNoise.loop = true;
  cityFilter.type = "bandpass";
  cityFilter.frequency.value = 310;
  cityFilter.Q.value = 0.34;
  cityGain.gain.value = 0;
  cityNoise.connect(cityFilter).connect(cityGain).connect(buses.ambience);

  const windNoise = context.createBufferSource();
  const windFilter = context.createBiquadFilter();
  const windGain = context.createGain();
  windNoise.buffer = noiseBuffer;
  windNoise.loop = true;
  windFilter.type = "highpass";
  windFilter.frequency.value = 760;
  windGain.gain.value = 0;
  windNoise.connect(windFilter).connect(windGain).connect(buses.ambience);

  const engine = context.createOscillator();
  const engineFilter = context.createBiquadFilter();
  const engineGain = context.createGain();
  engine.type = "sawtooth";
  engine.frequency.value = 38;
  engineFilter.type = "lowpass";
  engineFilter.frequency.value = 420;
  engineFilter.Q.value = 0.72;
  engineGain.gain.value = 0;
  engine.connect(engineFilter).connect(engineGain).connect(buses.sfx);

  const engineHarmonic = context.createOscillator();
  const engineHarmonicFilter = context.createBiquadFilter();
  const engineHarmonicGain = context.createGain();
  engineHarmonic.type = "square";
  engineHarmonic.frequency.value = 76;
  engineHarmonicFilter.type = "bandpass";
  engineHarmonicFilter.frequency.value = 520;
  engineHarmonicFilter.Q.value = 0.8;
  engineHarmonicGain.gain.value = 0;
  engineHarmonic
    .connect(engineHarmonicFilter)
    .connect(engineHarmonicGain)
    .connect(buses.sfx);

  const pursuit = context.createOscillator();
  const pursuitFilter = context.createBiquadFilter();
  const pursuitGain = context.createGain();
  pursuit.type = "triangle";
  pursuit.frequency.value = 54;
  pursuitFilter.type = "lowpass";
  pursuitFilter.frequency.value = 180;
  pursuitGain.gain.value = 0;
  pursuit.connect(pursuitFilter).connect(pursuitGain).connect(buses.music);

  const sirenLow = context.createOscillator();
  const sirenHigh = context.createOscillator();
  const sirenGain = context.createGain();
  sirenLow.type = "triangle";
  sirenHigh.type = "triangle";
  sirenLow.frequency.value = 510;
  sirenHigh.frequency.value = 680;
  sirenGain.gain.value = 0;
  sirenLow.connect(sirenGain);
  sirenHigh.connect(sirenGain);
  sirenGain.connect(buses.ambience);

  const heartbeat = context.createOscillator();
  const heartbeatGain = context.createGain();
  heartbeat.type = "sine";
  heartbeat.frequency.value = 48;
  heartbeatGain.gain.value = 0;
  heartbeat.connect(heartbeatGain).connect(buses.sfx);

  const blackout = context.createOscillator();
  const blackoutFilter = context.createBiquadFilter();
  const blackoutGain = context.createGain();
  blackout.type = "sawtooth";
  blackout.frequency.value = 29;
  blackoutFilter.type = "lowpass";
  blackoutFilter.frequency.value = 92;
  blackoutGain.gain.value = 0;
  blackout
    .connect(blackoutFilter)
    .connect(blackoutGain)
    .connect(buses.ambience);

  cityNoise.start();
  windNoise.start();
  engine.start();
  engineHarmonic.start();
  pursuit.start();
  sirenLow.start();
  sirenHigh.start();
  heartbeat.start();
  blackout.start();

  return {
    cityGain,
    cityNoise,
    engine,
    engineFilter,
    engineGain,
    engineHarmonic,
    engineHarmonicGain,
    heartbeat,
    heartbeatGain,
    pursuit,
    pursuitGain,
    sirenGain,
    sirenHigh,
    sirenLow,
    windGain,
    windNoise,
    blackout,
    blackoutGain,
  };
}

function createBuses(context: AudioContext): BusNodes {
  const master = context.createGain();
  const ambience = context.createGain();
  const music = context.createGain();
  const sfx = context.createGain();
  const ui = context.createGain();
  const compressor = context.createDynamicsCompressor();

  master.gain.value = MASTER_LEVEL;
  ambience.gain.value = 0.8;
  music.gain.value = 0.72;
  sfx.gain.value = 0.9;
  ui.gain.value = 0.86;
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

export class AfterlightAudioDirector {
  private context: AudioContext | null = null;
  private buses: BusNodes | null = null;
  private loops: LoopNodes | null = null;
  private muted = false;
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
    this.context = context;
    this.buses = buses;
    this.loops = createLoopNodes(context, buses);
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
    setSmooth(this.loops.engine.frequency, mix.engineFrequency, now, 0.055);
    setSmooth(
      this.loops.engineHarmonic.frequency,
      mix.engineFrequency * 2.02,
      now,
      0.055,
    );
    setSmooth(
      this.loops.engineFilter.frequency,
      220 + mix.engineFrequency * 2.2,
      now,
      0.08,
    );
    setSmooth(this.loops.engineGain.gain, mix.engineGain, now);
    setSmooth(this.loops.engineHarmonicGain.gain, mix.engineHarmonicGain, now);
    setSmooth(this.loops.windGain.gain, mix.windGain, now, 0.16);
    setSmooth(this.loops.cityGain.gain, mix.cityGain, now, 0.32);
    setSmooth(this.loops.pursuitGain.gain, mix.pursuitGain, now, 0.32);
    setSmooth(this.loops.sirenGain.gain, mix.sirenGain, now, 0.18);
    setSmooth(this.loops.heartbeatGain.gain, mix.heartbeatGain, now, 0.2);
    setSmooth(this.loops.blackoutGain.gain, mix.blackoutGain, now, 0.35);

    const sirenPhase = now % 1.16;
    const sweep = 540 + Math.sin((sirenPhase / 1.16) * Math.PI * 2) * 95;
    setSmooth(this.loops.sirenLow.frequency, sweep, now, 0.035);
    setSmooth(this.loops.sirenHigh.frequency, sweep * 1.29, now, 0.035);
  }

  cue(cue: AfterlightAudioCue): void {
    if (!this.context || !this.buses || this.muted) return;

    const context = this.context;
    const now = context.currentTime;

    switch (cue) {
      case "weapon-fire":
        this.playNoiseBurst(0.13, 0.19, 780, "bandpass");
        this.playTone(78, 45, 0.16, 0.1, this.buses.sfx, "sawtooth");
        break;
      case "impact":
        this.playNoiseBurst(0.12, 0.12, 240, "lowpass");
        this.playTone(64, 38, 0.11, 0.14, this.buses.sfx, "triangle");
        break;
      case "empty":
        this.playTone(980, 620, 0.06, 0.055, this.buses.sfx, "square");
        break;
      case "reload":
        this.playNoiseBurst(0.045, 0.08, 1480, "highpass");
        this.playTone(360, 520, 0.05, 0.12, this.buses.sfx, "square", 0.13);
        break;
      case "vehicle-enter":
        this.playTone(104, 76, 0.11, 0.18, this.buses.sfx, "triangle");
        break;
      case "vehicle-exit":
        this.playTone(82, 124, 0.07, 0.14, this.buses.sfx, "triangle");
        break;
      case "objective":
        this.playArpeggio([440, 554, 659], 0.075, 0.14);
        break;
      case "cash":
        this.playArpeggio([784, 988], 0.055, 0.09);
        break;
      case "mission-phase":
        this.playArpeggio([196, 294, 392], 0.11, 0.24);
        break;
      case "mission-complete":
        this.playArpeggio([220, 330, 440, 659], 0.13, 0.34);
        break;
      case "blackout":
        this.playTone(96, 26, 0.22, 1.1, this.buses.sfx, "sawtooth");
        this.playNoiseBurst(0.16, 0.65, 160, "lowpass");
        break;
      case "death":
        this.playTone(174, 42, 0.18, 0.9, this.buses.music, "sawtooth");
        break;
    }

    this.buses.master.gain.setValueAtTime(this.muted ? 0 : MASTER_LEVEL, now);
  }

  async dispose(): Promise<void> {
    const context = this.context;
    if (!context) return;

    const loops = this.loops;
    if (loops) {
      loops.cityNoise.stop();
      loops.windNoise.stop();
      loops.engine.stop();
      loops.engineHarmonic.stop();
      loops.pursuit.stop();
      loops.sirenLow.stop();
      loops.sirenHigh.stop();
      loops.heartbeat.stop();
      loops.blackout.stop();
    }

    this.context = null;
    this.buses = null;
    this.loops = null;
    await context.close();
  }

  private playArpeggio(
    frequencies: readonly number[],
    spacing: number,
    release: number,
  ): void {
    if (!this.buses) return;
    frequencies.forEach((frequency, index) => {
      this.playTone(
        frequency,
        frequency * 1.08,
        0.07,
        release,
        this.buses?.ui ?? null,
        "sine",
        index * spacing,
      );
    });
  }

  private playTone(
    startFrequency: number,
    endFrequency: number,
    peak: number,
    release: number,
    destination: AudioNode | null,
    type: OscillatorType,
    delay = 0,
  ): void {
    if (!this.context || !destination) return;
    const context = this.context;
    const start = context.currentTime + delay;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(Math.max(1, startFrequency), start);
    oscillator.frequency.exponentialRampToValueAtTime(
      Math.max(1, endFrequency),
      start + release,
    );
    envelope(gain.gain, start, peak, 0.008, release);
    oscillator.connect(gain).connect(destination);
    oscillator.start(start);
    oscillator.stop(start + release + 0.03);
  }

  private playNoiseBurst(
    peak: number,
    release: number,
    frequency: number,
    filterType: BiquadFilterType,
  ): void {
    if (!this.context || !this.buses) return;
    const context = this.context;
    const now = context.currentTime;
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    source.buffer = createNoiseBuffer(context, Math.max(0.2, release + 0.05));
    filter.type = filterType;
    filter.frequency.value = frequency;
    filter.Q.value = 0.72;
    envelope(gain.gain, now, peak, 0.004, release);
    source.connect(filter).connect(gain).connect(this.buses.sfx);
    source.start(now);
    source.stop(now + release + 0.04);
  }
}
