# Publishing operations

## Normal path

1. A contributor adds one `submissions/GAME_ID.json` record in a pull request.
2. `Secretless submission preflight` validates the record, fetches its exact
   public commit, builds it in the candidate container, and validates `dist/`.
3. A maintainer reviews the provenance, licenses, playability, and check output,
   then merges the record to protected `main`. This is the sole approval.
4. `Build and publish game submissions` repeats the build from protected
   `main`, transfers only validated static files, and uses its isolated
   `contents:write` job to update the protected `mirage-artifacts` branch.
5. The runtime registry exposes `mirageml.com/play/GAME_ID`. Contributors never
   deploy the game or receive production credentials.

Vercel remains Git-connected to `main` for Mirage application changes. Artifact
storage commits explicitly skip Vercel because the production application
loads the artifact registry dynamically.

## Retry

Use the workflow's `Run workflow` action on `main` to rebuild every active
submission. Publication is keyed by game ID, source commit, artifact digest, and
manifest digest:

- identical output is accepted as an idempotent retry;
- different output for an already-published ID fails closed;
- a materially different build requires a new game ID and submission.

## Delisting and emergency removal

Delete `submissions/GAME_ID.json` in a reviewed pull request and merge it. The
publisher removes the game from `registry.json` while preserving its immutable
files. This stops registry-driven discovery and new uncached proxy resolution,
but one-year immutable CDN responses and direct public artifact-branch URLs may
remain reachable. Do not describe delisting as revocation.

For an active exploit or legal removal, use private security coordination. The
current system has no tested full-revocation path; containment may require a
Vercel cache purge or redeploy plus artifact quarantine, and public Git history
may still retain evidence. Record every manual action. Reverting a delisting
restores the same accepted identities only if all validation still passes.

## Diagnose

Check, in order:

1. the preflight or protected-`main` workflow log;
2. whether `mirage-artifacts/registry.json` contains the game;
3. the manifest and artifact paths recorded for the game;
4. `https://mirageml.com/play/GAME_ID`;
5. production runtime logs for registry or artifact-proxy failures.

Do not work around a failed validator by copying files, editing
`mirage-artifacts`, weakening the sandbox, or manually deploying a contributor
repository.
