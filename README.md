# Mirage

[![Playable demos](https://img.shields.io/badge/playable-model--built%20games-9cc1b9.svg)](https://mirage-kshr.vercel.app)
[![CI](https://github.com/KSHR-AI/Mirage/actions/workflows/ci.yml/badge.svg)](https://github.com/KSHR-AI/Mirage/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)

**Playable browser games built end-to-end by coding models.**

[Play the gallery](https://mirage-kshr.vercel.app) ·
[Play the featured demo](https://mirage-kshr.vercel.app/play) ·
[View the source](https://github.com/KSHR-AI/Mirage)

Mirage is a public gallery of complete model-built game demos. Each entry pairs
the playable artifact with the model, build date, source revision, build brief,
agent setup, and honest gaps in the record. Mirage does not grade, rank, or
declare a winner; the work is the evidence.

## Playable demos

| Demo            | Model         | What it contains                                                                        | Play                                                                                   |
| --------------- | ------------- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Fogline Pursuit | `gpt-5.6-sol` | 3D arcade driving, route guidance, police pursuit, three-stage getaway, touch controls  | [`/play/fogline-pursuit-001`](https://mirage-kshr.vercel.app/play/fogline-pursuit-001) |
| Hot Drop        | `gpt-5.6-sol` | 3D city driving, vehicle switching, police pursuit, timed mission, objective navigation | [`/play/legacy-hot-drop`](https://mirage-kshr.vercel.app/play/legacy-hot-drop)         |

The root page opens the gallery. `/play` always redirects to the featured demo
declared in [`demos/collection.json`](demos/collection.json).

## Run locally

### Requirements

- Node.js 24
- pnpm 11.7

```bash
pnpm install --frozen-lockfile
pnpm dev
```

Open `http://localhost:3000`.

The default development and production commands use Next.js, matching the
Vercel deployment. Sites-compatible Vinext commands remain available as
`dev:sites`, `build:sites`, and `start:sites`.

## Play controls

### Fogline Pursuit

- `WASD` or arrow keys: accelerate, brake, reverse, and steer
- `Space`: handbrake
- `R`: restart immediately
- Touch controls appear on mobile

### Hot Drop

- `WASD` or arrow keys: move or drive
- `E`: enter, exit, or steal a nearby vehicle
- `Space`: handbrake
- `R`: restart

## How the gallery works

The collection is intentionally file-backed:

1. [`demos/collection.json`](demos/collection.json) defines the gallery and
   featured demo.
2. Each file in [`demos/entries/`](demos/entries/) describes one playable
   artifact.
3. `pnpm catalog:generate` creates the typed application catalog.
4. The gallery embeds each demo in a sandboxed full-screen frame.
5. “How it was made” exposes the available build brief, setup, source, and asset
   record without turning them into a grade.

This keeps every public claim reviewable in Git while avoiding accounts, a
database, or a write-enabled public API.

## Add a model-built demo

Read [`demos/README.md`](demos/README.md), then open a pull request containing:

- a unique entry under `demos/entries/`;
- a reviewed local route under `app/play/DEMO_ID/` or an immutable HTTPS
  artifact;
- the model and agent setup actually used;
- the build brief when available;
- a pinned source revision;
- a cover image and concise feature list; and
- licensing or attribution for code and assets.

Existing demo records describe historical artifacts. Fixes or materially new
attempts should receive a new demo ID so the older work remains inspectable.

## Repository map

| Path                                                                     | Purpose                                                  |
| ------------------------------------------------------------------------ | -------------------------------------------------------- |
| [`app/gallery/`](app/gallery/)                                           | Full-screen gallery, details drawer, and typed catalog   |
| [`app/play/`](app/play/)                                                 | Stable public routes for playable demos                  |
| [`app/runs/`](app/runs/)                                                 | Self-contained demo implementations                      |
| [`demos/`](demos/)                                                       | Collection configuration, demo records, and build briefs |
| [`scripts/generate-demo-catalog.mjs`](scripts/generate-demo-catalog.mjs) | Generates the application catalog                        |

## Quality gate

```bash
pnpm check
```

The gate verifies catalog freshness, formatting, lint, types, game behavior,
dependency security, and a production build. Before submitting a demo, also
play its main loop in a browser and inspect the runtime console.

## Contributing and security

Read [CONTRIBUTING.md](CONTRIBUTING.md),
[CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md), and [SECURITY.md](SECURITY.md).
Report vulnerabilities privately through
[GitHub Security Advisories](https://github.com/KSHR-AI/Mirage/security/advisories/new).

## License and independence

Mirage is released under [Apache-2.0](LICENSE). Submitted code and assets must be
license-compatible or include explicit reviewed attribution.

Mirage is an independent open-source project. It is not affiliated with,
endorsed by, or sponsored by Rockstar Games or Take-Two Interactive.
