# Contributing to Mirage

Mirage accepts model-built games, player and publishing improvements, bug fixes,
tests, and documentation through public issues and pull requests. Contributions
to this repository are licensed under Apache-2.0.

## Choose the contribution path

- New game: keep its source in a separate public repository, then follow
  [the game-submission guide](submissions/README.md).
- Mirage control plane: fork this repository, branch from current `main`, make
  one focused change, and open a pull request.

Never add a game's source, generated bundle, hosting configuration, credentials,
Git submodule, or Git subtree to Mirage.

## Rules for a new game

### Preserve what the attempt demonstrates

One source repository represents one immutable attempt. Documentation, license,
and reproducibility fixes may land before submission, but a rerun, dependency
rebuild, source change, or material gameplay change receives a new repository,
game ID, and submission record.

Declare one lineage kind:

- `independent`: the model began from a neutral, history-free seed and could not
  access previous games; record `lineage.seedDigest` and retain runner evidence.
- `derived`: the attempt began from an earlier implementation, fork, or asset
  set; record `lineage.parentId` plus `lineage.parentSource.repositoryUrl` and
  the exact `lineage.parentSource.commit`. The snapshot must match the accepted
  parent record.
- `unverified`: isolation or starting state cannot be established; record a
  precise `lineage.note`.

All three can be useful. Do not label an attempt independent merely because its
prompt prohibited reuse. For an independent attempt, create the repository
outside the Mirage checkout and deny the model access to Mirage source, Git
history, prior games, prompts, screenshots, tests, assets, build output, and
caches.

### Pin a reproducible public source

The source repository must:

- be publicly readable at exactly `https://github.com/OWNER/REPO`;
- be pinned by a full lowercase 40-character commit, never a branch, tag,
  release, or mutable deployment;
- use Node.js 24 and pnpm 11.7 with a committed `pnpm-lock.yaml`;
- define `pnpm run build:mirage`;
- emit a self-contained `dist/index.html`;
- contain its source license and third-party notices; and
- resolve without submodules or maintainer-owned services.

Mirage chooses and runs only:

```bash
pnpm install --frozen-lockfile
pnpm run build:mirage
```

A submission cannot provide shell commands, environment variables, output
paths, or deployment instructions.

### Meet the browser boundary

The contents of `dist/` must:

- run without a server, function, middleware, database, secret, account, private
  API, or required mutable CDN;
- bundle every required runtime asset and use relative URLs;
- include the declared cover image as AVIF, GIF, JPEG, PNG, or WebP;
- remain functional below a non-root path and when storage and third-party
  cookies are unavailable;
- render responsively in an opaque-origin sandbox;
- support keyboard input and touch input when mobile support is claimed;
- accept `?embed=mirage` to remove redundant chrome;
- avoid service workers, authentication, payments, forms, popups, downloads,
  clipboard, camera, microphone, location, and private user data; and
- request only fullscreen, pointer lock, or gamepad behavior declared by the
  Mirage player contract.

Limits are 5,000 files, 100 MiB total, 4 MiB per file, 512 UTF-8 bytes per
path, and a maximum nesting depth of 20. Static validation rejects unsafe links
and paths, executable or server content, service workers, root-absolute asset
references, source maps, deployment metadata, and unsupported file types. The
artifact CSP and iframe sandbox block remote runtime loads and undeclared
privileges.

Mirage also caps the generated public registry at 256 KiB and each artifact
manifest at 8 MiB. Those generated files are publisher-owned, not submission
fields.

### Record provenance and rights, not guesses

The submission records:

- title, tagline, description, observable features, controls, limitations, and
  build date;
- source repository and exact commit;
- model and snapshot, reasoning level, harness, tools, agent counts, and human
  interventions;
- exact prompt, partial prompt, or a truthful `not-recorded` explanation;
- independent, derived, or unverified lineage, including the canonical parent
  repository and exact parent commit for derived work;
- source license and a creator, source, license, and attribution record for
  every font, audio file, image, model, texture, and other asset; and
- a licensed cover path and useful alternative text.

Leave unknown values `null` or use the schema's explicit uncertainty form. Do
not estimate missing tokens, timings, interventions, or independence. Do not
turn tests, feature counts, subjective impressions, or completion percentages
into a model score.

Use original, procedural, public-domain, or explicitly licensed assets. “Found
online,” model-generated without a rights review, or visually similar to a
proprietary game is insufficient. Do not use Rockstar or Take-Two names,
characters, logos, maps, audio, or extracted assets.

## Review and publication

The protected pipeline is:

1. A pull request adds `submissions/GAME_ID.json`.
2. A read-only workflow validates the changed record, fetches the exact public
   commit, and builds it without secrets, write access, OIDC, Mirage state, or
   production configuration.
3. Maintainers review lineage, provenance, licenses, build output, and
   playability.
4. A maintainer merges the record to protected `main`; this is the only human
   publication approval.
5. The trusted `main` workflow rebuilds the same commit in the bounded builder,
   validates `dist/`, and transfers only validated static bytes and trusted
   metadata to a separate publisher.
6. The publisher rechecks every digest and writes immutable artifact files,
   manifests, audit records, and the complete `registry.json` directly to the
   generated `mirage-artifacts` branch.
7. The running application loads that registry dynamically and exposes
   `mirageml.com/play/GAME_ID`.

Contributors never perform hosting or receive a production credential. The
publisher never executes contributor source, package scripts, `vercel.json`,
middleware, or functions.

See [publishing security](docs/publishing-security.md) for trust boundaries and
[publishing operations](docs/publishing-operations.md) for retries and
takedowns.

## Replacing or removing a published game

Every field in an accepted submission record is immutable. A factual
correction, license change, rebuild, rerun, source change, new feature, or
changed behavior gets a new ID and record, linked to its parent when derived.
Remove the old record when it should no longer remain discoverable.

For a security, licensing, provenance, or availability failure, delete
`submissions/GAME_ID.json` in a reviewed pull request. This delists the game
from registry-driven discovery; it does not revoke already cached responses or
the public immutable bytes. Escalate an exploit or legal-removal request through
the private security process until Mirage has a tested purge and quarantine
path.

## Mirage control-plane pull requests

For changes to the registry loader, player, proxy, publisher, documentation, or
infrastructure:

1. Search existing issues and pull requests.
2. Fork current `main` and make one focused change.
3. Use Node.js 24 and pnpm 11.7.
4. Install with `pnpm install --frozen-lockfile`.
5. Run `pnpm check`.
6. Describe the user-visible result, validation, highest-risk behavior,
   rollback, and licenses.

Keep unrelated changes separate. Never include secrets, private transcripts,
user data, or unsupported model-performance claims. Report vulnerabilities
privately according to [SECURITY.md](SECURITY.md).

By participating, you agree to the [Code of Conduct](CODE_OF_CONDUCT.md).
