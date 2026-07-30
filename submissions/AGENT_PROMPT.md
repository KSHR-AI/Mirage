# Give this prompt to your coding agent

Create a brand-new public GitHub repository before starting. Open the coding
agent of your choice inside that empty repository, then paste everything below.
Do not clone or open Mirage until the agent has finished, pushed, deployed, and
reported the final source commit.

```text
Build one independent MirageML Bench run.

You are working inside a brand-new repository. Until the game is finished,
committed, pushed, and deployed, do not inspect, clone, search for, or reuse the
Mirage repository, previous MirageML Bench runs, existing game implementations,
screenshots, prompts, tests, assets, worktrees, build output, or caches.

The benchmark question is:

“Can a coding model build GTA in San Francisco?”

Build the most complete original browser-based open-world driving game you can.
“GTA” describes the genre-level ambition; it is not permission to reproduce
Grand Theft Auto. Do not use Rockstar or Take-Two code, names, characters,
logos, maps, audio, extracted assets, or other protected material. Use original,
procedural, public-domain, or properly licensed assets and record every
third-party asset.

Product priorities:

- Let the player begin playing quickly.
- Make driving controllable, responsive, and worth practicing.
- Create a recognizable San Francisco-inspired world to explore.
- Include at least one objective or mission loop with clear success or failure.
- Prefer interacting systems and finished game feel over a long feature list.
- Handle restart, resize, loading, and runtime failure cleanly.
- Test the production game by actually using its controls in a browser.

Technical contract:

- Use Node.js 24 and pnpm 11.7.
- Commit package.json, pnpm-lock.yaml, source code, README.md, LICENSE, and all
  required runtime assets.
- Define `pnpm run build:mirage`.
- Make that command emit a self-contained static game at `dist/index.html`.
- Bundle runtime dependencies and use relative asset URLs so the game works
  below a hosting-provider subpath.
- Require no server, database, login, secret, private API, paid service, or
  mutable CDN dependency.
- Do not collect private user data or require forms, popups, downloads,
  clipboard, camera, microphone, or location.
- Work in a sandboxed cross-origin iframe without same-origin privileges,
  third-party cookies, or persistent storage.
- Support keyboard input. Support touch or gamepad only if you declare and test
  it.
- Accept `?embed=mirage` and remove redundant site chrome in embed mode.
- Include a licensed AVIF, GIF, JPEG, PNG, or WebP cover inside `dist/`.

Hosting contract:

- Deploy `dist/` to a stable, public HTTPS URL. GitHub Pages, Cloudflare Pages,
  Vercel, Netlify, or another static host is acceptable.
- Prefer GitHub Pages when the repository owner wants no additional hosting
  account. Prefer another provider when the game needs different asset,
  bandwidth, or response-header limits.
- The submitted play URL must return the game directly with HTTP 200. It must
  not require authentication or redirect to another URL.
- The play URL must contain no credentials, query string, or fragment.
- Allow mirageml.com to embed the game. Do not send `X-Frame-Options: DENY` or
  `X-Frame-Options: SAMEORIGIN`. If you set CSP `frame-ancestors`, include
  `https://mirageml.com`.
- Confirm the deployed cover URL returns an image and all production assets
  load from the deployment.

Freeze the run:

1. Run the production build and project tests.
2. Play the deployed game with its real controls.
3. Fix blocking build, loading, console, control, and gameplay failures.
4. Commit and push the final source.
5. Wait for the public deployment to serve that exact revision.
6. Record the full 40-character source commit.
7. Do not modify or redeploy the game after recording the submission details.

When finished, return exactly this handoff, filling unknown evidence with
`unknown` rather than guessing:

MIRAGE_RUN_HANDOFF
REPOSITORY_URL=
SOURCE_COMMIT=
PLAY_URL=
HOSTING_PROVIDER=
GAME_TITLE=
TAGLINE=
DESCRIPTION=
FEATURES=
CONTROLS=
COVER_PATH=
KNOWN_LIMITATIONS=
MODEL=
MODEL_SNAPSHOT=
REASONING_LEVEL=
CODING_HARNESS=
TOOLS_USED=
AGENT_COUNT=
SUBAGENT_COUNT=
HUMAN_INTERVENTIONS=
PROMPT_STATUS=published
CODE_LICENSE=
ASSET_LICENSE_NOTES=
BUILD_CHECKS=
PLAY_CHECKS=
END_MIRAGE_RUN_HANDOFF
```

After the handoff is frozen, follow [the submission guide](README.md). At that
point the agent may inspect Mirage solely to prepare
`submissions/GAME_ID.json`; it must not return to or modify the game repository.
