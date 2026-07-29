# Mirage repository split

Mirage is the registry, player, provenance record, and publishing control
plane. Each immutable game attempt is authored in its own public repository,
then centrally built and played at `mirageml.com`.

## Architecture decisions

- [x] Use one public source repository per game attempt, pinned by full commit.
- [x] Accept source identity and evidence; never require contributor hosting.
- [x] Build untrusted source in isolation and publish validated static output.
- [x] Use one Mirage-controlled artifact branch instead of one cloud project per
      game.
- [x] Treat a reviewed submission-record merge to protected `main` as the sole
      publication authorization.
- [x] Give every accepted game a `mirageml.com/play/ID` permalink.
- [x] Store source references, not Git submodules, subtrees, or copied games.

## Completed control-plane work

- [x] Define strict `submissions/ID.json` validation for identity, lineage,
      provenance, licenses, features, and presentation.
- [x] Require derived lineage to pin the parent ID, canonical public repository
      URL, and exact parent commit, matching the accepted parent record.
- [x] Fix the source contract to Node.js 24, pnpm 11.7, a committed lockfile,
      `pnpm install --frozen-lockfile`, `pnpm run build:mirage`, and
      `dist/index.html`.
- [x] Run a read-only, secretless preflight on submission pull requests.
- [x] Rebuild accepted source from protected `main` in an unprivileged,
      resource-bounded container with build-time networking disabled.
- [x] Reject unsafe static output, including links, special files, hidden or
      escaping paths, executables, server files, service workers, root-absolute
      asset references, and unsupported types.
- [x] Enforce 5,000 files, 100 MiB total, 4 MiB per file, 512 UTF-8 bytes per
      path, and a maximum nesting depth of 20.
- [x] Transfer only validated static bytes and trusted metadata into the
      credentialed publisher.
- [x] Publish immutable content-addressed files, strict file manifests, audit
      records, and the complete runtime `registry.json` directly to
      `mirage-artifacts`.
- [x] Make publication idempotent by game ID, source commit, artifact digest,
      manifest digest, and submission digest.
- [x] Remove in-repository game implementations, game-specific routes, local
      catalog records, prompts, covers, and generated catalog data.
- [x] Load and validate the public registry at request time with a configurable
      `MIRAGE_REGISTRY_URL` and an honest empty/unavailable state.
- [x] Serve every game through the generic `/play/[id]` route.
- [x] Derive artifact paths locally and proxy only registry-authorized files.
- [x] Verify exact manifest bytes, aggregate limits, requested-file membership,
      byte count, and SHA-256 before serving an artifact.
- [x] Bound the complete public registry at 256 KiB and each fetched artifact
      manifest at 8 MiB.
- [x] Run games in an opaque-origin iframe with scripts and pointer lock only;
      omit same-origin, forms, popups, downloads, storage access, and top
      navigation.
- [x] Publish contributor, security, operations, and agent documentation for the
      repository-per-attempt flow.

## P0: production enforcement

- [ ] Require the submission preflight, CI, and publishing-contract checks in
      protected-branch rules.
- [ ] Restrict artifact-branch writes to the protected publisher identity and
      continuously audit branch protection.
- [ ] Verify production `MIRAGE_REGISTRY_URL`, DNS, cache behavior, rollback,
      and runtime observability against the live deployment.
- [ ] Add adversarial end-to-end fixtures for secret reads, install-time
      exfiltration, symlinks, hardlinks, archive traversal, decompression bombs,
      process exhaustion, remote imports, persistent workers, unsafe URLs,
      manifest substitution, and digest substitution.
- [ ] Separate dependency acquisition from lifecycle-script execution, or route
      installation through an audited egress policy; installation currently
      needs network access inside the credential-free candidate boundary.
- [ ] Pin and regularly refresh the builder image after vulnerability review.
- [ ] Define incident ownership, emergency delisting, Vercel CDN purge, private
      artifact quarantine or deletion, evidence retention, and restore drills;
      normal registry deletion is not full revocation.

## P1: independent-attempt infrastructure

- [ ] Publish a neutral seed containing only the browser contract, generic
      tests, and licensing guidance.
- [ ] Release the seed as a history-free archive with a recorded SHA-256.
- [ ] Build a runner that creates a fresh repository and ephemeral container for
      every independent attempt.
- [ ] Keep Mirage source, prior games, Git credentials, user state, and hidden
      evaluation logic outside the runner.
- [ ] Record seed digest, model snapshot, harness, tools, budget, prompt,
      transcript, interventions, result commit, and runner attestation.
- [ ] Test that the seed and runner cannot recover old implementations through
      Git history, caches, worktrees, package stores, or build inputs.

## P1: artifact and player hardening

- [ ] Publish the frame-message protocol for ready, pause, resume, restart,
      completion, failure, telemetry, and runtime errors.
- [ ] Validate message source, protocol version, schema, rate, and expected
      opaque-origin behavior.
- [ ] Add browser tests for nested asset loading, keyboard, touch, gamepad,
      fullscreen, pointer lock, restart, resize, loading, and runtime failure.
- [ ] Add cache-poisoning, redirect, MIME-confusion, range-request, and
      registry-unavailability tests against the production proxy.
- [ ] Decide whether a dedicated artifact hostname materially improves the
      opaque sandbox and verified-proxy design.
- [ ] Archive accepted source snapshots or Git bundles so repository deletion
      cannot erase provenance.
- [ ] Before the public registry approaches 256 KiB, move heavy provenance and
      license detail into digest-bound per-game records loaded lazily while
      retaining a compact discovery index.

## P2: contributor experience

- [ ] Publish a starter repository that implements the fixed contract without
      exposing any prior game.
- [ ] Add a local `mirage verify` command using the same submission and static
      validators as CI.
- [ ] Generate a validated submission-record pull request from the structured
      proposal issue.
- [ ] Report preflight and play-test failures on the proposal or pull request
      without exposing maintainer credentials.
- [ ] Add copyable lineage, prompt-status, license, and per-asset examples.
- [ ] Document maintainer appeal, takedown, retention, rebuild, and ownership
      transfer policies.

## P2: evaluation

- [ ] Freeze task, model snapshot, budget, harness, tools, and intervention
      policy before comparing independent attempts.
- [ ] Use hidden behavioral scenarios, browser telemetry, and human playability
      review instead of a vibes or feature-count score.
- [ ] Separate build correctness, runtime reliability, control quality,
      completion behavior, and aesthetic review.
- [ ] Publish evaluator versions and preserve raw evidence without leaking
      hidden cases into future build contexts.
