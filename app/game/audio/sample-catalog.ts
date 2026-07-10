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

export type AfterlightAudioBus = "music" | "sfx" | "ui";

export interface AfterlightCueSampleProfile {
  readonly bus: AfterlightAudioBus;
  readonly gain: number;
  readonly paths: readonly string[];
  readonly playbackRate?: number;
}

const AUDIO_ROOT = "/game-assets/audio";

export const AFTERLIGHT_AUDIO_LOOPS = Object.freeze({
  ambience: `${AUDIO_ROOT}/ambience/urban-rain-loop.ogg`,
  engineDrive: `${AUDIO_ROOT}/vehicles/engine-drive-loop.ogg`,
  engineIdle: `${AUDIO_ROOT}/vehicles/engine-idle-loop.ogg`,
  policeSiren: `${AUDIO_ROOT}/vehicles/police-siren-loop.ogg`,
});

export const AFTERLIGHT_FOOTSTEP_SAMPLES = Object.freeze(
  Array.from(
    { length: 5 },
    (_, index) =>
      `${AUDIO_ROOT}/footsteps/concrete-${String(index + 1).padStart(2, "0")}.ogg`,
  ),
);

const GENERIC_IMPACTS = Object.freeze(
  Array.from(
    { length: 3 },
    (_, index) =>
      `${AUDIO_ROOT}/impacts/generic-${String(index + 1).padStart(2, "0")}.ogg`,
  ),
);

export const AFTERLIGHT_CUE_SAMPLE_PROFILES: Readonly<
  Record<AfterlightAudioCue, AfterlightCueSampleProfile>
> = Object.freeze({
  blackout: {
    bus: "music",
    gain: 0.52,
    paths: [`${AUDIO_ROOT}/ui/objective-failed.ogg`],
    playbackRate: 0.68,
  },
  cash: {
    bus: "ui",
    gain: 0.4,
    paths: [`${AUDIO_ROOT}/ui/select.ogg`],
    playbackRate: 1.08,
  },
  death: {
    bus: "music",
    gain: 0.58,
    paths: [`${AUDIO_ROOT}/ui/objective-failed.ogg`],
    playbackRate: 0.82,
  },
  empty: {
    bus: "sfx",
    gain: 0.52,
    paths: [`${AUDIO_ROOT}/weapons/pistol-empty.ogg`],
  },
  impact: { bus: "sfx", gain: 0.62, paths: GENERIC_IMPACTS },
  "mission-complete": {
    bus: "music",
    gain: 0.62,
    paths: [`${AUDIO_ROOT}/ui/objective-complete.ogg`],
  },
  "mission-phase": {
    bus: "ui",
    gain: 0.46,
    paths: [`${AUDIO_ROOT}/ui/objective-start.ogg`],
  },
  objective: {
    bus: "ui",
    gain: 0.5,
    paths: [`${AUDIO_ROOT}/ui/objective-complete.ogg`],
  },
  reload: {
    bus: "sfx",
    gain: 0.7,
    paths: [`${AUDIO_ROOT}/weapons/pistol-reload.ogg`],
  },
  "vehicle-enter": {
    bus: "sfx",
    gain: 0.72,
    paths: [`${AUDIO_ROOT}/vehicles/door-enter.ogg`],
  },
  "vehicle-exit": {
    bus: "sfx",
    gain: 0.72,
    paths: [`${AUDIO_ROOT}/vehicles/door-exit.ogg`],
  },
  "weapon-fire": {
    bus: "sfx",
    gain: 0.72,
    paths: [
      `${AUDIO_ROOT}/weapons/pistol-fire-01.ogg`,
      `${AUDIO_ROOT}/weapons/pistol-fire-02.ogg`,
    ],
  },
});

export const AFTERLIGHT_AUDIO_SAMPLE_URLS = Object.freeze(
  Array.from(
    new Set([
      ...Object.values(AFTERLIGHT_AUDIO_LOOPS),
      ...AFTERLIGHT_FOOTSTEP_SAMPLES,
      ...Object.values(AFTERLIGHT_CUE_SAMPLE_PROFILES).flatMap(
        (profile) => profile.paths,
      ),
    ]),
  ),
);

function stableHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function selectAfterlightSample(
  paths: readonly string[],
  token: string | undefined,
  sequence: number,
): string {
  if (paths.length === 0) throw new Error("Audio sample set cannot be empty.");
  const index = token === undefined ? sequence : stableHash(token);
  return paths[index % paths.length];
}
