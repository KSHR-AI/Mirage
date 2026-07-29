# Mirage agent rules

Strive to be unsummarizable: remove any word whose removal loses no useful
idea.

Mirage is the registry, player, provenance record, and trusted publisher. It is
not the workspace or template for new games.

- Author each immutable game attempt in its own public source repository.
- For an independent attempt, begin from the neutral, history-free seed outside
  this checkout. Do not expose Mirage source, Git history, prior games,
  screenshots, prompts, tests, assets, build output, worktrees, or caches.
- Label work `derived` with its parent ID, canonical public repository URL, and
  exact parent source commit when it starts from an earlier game. Require that
  snapshot to match the accepted parent record. Use `unverified` with a precise
  note when isolation cannot be established.
- A fix, rerun, dependency rebuild, source change, or material gameplay change
  gets a new ID and exact 40-character source commit.
- A game contribution is one `submissions/ID.json` record containing public
  source identity, lineage, provenance, licenses, and presentation metadata. It
  never contains copied game source, generated bundles, artifact fields,
  deployment credentials, submodules, or subtrees.
- Enforce Node.js 24, pnpm 11.7, a committed lockfile,
  `pnpm install --frozen-lockfile`, `pnpm run build:mirage`, and
  `dist/index.html`; never accept contributor-supplied commands.
- Never require a contributor deployment, hosted preview, cloud account, or
  Vercel account. The protected pipeline centrally hosts validated static
  output.
- Treat the reviewed submission-record merge to protected `main` as the sole
  publication authorization. Publication writes immutable files, manifests,
  and the complete runtime registry directly to `mirage-artifacts`.
- Treat source, dependencies, package scripts, and generated files as hostile.
  Candidate jobs receive no secrets or production state. The publisher receives
  validated static bytes only and never executes them.
- Keep the Mirage permalink, source identity, artifact identity, and manifest
  identity separate. Derive `/play/ID` and artifact proxy paths locally.
- Run games only in the generic opaque-origin player. Do not grant
  `allow-same-origin`, forms, popups, downloads, storage access, or top
  navigation.
- Record observed facts and explicit unknowns. Never infer a model grade,
  clean-room status, license clearance, or reproducibility from a successful
  build.
- Follow [CONTRIBUTING.md](CONTRIBUTING.md),
  [submissions/README.md](submissions/README.md), and [TODO.md](TODO.md). Run
  the quality gate for every affected surface.
