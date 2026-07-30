# Contributing to MirageML Bench

Mirage accepts new coding-model game runs, benchmark and player improvements,
bug fixes, tests, and documentation through public pull requests.

## Choose a contribution path

- New benchmark run: build and deploy it in a separate public repository, then
  follow [the submission guide](submissions/README.md).
- Mirage website or validation: fork this repository, branch from current
  `main`, make one focused change, and open a pull request.

Never add game source, generated game bundles, hosting credentials, Git
submodules, or Git subtrees to Mirage.

## Build a new benchmark run

### Start outside Mirage

Create a brand-new public GitHub repository and open the coding agent of your
choice there. Give it the complete
[Mirage game-agent prompt](submissions/AGENT_PROMPT.md).

For an independent attempt, the model must not access Mirage source, Git
history, previous games, prompts, screenshots, tests, assets, build output,
worktrees, or caches until its game is finished, committed, pushed, and
deployed. If that isolation cannot be established, label the run `unverified`.
If it began from earlier work, label it `derived` and pin the exact parent.

One repository and source commit represent one frozen attempt. A rerun,
dependency rebuild, source change, prompt correction, or material behavior
change receives a new ID and record.

### Freeze reproducible public source

The source repository must:

- be public at exactly `https://github.com/OWNER/REPOSITORY`;
- be pinned by a full lowercase 40-character commit;
- use Node.js 24 and pnpm 11.7 with a committed `pnpm-lock.yaml`;
- define `pnpm run build:mirage`;
- emit a self-contained `dist/index.html`;
- contain source and third-party licenses; and
- require no private package, submodule, service, or credential.

### Supply a playable public deployment

Deploy `dist/` to GitHub Pages, Cloudflare Pages, Vercel, Netlify, or another
stable static HTTPS host. The deployment must:

- return the game directly with HTTP 200 and `text/html`;
- use no authentication, redirect, credentialed URL, query, or fragment;
- load every required runtime asset from public HTTPS URLs;
- resolve the declared relative cover path to a valid image response;
- work below its deployment path and inside an opaque-origin iframe;
- accept `?embed=mirage`;
- omit `X-Frame-Options: DENY` and `SAMEORIGIN`; and
- allow `https://mirageml.com` in CSP `frame-ancestors` when that directive is
  present.

The contributor operates the deployment. Mirage verifies it at submission time
and on a schedule but does not archive or host a copy. Do not change the game
served at an accepted URL.

### Record evidence without inventing it

The submission records:

- title, description, observable features, controls, limitations, and cover;
- source repository, exact commit, deployment URL, and hosting provider;
- model, snapshot, reasoning level, harness, tools, agents, interventions, and
  build date;
- exact prompt, a labeled partial prompt, or a specific `not-recorded` note;
- independent, derived, or unverified lineage; and
- source license plus creator, source, license, and attribution for every
  third-party asset.

Use `null`, `unknown`, or the schema’s uncertainty form instead of estimating
missing evidence. Do not turn tests, feature counts, or impressions into a
model score.

Use original, procedural, public-domain, or explicitly licensed assets. Do not
use Rockstar or Take-Two code, characters, logos, maps, audio, extracted assets,
or material whose redistribution rights are uncertain.

## Submission review

1. A pull request adds `submissions/GAME_ID.json`.
2. Read-only preflight validates the changed record and the complete active
   lineage graph.
3. Preflight confirms that the exact GitHub commit exists.
4. Preflight safely fetches the deployment and cover, rejects redirects and
   private-network destinations, and checks content types and iframe headers.
5. Maintainers play the run and review isolation, provenance, and rights.
6. Merge accepts the record. Mirage’s normal production deployment makes the
   run available at `mirageml.com/play/GAME_ID`.

Contributor code is never executed by Mirage and receives no Mirage or hosting
credential. Playback occurs in a sandbox without same-origin, forms, popups,
downloads, storage access, or top-navigation privileges.

## Updates and removal

Accepted evidence is immutable. A changed source commit, build, game, prompt,
provenance field, license record, or presentation field receives a new ID.

You may update only `deployment.url` and `deployment.provider` to relocate the
same frozen run. The replacement must pass preflight before merge. Deleting the
submission in a reviewed pull request removes the run from discovery after the
next Mirage deployment.

Report a security or legal issue privately according to
[SECURITY.md](SECURITY.md).

## Mirage control-plane pull requests

For website, registry, player, validation, documentation, or infrastructure
changes:

1. Search existing issues and pull requests.
2. Fork current `main` and make one focused change.
3. Use Node.js 24 and pnpm 11.7.
4. Install with `pnpm install --frozen-lockfile`.
5. Run `pnpm check`.
6. Describe the user-visible result, validation, highest-risk behavior,
   rollback, and licenses.

Keep unrelated changes separate. Never include secrets, private transcripts,
user data, or unsupported model-performance claims.

By participating, you agree to the [Code of Conduct](CODE_OF_CONDUCT.md).
