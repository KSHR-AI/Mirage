# Submit a game to Mirage

Mirage hosts accepted games centrally. You provide a public source repository,
an exact commit, and an evidence record—never a Vercel project, deployment URL,
cloud account, generated bundle, or artifact digest.

## Fast path

1. Create one public GitHub repository for one model-built game attempt.
2. Commit a pnpm lockfile and make `pnpm run build:mirage` produce
   `dist/index.html`.
3. Pin the result to its full lowercase 40-character commit.
4. Open a
   [model-built game proposal](https://github.com/KSHR-AI/Mirage/issues/new?template=demo.yml)
   if you want help preparing the record, or fork Mirage and add
   `submissions/GAME_ID.json` directly.
5. Open a pull request. The secretless preflight validates and builds the exact
   commit.
6. After review, a maintainer merges the record to protected `main`. That one
   merge rebuilds, validates, publishes, and registers the game at
   `mirageml.com/play/GAME_ID`.

Game source remains in its own repository. The submission file is only a pinned
reference and evidence record.

## Source repository contract

The repository must be public at exactly `https://github.com/OWNER/REPO` and
must not require submodules, private packages, services, or credentials. The
pinned revision must include:

- Node.js 24 compatibility;
- `packageManager: "pnpm@11.7.0"`;
- a committed `pnpm-lock.yaml`;
- a `build:mirage` package script;
- a source license and third-party notices; and
- every source and runtime asset needed to emit a static `dist/`.

Mirage chooses and runs only:

```bash
pnpm install --frozen-lockfile
pnpm run build:mirage
```

`dist/` must contain `index.html`, the declared cover image, and all required
static assets. Use relative URLs. The game must work without a server, secret,
login, database, private API, required mutable CDN, service worker, popup,
download, form submission, or privileged browser data. It must tolerate an
opaque origin and accept `?embed=mirage`.

The publisher accepts at most 5,000 files, 100 MiB total, 4 MiB per file, 512
UTF-8 bytes per path, and a maximum nesting depth of 20. Cover files must be
AVIF, GIF, JPEG, PNG, or WebP. Static validation rejects links, unsafe or hidden
paths, executables, server and deployment files, service workers, root-absolute
asset references, source maps, and unsupported MIME types. The artifact CSP and
iframe sandbox block remote runtime loads, forms, popups, downloads, top
navigation, and undeclared browser privileges.

The publisher caps the complete public registry at 256 KiB and each artifact
manifest at 8 MiB. Contributors do not author either generated file.

## Submission file

Create exactly `submissions/GAME_ID.json`. `GAME_ID` is an immutable lowercase
kebab-case identifier. The file name and `id` must match.

Use this schema-complete example as a shape, not as evidence to copy:

```json
{
  "schemaVersion": 1,
  "id": "night-drive-001",
  "title": "Night Drive",
  "tagline": "One city, one clean attempt",
  "description": "A complete browser driving game.",
  "features": ["Driving", "Mission loop"],
  "source": {
    "repositoryUrl": "https://github.com/example/night-drive",
    "commit": "1111111111111111111111111111111111111111"
  },
  "lineage": {
    "kind": "independent",
    "seedDigest": "sha256:3333333333333333333333333333333333333333333333333333333333333333"
  },
  "provenance": {
    "builtOn": "2026-07-29",
    "model": "example-model",
    "modelSnapshot": "example-model-2026-07-29",
    "reasoning": "high",
    "harness": "Codex",
    "tools": ["apply_patch", "browser"],
    "agentCount": 1,
    "subagentCount": 0,
    "humanInterventions": 0,
    "prompt": {
      "status": "published",
      "text": "Build a complete browser driving game.",
      "note": "Exact prompt preserved."
    }
  },
  "licenses": {
    "code": "Apache-2.0",
    "assetStatement": "All visual assets are original procedural geometry.",
    "assets": []
  },
  "presentation": {
    "coverPath": "assets/cover.webp",
    "coverAlt": "A procedural car driving through a city at night",
    "controls": ["WASD to drive"],
    "limitations": ["Desktop browsers are best tested"],
    "protocolVersion": 1
  }
}
```

The executable validator is
[`scripts/publishing/submission.mjs`](../scripts/publishing/submission.mjs);
the machine-readable contract is
[`scripts/publishing/submission.schema.json`](../scripts/publishing/submission.schema.json).
Unknown fields are rejected. Contributors never add `artifact`, `publication`,
`embedUrl`, build commands, environment variables, or deployment settings.

## Lineage

Choose exactly one shape:

```json
{ "kind": "independent", "seedDigest": "sha256:..." }
```

Use `independent` only when the model began from a neutral, history-free seed
and the runner prevented access to prior games. Preserve the seed digest and
isolation evidence.

```json
{
  "kind": "derived",
  "parentId": "earlier-game-id",
  "parentSource": {
    "repositoryUrl": "https://github.com/example/earlier-game",
    "commit": "2222222222222222222222222222222222222222"
  }
}
```

Use `derived` when the attempt began from an earlier implementation, fork,
prompted reproduction, or asset set. `parentSource.repositoryUrl` must be the
parent's canonical public GitHub repository and `parentSource.commit` must be
its exact lowercase 40-character source commit. Both must match the accepted
parent record; a branch, tag, release, or current repository head is not a
snapshot.

```json
{
  "kind": "unverified",
  "note": "The runner isolation record was not preserved."
}
```

Use `unverified` when the starting state or isolation cannot be proved. All
three categories can be accepted; they answer different questions. A prompt
instructing a model not to inspect old games does not prove independence.

For an independent attempt, create the source repository outside the Mirage
checkout and prevent access to Mirage source, Git history, prior artifacts,
screenshots, prompts, tests, assets, worktrees, and caches.

## Provenance and licenses

Record what happened, including uncertainty:

- use an exact model identifier and snapshot when known;
- set nullable model snapshots, reasoning levels, or counts to `null` when they
  are unknown; the model identifier itself is required;
- publish the exact prompt, mark it `partial`, or use `not-recorded` with a
  specific explanation;
- count human interventions consistently and explain material intervention in
  the pull request;
- list observable features and limitations, not scores; and
- inventory every third-party font, audio file, image, 3D model, texture, and
  other asset with creator, source URL, SPDX license, and required attribution.

Use original, procedural, public-domain, or explicitly licensed assets. Do not
use proprietary game names, characters, logos, maps, audio, extracted assets,
or material whose distribution rights are uncertain.

## What happens after the pull request

The pull-request preflight has read-only repository access and no secrets,
write token, OIDC, production environment, or trusted cache write. It fetches
the exact public source commit, installs its locked dependencies in the bounded
candidate container, builds with network disabled, and validates `dist/`.
Maintainers separately review playability, provenance, lineage, and rights.

Merging the accepted record to protected `main` is the sole publication
approval. The trusted workflow repeats the exact build, passes only validated
static bytes and metadata across the trust boundary, and publishes directly to
the generated `mirage-artifacts` branch:

```text
artifacts/GAME_ID/SOURCE_COMMIT/ARTIFACT_DIGEST_HEX/...
manifests/GAME_ID/SOURCE_COMMIT/ARTIFACT_DIGEST_HEX.json
registry/GAME_ID.json
registry.json
```

The publisher derives and verifies artifact identity; contributors do not
choose it. The production app reads `registry.json` at request time, completing
publication without contributor hosting.

## Updates, retries, and takedowns

Every field in an accepted submission record is immutable. A factual
correction, license change, rerun, rebuilt dependency graph, source or behavior
change, or new feature gets a new ID and record; connect it to the parent when
derived. Remove the old record when it should no longer remain discoverable.

Identical publication retries are idempotent. Deleting a submission in a
reviewed pull request delists it from the runtime registry while retaining
immutable artifact and audit evidence. Delisting does not revoke already cached
responses or direct access to public bytes; report an active exploit or legal
removal privately so maintainers can coordinate containment.

See [CONTRIBUTING.md](../CONTRIBUTING.md),
[publishing security](../docs/publishing-security.md), and
[publishing operations](../docs/publishing-operations.md).
