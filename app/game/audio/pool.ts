export interface CueAllocationRequest {
  readonly duration: number;
  readonly now: number;
  readonly priority: number;
  readonly startTime?: number;
  readonly token?: string;
}

export interface CueAllocation {
  readonly duration: number;
  readonly endTime: number;
  readonly priority: number;
  readonly startTime: number;
  readonly token?: string;
  readonly voiceIndex: number;
}

interface VoiceReservation {
  endTime: number;
  priority: number;
  startTime: number;
  token: string | null;
}

interface RecentToken {
  readonly expiresAt: number;
  readonly token: string;
}

function compareVoiceReservation(
  left: VoiceReservation,
  right: VoiceReservation,
): number {
  if (left.priority !== right.priority) return left.priority - right.priority;
  if (left.endTime !== right.endTime) return left.endTime - right.endTime;
  return left.startTime - right.startTime;
}

export class DeterministicCuePool {
  private readonly recentTokens: RecentToken[] = [];
  private readonly voices: VoiceReservation[];

  constructor(private readonly size: number) {
    if (!Number.isInteger(size) || size < 1) {
      throw new RangeError("Cue pool size must be a positive integer");
    }

    this.voices = Array.from({ length: size }, () => ({
      endTime: Number.NEGATIVE_INFINITY,
      priority: Number.NEGATIVE_INFINITY,
      startTime: Number.NEGATIVE_INFINITY,
      token: null,
    }));
  }

  activeCount(now: number): number {
    this.cleanup(now);
    return this.voices.filter((voice) => voice.endTime > now).length;
  }

  allocate(request: CueAllocationRequest): CueAllocation | null {
    this.cleanup(request.now);
    if (request.token && this.hasRecentToken(request.token, request.now)) {
      return null;
    }

    const startTime = request.startTime ?? request.now;
    const endTime = startTime + request.duration;
    const voiceIndex = this.findAvailableVoice(startTime, request.priority);
    if (voiceIndex < 0) return null;

    const voice = this.voices[voiceIndex];
    voice.startTime = startTime;
    voice.endTime = endTime;
    voice.priority = request.priority;
    voice.token = request.token ?? null;

    if (request.token) {
      this.recentTokens.push({
        token: request.token,
        expiresAt: endTime + 0.35,
      });
    }

    return {
      duration: request.duration,
      endTime,
      priority: request.priority,
      startTime,
      token: request.token,
      voiceIndex,
    };
  }

  snapshot(now: number): readonly CueAllocation[] {
    this.cleanup(now);
    return this.voices
      .map((voice, voiceIndex) => ({ voice, voiceIndex }))
      .filter(({ voice }) => voice.endTime > now)
      .map(({ voice, voiceIndex }) => ({
        duration: voice.endTime - voice.startTime,
        endTime: voice.endTime,
        priority: voice.priority,
        startTime: voice.startTime,
        token: voice.token ?? undefined,
        voiceIndex,
      }));
  }

  private cleanup(now: number): void {
    for (let index = this.recentTokens.length - 1; index >= 0; index -= 1) {
      if (this.recentTokens[index]!.expiresAt <= now) {
        this.recentTokens.splice(index, 1);
      }
    }
  }

  private findAvailableVoice(now: number, incomingPriority: number): number {
    const freeIndex = this.voices.findIndex((voice) => voice.endTime <= now);
    if (freeIndex >= 0) return freeIndex;

    let selectedIndex = 0;
    let selectedVoice = this.voices[0]!;
    for (let index = 1; index < this.voices.length; index += 1) {
      const candidate = this.voices[index]!;
      if (compareVoiceReservation(candidate, selectedVoice) < 0) {
        selectedVoice = candidate;
        selectedIndex = index;
      }
    }
    return incomingPriority < selectedVoice.priority ? -1 : selectedIndex;
  }

  private hasRecentToken(token: string, now: number): boolean {
    return this.recentTokens.some(
      (entry) => entry.token === token && entry.expiresAt > now,
    );
  }
}
