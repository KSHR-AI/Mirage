# OPUS SANFRAN default selection design QA

## Comparison target

- Source visual truth: `/var/folders/hx/6dkvktts5wgdbx2l5scqhrr00000gn/T/codex-clipboard-07214a80-e70f-453e-9d52-6094422150ae.png`
- Browser-rendered implementation: `/tmp/mirage-opus-default-implementation-1024.png`
- Combined comparison: `/tmp/mirage-opus-default-comparison.png`
- Source pixels: `1024 x 638`.
- Implementation pixels and CSS viewport: `1024 x 638` at device density `1`.
- Density normalization: none required.
- State: fresh load of `/`, with no drawer open and no prior carousel input.

## Full-view comparison evidence

The source is a focused crop of the requested center card, while the implementation capture shows the complete MirageML Bench page. The combined comparison confirms that a fresh page load now centers the same `Claude Opus 5` / `OPUS SANFRAN` submission, Aug 5, 2026 date, first-party street cover, tagline, Play action, and Submission details action. The surrounding page layout and registry order remain unchanged.

A separate focused-region comparison was unnecessary because the source itself is already a readable focused card crop and the requested change concerns initial selection, not page-scale restyling. Page-level size differences between that crop and the full implementation are therefore not treated as design drift.

## Required fidelity surfaces

- Fonts and typography: the existing Barlow Condensed and Inter hierarchy is unchanged; the selected card exposes the same model, title, date, tagline, and action labels as the source.
- Spacing and layout rhythm: the existing carousel geometry is unchanged. Only the initial selected ID changed, so no reflow, wrapping, overflow, radius, or spacing regression was introduced.
- Colors and visual tokens: the dark green panel, bone text, mint title, pale Play button, borders, and shadows continue to use the existing tokens.
- Image quality and asset fidelity: the selected card loads OPUS SANFRAN's published `assets/cover.png` with its submitted alternative text. No approximation or replacement asset was introduced.
- Copy and content: model, title, build date, tagline, Play label, and Submission details label match the source.

## Interaction and console verification

- Fresh load selected `opus-sanfran`; BAYLINE HEAT remained the previous carousel neighbor.
- Play navigated to `/play/opus-sanfran`, whose player identified `OPUS SANFRAN` and `Claude Opus 5`.
- Submission details opened the OPUS SANFRAN evidence drawer and closed successfully.
- The browser reported no console warnings or errors.
- `pnpm check` passed: formatting, lint, typecheck, 60 tests, both submission validations, security audit, and production build.

## Findings

No actionable P0, P1, or P2 differences remain for the requested default-selection change.

## Comparison history

- Before the change, gallery state initialized from the first alphabetically loaded submission, which selected BAYLINE HEAT.
- The implementation now prefers the stable `opus-sanfran` ID and falls back to the first published game if that record is absent.
- Post-fix browser evidence at `1024 x 638` confirms the requested OPUS SANFRAN card is selected on a fresh load, with working Play and Submission details actions.

## Follow-up polish

None required for this scoped change.

final result: passed
