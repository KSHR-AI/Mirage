# MirageML Bench roadmap

Mirage is the benchmark registry, evidence layer, and sandboxed player. Each
game attempt is built in a brand-new repository and deployed by its contributor.

## Architecture

- [x] Use one public source repository and exact commit per run.
- [x] Keep game source, bundles, submodules, and hosting credentials out of
      Mirage.
- [x] Accept contributor-operated public HTTPS deployments.
- [x] Make GitHub Pages the no-additional-account default without requiring one
      provider.
- [x] Validate source identity, live HTML, cover content type, redirects, public
      DNS resolution, and iframe headers.
- [x] Load accepted records directly from `submissions/` in the Mirage
      deployment.
- [x] Give each accepted run a `mirageml.com/play/ID` route.
- [x] Preserve independent, derived, and unverified lineage.
- [x] Permit deployment-only relocation while keeping benchmark evidence
      immutable.
- [x] Remove the Mirage artifact branch, candidate builder, artifact proxy, and
      credentialed publisher.

## P0: production verification

- [ ] Confirm the production Vercel project redeploys from protected `main`
      after an accepted submission merges.
- [ ] Require `CI` and `submission-preflight` in protected-branch rules.
- [ ] Verify scheduled deployment-health checks run and alert maintainers.
- [ ] Add a maintainer playability checklist to submission pull requests.
- [ ] Test accepted GitHub Pages, Cloudflare Pages, Vercel, and Netlify examples
      through the production sandbox.
- [ ] Add DNS-rebinding, redirect-chain, oversized-response, slow-response,
      malformed-header, and content-type adversarial fixtures.
- [ ] Decide when a failing deployment should be labeled unavailable, hidden
      automatically, or removed through review.

## P1: independent-run infrastructure

- [ ] Publish a neutral seed containing only the browser contract, generic
      tests, and licensing guidance.
- [ ] Release the seed as a history-free archive with a recorded SHA-256.
- [ ] Build a runner that creates a fresh repository and ephemeral environment
      for each independent attempt.
- [ ] Keep Mirage, previous games, credentials, user state, and hidden
      evaluation logic outside the runner.
- [ ] Record seed digest, model snapshot, harness, tools, budget, prompt,
      transcript, interventions, result commit, and runner attestation.
- [ ] Test that Git history, caches, worktrees, package stores, and build inputs
      cannot recover prior implementations.

## P1: player and deployment hardening

- [ ] Publish the frame-message protocol for ready, pause, resume, restart,
      completion, failure, telemetry, and runtime errors.
- [ ] Validate message source, protocol version, schema, and rate for opaque
      external origins.
- [ ] Add browser tests for keyboard, touch, gamepad, fullscreen, pointer lock,
      restart, resize, loading, runtime failure, and host unavailability.
- [ ] Add an explicit “externally hosted” indicator and latest verification
      time to run details.
- [ ] Archive public source snapshots or Git bundles so repository deletion
      cannot erase provenance.
- [ ] Move large prompts and license inventories behind lazy per-run records
      before the 256 KiB client registry limit becomes material.

## P2: contributor experience

- [x] Publish one copyable coding-agent prompt.
- [x] Make the prompt finish with a structured `MIRAGE_RUN_HANDOFF`.
- [ ] Publish provider-specific GitHub Pages, Cloudflare Pages, Vercel, and
      Netlify deployment snippets.
- [ ] Generate `submissions/ID.json` from a pasted handoff.
- [ ] Add a local `mirage verify` command for source and deployment checks.
- [ ] Turn the structured proposal issue into a validated submission pull
      request.
- [ ] Report health-check failures to the accepted run’s owner.
- [ ] Document maintainer appeal, ownership transfer, relocation, and takedown
      policies.

## P2: evaluation

- [ ] Freeze task, model snapshot, budget, harness, tools, and intervention
      policy before comparing independent runs.
- [ ] Use hidden behavioral scenarios, browser telemetry, and human playability
      review instead of a vibes or feature-count score.
- [ ] Separate build correctness, runtime reliability, controllability, mission
      completion, systems depth, and aesthetic review.
- [ ] Publish evaluator versions and preserve raw evidence without leaking
      hidden cases into future build contexts.
