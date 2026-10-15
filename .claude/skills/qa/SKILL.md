---
name: qa
description: Agent-driven UI/UX QA of the Mingle iOS app on the iOS Simulator. Picks scenarios from the branch diff (or all, or by id), builds and launches a QA-bridge build against this worktree's local devbox, drives the app like a user with the iOS Simulator tools, judges each scenario against the owner's taste rules and rubric, and publishes an HTML report with screenshots and a real-device checklist. Use when the user asks to QA, test or check the app's UI/UX, translation or speech flows, or says /qa.
---

# /qa — agent-driven UI/UX QA

You are the QA tester for the Mingle app. Use the app like a picky user, and judge it the way the product owner
would. Everything you need is in `mingle-app/qa/agent/`:

- `taste.md`: the owner's UX rules (T1–T23), each traced to past bug reports. **Read it first, every run.**
- `rubric.md`: verdicts, severity, the translation 1–5 scale and responsiveness thresholds.
- `scenarios/*.md`: the scenario catalog (frontmatter: id, priority, environment, tags, taste, paths).
- `fixtures/`: inputs such as the typed messages.

## Arguments

| Invocation | Scenarios |
| --- | --- |
| `/qa` | Scenarios whose `paths` match the diff against `origin/main`. If nothing matches, run the P0 `sim` scenarios as a smoke test. |
| `/qa all` | Every `sim` scenario, P0 first. |
| `/qa P0` (or `P1`) | Every `sim` scenario of that priority. |
| `/qa <id> [<id>...]` | Exactly those scenarios. |
| `--fresh` | Uninstall the app first (clean first launch). Implied by `first-launch-and-login`. |

## Ground rules

- **Never start the dev server, Metro or any devbox service** (CLAUDE.md). If they are not running, ask the user to
  start them, and wait.
- **Local only.** The QA build points every web and fallback URL at this worktree's devbox. Never point a QA run at
  production. Never sign in with a real person's account. Only touch databases on `127.0.0.1`/`localhost`, and only
  inside `BEGIN READ ONLY; … ROLLBACK;`.
- The QA account is created by this skill on the local server. Never print its password in chat.
- Do not click ads, buy anything, send invitations to real people, or post anything outside the app.
- Report honestly: a scenario that did not run is `blocked`, never `pass`. A check that needs a real device is
  `manual`.
- Run outputs go in `mingle-app/qa/agent/runs/` (gitignored). Do not commit them.

## 1. Select scenarios

```bash
node mingle-app/scripts/qa-agent-scenarios.mjs select --base origin/main
```

This prints the matched scenarios and `uncoveredAppFiles`: changed app files that no scenario covers. For those,
add a short exploratory pass over the screens they render, and mention them in the report as a coverage gap. Use
`list` to see the whole catalog. Skip `real-device` and `manual-only` scenarios on the simulator, apart from the
simulator part some of them define, and copy their checks into the real-device checklist.

Tell the user in one line which scenarios will run and roughly how long it will take (about 5–10 minutes per
scenario). Then continue without waiting.

## 2. Environment

Run these from the worktree root.

1. `.devbox.env` missing → `scripts/devbox init` (this writes config only and starts nothing).
2. Check the servers:
   ```bash
   mingle-app/scripts/qa-agent-sim.sh servers
   ```
   If this exits non-zero, stop. Give the user this command for this worktree and wait for them to say it is up:
   ```bash
   scripts/devbox up --profile local
   ```
3. Build the QA app. The first build takes about 10 minutes, so run it in the background; later builds take under a
   minute. The script also installs RN dependencies and pods if they are missing.
   ```bash
   mingle-app/scripts/qa-agent-sim.sh build
   ```
   Only the native shell is built. Web changes are served live by devbox, so rebuild only when `mingle-app/rn/**`
   changed or no build exists yet.
4. Install and launch. This creates and boots the "Mingle QA iPhone 17" simulator in Korean if needed, and prints
   its UDID:
   ```bash
   mingle-app/scripts/qa-agent-sim.sh install          # add --fresh for a clean first launch
   ```
5. Call `mcp__Claude_Code_iOS_Simulator__control` with `action: "attach"` and `device: <UDID>`, so the user can
   watch.
6. Create the run folder `mingle-app/qa/agent/runs/<YYYYMMDD-HHMM>-<branch>/`, with `shots/`, and start
   `notes.md`. In it, record the commit (`git rev-parse --short HEAD`), the branch, the simulator, the server URL and
   the start time in UTC (you will need that for event queries).

## 3. QA account and rooms

- Credentials live in `mingle-app/qa/agent/local/account.json` (gitignored). If the file is missing, create the
  account on the local server only:
  ```bash
  mkdir -p mingle-app/qa/agent/local
  # email: qa-agent+<worktree-name>@mingle.test, password: openssl rand -base64 18
  curl -s -X POST http://127.0.0.1:<DEVBOX_WEB_PORT>/api/auth/signup -H 'content-type: application/json' \
    --data @mingle-app/qa/agent/local/signup.json
  ```
  `signup.json` holds `{"email", "password", "name": "QA Agent", "primaryLanguages": ["ko","en"], "birthDate": "2000-01-01"}`.
  Save email and password to `account.json`, then delete `signup.json`. A `409 email_already_registered` with an
  existing `account.json` is fine.
- Sign in through the app's email sign-in sheet, typing with the `text` action.
- The scenarios assume room A (Korean, English and Japanese) and room B. Create them once in the app, name them
  `QA A` and `QA B`, and reuse them in later runs.

## 4. Drive each scenario

Read the scenario file and follow its Preconditions, Steps, Oracle and Signals. Act like a user: tap what a person
would tap. Use the WebView helper to read state, never to click for you.

| Need | How |
| --- | --- |
| See the screen | `control` `screenshot`. Coordinates are in device points. |
| Evidence image for the report | `xcrun simctl io <UDID> screenshot <run>/shots/<scenario>-<step>.png` |
| Burst (flicker, transitions) | A short bash loop of `simctl io screenshot`, about 250 ms apart. View only the frames that matter, shrunk first: `sips -Z 700 <file> --out <small>` |
| Tap, swipe, type, back | `control` `tap` / `swipe` / `text`. iOS back is a swipe from x ≈ 5 pt (an edge gesture starts ≤ 4 pt from the edge). Long-press is `tap` with `duration: 0.8`. |
| App state | `node mingle-app/scripts/qa-agent-webview.mjs snapshot --udid <UDID> 2>/dev/null`. This returns `liveDemo` (the room), `conversationList`, `activeElement` (is the composer focused?), `alerts` and the viewport size. |
| Run a QA bridge method | `node mingle-app/scripts/qa-agent-webview.mjs eval --udid <UDID> 'window.__MINGLE_QA__.seedScrollPerformanceHistory()' 2>/dev/null` |
| Client events | Local DB, read-only: `SELECT created_at, event_type, metadata FROM app.app_event_logs WHERE created_at > '<start UTC>' ORDER BY created_at;` |
| Native logs | `xcrun simctl spawn <UDID> log show --last 3m --style compact --predicate 'process == "mingle"'` |

For the DB, use `DATABASE_URL` from the devbox environment or `mingle-app/.env.local` in the main checkout. Before
querying, check that the host is `localhost` or `127.0.0.1`.

Rules while driving:

- Take a screenshot after every step that has an oracle. Before judging, look at it closely: zoom with `sips`
  crops when edges or alignment matter.
- Repeat timing-sensitive checks (flicker, first-tap response, races) at least twice and record `n/m`.
- When something looks wrong, try to reproduce it once more. Then capture the snapshot, the events and the logs
  around it. Keep going with the rest of the scenario if you can.
- Simulator limits (no camera, the Mac's microphone, test ads, simulator frame rate) are environment notes, not
  findings. Move those checks to the real-device list.
- Keep `notes.md` current as you go: step, observation, evidence file. The report is built from it.

## 5. Judge

For each scenario, decide the verdict from `rubric.md`:

1. Check every Oracle line: held, failed, or not checkable.
2. Write findings. Each has a severity (S0–S3), the taste rule(s) it breaks, a one-line observation, its
   reproduction count, and its evidence (a screenshot path or a snapshot field, an event or a log line).
3. Score each translated message 1–5 on the four dimensions, against the fixture's intent.
4. Look at the screens as the owner would, beyond the oracle. Anything that breaks a taste rule is a finding, even
   when the scenario's checks passed.

Write `results.json` in the run folder:
`{ scenarios: [{ id, verdict, findings: [{severity, taste, summary, repro, evidence}], translationScores, realDeviceChecks }], environment }`.

## 6. Report

Before writing the page, load the `artifact-design` skill and follow it. Build `report.html` in the run folder,
then publish it with the Artifact tool:

- **Header:** branch, commit, date, simulator and iOS version, server URL, and the scenarios run.
- **Summary:** counts by verdict, then every S0/S1 finding as a one-liner linking to its scenario.
- **One card per scenario:** verdict badge, findings sorted by severity with taste-rule tags, 1–4 key screenshots
  (JPEG, max 700 px, embedded as data URIs; keep the page under 10 MB), translation scores when present, and the
  evidence snippets.
- **Real-device checklist:** every `manual` check and every real-device follow-up from the run, as a short
  checklist the owner can tick on a phone.
- **Coverage gaps:** `uncoveredAppFiles` and anything you could not exercise.
- **Calibration:** one line inviting the owner to say where they disagree with a verdict.

Send the published link to the user, with three lines: the overall verdict, the top findings, and how many
real-device checks remain.

## 7. Calibrate

When the owner disagrees with a verdict ("that flicker doesn't matter", "this should have failed"), update
`taste.md` or `rubric.md` in the same session. Adjust the rule's wording or severity anchor and add a dated bullet
saying which run it came from. When a new bug class shows up that no scenario covers, propose a new scenario file.
Run `node mingle-app/scripts/qa-agent-scenarios.mjs check` after editing any scenario.
