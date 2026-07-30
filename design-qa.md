# MirageML Bench design QA

## Comparison target

- Source visual truth:
  `/var/folders/hx/6dkvktts5wgdbx2l5scqhrr00000gn/T/codex-clipboard-eacbe9dd-83e2-47bf-a1f9-5f6732a04796.png`
- Intended viewport: `1430 x 941` CSS pixels.
- State: full-screen selected submission, carousel, and submission-detail
  popover; the live registry currently has zero accepted submissions, so the
  default route renders the corresponding empty state.

## Implementation

- The selected submission cover owns the full viewport.
- Hero copy is limited to `MirageML Bench` and `GTA in SF`.
- The carousel retains previous, selected, next/open-slot, keyboard navigation,
  and play controls.
- `Submission details` opens the existing modal drawer with model, date, pinned
  commit, deployment, lineage, provenance, licenses, presentation evidence,
  downloadable record, and exact GitHub source link.
- The empty registry uses the same full-screen image language with one concise
  submission card and GitHub link.
- Formatting, lint, types, 57 tests, submission validation, security audit, and
  production build pass.

## Blocking evidence

The current in-app browser session rejected navigation to the local preview
under its URL safety policy. No browser-rendered capture of this latest copy
revision exists, so the required visual comparison, responsive capture,
interaction check, and console inspection cannot be claimed.

## Required fidelity surfaces

- Fonts and typography: implementation uses the existing Barlow Condensed and
  Inter system from the source design; browser comparison pending.
- Spacing and layout rhythm: source carousel structure is preserved; browser
  comparison pending.
- Colors and visual tokens: source dark green, warm bone, muted teal, and blue
  Mirage mark are preserved; browser comparison pending.
- Image quality and asset fidelity: the real SF chase raster and contributor
  cover URLs are used; browser crop comparison pending.
- Copy and content: simplified to the requested product name, challenge,
  submission metadata, GitHub provenance, and detail drawer.

## Findings

- `[P0] Latest implementation cannot be visually verified.`
  - Location: local homepage and carousel states.
  - Evidence: local URL navigation was blocked before capture.
  - Impact: Product Design handoff cannot pass without browser-rendered
    evidence.
  - Fix: open `http://localhost:3000/` in the in-app browser, then capture and
    compare the page at desktop and mobile sizes.

## Comparison history

- The prior image-led empty state passed at desktop and mobile sizes before this
  copy reduction.
- The latest revision has code/build verification only; no visual pass was
  performed.

final result: blocked
