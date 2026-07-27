# Mirage benchmark protocol

Mirage evaluates whether a foundation model can create a playable, AAA-style
open-world game set in San Francisco. The benchmark website is also the public
artifact registry: visitors can inspect a run and play the exact game it
produced.

## Independent-run contract

Comparable runs must:

1. begin from the same frozen task release and clean repository state;
2. receive the same prompt, budget, tools, agent allowance, and evaluation
   harness;
3. publish every trial, including failed runs;
4. pin the model snapshot, source commit, playable artifact, and evidence; and
5. remain isolated from previous game implementations.

The current Hot Drop run predates this protocol. Its setup evidence is
incomplete, so it remains playable but does not establish a comparable model
score.

## Adding a game

Open a pull request containing a versioned run manifest under
`benchmark/submissions/`. An accepted entry may point to:

- a reviewed, self-contained game route added under `app/play/<run-id>/`; or
- an immutable HTTPS artifact deployed on a separate origin.

Do not replace an existing game or mutable manifest. New attempts receive new
run IDs. External artifacts are sandboxed and must not require benchmark-site
cookies, credentials, camera, microphone, geolocation, clipboard, or payment
access.

Each manifest records:

- task and run identifiers;
- exact model and source revision;
- immutable playable-artifact URL;
- playability and comparison eligibility;
- a clearly labeled, submitter-reported progress estimate;
- capability and evidence summaries; and
- links to source and evaluation records.

The static registry is intentionally pull-request driven. This keeps the first
public version auditable without introducing accounts, a database, or a
write-enabled submission API.

Run `pnpm catalog:generate` after adding a task or submission manifest. Commit
the generated catalog and run `pnpm check`; CI rejects stale catalogs. All
submitted code and assets must be Apache-2.0-compatible or carry explicit,
reviewed licensing and attribution.
