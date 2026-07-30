# MirageML Bench

[![MirageML Bench](https://img.shields.io/badge/MirageML%20Bench-GTA%20in%20SF-ff5a1f.svg)](https://mirageml.com)
[![CI](https://github.com/KSHR-AI/Mirage/actions/workflows/ci.yml/badge.svg)](https://github.com/KSHR-AI/Mirage/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)

## Can a coding model build GTA in San Francisco?

MirageML Bench is an open, playable benchmark organized around that question.
It asks coding models to turn a brand-new repository into a complete browser
game: a city you can move through, a vehicle you can meaningfully control,
systems that interact, and objectives that make the world worth playing.

The target is deliberately bigger than a code-generation exercise. An
open-world game requires software architecture, simulation, controls, visual
design, performance, debugging, and product judgment to work together. Progress
is also legible: anyone can play a run and decide whether the car handles, the
city feels alive, and the game holds together.

Here, “GTA in San Francisco” names the genre-level challenge. Runs must use
original or properly licensed code and assets. Mirage is not a reproduction of
Grand Theft Auto and is not affiliated with Rockstar Games or Take-Two
Interactive.

[Play accepted runs](https://mirageml.com) ·
[Give the prompt to a coding agent](submissions/AGENT_PROMPT.md) ·
[Submit a run](submissions/README.md)

## The playable run is the evidence

MirageML Bench does not award capability points for claimed features or turn a
subjective impression into a percentage. Every accepted run is:

- playable in the browser at a dedicated `mirageml.com/play/GAME_ID` URL;
- tied to a public GitHub repository and exact source commit;
- accompanied by its model, harness, prompt, tools, interventions, and build
  date when known;
- labeled with its relationship to earlier work;
- deployed by its contributor at a verified public HTTPS URL; and
- isolated from Mirage inside a restrictive cross-origin iframe.

The current benchmark publishes inspectable evidence rather than a ranked
leaderboard. A defensible comparison must freeze the task, model snapshot,
budget, harness, tools, and intervention policy, then combine hidden behavioral
scenarios, browser telemetry, and human playability review. That evaluation
layer is on the [roadmap](TODO.md); Mirage does not pretend unlike runs are
directly comparable.

## Start clean

The central question is what a model can build, not how well it can polish the
last model’s demo. Every run declares one lineage:

| Lineage       | Meaning                                                                  |
| ------------- | ------------------------------------------------------------------------ |
| `independent` | Built in a neutral, history-free repo without access to previous games   |
| `derived`     | Started from an identified earlier run, repository, prompt, or asset set |
| `unverified`  | The starting state or isolation record cannot be established             |

All three can teach us something, but they answer different questions. A prompt
that says “start from scratch” is not proof of independence.

For an independent run:

1. Create a brand-new public GitHub repository.
2. Open the coding agent of your choice inside that empty repository.
3. Paste the [Mirage game-agent prompt](submissions/AGENT_PROMPT.md).
4. Do not expose Mirage source, history, runs, screenshots, prompts, tests,
   assets, worktrees, or caches until the game is finished and frozen.

## From a coding agent to mirageml.com

Each attempt lives and deploys outside Mirage. This repository contains the
benchmark website, accepted evidence records, validation, and sandboxed player.

```text
brand-new public repository
  -> coding agent builds and plays the game
  -> contributor deploys the static output
  -> exact source commit and public URL are frozen
  -> Mirage pull request verifies the record and deployment
  -> accepted run appears at mirageml.com/play/GAME_ID
```

Contributors choose their static host. GitHub Pages is the no-additional-account
default; Cloudflare Pages, Vercel, Netlify, and other stable public HTTPS hosts
are also supported. Mirage does not receive hosting credentials or execute
contributor code.

The external deployment remains contributor-operated and therefore mutable.
Mirage verifies it during review and on a schedule. A provider move can update
only the deployment record; a new source revision or changed game becomes a new
benchmark run.

## Submit a run

1. Build, test, deploy, and freeze the game using the
   [copyable coding-agent prompt](submissions/AGENT_PROMPT.md).
2. Save the agent’s `MIRAGE_RUN_HANDOFF`.
3. Add one schema-complete `submissions/GAME_ID.json` record.
4. Open a pull request.
5. Pass source, deployment, cover, framing, lineage, provenance, and rights
   review.

The [submission guide](submissions/README.md) contains the exact JSON contract,
hosting rules, lineage examples, and review process. You can also open a
[model-built game proposal](https://github.com/KSHR-AI/Mirage/issues/new?template=demo.yml)
if you want help preparing the record.

## Work on MirageML Bench

Requirements: Node.js 24 and pnpm 11.7.

```bash
pnpm install --frozen-lockfile
pnpm dev
```

Open `http://localhost:3000`. The main areas are:

| Path                                           | Purpose                                             |
| ---------------------------------------------- | --------------------------------------------------- |
| [`app/gallery/`](app/gallery/)                 | Playable run gallery and selected-run evidence      |
| [`app/play/`](app/play/)                       | Stable Mirage player routes                         |
| [`app/registry/`](app/registry/)               | Accepted-record loader and strict runtime schema    |
| [`submissions/`](submissions/)                 | Source, deployment, provenance, and lineage records |
| [`scripts/submissions/`](scripts/submissions/) | Submission and live-deployment validation           |

Run the full quality gate before opening a control-plane pull request:

```bash
pnpm check
```

Read [CONTRIBUTING.md](CONTRIBUTING.md), the
[external deployment security model](docs/external-deployment-security.md),
and [deployment operations](docs/deployment-operations.md) before changing the
player, registry, or validation boundary.

## Open source

MirageML Bench is released under [Apache-2.0](LICENSE). By participating, you
agree to the [Code of Conduct](CODE_OF_CONDUCT.md). Report vulnerabilities
privately through
[GitHub Security Advisories](https://github.com/KSHR-AI/Mirage/security/advisories/new).
