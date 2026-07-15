# Mirage

Mirage began with a premise: describe a 3D world, then step inside it. The
current game is **The Drop**, a compact browser-native arcade mission through a
handcrafted block-built San Francisco.

## Run

```bash
pnpm install
pnpm dev
```

Open `http://localhost:3000` and start the run.

## Autonomous playtest

```bash
pnpm playtest
```

The playtest starts an isolated dev server when necessary, drives desktop and
mobile journeys in Chromium, then writes a visual and machine-readable report
under `.artifacts/playtest/`. Each run checks canvas rendering, simulation
progress, steering, fixed camera, render budget, touch controls, full mission
completion, replay, and uncaught browser errors.

Target a deployed build or run one journey while debugging:

```bash
pnpm playtest:production
pnpm playtest -- --scenario desktop --headed
```

## Play

- Start already moving, collect the package, and escape a road-bound pursuit.
- Clear three route gates, hit the waterfront ramp, and deliver to Pier 11.
- Use steering, boost, and brake; the camera follows automatically.
- Replay immediately to improve time, score, near misses, and rank.
- Play on desktop or mobile with no account, API key, or payment gate.

## Stack

- Next.js
- React Three Fiber and Three.js
- Custom fixed-step arcade simulation, recovery, traffic, and pursuit
- Vitest, Playwright, and autonomous visual playtests
- Vercel

No environment variables are required for the game.
