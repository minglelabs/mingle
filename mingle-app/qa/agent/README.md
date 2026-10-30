# Agent QA

Claude tests the Mingle app the way the product owner would. It drives the connected iPhone by hand (or an iOS
Simulator when the phone is not connected or is busy), judges what
it sees against the owner's recorded taste, and hands back a report with screenshots and a short manual checklist.
Run it with the `/qa` skill ([`.claude/skills/qa/SKILL.md`](../../../.claude/skills/qa/SKILL.md)).

This complements the deterministic Appium suite in [`../mobile-ui`](../mobile-ui/README.md). That suite proves
known regressions stay fixed. Agent QA judges whether the app *feels* right, catches what nobody wrote a test for,
and scores translation quality.

## Pieces

| File | Purpose |
| --- | --- |
| [taste.md](taste.md) | The owner's UX rules (T1–T23), each traced to entries in [the UI/UX history](../../docs/ui-ux-codex-thread-history.md). |
| [rubric.md](rubric.md) | Verdicts, severity anchors, the translation 1–5 scale, responsiveness thresholds. |
| [scenarios/](scenarios) | 16 scenarios with frontmatter (`id`, `priority`, `environment`, `tags`, `taste`, `paths`, `history`). `environment` is `device` (the agent runs it end to end), `assisted` (parts need a person: speaking, AirPods) or `manual-only`. |
| [fixtures/](fixtures) | Inputs the scenarios type or send. |
| `local/` | Gitignored: the local QA account, the device session and the Appium log. |
| `runs/` | Gitignored: screenshots, notes, `results.json` and `report.html` per run. |

Scripts in `mingle-app/scripts/`:

| Script | Purpose |
| --- | --- |
| `qa-agent-scenarios.mjs list \| select \| check` | Lists the catalog, selects scenarios for a diff, and validates frontmatter, path globs, history headings and taste ids. |
| `qa-agent-report.mjs <run-dir>` | Turns a run's `results.json` and screenshots into one self-contained `report.html` for publishing. |
| `qa-agent-device.mjs` | Drives the connected iPhone over Appium XCUITest (real-device mode, WDA signed with the team ID): `devices`, `servers`, `build` (Release + QA bridge, local URLs, AdMob test units), `install`, `start`, `screenshot`, `tap`, `long-press`, `swipe`, `type`, `alert`, `snapshot`, `eval`, `app`, `logs`, `stop`. |

## Running

1. Start the local stack in this worktree, reachable from the phone over Wi-Fi (Claude asks before starting it):
   ```bash
   scripts/devbox up --profile local --host "$(ipconfig getifaddr en0)"
   ```
2. Connect the iPhone by USB, unlocked and trusted, with Developer Mode on.
3. In Claude Code: `/qa` (scenarios for the current diff), `/qa all`, `/qa P0`, or `/qa <scenario-id>`.
4. Open the published report. Work through the manual checklist. Tell Claude where you disagree.

The phone is shared with other sessions. Claude checks that no other session is installing to it or running on
it before installing the QA build, which replaces whatever Mingle build is on the phone.

## Calibration

The report is only as good as `taste.md`. When you overrule a verdict, Claude updates the matching rule or
severity anchor and notes the run it came from. After a few runs, the agent's verdicts should match yours.

## Adding a scenario

Copy an existing file in `scenarios/` and fill in the frontmatter. `paths` decides when `/qa` picks the scenario
for a diff, so list the source files whose changes it would catch. Then run:

```bash
node mingle-app/scripts/qa-agent-scenarios.mjs check
```

## Limits

- iPhone or iOS Simulator. Android is not driven yet. On the simulator, phone-only checks (real microphone,
  earphones, production ads, real performance) are reported as pending.
- The agent cannot speak, so speech accuracy is scored only with injected audio or when the owner reads the
  fixture sentences.
- QA builds show AdMob test ads.
- Appium screenshots are too slow to show dropped frames, so the scroll-jank verdict comes from
  `pnpm test:qa:ui:ios:scroll-fps`.
