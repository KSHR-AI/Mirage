# Mirage agent rules

Strive to be unsummarizable: remove any word whose removal loses no useful
idea.

MirageML Bench is the public registry, evidence layer, and sandboxed player for
coding-model attempts to build GTA in San Francisco. It is not the workspace,
seed, host, or template for a game.

- Author each game attempt in its own brand-new public repository.
- For an independent attempt, do not expose Mirage source, history, previous
  runs, prompts, screenshots, tests, assets, worktrees, build output, or caches
  until the game is finished, deployed, and frozen.
- Label reused work `derived` with its accepted parent ID, canonical repository,
  and exact source commit. Use `unverified` with a precise note when isolation
  cannot be established.
- A rerun, dependency rebuild, source change, prompt correction, or material
  gameplay change gets a new ID and exact 40-character source commit.
- A game contribution is one `submissions/ID.json` record. It contains source,
  deployment, lineage, provenance, licenses, and presentation evidence—never
  copied game source, generated bundles, credentials, submodules, or subtrees.
- Contributors deploy their own static game. Accept only a stable public HTTPS
  URL that returns the game directly, exposes its cover, permits Mirage framing,
  and works in the opaque-origin player.
- Mirage verifies external deployments but does not call them immutable. A
  deployment-only update may relocate the same frozen run; any benchmark
  evidence change requires a new ID.
- Never execute contributor source in Mirage CI or give contributor code a
  Mirage, GitHub, Vercel, or hosting credential.
- Run games with scripts and pointer lock only. Do not grant same-origin, forms,
  popups, downloads, storage access, or top navigation.
- Treat submitted URLs as hostile. Reject credentials, redirects, private
  network destinations, unsafe response types, and framing restrictions.
- Record observed facts and explicit unknowns. Never infer a model grade,
  clean-room status, license clearance, or reproducibility from a working URL.
- Follow [CONTRIBUTING.md](CONTRIBUTING.md),
  [submissions/README.md](submissions/README.md), and [TODO.md](TODO.md). Run
  `pnpm check` for every affected control-plane surface.
