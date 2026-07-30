# External deployment operations

## Acceptance

Before merging a new submission:

1. require `CI` and `submission-preflight`;
2. confirm the source repository and exact commit are public;
3. open the submitted deployment through the Mirage preview;
4. play with the declared controls;
5. inspect loading and console failures;
6. confirm the cover, title, limitations, prompt status, lineage, and licenses;
7. confirm that no unsupported model score or independence claim appears; and
8. merge only the single accepted record and related documentation.

The normal Mirage production deployment from `main` registers the run. There is
no separate game publication job.

## Scheduled health checks

`.github/workflows/submission-preflight.yml` validates every active deployment
daily and on manual dispatch. A failure means the deployment was not verifiable
at that time; it does not automatically prove malicious modification.

Check:

1. whether the GitHub source commit still resolves;
2. deployment DNS and certificate health;
3. HTTP status, redirects, and content type;
4. `X-Frame-Options` and CSP `frame-ancestors`;
5. cover availability; and
6. the game through the production Mirage player.

Retry a transient provider or DNS failure before changing the registry.

## Relocation

If the same frozen game moves hosts, change only:

```json
{
  "deployment": {
    "url": "https://new-public-host.example/game/",
    "provider": "New provider"
  }
}
```

Preflight must verify the replacement. Do not change source, provenance,
lineage, licenses, presentation, or descriptive evidence in the relocation pull
request.

## Changed game

A new source commit, rebuild, gameplay change, prompt correction, dependency
change, license correction, or presentation change is a new benchmark run with
a new ID. Do not overwrite what an accepted run demonstrated.

## Delisting

Delete `submissions/GAME_ID.json` in a reviewed pull request when the deployment
is persistently unavailable, ownership is lost, evidence is materially false,
or security or rights review requires removal.

Delisting removes the game from Mirage after the next production deployment. It
does not delete the contributor’s repository or deployment.

For an active exploit or legal issue:

1. report privately through GitHub Security Advisories;
2. avoid loading the external URL during investigation;
3. prepare the smallest delisting change;
4. deploy Mirage from protected `main`; and
5. record the decision and any follow-up separately from the immutable run.
