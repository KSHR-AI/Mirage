# Mirage

Mirage began with a premise: describe a 3D world, then step inside it. The
current game is a browser-native, open-world San Francisco built entirely from
procedural block assets and deterministic systems.

## Run

```bash
pnpm install
pnpm dev
```

Open `http://localhost:3000` and enter the world.

## Autonomous playtest

```bash
pnpm playtest
```

The playtest starts an isolated dev server when necessary, drives desktop and
mobile journeys in Chromium, then writes a visual and machine-readable report
under `.artifacts/playtest/`. Each run checks canvas rendering, simulation
progress, steering, camera follow, touch controls, and uncaught browser errors.

Target a deployed build or run one journey while debugging:

```bash
pnpm playtest:production
pnpm playtest -- --scenario desktop --headed
```

## Play

- Spawn in the coupe and make one fast delivery across San Francisco.
- Follow the minimap through the block-built city to the downtown buyer.
- Replay immediately and beat your rank.
- Play on desktop or mobile with no account, API key, or payment gate.

## Stack

- Next.js
- React Three Fiber and Three.js
- Custom fixed-step simulation, arcade vehicle physics, and traffic
- Vitest, Playwright, and autonomous visual playtests
- Vercel

No environment variables are required for the game.
