# Submit a hosted game with your coding agent

Already have a game online? Paste everything below into a coding agent that has
a browser, and replace `PASTE_YOUR_GAME_LINK` with your public link. The agent
checks the link, plays the game, writes its record, and opens the pull request.

To build a new run from an empty repository instead, start with the
[game-agent prompt](AGENT_PROMPT.md).

```text
Submit a hosted game to MirageML Bench.

PLAY_URL=PASTE_YOUR_GAME_LINK

MirageML Bench asks one question: can a coding model build GTA in San
Francisco? Every accepted game is a run that anyone can play at
mirageml.com/play/GAME_ID inside a sandboxed frame. Your job: play this game,
record only what is true about it, and open one pull request that adds it.

Rules for the whole task
- Never guess. Anything you cannot observe and I cannot tell you is
  "unknown", "not-recorded", or null, as the template shows.
- You need a real browser with WebGL that you can click, type in, and
  screenshot. If you have none, or the game will not render in it, stop and
  tell me. Never write a record from the page source alone.
- Add exactly two files to Mirage: one record and one cover. Never copy game
  source, bundles, or credentials into it.

1. Check the link
   Run: curl -sS -o /dev/null -D - "PLAY_URL"
   - The status must be 200 with content-type text/html, served directly: no
     redirect or login, and no credentials, query string, or fragment in
     PLAY_URL.
   - No "X-Frame-Options: DENY" or "SAMEORIGIN". A Content-Security-Policy
     "frame-ancestors" directive, if present, must include
     https://mirageml.com.
   If a check fails, stop and tell me exactly what to change on my host.

2. Play it directly
   - Open PLAY_URL at 1280x720 or larger. Wait for loading to finish, then
     start the game the way a player would.
   - Read the browser console and note errors and failed requests.
   - Try every control the game advertises, one at a time, and confirm on
     screen that each input did something. Then try the core loop: move on
     foot, enter and drive a vehicle, attempt an objective, and restart.
   - Keep notes: the title shown in the game, what works, what fails, the
     controls that actually respond, and whether the city is San Francisco.
   - Capture the cover during real play: one 16:9 PNG or JPEG of the game
     itself, at least 1280x720 and under 2 MB, with no browser chrome, no
     loading or menu screen, and no edits.

3. Ask me once
   Send one message with these questions. I may answer "unknown" to any.
   - Which model built it, and in which coding harness?
   - Is the source public? If so, the GitHub repository and the exact
     40-character commit that is deployed.
   - When was it built (YYYY-MM-DD), and what was the prompt?
   - The code license, and the license of each third-party asset.
   - May Mirage publish your screenshot under CC0-1.0?

4. Write the record
   - Fork https://github.com/KSHR-AI/Mirage, clone your fork, and create the
     branch submit/GAME_ID. Read submissions/README.md.
   - Choose GAME_ID: lowercase letters, digits, and single hyphens, not
     already used in submissions/. It is permanent.
   - Save the cover as public/showcase-covers/GAME_ID.png (or .jpg).
   - Create submissions/GAME_ID.json from this template. Keep every key and
     add none; unknown keys are rejected.

     {
       "schemaVersion": 2,
       "id": "GAME_ID",
       "title": "The title shown in the game",
       "tagline": "One line, at most 180 characters",
       "description": "Two to four sentences on what a player can do.",
       "features": ["One observed feature, at most 120 characters"],
       "source": null,
       "deployment": {
         "url": "PLAY_URL",
         "provider": "The host, such as GitHub Pages or Cloudflare"
       },
       "lineage": {
         "kind": "unverified",
         "note": "Why the starting state cannot be established."
       },
       "provenance": {
         "builtOn": null,
         "model": "unknown",
         "modelSnapshot": null,
         "reasoning": null,
         "harness": "unknown",
         "tools": ["Not recorded"],
         "agentCount": null,
         "subagentCount": null,
         "humanInterventions": null,
         "prompt": {
           "status": "not-recorded",
           "text": null,
           "note": "Why the prompt is missing."
         }
       },
       "licenses": {
         "code": "NOASSERTION",
         "assetStatement": "What is known about code and asset rights, and what is not.",
         "assets": [
           {
             "name": "TITLE cover",
             "creator": "Who captured it",
             "license": "NOASSERTION",
             "sourceUrl": "PLAY_URL",
             "attribution": "Unaltered browser capture of the public deployment on YYYY-MM-DD."
           }
         ]
       },
       "presentation": {
         "coverPath": "/showcase-covers/GAME_ID.png",
         "coverAlt": "One sentence on what the cover shows",
         "controls": ["One working control per item"],
         "limitations": ["One observed limit or evidence gap per item"],
         "protocolVersion": 1
       }
     }

   - Replace a value only with something you observed or I told you. The
     values above are the correct ones for anything unknown.
   - "source" is { "repositoryUrl": "https://github.com/OWNER/REPO",
     "commit": "40 lowercase hex characters" } when I gave you both, else
     null. "builtOn" is YYYY-MM-DD or null.
   - "prompt.status" is "published" with the full "text", "partial" with the
     text and a note, or "not-recorded" with a note.
   - Licenses are SPDX identifiers, or NOASSERTION when unknown. Use CC0-1.0
     for the cover only if I said yes. Add one "assets" entry for every
     third-party asset or library you can identify.
   - In "limitations", state each evidence gap, each control or system that
     failed, each input mode you did not test, and that the city is not San
     Francisco if it is not.

5. Verify in Mirage
   - Use Node.js 24 and pnpm 11.7. Run "pnpm install --frozen-lockfile", then
     "pnpm submissions:validate", and fix the record until it passes.
   - Run "pnpm dev" and open http://localhost:3000/play/GAME_ID. Mirage frames
     the game with scripts and pointer lock only: no same-origin access,
     storage, forms, or popups. Play it again there with the same controls.
     Add anything that fails only in the frame to "limitations". If the game
     cannot be played in the frame at all, stop and tell me why.
   - Open http://localhost:3000 and confirm the run and its cover appear.
   - Commit the two files, then run the checks the pull request will run:
       node scripts/submissions/validate-submissions.mjs --mode changed --base origin/main --head HEAD --output /tmp/mirage-plan.json
       node scripts/submissions/verify-deployments.mjs --plan /tmp/mirage-plan.json

6. Open the pull request
   - "git status" and the diff against main must show only the record and
     the cover.
   - Push the branch to your fork and open a pull request against main of
     KSHR-AI/Mirage titled "Add TITLE". Fill in the repository's pull request
     template: say what you played directly and in the frame, what worked, and
     what did not.
   - Give me the pull request link and a three-line summary.
```

After the pull request opens, Mirage’s preflight verifies the record and the
live link. A maintainer plays the game before merge. See
[the submission guide](README.md) for the full record contract.
