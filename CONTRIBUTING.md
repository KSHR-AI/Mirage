# Contributing a benchmark build

Mirage compares independently produced, playable browser games. A submission is
reviewable only when another person can reproduce the run, inspect its inputs,
and play its result.

## Submit through a fork

`main` is protected. Contributors do not push to it directly:

1. Fork `KSHR-AI/Mirage`.
2. Branch from the current upstream `main`.
3. Build the game in an isolated route such as `app/play/<run-id>`, then commit
   the playable result.
4. Copy `benchmark/submission.template.json` to
   `benchmark/submissions/<run-id>.json`.
5. Save the complete, unedited prompt at
   `benchmark/prompts/<run-id>.md`; reference its SHA-256 digest in the
   submission record.
6. Record the playable commit as `source.result_commit` and
   `artifact.build_commit`, then commit the disclosure separately. This avoids
   a self-referential commit hash. If later work changes the game, repeat this
   step with the new playable commit.
7. Run the project checks and validate the submission record.
8. Open a pull request against `KSHR-AI/Mirage:main` with the **Benchmark build
   submission** template.

Keep model-generated code, hand-written corrections, and imported assets
distinguishable in the commit history. Never commit credentials, private data,
or licensed material that this public repository cannot redistribute.

## Required run disclosure

Every field in the submission template is required, including empty arrays,
zero retries, or `null` cost/token limits. Disclose:

- the verbatim prompt and its digest;
- provider, model family, exact snapshot, reasoning level, and sampling setup;
- harness/version, agent roles, agent/subagent counts, tools, permissions,
  sandbox, and network access;
- upstream base commit, submitted result commit, branch, and repository;
- wall-clock, token, and cost limits and actuals;
- retries, failed trials, and every human intervention;
- dependencies and assets with versions, sources, licenses, and attribution;
- reproducible test commands, results, evidence, and known failures;
- a public playable artifact URL pinned to the submitted commit.

Omission is not a performance optimization. Missing or unverifiable disclosure
makes the run ineligible for comparison.

## Validate

Run the repository gate:

```bash
pnpm install --frozen-lockfile
pnpm check
```

Validate the manifest before opening the pull request:

```bash
pnpm dlx ajv-cli@5 validate \
  --spec=draft2020 \
  -s benchmark/submission.schema.json \
  -d benchmark/submissions/<run-id>.json
```

Then confirm the game loads from a clean checkout and that the playable URL
serves the same result commit recorded in the manifest.

## Review and ranking

Maintainers verify disclosure, reproducibility, licensing, tests, and
playability before merging. Merge acceptance records an artifact; it does not
guarantee a score or rank. Benchmark scoring is performed from the merged,
commit-pinned artifact under the published rubric. Maintainers may mark a run
unranked when evidence is incomplete, the artifact drifts from its recorded
commit, or human intervention exceeds the disclosed setup.
