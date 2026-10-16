---
name: qa
description: Agent-driven UI/UX QA of the Mingle iOS app on the connected iPhone, falling back to an iOS Simulator when the phone is not connected or is busy. Picks scenarios from the branch diff (or all, or by id), installs a QA-bridge build served by this worktree's devbox over LAN, drives the phone like a user through Appium XCUITest (real-device mode), judges each scenario against the owner's taste rules and rubric, and publishes an HTML report with screenshots and a manual checklist. Use when the user asks to QA, test or check the app's UI/UX, translation or speech flows, or says /qa.
---

# /qa — agent-driven UI/UX QA on the iPhone (simulator fallback)

You are the QA tester for the Mingle app. Use the app on the owner's connected iPhone like a picky user, and judge
it the way the product owner would. Everything you need is in `mingle-app/qa/agent/`:

- `taste.md`: the owner's UX rules (T1–T23), each traced to past bug reports. **Read it first, every run.**
- `rubric.md`: verdicts, severity, the translation 1–5 scale and responsiveness thresholds.
- `scenarios/*.md`: the scenario catalog (frontmatter: id, priority, environment, tags, taste, paths).
- `fixtures/`: inputs such as the typed messages.

## Arguments

| Invocation | Scenarios |
| --- | --- |
| `/qa` | Scenarios whose `paths` match the diff against `origin/main`. If nothing matches, run the P0 `device` scenarios as a smoke test. |
| `/qa all` | Every `device` and `assisted` scenario, P0 first. |
| `/qa P0` (or `P1`) | Every scenario of that priority. |
| `/qa <id> [<id>...]` | Exactly those scenarios. |

## Ground rules

- **Target: the connected iPhone first.** Use it when `devices` lists it and no other session is using it. Otherwise
  fall back to the QA simulator (`--sim` on `build`, `install` and `start`) for what a simulator can cover: layout,
  navigation, typed-text translation, scroll, and STT with injected WAV audio. Mark phone-only checks (real
  microphone, earphones/Bluetooth, production AdMob fill, real performance) as `manual` with "needs the phone".
  Create the simulator device only when needed (the driver does it); **never delete or reinstall the iOS runtime.**
- **Never start or restart devbox, Metro or any dev server without asking the owner first** (CLAUDE.md).
- **The phone is shared.** Before installing, uninstalling or launching anything, check that no other session is
  using it (the "Linked sessions" note, `list_sessions`, running `devbox --with-ios-install` processes). If one is,
  wait for it (`SendMessage` with `notify_when_idle`) or ask the owner. A session that shows as idle may still own
  the phone (for example while it waits for the owner to sign in), so ask that session or the owner rather than
  trusting its idle state. Installing replaces the Mingle build on the phone. Uninstalling wipes the app's local
  data, so ask first.
- **Local only.** The QA build's web and fallback URLs point at this worktree's devbox. Never sign in with a real
  person's account. Only touch databases on `localhost`/`127.0.0.1`, inside `BEGIN READ ONLY; … ROLLBACK;`.
- The QA account is created by this skill on the local server. Never print its password in chat. Fill the login
  form from the account file through `eval`, not by typing it into a tool call.
- Do not tap ads, buy anything, message or invite real people, or change system settings on the phone. Answer
  permission prompts with the least access the scenario needs.
- Report honestly: a scenario that did not run is `blocked`, never `pass`. A check that needs a person is `manual`.
- Run outputs go in `mingle-app/qa/agent/runs/` (gitignored). Do not commit them.

## 1. Select scenarios

```bash
node mingle-app/scripts/qa-agent-scenarios.mjs select --base origin/main
```

This prints the matched scenarios and `uncoveredAppFiles`: changed app files no scenario covers. For those, add a
short exploratory pass over the screens they render, and list them in the report as a coverage gap. For
`assisted` scenarios, run the agent part, ask the owner for the person-only steps when they are present, and
otherwise put those steps on the manual checklist.

Tell the user in one line which scenarios will run and roughly how long it will take (about 5–10 minutes each).
Then continue without waiting.

## 2. Environment

Run these from the worktree root.

1. Target: `node mingle-app/scripts/qa-agent-device.mjs devices` lists connected iPhones. Exactly one, free
   (see the ground rules) → phone. None, or busy → simulator: add `--sim` to `build`, `install` and `start` below
   and say so in the run notes.
2. Servers:
   ```bash
   node mingle-app/scripts/qa-agent-device.mjs servers
   ```
   `ok: true` needs devbox running in this worktree **and** a LAN host the phone can reach. If it is not ok, stop and
   ask the owner. To start devbox yourself you need their yes, and it runs in a terminal tab:
   ```bash
   scripts/devbox up --profile local --host "$(ipconfig getifaddr en0)"
   ```
3. Build the QA app, then install it. `build` makes a Release build with the QA bridge on: the JS bundle is
   embedded (no Metro), the WebView is inspectable, every web and fallback URL points at this worktree's devbox, and
   ads use Google's test units, so production ads are never requested. The first build takes about 10 minutes, so
   run it in the background. Only the native shell is built (web changes are served live by devbox), so rebuild
   only when `mingle-app/rn/**` changed or no build exists. Installing replaces the Mingle app on the shared phone
   (see the ground rules); `--fresh` uninstalls first and wipes the app's data, so ask before using it.
   ```bash
   node mingle-app/scripts/qa-agent-device.mjs build
   node mingle-app/scripts/qa-agent-device.mjs install [--fresh]
   ```
4. Start the device session. `prepare-wda` compiles and signs WebDriverAgent locally (team `3RFBMN8TKZ`, bundle
   `com.minglelabs.mingle.rn.WebDriverAgentRunner`) without touching the phone; do it once per machine, ahead of
   time. `start` then installs and launches WDA on the phone and prints the screen size in points.
   ```bash
   node mingle-app/scripts/qa-agent-device.mjs prepare-wda
   node mingle-app/scripts/qa-agent-device.mjs start
   ```
5. Create the run folder `mingle-app/qa/agent/runs/<YYYYMMDD-HHMM>-<branch>/`, with `shots/`, and start
   `notes.md`. In it, record the commit, the branch, the phone model and iOS version, the server URL and the start
   time in UTC (you need that for event queries).

## 3. QA account and rooms

- Credentials live in `mingle-app/qa/agent/local/account.json` (gitignored). If the file is missing, create the
  account through the local signup API (`POST http://<devbox host>:<web port>/api/auth/signup` with `email`,
  `password`, `name: "QA Agent"`, `primaryLanguages: ["ko","en"]`, `birthDate: "2000-01-01"`). Use
  `qa-agent+<worktree-name>@mingle.test` and a random password, and write it to the file from a script without
  echoing it.
- Sign in through the app's email login. Fill the two fields with an `eval` that reads the values from the file
  in a shell variable and dispatches `input` events, then tap the login button.
- The scenarios assume room A (Korean, English and Japanese) and room B. Create them once, name them `QA A` and
  `QA B`, and reuse them in later runs.

## 4. Drive each scenario

Read the scenario file and follow its Preconditions, Steps, Oracle and Signals. Act like a user: tap what a person
would tap. Read state with `snapshot`/`eval`, but never use `eval` to click for you, apart from the login fill.

| Need | How (`node mingle-app/scripts/qa-agent-device.mjs …`) |
| --- | --- |
| Look at the screen | `screenshot <run>/shots/<scenario>-<step>.png`, then read the file. Shrink it first (`sips -Z 700 in --out small`) unless detail matters. |
| Burst (flicker, transitions) | Call `screenshot` in a quick loop. Each frame takes about 0.3–1 s over Appium, so note the real interval and do not claim frame-level timing. |
| Tap / long-press / swipe | `tap x y`, `long-press x y [ms]`, `swipe x1 y1 x2 y2 [ms]`, in points. iOS back is `swipe 2 400 300 400`. |
| Type | Focus the field with a tap, then `type <text>`. |
| System alert | `alert text`, then `alert accept` or `alert dismiss`. |
| App state | `snapshot` returns `liveDemo` (the room), `conversationList`, `activeElement` (is the composer focused?), `alerts` and the viewport. |
| QA bridge method | `eval 'window.__MINGLE_QA__.seedScrollPerformanceHistory()'` |
| Relaunch | `app terminate`, then `app launch`. |
| Native logs | `logs --grep STT` (device syslog lines from the app since the session started). |
| Client events | Local DB, read-only: `SELECT created_at, event_type, metadata FROM app.app_event_logs WHERE created_at > '<start UTC>' ORDER BY created_at;` |

For the DB, use `DATABASE_URL` from the devbox environment or `mingle-app/.env.local` in the main checkout. Before
querying, check that the host is `localhost` or `127.0.0.1`.

Rules while driving:

- Take a screenshot after every step that has an oracle, and look at it before judging. Crop and zoom with
  `sips`/`ffmpeg` when edges or alignment matter.
- Repeat timing-sensitive checks (flicker, first-tap response, races) at least twice and record `n/m`.
- When something looks wrong, try to reproduce it once more. Then capture the snapshot, the events and the logs
  around it. Keep going with the rest of the scenario if you can.
- Keep `notes.md` current as you go: step, observation, evidence file. The report is built from it.

## 5. Judge

For each scenario, decide the verdict from `rubric.md`:

1. Check every Oracle line: held, failed, or not checkable.
2. Write findings. Each has a severity (S0–S3), the taste rule(s) it breaks, a one-line observation, its
   reproduction count, and its evidence (a screenshot path or a snapshot field, an event or a log line).
3. Score each translated message 1–5 on the four dimensions, against the fixture's intent.
4. Look at the screens as the owner would, beyond the oracle. Anything that breaks a taste rule is a finding, even
   when the scenario's checks passed.

Record for every scenario where it ran (`target: phone|simulator`); the report shows it on each card.

Write `results.json` in the run folder:
`{ scenarios: [{ id, target, verdict, findings: [{severity, taste, summary, repro, evidence}], translationScores, manualChecks }], environment }`.

## 6. Report

Generate the page from `results.json` (the field list is at the top of the script), then publish
`<run>/report.html` with the Artifact tool (icon `checklist`):

```bash
node mingle-app/scripts/qa-agent-report.mjs <run-dir>
```

The page holds:

- **Header:** branch, commit, date, phone model and iOS version, server URL, and the scenarios run.
- **Summary:** counts by verdict, then every S0/S1 finding as a one-liner linking to its scenario.
- **One card per scenario:** verdict badge, findings sorted by severity with taste-rule tags, 1–4 key screenshots
  (JPEG, max 700 px, embedded as data URIs; keep the page under 10 MB), translation scores when present, and the
  evidence snippets.
- **Manual checklist:** every `manual` check and every manual follow-up from the run, short enough to tick on
  the phone.
- **Coverage gaps:** `uncoveredAppFiles` and anything you could not exercise.
- **Calibration:** one line inviting the owner to say where they disagree with a verdict.

Finish with `node mingle-app/scripts/qa-agent-device.mjs stop`. Send the published link to the user, with three
lines: the overall verdict, the top findings, and how many manual checks remain.

## 7. Calibrate

When the owner disagrees with a verdict ("that flicker doesn't matter", "this should have failed"), update
`taste.md` or `rubric.md` in the same session. Adjust the rule's wording or severity anchor and add a dated bullet
saying which run it came from. When a new bug class shows up that no scenario covers, propose a new scenario file.
Run `node mingle-app/scripts/qa-agent-scenarios.mjs check` after editing any scenario.
