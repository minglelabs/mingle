# Android Regression Backlog Classification

This document explains why [docs/ui-ux-codex-thread-history.md](/Users/nam/.codex/worktrees/a92b/mingle/docs/ui-ux-codex-thread-history.md) still contains more issue atoms than the current Android regression suite.

- Historical issue atoms in the history doc: `92`
- Historical issue atoms already linked to the Android regression inventory: `49`
- Historical issue atoms still not linked to the Android regression inventory: `43`

The `21` items in [ANDROID_REGRESSION_INVENTORY.md](/Users/nam/.codex/worktrees/a92b/mingle/mingle-app/qa/mobile-ui/ANDROID_REGRESSION_INVENTORY.md) are validation targets, not one-to-one issue atoms. One target can cover several historical atoms.

## Category Summary

| Category | Count | Meaning |
| --- | --- | --- |
| Legacy surface removed from the current Android app | `28` | The issue belongs to the old multi-room conversations/list/room drawer UI that the current Android shell no longer exposes. |
| Current Android surface, but not automated yet | `1` | The issue still belongs to the current Android shell/live-demo surface, but the suite does not yet encode it directly. |
| Oracle still unclear | `2` | The problem is understood, but the pass/fail rule is still too fuzzy to automate safely. |
| Reproduction rule still unclear | `1` | The history entry is too blended or meta to replay as one clean bug. |
| Deferred or deprioritized for now | `2` | The issue is known, but it is not in the active Android automation backlog right now. |
| Web-only or iOS-only, not an Android regression target | `9` | The issue is out of scope for the current Android suite. |

## What "Oracle" Means

In test automation, an oracle is the rule that tells the runner whether the test passed or failed.

- Clear oracle example: "The remounted Android UI must restore the red running-state control."
- Unclear oracle example: "The transition feels stuttery."

The second case needs a stronger measurable rule before it becomes reliable automation. For example:

- maximum allowed frame drop count
- screenshot/video diff threshold
- exact DOM or layout state before and after the transition
- exact native event order

Without that rule, the test would be unstable or would assert the wrong thing.

## 1. Legacy Surface Removed From the Current Android App

These atoms belong to the old RN 1.1.0 multi-room conversations/list/room stack UI. They stay in history, but they should not be counted as current Android regressions unless that product surface ships again.

- `019d4cae#1` list header height mismatch
- `019d4cae#2` list CTA orange glow
- `019d4cae#3` top-gap fallback spacer issue
- `019d4cae#6` full-width bottom CTA bar vs inner button
- `019d4cae#7` oversized in-room header
- `019d4cae#16` banner transition lag across list/room changes
- `019d4cae#17` room swipe-back flicker
- `019d4cae#18` iOS forward-swipe room restore bug
- `019d4cae#19` drawer swipe-back flicker
- `019d4cae#20` room swipe-back too edge-dependent
- `019d4cae#24` room auto-start consumed too early
- `019d4cae#25` room auto-start depended on child mount timing
- `019d4cae#26` auto-start ref callback update loop
- `019d4cae#27` conversation row recent-message preview missing
- `019d4cae#28` recent preview disappeared after PATCH
- `019d4cae#29` live/paused model tied to room open/close
- `019d4cae#30` closing live room killed session instead of backgrounding it
- `019d4cae#31` re-entering live room did not reliably restore the same live instance
- `019d4cae#33` hidden non-owner room consumed native STT events
- `019d4cae#34` restored list rows kept stale active badges
- `019d4cae#35` stop action updated paused/order too late
- `019d4cae#36` list ordering used the wrong signal
- `019d4cae#37` non-owner room looked live when opened
- `019d4cae#38` room-to-room handoff started before native stop ack
- `019d4cae#39` old live room unmounted before stop listener finished
- `019d4cae#40` running button still showed the play icon in the old room UI
- `019d4cae#44` `isLikelyIOSPlatform` runtime error during old room-state pass
- `019d4d16#1` old room/list/drawer/menu banner-zone transition issue

## 2. Current Android Surface, But Not Automated Yet

These atoms still belong to the current Android shell/live-demo surface, but they are not yet wired into a dedicated Android validation target.

- `019d4caf#1` permission-denial recovery could strand the app in a failed state
  The current Android suite covers STT state reconciliation and remount recovery, but it does not yet run a deterministic Android permission-denial regression path.

## 3. Oracle Still Unclear

These atoms still matter, but they still need a stronger pass/fail rule before turning them into reliable Android automation.

- `019c6f40#4` stopping STT during TTS left playback state stuck
  Needs a deterministic Android live audio/TTS event oracle.
- `019d43a0#1` live-demo hydration mismatch around client-only initialization and `Date`/`Intl` rendering
  Needs a precise hydration-error oracle, not just a vague first-paint symptom.

## 4. Reproduction Rule Still Unclear

These atoms are not blocked on pass/fail measurement first. They are blocked because the history entry itself is too blended or meta to replay as one clean bug.

- `019d43ae#1` bottom-tabs branch meta summary, not a clean standalone bug
  Needs decomposition into actual observable regressions first.

## 5. Deferred Or Deprioritized For Now

These atoms stay in history, but the current plan is not to spend active Android automation time on them.

- `019d10e1#1` splash logo yellow mismatched the splash background
  Deprioritized for now.
- `019d6f86#1` voice-to-keyboard transition stuttered
  Deprioritized until there is a clear frame-drop oracle.

## 6. Web-Only Or iOS-Only

These atoms should not be counted as missing Android coverage.

- `019c5304#1` app shell exceeded intended max width
  Web shell/layout issue, not an Android runtime regression.
- `019c5c43#1` intermittent favicon load crash on first activation/refresh
  Browser/web infrastructure issue.
- `019d18f0#1` iOS resume showed a brief white flash
  iOS-only.
- `019d4cae#5` iOS swipe-back was initially unavailable
  iOS-only gesture path.
- `019d4cae#8` legacy iOS tap-to-top fallback sat above the room header
  iOS-only.
- `019d4cae#41` iOS mic-permission denial trapped the room in retry/error UI
  iOS-only permission flow.
- `019d4cae#42` iOS denial recovery opened Settings too aggressively
  iOS-only permission flow.
- `019d4cae#43` iOS swipe-back regressed again because gesture enablement became tied to menu-open state
  iOS-only.
- `019d4cae#45` iOS interactive swipe kept the old banner visible during the gesture
  iOS-only structural limitation.
