# Adding a demo to Mirage

Mirage collects playable browser games built by coding models. A gallery entry
should let a visitor play the work immediately and understand how it was made.
There are no grades, rankings, or claims that separate builds are directly
comparable.

## What belongs

A submission should be:

- materially created by a coding model or model-driven agent;
- playable in a modern browser without an account;
- complete enough to communicate a game loop, interaction, or technical idea;
- pinned to a public source revision or immutable artifact; and
- safe to embed without cookies, credentials, camera, microphone, location,
  clipboard, payments, or access to private data.

## Required files

Add a unique JSON record under `demos/entries/`. It must include:

- `id`, `title`, `tagline`, and concise description;
- model name, build date, and 40-character source commit;
- stable play, source, and cover-image URLs;
- the build brief when it was preserved;
- available agent setup and build metadata;
- code and asset licensing state; and
- a short list of observable features.

The record must describe what exists. Do not convert tests, feature counts,
subjective impressions, or completion estimates into a model grade.

An accepted artifact may be:

- a reviewed, self-contained route under `app/play/DEMO_ID/`; or
- an immutable HTTPS deployment on a separate origin.

## Pull-request workflow

1. Choose a new demo ID. Do not replace an older build.
2. Add the reviewed route or pinned external artifact.
3. Add the record under `demos/entries/`.
4. Put long-form build briefs in `demos/prompts/` when useful.
5. Add a licensed cover image under `public/demos/`.
6. Regenerate the catalog:

   ```bash
   pnpm catalog:generate
   ```

7. Run the full gate:

   ```bash
   pnpm check
   ```

8. Play the main loop, test the gallery embed, and inspect the browser console.
9. Open a pull request describing the visible result, source, known limitations,
   and licenses.

The pull request and Git history provide the review trail. No submission API or
special service account is required.
