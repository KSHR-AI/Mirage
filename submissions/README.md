# Submit a run to MirageML Bench

MirageML Bench asks one public question: **can a coding model build GTA in San
Francisco?**

Your coding agent builds one game in a brand-new repository. You host the
finished static game. Mirage verifies the public source commit and deployment,
records how the run was produced, and makes it playable at
`mirageml.com/play/GAME_ID`.

## Fast path

1. Create a new, empty, public GitHub repository.
2. Open the coding agent of your choice inside that repository.
3. Paste the complete [Mirage game-agent prompt](AGENT_PROMPT.md).
4. Let the agent build, test, push, and deploy the game.
5. Freeze the source commit and save the agent’s `MIRAGE_RUN_HANDOFF`.
6. Fork Mirage and add exactly one `submissions/GAME_ID.json` file.
7. Open a pull request. Mirage checks the record, exact GitHub commit, live
   deployment, cover, and iframe headers.
8. After review and merge, the next Mirage deployment adds the run to the
   benchmark.

Do not open Mirage in the game-building agent’s environment until the game has
been committed, deployed, and frozen. This prevents previous implementations
from leaking into an independent attempt.

## Hosting

You choose and operate the static host. GitHub Pages, Cloudflare Pages, Vercel,
Netlify, or another public HTTPS provider is acceptable.

- GitHub Pages is the simplest default when you want no additional hosting
  account.
- Another provider may be better for larger assets, heavier traffic, custom
  response headers, or different deployment limits.
- Mirage does not accept localhost, authenticated previews, expiring share
  links, redirects, URLs with credentials, query strings, or fragments.
- The game must allow `https://mirageml.com` to frame it. Do not send
  `X-Frame-Options: DENY` or `SAMEORIGIN`. A CSP `frame-ancestors` directive
  must include `https://mirageml.com`.
- The deployment and its cover must return HTTP 200 with the correct HTML or
  image content type.

The live deployment remains under your control, so it is not immutable. Mirage
verifies it when you submit and checks accepted deployments on a schedule. Keep
the accepted URL online and do not change the game served there. You may update
only the `deployment` object to move the same frozen run to another host; Mirage
re-verifies the replacement. A source, gameplay, prompt, provenance, license, or
presentation change is a new run with a new ID.

## Static game contract

The frozen source revision must:

- be public at exactly `https://github.com/OWNER/REPOSITORY`;
- use Node.js 24 and pnpm 11.7 with a committed `pnpm-lock.yaml`;
- define `pnpm run build:mirage`;
- emit a self-contained game at `dist/index.html`;
- bundle required runtime assets and use relative paths;
- work below a hosting-provider subpath;
- require no server, database, login, secret, private API, or mutable CDN;
- work in an opaque-origin iframe without same-origin privileges, third-party
  cookies, or persistent storage;
- accept `?embed=mirage` and remove redundant chrome in embed mode;
- support keyboard controls and every other input mode it claims;
- include the declared cover image in `dist/`; and
- include compatible code and per-asset licensing.

Mirage does not execute contributor code. The pull request verifies the public
deployment and the pinned source identity; maintainers review playability,
lineage, provenance, and rights.

## Submission file

Create `submissions/GAME_ID.json`. `GAME_ID` is a permanent lowercase kebab-case
identifier. The filename and `id` must match.

Use this schema-complete example as a shape, not as evidence to copy:

```json
{
  "schemaVersion": 2,
  "id": "night-drive-001",
  "title": "Night Drive",
  "tagline": "One city, one clean attempt",
  "description": "A complete browser driving game.",
  "features": ["Driving", "Mission loop"],
  "source": {
    "repositoryUrl": "https://github.com/example/night-drive",
    "commit": "1111111111111111111111111111111111111111"
  },
  "deployment": {
    "url": "https://example.github.io/night-drive/",
    "provider": "GitHub Pages"
  },
  "lineage": {
    "kind": "independent",
    "seedDigest": "sha256:3333333333333333333333333333333333333333333333333333333333333333"
  },
  "provenance": {
    "builtOn": "2026-07-29",
    "model": "example-model",
    "modelSnapshot": "example-model-2026-07-29",
    "reasoning": "high",
    "harness": "Codex",
    "tools": ["apply_patch", "browser"],
    "agentCount": 1,
    "subagentCount": 0,
    "humanInterventions": 0,
    "prompt": {
      "status": "published",
      "text": "Build a complete browser driving game.",
      "note": "Exact prompt preserved."
    }
  },
  "licenses": {
    "code": "Apache-2.0",
    "assetStatement": "All visual assets are original procedural geometry.",
    "assets": []
  },
  "presentation": {
    "coverPath": "assets/cover.webp",
    "coverAlt": "A procedural car driving through a city at night",
    "controls": ["WASD to drive"],
    "limitations": ["Desktop browsers are best tested"],
    "protocolVersion": 1
  }
}
```

The executable validator is
[`scripts/submissions/submission.mjs`](../scripts/submissions/submission.mjs).
The machine-readable schema is
[`scripts/submissions/submission.schema.json`](../scripts/submissions/submission.schema.json).
Unknown fields are rejected.

## Lineage

Choose exactly one:

```json
{
  "kind": "independent",
  "seedDigest": "sha256:..."
}
```

Use `independent` only when the model began in a neutral, history-free
repository and could not access prior runs. Preserve the seed digest and runner
evidence. A prompt saying “do not inspect previous games” does not prove
isolation.

```json
{
  "kind": "derived",
  "parentId": "earlier-game-id",
  "parentSource": {
    "repositoryUrl": "https://github.com/example/earlier-game",
    "commit": "2222222222222222222222222222222222222222"
  }
}
```

Use `derived` when the run began from an earlier implementation, reproduction,
fork, prompt, or asset set. The parent repository and exact commit must match
the accepted parent record.

```json
{
  "kind": "unverified",
  "note": "The runner isolation record was not preserved."
}
```

Use `unverified` when the starting state or isolation cannot be established.
All three categories are useful; they answer different questions.

## Provenance and licenses

Record what happened without filling gaps:

- use the exact model and snapshot when known;
- preserve the complete prompt, mark it `partial`, or explain
  `not-recorded`;
- record the harness, tools, agent counts, and human interventions;
- describe observable features and limitations, not a model score;
- identify every third-party font, audio file, image, model, texture, and
  other asset with its creator, source, SPDX license, and attribution; and
- use original, procedural, public-domain, or explicitly licensed assets.

Do not use Rockstar or Take-Two code, characters, logos, maps, audio, extracted
assets, or material whose distribution rights are uncertain.

## Review, updates, and removal

The submission preflight is read-only. It checks the full record collection,
confirms the GitHub commit exists, rejects non-public deployment hosts, and
verifies the game and cover responses without receiving contributor
credentials.

Accepted benchmark evidence is immutable. A new source commit, changed game,
rerun, dependency rebuild, corrected prompt, changed provenance, new license
record, or presentation change gets a new ID. A deployment-only edit is allowed
for relocating the unchanged frozen run and must pass preflight again.

Deleting `submissions/GAME_ID.json` in a reviewed pull request removes the run
from Mirage discovery after the next application deployment. Report security
or legal issues privately through
[GitHub Security Advisories](https://github.com/KSHR-AI/Mirage/security/advisories/new).

Read [CONTRIBUTING.md](../CONTRIBUTING.md) for project-wide review rules.
