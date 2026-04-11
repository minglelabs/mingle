# iOS Regression Backlog Classification

This document explains why [docs/ui-ux-codex-thread-history.md](/Users/nam/.codex/worktrees/a92b/mingle/docs/ui-ux-codex-thread-history.md) currently has more issue atoms than the automated iOS regression suite.

- Historical issue atoms in the history doc: `92`
- Historical issue atoms already linked to the iOS regression inventory: `47`
- Historical issue atoms still not linked to the iOS regression inventory: `45`

The `23` items in [IOS_REGRESSION_INVENTORY.md](/Users/nam/.codex/worktrees/a92b/mingle/mingle-app/qa/mobile-ui/IOS_REGRESSION_INVENTORY.md) are validation targets, not one-to-one issue atoms. One target can cover several historical atoms.

## Category Summary

| Category | Count | Meaning |
| --- | --- | --- |
| Legacy surface removed from the current iOS app | `29` | The issue belongs to the old multi-room conversations/list/room drawer UI that the current iOS shell no longer exposes. |
| Current iOS surface, but not automated yet | `0` | The previously identified 12 current-surface atoms are now linked into the iOS regression inventory. |
| Likely already covered semantically, but not backlinked in the inventory yet | `6` | A current test already checks the same behavior class, but the historical atom has not been explicitly mapped into the inventory document. |
| Oracle still unclear | `2` | The problem is understood, but the pass/fail rule is still too fuzzy to encode safely. |
| Reproduction rule still unclear | `1` | The history entry is too meta or blended to recreate as one clean, observable bug. |
| Deferred or deprioritized for now | `3` | The issue is known, but the current product/testing priority is to leave it out of the active iOS automation backlog. |
| Web-only or Android-only, not an iOS regression target | `4` | The issue is out of scope for the current iOS suite. |

## What "Oracle" Means

In test automation, an oracle is the rule that tells the runner whether the test passed or failed.

- Clear oracle example: "The menu button label must be `메뉴` when the locale is Korean."
- Unclear oracle example: "The transition feels stuttery."

The second case needs an extra measurable rule before it can become reliable automation. For example:

- maximum allowed frame drop count
- screenshot/video diff threshold
- exact DOM or layout state before and after the transition
- exact native event order

Without that rule, the test would be unstable or would assert the wrong thing.

## 1. Legacy Surface Removed From the Current iOS App

These atoms belong to the old RN 1.1.0 multi-room conversations/list/room stack UI. They stay in history, but they should not be counted as current iOS regressions unless that product surface ships again.

- `019d4cae#1` list header height mismatch
- `019d4cae#2` list CTA orange glow
- `019d4cae#3` top-gap fallback spacer issue
- `019d4cae#4` Android hardware back from room to list
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
- `019d4cae#30` closing live room killed session instead of backgrounding
- `019d4cae#31` re-entering live room did not restore same instance
- `019d4cae#33` hidden non-owner room consumed native STT events
- `019d4cae#34` restored list rows kept stale active badges
- `019d4cae#35` stop action updated paused/order too late
- `019d4cae#36` list ordering used the wrong signal
- `019d4cae#37` non-owner room looked live when opened
- `019d4cae#38` room-to-room handoff started before native stop ack
- `019d4cae#39` old live room unmounted before stop listener finished
- `019d4cae#40` running button still showed play icon in the old room UI
- `019d4cae#44` `isLikelyIOSPlatform` runtime error during old room-state pass
- `019d4d16#1` old room/list/drawer/menu banner-zone transition issue

## 2. Current iOS Surface, But Not Automated Yet

There are currently no known current-surface iOS atoms left in the "not automated yet" bucket. The last expansion pass linked the previous 12-item backlog into the inventory:

- `019c95e8#4` and `019c95e8#5` -> `ios-menu-chrome-contracts`, `menu-chrome-keeps-dropdown-cue-and-stable-overlay-real-device`
- `019c992c#2` -> `ios-native-mic-recovery-contracts`
- `019ca08b#1`, `019ca08b#2`, and `019ca08b#4` -> `ios-auth-gate-contracts`
- `019ca08b#3` -> `ios-native-auth-route-contracts`
- `019d0514#1`, `019d2f95#1`, `019d2f95#2`, `019d2f95#3`, and `019d43a3#1` -> `ios-menu-chrome-contracts`, `menu-chrome-keeps-dropdown-cue-and-stable-overlay-real-device`

## 3. Likely Already Covered Semantically, But Not Backlinked Yet

These atoms describe the same behavior class as an existing target, but the explicit historical ref has not been linked in the inventory yet.

- `019d18f2#1` auto-scroll fought manual scrolling
  Current likely gate: `ios-scroll-platform-contracts`
- `019d2a13#1` initial landing with existing history did not snap to bottom
  Current likely gate: `bottom-anchor-restores-after-storage-hydration-real-device`
- `019d2a3f#1` relaunch auto-scroll happened only once
  Current likely gate: `bottom-anchor-restores-after-storage-hydration-real-device`
- `019d4eba#1` forced WebView reload left native STT running while the UI fell back toward idle/play
  Current likely gate: `ios-native-mic-recovery-contracts` via `use-realtime-stt.logic.test.ts` (`promotes native transcript activity back into ready state after unexpected web reloads`)
- `019d6d6d#1` keyboard composer grew but did not shrink back
  Current likely gate: `composer-roundtrip-restores-compact-bottom-bar-real-device`
- `019d6d99#1` keyboard mode added too much bottom margin with bottom banner
  Current likely gate: `banner-position-updates-insets-real-device` plus composer round-trip

## 4. Oracle Still Unclear

These atoms still matter, but we still need a stronger pass/fail rule before turning them into reliable automation.

- `019c6f40#4` stopping STT during TTS left playback state stuck
  Needs a deterministic live audio/TTS event oracle.
- `019d43a0#1` live-demo hydration mismatch around client-only initialization and `Date`/`Intl` rendering
  Needs a precise hydration-error oracle, not just a vague first-paint symptom.

## 5. Reproduction Rule Still Unclear

These atoms are not blocked on pass/fail measurement first. They are blocked because the history entry itself is too blended or meta to reproduce as one clean bug.

- `019d43ae#1` bottom-tabs branch meta summary, not a clean standalone bug
  Needs decomposition into actual observable regressions first.

## 6. Deferred Or Deprioritized For Now

These atoms stay in history, but the current plan is not to spend active iOS automation time on them.

- `019d10e1#1` splash logo yellow mismatched the splash background
  Deprioritized for now.
- `019d18f0#1` iOS resume showed a brief white flash
  Still unresolved, but explicitly deferred for now.
- `019d6f86#1` voice-to-keyboard transition stuttered
  Deprioritized for now.

## 7. Web-Only Or Android-Only

These atoms should not be counted as missing iOS coverage.

- `019c5304#1` app shell exceeded intended max width
  Web shell/layout issue, not an iPhone runtime regression.
- `019c5c43#1` intermittent favicon load crash on first activation/refresh
  Browser/web infrastructure issue.
- `019d19a3#1` Android background translations did not visibly update until foreground
  Android-only.
- `019d4f37#1` Android showed stopped/orange run button while STT still ran
  Android-only.
