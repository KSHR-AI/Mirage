export interface PointerCapabilityProfile {
  readonly coarsePointer: boolean;
  readonly finePointer: boolean;
  readonly touchPoints: number;
  readonly viewportWidth: number;
}

export function prefersTouchControls(
  profile: PointerCapabilityProfile,
): boolean {
  if (
    profile.touchPoints > 0 &&
    (profile.coarsePointer || profile.viewportWidth <= 760)
  ) {
    return true;
  }
  if (profile.finePointer) return false;
  return profile.coarsePointer || profile.viewportWidth <= 760;
}
