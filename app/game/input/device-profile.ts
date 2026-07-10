export interface PointerCapabilityProfile {
  readonly coarsePointer: boolean;
  readonly finePointer: boolean;
  readonly viewportWidth: number;
}

export function prefersTouchControls(
  profile: PointerCapabilityProfile,
): boolean {
  if (profile.finePointer) return false;
  return profile.coarsePointer || profile.viewportWidth <= 760;
}
