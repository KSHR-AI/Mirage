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

The playtest starts an isolated dev server when necessary, drives desktop,
narrow-window, and mobile-touch journeys in Chromium, then writes a visual and
machine-readable report under `.artifacts/playtest/`. Each run checks canvas
rendering, simulation progress, camera-relative movement, mouse and touch look,
vehicle entry, acceleration, and uncaught browser errors.

Target a deployed build or run one journey while debugging:

```bash
pnpm playtest:production
pnpm playtest -- --scenario narrow --headed
```

## Play

- Explore San Francisco on foot or by car.
- Run The Afterlight Job from SoMa to the Golden Gate.
- Evade a rising police pursuit through a living city.
- Play on desktop or mobile with no account, API key, or payment gate.

## Stack

- Next.js
- React Three Fiber and Three.js
- Custom fixed-step simulation, vehicle physics, traffic, and combat
- Vitest, Playwright, and autonomous visual playtests
- Vercel

No environment variables are required for the game.
