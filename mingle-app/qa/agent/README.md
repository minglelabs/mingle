# Agent QA

Claude tests the Mingle app the way the product owner would. It drives the iOS Simulator by hand, judges what it
sees against the owner's recorded taste, and hands back a report with screenshots and a short real-device
checklist. Run it with the `/qa` skill ([`.claude/skills/qa/SKILL.md`](../../../.claude/skills/qa/SKILL.md)).

This complements the deterministic Appium suite in [`../mobile-ui`](../mobile-ui/README.md). That suite proves
known regressions stay fixed. Agent QA judges whether the app *feels* right, catches what nobody wrote a test for,
and scores translation quality.

## Pieces

| File | Purpose |
| --- | --- |
| [taste.md](taste.md) | The owner's UX rules (T1–T23), each traced to entries in [the UI/UX history](../../../docs/ui-ux-codex-thread-history.md). |
| [rubric.md](rubric.md) | Verdicts, severity anchors, the translation 1–5 scale, responsiveness thresholds. |
| [scenarios/](scenarios) | 16 scenarios with frontmatter (`id`, `priority`, `environment`, `tags`, `taste`, `paths`, `history`). |
| [fixtures/](fixtures) | Inputs the scenarios type or send. |
| `local/` | Gitignored: the local QA account. |
| `runs/` | Gitignored: screenshots, notes, `results.json` and `report.html` per run. |

Scripts in `mingle-app/scripts/`:

| Script | Purpose |
| --- | --- |
| `qa-agent-scenarios.mjs list \| select \| check` | Lists the catalog, selects scenarios for a diff, and validates frontmatter, path globs, history headings and taste ids. |
| `qa-agent-sim.sh servers \| build \| device \| install` | Checks the devbox servers, builds a Release simulator app with the QA bridge (all URLs local), and boots, installs and launches it. |
| `qa-agent-webview.mjs pages \| snapshot \| eval` | Reads the WebView's QA bridge state over the simulator's Web Inspector socket. No Appium server or WebDriverAgent needed. |

## Running

1. Start the local stack in this worktree: `scripts/devbox up --profile local` (Claude never starts it).
2. In Claude Code: `/qa` (scenarios for the current diff), `/qa all`, `/qa P0`, or `/qa <scenario-id>`.
3. Open the published report. Work through the real-device checklist on a phone. Tell Claude where you disagree.

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

- iOS Simulator only. Android and physical devices are not driven yet. Their checks go on the checklist.
- The simulator has no camera and hears the Mac's microphone, so speech accuracy is scored only when injected audio
  is available. It shows AdMob test ads, and its frame rate is not an iPhone's, so the scroll-jank verdict needs
  `pnpm test:qa:ui:ios:scroll-fps` on a device.
