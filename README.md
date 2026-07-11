# Mirage: Bay City

Mirage began with a premise: describe a 3D world, then step inside it. Bay City
is a browser-native open-world San Francisco built to test how far a coding
model can take that original vision. The public project is a showcase for
AI-created, in-browser 3D games built with Three.js.

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
- Run four missions from SoMa to the Golden Gate.
- Evade a rising police pursuit through a living city.
- Play on desktop or mobile with no account, API key, or payment gate.

## Stack

- Next.js
- React Three Fiber and Three.js
- Rapier physics
- Vercel

No environment variables are required for the game.
