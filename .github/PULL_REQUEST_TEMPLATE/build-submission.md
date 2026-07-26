<!-- Use the title: [Build] <run-id> -->

## Run

- Run ID:
- Model snapshot:
- Result commit:
- Playable artifact:
- Manifest: `benchmark/submissions/<run-id>.json`
- Complete prompt: `benchmark/prompts/<run-id>.md`

## What is playable?

Describe the game loop and the shortest path a reviewer can use to verify it.

## Evidence

List the exact commands run and link durable logs, screenshots, or recordings.
State every known failure; do not report an unrun check as passing.

## Disclosure checklist

- [ ] The run started from the base commit recorded in the manifest.
- [ ] The complete prompt is committed verbatim and its SHA-256 digest matches.
- [ ] Provider, exact model snapshot, reasoning level, and sampling setup are recorded.
- [ ] Harness, tools, permissions, sandbox, network access, and all agent/subagent roles are recorded.
- [ ] Time, token, and cost limits and actuals are recorded, including `null` or zero values.
- [ ] Retries, failed trials, and every human intervention are recorded.
- [ ] Dependencies and assets include their sources, versions, licenses, and attribution.
- [ ] Tests, evidence, known failures, and the public playable URL are recorded.
- [ ] The playable artifact is pinned to the submitted result commit.
- [ ] No credentials, private data, or non-redistributable material are included.
- [ ] `pnpm check` and manifest schema validation pass, or failures are explained above.

By submitting this pull request, I attest that the manifest is complete and
accurate to the best of my knowledge.
