# Mirage benchmark

[![CI](https://github.com/KSHR-AI/Mirage/actions/workflows/ci.yml/badge.svg)](https://github.com/KSHR-AI/Mirage/actions/workflows/ci.yml)
[![Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)

Mirage is a public, playable benchmark for foundation models. The task is
deliberately ambitious and legible: create a playable, AAA-style open-world game
set in San Francisco that runs entirely in the browser.

Every model run starts from the same clean benchmark release and produces a
separate game. The site is both the progress record and artifact registry:
visitors can inspect the evidence for a run, then play the exact game it
produced.

- Repository: [KSHR-AI/Mirage](https://github.com/KSHR-AI/Mirage)
- Live benchmark: [mirage-kshr.vercel.app](https://mirage-kshr.vercel.app)
- Contribution protocol: [benchmark/README.md](benchmark/README.md)

## What it benchmarks

- Long-horizon work across an evolving, interconnected codebase.
- Real-time 3D graphics and rigid-body physics under browser constraints.
- Game-system design, control tuning, navigation, and adversarial police AI.
- Translation of play-test feedback into precise, regression-tested changes.
- End-to-end ownership from implementation through a deployed playable build.

## Current run

The current featured run, model, submitter-reported progress estimate, status,
play URL, source commit, evidence, imagery, and benchmark metadata are read from
the versioned task and submission manifests. Do not duplicate those values in
components, routes, or documentation.

Progress is a vibes-based estimate supplied by each run submitter. It is not an
evaluator score. Comparable rankings begin only when models share the same
frozen task, starting commit, budget, tools, and evaluation harness.

The current vertical slice is powered by Three.js and Rapier. Steal the marked
car, collect a package across town, then reach the safehouse while the police
response escalates. Bail out and steal traffic cars to trade speed, durability,
and cargo protection—or cut your heat with an unseen switch.

## Play the current run

- Move on foot or drive with WASD or the arrow keys; the camera chases the
  active player.
- Press E to enter or exit a ride and steal any nearby traffic car.
- Hold Space to handbrake through corners.
- Drift, jump physical ramps, smash props, and thread near misses for bonuses.
- Choose the fast Flash, heavy Bruiser, or armored Lockbox van.
- Press R at any time for an immediate restart.

Touch controls appear automatically on mobile devices. `/play` redirects to the
featured run declared by the task manifest; each immutable run owns its route
and artifact details in its submission manifest.

## Runtime

- `game3d/gameplay.ts` owns mission, score, heat, arrest, and cargo rules.
- `game3d/simulation.ts` owns the fixed-step Rapier world, arcade tire forces,
  vehicle swapping, collisions, traffic, pursuit, ramps, and props.
- `game3d/presentation.ts` projects simulation state into a generated Three.js
  city and third-person camera without owning gameplay.

## Add a model run

Run submission is pull-request driven. Add a versioned manifest under
`benchmark/submissions/` and either a reviewed in-repository game route or a
pinned external artifact. Existing runs are immutable; a new attempt always
gets a new run ID. See [benchmark/README.md](benchmark/README.md) for the
protocol.

## Develop

```bash
pnpm install --frozen-lockfile
pnpm dev
```

Open `http://localhost:3000`.

Run the complete type, format, gameplay, physics, and production-build gate with
`pnpm check`.

The default development and production commands use Next.js, matching Vercel.
The legacy Sites-compatible Vinext commands remain available as `dev:sites`,
`build:sites`, and `start:sites`.

## Open-source project

Mirage is licensed under [Apache-2.0](LICENSE). Contributions are welcome through
the protected pull-request workflow; read [CONTRIBUTING.md](CONTRIBUTING.md),
[CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md), and [SECURITY.md](SECURITY.md) before
participating.

Mirage is an independent research benchmark and is not affiliated with,
endorsed by, or sponsored by Rockstar Games or Take-Two Interactive.
