# Mirage: GTA in SF

Mirage is a living ML benchmark for frontier coding models. The task is
deliberately ambitious and legible: design, implement, test, and continuously
improve a GTA-inspired 3D game that runs entirely in the browser.

The playable game is both the benchmark and its artifact. Each iteration asks a
frontier coding model to turn qualitative feedback into a working system across
graphics, physics, driving, police AI, missions, interface design, tests, and
deployment.

## What it benchmarks

- Long-horizon work across an evolving, interconnected codebase.
- Real-time 3D graphics and rigid-body physics under browser constraints.
- Game-system design, control tuning, navigation, and adversarial police AI.
- Translation of play-test feedback into precise, regression-tested changes.
- End-to-end ownership from implementation through a deployed playable build.

The current vertical slice is powered by Three.js and Rapier. Steal the marked
car, collect a package across town, then reach the safehouse while the police
response escalates. Bail out and steal traffic cars to trade speed, durability,
and cargo protection—or cut your heat with an unseen switch.

## Play

- Move on foot or drive with WASD or the arrow keys; the camera chases the
  active player.
- Press E to enter or exit a ride and steal any nearby traffic car.
- Hold Space to handbrake through corners.
- Drift, jump physical ramps, smash props, and thread near misses for bonuses.
- Choose the fast Flash, heavy Bruiser, or armored Lockbox van.
- Press R at any time for an immediate restart.

Touch controls appear automatically on mobile devices. The original top-down
build remains playable at `/?mode=2d`.

## Runtime

- `game3d/gameplay.ts` owns mission, score, heat, arrest, and cargo rules.
- `game3d/simulation.ts` owns the fixed-step Rapier world, arcade tire forces,
  vehicle swapping, collisions, traffic, pursuit, ramps, and props.
- `game3d/presentation.ts` projects simulation state into a generated Three.js
  city and third-person camera without owning gameplay.

## Develop

```bash
pnpm install
pnpm dev
```

Open `http://localhost:3000`.

Run the complete type, format, gameplay, physics, and production-build gate with
`pnpm check`.
