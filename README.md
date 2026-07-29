# Mirage

[![Playable games](https://img.shields.io/badge/playable-model--built%20games-9cc1b9.svg)](https://mirageml.com)
[![CI](https://github.com/KSHR-AI/Mirage/actions/workflows/ci.yml/badge.svg)](https://github.com/KSHR-AI/Mirage/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)

**Playable browser games built end-to-end by coding models.**

[Play the gallery](https://mirageml.com) ·
[Play the first available game](https://mirageml.com/play) ·
[Contribute a game](submissions/README.md)

Mirage is a public registry, player, provenance record, and trusted publisher
for model-built games. It does not grade models or treat feature counts as
capability scores; each playable artifact and its evidence record speak for
themselves.

## One attempt, one source repository

Every new game is developed outside Mirage:

```text
public game repository @ exact commit
  -> secretless Mirage preflight
  -> protected-main approval
  -> isolated rebuild and static validation
  -> immutable files on mirage-artifacts
  -> mirageml.com/play/GAME_ID
```

The game source stays in its own public repository. Mirage stores a small
submission record containing its exact commit, lineage, provenance, licenses,
and presentation metadata. A materially different attempt gets a new
repository, ID, and record.

Mirage does not use Git submodules or subtrees for games. A submodule pins a
commit but puts untrusted source inside the control-plane checkout, complicates
clones, and provides neither build isolation nor hosting. Mirage instead fetches
the pinned source in an isolated builder and publishes only validated,
content-addressed static output.

## No contributor hosting

Contributors do not need a Vercel account, cloud project, preview URL, service
account, or Mirage credential. One Mirage-controlled pipeline hosts every
accepted artifact:

1. Build the game in its own public repository and pin a 40-character commit.
2. Open a proposal, or add one `submissions/GAME_ID.json` file in a pull
   request.
3. The pull request runs a read-only, secretless preflight build.
4. A maintainer merges the record to protected `main`; that merge is the sole
   publication approval.
5. The trusted workflow rebuilds the pinned commit, validates `dist/`, and
   writes the immutable artifact, manifest, and runtime registry directly to
   `mirage-artifacts`.
6. Mirage reads that registry at request time, so
   `mirageml.com/play/GAME_ID` becomes available as soon as the protected
   publication finishes.

Submitted code never receives Mirage credentials. Only validated static bytes
cross into the publishing job, and games run in an opaque-origin iframe that
omits same-origin, forms, popups, downloads, and top-navigation privileges.

Read the [submission guide](submissions/README.md) for the exact JSON contract
and [CONTRIBUTING.md](CONTRIBUTING.md) for review rules.

## Independent, derived, and unverified attempts

| Lineage       | Starting point                                          | Required evidence                                            |
| ------------- | ------------------------------------------------------- | ------------------------------------------------------------ |
| `independent` | Neutral, history-free seed; no access to previous games | Seed digest and isolated-run record                          |
| `derived`     | An identified earlier game                              | Parent ID, canonical repository URL, and exact parent commit |
| `unverified`  | Starting state or isolation cannot be established       | A precise note describing what remains uncertain             |

Derived work is welcome; it answers a different question from independent
construction. A prompt saying “do not inspect prior games” is not evidence of
isolation. For a scratch attempt, create the source repository outside the
Mirage checkout and do not expose Mirage history, prior artifacts, screenshots,
prompts, tests, assets, or caches to the model.

## Static game contract

An accepted source revision must:

- use Node.js 24, pnpm 11.7, a committed `pnpm-lock.yaml`, and the fixed
  `pnpm run build:mirage` command;
- emit a self-contained `dist/index.html` plus static assets;
- need no server, secret, account, private API, service worker, or required
  mutable CDN;
- use relative URLs and remain functional below a non-root path;
- work responsively in Mirage's sandbox with keyboard and declared touch or
  gamepad controls;
- include its cover image inside `dist/`; and
- include compatible code and per-asset licensing.

The build output is limited to 5,000 files, 100 MiB total, and 4 MiB per file.
Static validation rejects unsafe paths and links, executable or server content,
service workers, root-absolute asset references, and unsupported file types.
The artifact CSP and iframe sandbox block remote runtime loads, forms, popups,
downloads, top navigation, and undeclared browser privileges.

## Runtime registry

The publisher writes a strict `registry.json` to the generated
`mirage-artifacts` branch. The application loads it at request time from
`MIRAGE_REGISTRY_URL`, defaulting to:

```text
https://raw.githubusercontent.com/KSHR-AI/Mirage/mirage-artifacts/registry.json
```

The public registry is bounded at 256 KiB, leaving response headroom when Next.js
serializes gallery data, and each digest-bound artifact manifest is bounded at
8 MiB.

Each game records its immutable source commit, artifact and manifest digests,
file and byte totals, lineage, provenance, licenses, features, and presentation
metadata. Derived lineage also pins the parent's canonical repository URL and
exact commit. Artifact URLs are derived locally; registry data cannot choose a
filesystem or proxy base path.

Published files use these branch paths:

```text
artifacts/GAME_ID/SOURCE_COMMIT/ARTIFACT_DIGEST_HEX/...
manifests/GAME_ID/SOURCE_COMMIT/ARTIFACT_DIGEST_HEX.json
registry.json
```

Before serving a file, Mirage verifies the registry record, exact manifest
digest, manifest totals, requested path, byte count, and file SHA-256. A missing,
empty, invalid, or unavailable registry produces an honest empty/error state;
the app never falls back to bundled example games.

## Run Mirage locally

Requirements: Node.js 24 and pnpm 11.7.

```bash
pnpm install --frozen-lockfile
pnpm dev
```

Open `http://localhost:3000`. Set `MIRAGE_REGISTRY_URL` to an approved HTTPS
registry when testing another artifact branch.

## Repository map

| Path                                                             | Purpose                                                   |
| ---------------------------------------------------------------- | --------------------------------------------------------- |
| [`app/gallery/`](app/gallery/)                                   | Full-screen runtime gallery and provenance view           |
| [`app/play/`](app/play/)                                         | First-game redirect and generic `/play/[id]` player       |
| [`app/registry/`](app/registry/)                                 | Bounded runtime registry loader and strict schema         |
| [`app/artifacts/`](app/artifacts/)                               | Manifest-verified, least-privilege artifact proxy         |
| [`submissions/`](submissions/)                                   | Reviewed source/provenance records; never game source     |
| [`scripts/publishing/`](scripts/publishing/)                     | Isolated build, validation, and artifact-branch publisher |
| [`docs/publishing-security.md`](docs/publishing-security.md)     | Publishing threat model and trust boundaries              |
| [`docs/publishing-operations.md`](docs/publishing-operations.md) | Retry, takedown, and diagnosis runbook                    |
| [`TODO.md`](TODO.md)                                             | Remaining isolation, evaluation, and ecosystem work       |

## Quality gate

```bash
pnpm check
```

The gate checks formatting, lint, types, behavior, publishing contracts,
dependency security, and a production build. Acceptance additionally rebuilds
the pinned source, validates its static output, and requires a maintainer
playability and rights review.

## Contributing, security, and license

Read [CONTRIBUTING.md](CONTRIBUTING.md),
[CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md), and [SECURITY.md](SECURITY.md).
Report vulnerabilities privately through
[GitHub Security Advisories](https://github.com/KSHR-AI/Mirage/security/advisories/new).

Mirage is released under [Apache-2.0](LICENSE). Submitted code and assets must
be license-compatible or carry explicit reviewed attribution.

Mirage is an independent open-source project. It is not affiliated with,
endorsed by, or sponsored by Rockstar Games or Take-Two Interactive.
