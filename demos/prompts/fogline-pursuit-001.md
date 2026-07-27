# Mirage independent build brief

Starting from commit `507d32ec1edbdf22ca09f4194824fb8575b81cab`,
independently create a new browser-native, GTA-inspired 3D game set in San
Francisco. Do not inspect, import, copy, or adapt the implementations or assets
in `app/game`, `app/game3d`, or any existing `app/play/*` route. You may use
dependencies already present in the starting repository.

Publish the game at `/play/fogline-pursuit-001`. The result should feel like a
complete, replayable vertical slice rather than a technical scene:

- Immediate, readable arcade driving with acceleration, braking, reversing,
  steering, and a handbrake.
- A two-to-four-minute criminal getaway loop with a clear beginning, escalating
  objectives, success, failure, and instant restart.
- A strong San Francisco identity expressed through the world, atmosphere,
  streets, hills, landmarks, or mission fiction.
- Persistent objective guidance that makes the next destination unambiguous
  without obscuring play.
- Police that visibly pursue the player, recover from obstacles, and create
  pressure rather than merely spawning nearby.
- A polished third-person presentation, legible HUD, keyboard controls, and
  usable touch controls.
- Behavioral tests for driving, mission progression, collision boundaries, and
  pursuit effectiveness.

Own the architecture and visual direction. Use only original procedural
geometry or repository-safe assets. Play the result in a browser, inspect
runtime errors, and iterate on handling, camera, navigation, police pressure,
readability, and performance until you are proud of the build.
