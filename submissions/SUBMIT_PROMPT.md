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
- Where submissions/README.md or the pull request template disagrees with
  this prompt, follow this prompt and say so in the pull request.

1. Check the link
   Run: curl -sS -o /dev/null -D - "PLAY_URL"
   - The status must be 200 with content-type text/html, served directly: no
     redirect or login, and no credentials, query string, or fragment in
     PLAY_URL.
   - No "X-Frame-Options: DENY" or "SAMEORIGIN". A Content-Security-Policy
     "frame-ancestors" directive, if present, must include
     https://mirageml.com.
   If a check fails, stop and tell me exactly what the host must change.

2. Play it directly
   - Set the browser viewport to exactly 1280x720, then open PLAY_URL. Wait
     for loading to finish and start the game the way a player would.
   - Send real key presses and hold movement keys for a second or more.
     Synthetic events and quick taps often do nothing in a game.
   - Read the browser console and note errors and failed requests.
   - Test every control shown on the HUD or the first help screen, one at a
     time, and confirm on screen that each did something. Then try the core
     loop: move on foot, enter and drive a vehicle, attempt an objective, and
     restart with the game's own control, or by reloading if it has none.
   - Spend about fifteen minutes. If the game runs below about ten frames per
     second because your browser renders in software (SwiftShader, llvmpipe),
     limit the playtest to loading, starting, movement, and one vehicle, and
     tell me the playtest was shallow.
   - Open any credits, licences, or about page the game links to. What it
     publishes is evidence for the record; quote it as the deployment's claim.
   - Keep notes: the title shown in the game, what works, what fails, the
     controls that respond, the controls you did not test, the renderer and
     rough frame rate, and which city the game is set in.
   - Capture the cover during real play: one 1280x720 PNG or JPEG of the game
     itself, under 2 MB, with no browser chrome, no loading or menu screen,
     and no edits.

3. Ask me once
   Send one message with these questions. I may answer "unknown" to any.
   - Which model or models built it, and in which coding harness?
   - Is the source public? If so, the GitHub repository and the exact
     40-character commit that is deployed.
   - When was it built (YYYY-MM-DD), and what was the prompt?
   - The code license, and the license of each third-party asset.
   - Is this my game on a host I control, and will the game at this link stay
     unchanged?
   - May Mirage publish a screenshot of the game as its cover under CC0-1.0?

4. Write the record
   - Choose GAME_ID: lowercase letters, digits, and single hyphens, not
     already used in submissions/. It is permanent.
   - Fork https://github.com/KSHR-AI/Mirage, clone your fork, and create the
     branch submit/GAME_ID. Read submissions/README.md.
   - Save the cover as public/showcase-covers/GAME_ID.png (or .jpg).
   - Create submissions/GAME_ID.json from this template. Keep every key and
     add none; unknown keys are rejected.

     {
       "schemaVersion": 2,
       "id": "GAME_ID",
       "title": "The title shown in the game",
       "tagline": "One line of what the player does, under 80 characters",
       "description": "Two to four sentences on what a player can do.",
       "features": ["One observed feature, at most 120 characters"],
       "source": null,
       "deployment": {
         "url": "PLAY_URL",
         "provider": "The host you can observe, such as GitHub Pages"
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
             "creator": "Who captured it, such as your agent's name",
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
   - Licenses are SPDX identifiers, or NOASSERTION when unknown. The cover is
     CC0-1.0 only if I said yes; otherwise keep NOASSERTION and say so at the
     top of the pull request.
   - Add one "assets" entry for each third-party library or asset the
     deployment credits or you can identify: its name and version, its authors
     as "creator", its SPDX license, where it comes from, and the notice you
     saw. Say in "assetStatement" where the credits came from.
   - In "limitations", state: each evidence gap; each control or system that
     failed; the controls and input modes you did not test; the renderer and
     frame rate if the playtest was shallow; that the city is not San
     Francisco if it is not; and that the live game may change if I do not
     control the host or said it will change.

5. Verify in Mirage
   - Use Node.js 24 and pnpm 11.7. Run "pnpm install --frozen-lockfile".
   - Format the record: pnpm exec prettier --write submissions/GAME_ID.json
   - Commit only the two files:
       git add submissions/GAME_ID.json public/showcase-covers/GAME_ID.png
       git commit -m "Add TITLE"
   - Validation reads committed files, so run it after the commit:
       pnpm submissions:validate
       node scripts/submissions/validate-submissions.mjs --mode changed --base origin/main --head HEAD --output /tmp/mirage-plan.json
       node scripts/submissions/verify-deployments.mjs --plan /tmp/mirage-plan.json
     The first must count one more submission than main has. The second must
     report exactly 1 submission. Fix the record until all three pass.
   - Run "pnpm dev" and open http://localhost:3000/play/GAME_ID. Mirage frames
     the game with scripts and pointer lock only: no same-origin access,
     storage, forms, or popups. Play it again there with the same controls,
     and read the console of the game frame itself, not only of the Mirage
     page. Mirage's bar across the top of the frame is Mirage's, not a limit
     of the game. Add anything else that fails only in the frame to
     "limitations". If the game cannot be played in the frame at all, stop and
     tell me why.
   - Open http://localhost:3000 and confirm the run and its cover appear.
   - If you changed the record, format it, amend the commit, and run the three
     validation commands again. Then run "pnpm check", the full gate the pull
     request runs. Report a failure your two files did not cause instead of
     fixing it.

6. Open the pull request
   - "git status" must be clean, and "git diff --stat origin/main" must list
     only the record and the cover. Discard anything else a tool changed.
   - Push the branch to your fork and open a pull request against main of
     KSHR-AI/Mirage titled "Add TITLE". Fill in the repository's pull request
     template: say what you played directly and in the frame, what worked,
     what did not, and what you did not test.
   - Give me the pull request link and a three-line summary.
```

After the pull request opens, Mirage’s preflight verifies the record and the
live link. A maintainer plays the game before merge. See
[the submission guide](README.md) for the full record contract.
