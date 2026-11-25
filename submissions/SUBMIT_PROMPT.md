# Submit a hosted game with your coding agent

Already have a game online? Paste everything below into a coding agent that has
a browser, and replace `PASTE_YOUR_GAME_LINK` with your public link. The agent
plays the game, writes its record, and opens the pull request.

To build a new run from an empty repository instead, start with the
[game-agent prompt](AGENT_PROMPT.md).

```text
Submit a hosted game to MirageML Bench.

PLAY_URL=PASTE_YOUR_GAME_LINK

MirageML Bench asks one question: can a coding model build GTA in San
Francisco? Every accepted game is a run that people play at mirageml.com. Play
this game, record what is true about it, and open one pull request. Never
guess: write `unknown`, `not-recorded`, or `null` for anything you cannot
observe and I cannot tell you.

1. Check the link.
   - PLAY_URL must be a public HTTPS URL that returns the game directly with
     HTTP 200: no login, redirect, credentials, query string, or fragment.
   - It must let https://mirageml.com frame it: no `X-Frame-Options: DENY` or
     `SAMEORIGIN`, and any CSP `frame-ancestors` must include
     https://mirageml.com.
   - If a check fails, stop and tell me exactly what to change on my host.

2. Play it.
   - Open PLAY_URL in a real browser. Start the game and use its controls for
     several minutes: move, drive, and attempt an objective.
   - Note only what you observed: the title, what a player can do, the controls
     that work, and every limit or failure you hit.
   - Capture one landscape screenshot of real gameplay for the cover. Do not
     edit, composite, or generate it.

3. Ask me once for what you cannot observe.
   - The model that built the game and the coding harness it ran in.
   - The public source repository and exact 40-character commit, if any.
   - The build date, the prompt, and the code and asset licenses.

4. Prepare the pull request.
   - Fork and clone https://github.com/KSHR-AI/Mirage, then read
     `submissions/README.md` and follow its record contract exactly.
   - Add one record at `submissions/GAME_ID.json`. `GAME_ID` is a new,
     permanent, lowercase kebab-case ID.
   - Use the link-first record form: `"track": "showcase"`, and
     `presentation.coverPath` set to `/showcase-covers/GAME_ID.png`. Pin
     `source` when I gave you a public repository and commit; otherwise set it
     to `null`.
   - Add your screenshot at `public/showcase-covers/GAME_ID.png`, credit it in
     `licenses.assets`, and describe it in `presentation.coverAlt`.
   - Change nothing else. Never add game source, bundles, or credentials.

5. Verify.
   - Run `pnpm install --frozen-lockfile` and `pnpm submissions:validate`.
   - Run `pnpm dev`, open `/play/GAME_ID`, and confirm the game loads and
     responds to its controls inside the Mirage frame.

6. Open a pull request against `main` of KSHR-AI/Mirage titled
   "Add GAME_TITLE". Say what you played, what worked, and what did not, then
   give me the link.
```

After the pull request opens, Mirage’s preflight verifies the record and the
live link. A maintainer plays the game before merge. See
[the submission guide](README.md) for the full record contract.
