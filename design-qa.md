# Mirage benchmark design QA

## Evidence

- Source visual truth:
  `/Users/aman/.codex/generated_images/019f90c0-2f5b-70d2-815f-60d41680b6a3/call_z0VGxg8VuGcyLBThHwaeIVMG.png`
- Normalized source:
  `/Users/aman/Documents/Git/mirage/.codex-artifacts/reference-normalized-1440x1024.png`
- Browser-rendered implementation:
  `/Users/aman/Documents/Git/mirage/.codex-artifacts/benchmark-final-1440x1024.png`
- Full-view comparison:
  `/Users/aman/Documents/Git/mirage/.codex-artifacts/comparison-detail-v2.png`
- Focused drawer comparison:
  `/Users/aman/Documents/Git/mirage/.codex-artifacts/comparison-drawer-v2.png`
- Responsive evidence:
  `/Users/aman/Documents/Git/mirage/.codex-artifacts/benchmark-lobby-390x844.png`
  and
  `/Users/aman/Documents/Git/mirage/.codex-artifacts/benchmark-detail-390x844.png`
- Live-game evidence:
  `/Users/aman/Documents/Git/mirage/.codex-artifacts/benchmark-playing-1440x1024.png`
- Status-bar correction source:
  `/var/folders/hx/6dkvktts5wgdbx2l5scqhrr00000gn/T/codex-clipboard-ed1aebc5-3677-497c-aaf6-37cb7edd8c15.png`
- Status-bar correction implementation:
  `/Users/aman/Documents/Git/mirage/.codex-artifacts/benchmark-submit-progress.png`
- Desktop viewport: 1440 × 1024 CSS pixels at device pixel ratio 1.
- Mobile viewport: 390 × 844 CSS pixels at device pixel ratio 1.
- Source pixels: 1487 × 1058, normalized to 1440 × 1024.
- Implementation pixels: 1440 × 1024.
- State: the single `gpt-5.6-sol` run selected with its submitter-reported
  progress visible.

## Findings

- Fonts and typography: passed. Barlow Condensed recreates the narrow
  benchmark/display hierarchy; Inter keeps dense provenance readable. Weight,
  tracking, line height, truncation, and tabular metric alignment match the
  target at desktop and mobile widths.
- Spacing and layout rhythm: passed. The desktop split is 70/30, the game image
  remains dominant, the selected run is centered above a compact footer, and
  the drawer uses the target's divider-led vertical rhythm. The mobile drawer
  becomes full width with its close control and primary action continuously
  available.
- Colors and visual tokens: passed. Near-black, warm ivory, desaturated mint,
  success green, and restrained evidence-warning tones match the target without
  reintroducing the earlier acid/orange dashboard treatment.
- Image quality and asset fidelity: passed. A dedicated 1672 × 941 cinematic
  pursuit image supplies the full-bleed preview and run thumbnail. The playable
  state switches to the real WebGL build instead of pretending the generated
  still is gameplay. Phosphor supplies all interface icons; there are no
  handcrafted icon or placeholder assets.
- Copy and content: passed. The shell presents one real historical run and two
  explicit open contribution slots rather than fictional model results. The
  drawer truthfully marks the historical prompt and exact setup as missing
  while preserving its immutable source commit. Progress is explicitly labeled
  as a submitter estimate; no synthetic test-count or redundant baseline label
  remains.
- Interaction and accessibility: passed. “Prompt & setup” opens a named modal
  drawer, moves focus to Close, traps Tab, closes on Escape, and returns focus
  to the trigger. The background is inert while open. “Play selected build”
  launches the real 3D route in-place and auto-starts it; “Back to builds”
  restores the deck. External links use safe target/rel attributes. Desktop and
  mobile documents have no horizontal overflow.
- Runtime: passed. A clean final in-app-browser tab reported no console errors
  or warnings. The repository passed formatting, lint, typecheck, 31 tests, and
  production build.

## Comparison history

1. Initial full-view comparison found three P2 differences:
   the implementation added an unrequested marketing block over the hero; the
   open-detail state retained a prominent Play action instead of making
   “Prompt & setup” the selected-card action; and provenance rows were smaller
   than the target.
2. The marketing block was removed, the open-detail selected card now promotes
   “Prompt & setup,” drawer text was increased, and the close focus treatment
   was changed from acid to muted mint.
3. Post-fix full-view and focused-drawer comparisons show no remaining P0, P1,
   or P2 mismatch. Missing historical provenance and open run slots are
   intentional evidence-integrity constraints, not visual drift.
4. The latest focused comparison removed the unsupported “24/24 verified”
   claim and the redundant “Legacy baseline” label. The leading checkmark was
   replaced with a gauge, and “10% coverage” became “10% submitter estimate.”
   No P0, P1, or P2 issue remains in the revised status treatment.

## Follow-up polish

- P3: add distinct preview imagery when real independent model submissions
  arrive.
- P3: the static lobby preview omits decorative in-game HUD; the HUD appears
  immediately after Play launches the verified build.
- P3: migrate existing Rapier and Three.js deprecated APIs without changing
  game behavior.

final result: passed
