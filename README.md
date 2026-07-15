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

The playtest starts an isolated dev server when necessary, exercises desktop
and mobile input in Chromium, then writes a visual and machine-readable report
under `.artifacts/playtest/`. It checks canvas rendering, lane control, camera
tracking, render budget, touch controls, no-input route completion, replay, and
uncaught browser errors.

Target a deployed build or run one journey while debugging:

```bash
pnpm playtest:production
pnpm playtest -- --scenario desktop --headed
```

## Play

- Start already moving, collect the package, and escape a road-bound pursuit.
- Clear three route gates, hit the waterfront ramp, and deliver to Pier 11.
- Change lanes to dodge traffic; boost and brake control your pace.
- Replay immediately to improve time, score, near misses, and rank.
- Play on desktop or mobile with no account, API key, or payment gate.

## Stack

- Next.js
- React Three Fiber and Three.js
- Custom fixed-step arcade simulation, recovery, traffic, and pursuit
- Vitest, Playwright, and autonomous visual playtests
- Vercel

No environment variables are required for the game.
