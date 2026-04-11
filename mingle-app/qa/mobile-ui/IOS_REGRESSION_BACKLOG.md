# iOS Regression Backlog Classification

This document explains why [docs/ui-ux-codex-thread-history.md](/Users/nam/.codex/worktrees/a92b/mingle/docs/ui-ux-codex-thread-history.md) currently has more issue atoms than the automated iOS regression suite.

- Historical issue atoms in the history doc: `92`
- Historical issue atoms already linked to the iOS regression inventory: `35`
- Historical issue atoms still not linked to the iOS regression inventory: `57`

The `19` items in [IOS_REGRESSION_INVENTORY.md](/Users/nam/.codex/worktrees/a92b/mingle/mingle-app/qa/mobile-ui/IOS_REGRESSION_INVENTORY.md) are validation targets, not one-to-one issue atoms. One target can cover several historical atoms.

## Category Summary

| Category | Count | Meaning |
| --- | --- | --- |
| Legacy surface removed from the current iOS app | `29` | The issue belongs to the old multi-room conversations/list/room drawer UI that the current iOS shell no longer exposes. |
| Current iOS surface, but not automated yet | `12` | The issue still belongs to a visible iOS surface, but we have not built the dedicated automation for it yet. |
| Likely already covered semantically, but not backlinked in the inventory yet | `5` | A current test already checks the same behavior class, but the historical atom has not been explicitly mapped into the inventory document. |
| Oracle or reproduction rule still unclear | `7` | The issue exists as a user-facing complaint, but the automation pass/fail rule is still too fuzzy to encode safely. |
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

These atoms still belong to surfaces that the current iOS app exposes. They are the next candidates for automation expansion.

- `019c95e8#4` hamburger borders/depth still wrong after flattening
- `019c95e8#5` dropdown/menu positioning regressed
- `019c992c#2` multi-speaker overlap did not finalize per speaker
- `019ca08b#1` login safe areas showed white bands
- `019ca08b#2` login flow lacked the swipe-to-terms step
- `019ca08b#3` Apple/Google auth did not match the intended native UX
- `019ca08b#4` login could stall on `Checking your session`
- `019d0514#1` top-right language control was not recognizable as a dropdown
- `019d2f95#1` opening the redesigned drawer shook the main screen
- `019d2f95#2` flattening pass misplaced the drawer and wrong border
- `019d2f95#3` redesign introduced follow-up visible regressions
- `019d43a3#1` My Page scroll-chain and spacing bug

## 3. Likely Already Covered Semantically, But Not Backlinked Yet

These atoms describe the same behavior class as an existing target, but the explicit historical ref has not been linked in the inventory yet.

- `019d18f2#1` auto-scroll fought manual scrolling
  Current likely gate: `ios-scroll-platform-contracts`
- `019d2a13#1` initial landing with existing history did not snap to bottom
  Current likely gate: `bottom-anchor-restores-after-storage-hydration-real-device`
- `019d2a3f#1` relaunch auto-scroll happened only once
  Current likely gate: `bottom-anchor-restores-after-storage-hydration-real-device`
- `019d6d6d#1` keyboard composer grew but did not shrink back
  Current likely gate: `composer-roundtrip-restores-compact-bottom-bar-real-device`
- `019d6d99#1` keyboard mode added too much bottom margin with bottom banner
  Current likely gate: `banner-position-updates-insets-real-device` plus composer round-trip

## 4. Oracle Or Reproduction Rule Still Unclear

These atoms still matter, but we need a stronger pass/fail rule before turning them into reliable automation.

- `019c6f40#4` stopping STT during TTS left playback state stuck
  Needs a deterministic live audio/TTS event oracle.
- `019d10e1#1` splash logo yellow mismatched the splash background
  Needs a visual asset/screenshot oracle.
- `019d18f0#1` iOS resume showed a brief white flash
  Needs a frame-level resume-flash oracle.
- `019d43a0#1` hydration mismatch around render-time `Date`/`Intl`
  Needs a precise hydration-error oracle, not just a visual symptom.
- `019d43ae#1` bottom-tabs branch meta summary, not a clean standalone bug
  Needs decomposition into actual observable regressions first.
- `019d4eba#1` forced WebView reload left STT/state out of sync
  Needs a deterministic native/WebView reconcile oracle.
- `019d6f86#1` voice-to-keyboard transition stuttered
  Needs a measurable motion oracle, not just subjective smoothness.

## 5. Web-Only Or Android-Only

These atoms should not be counted as missing iOS coverage.

- `019c5304#1` app shell exceeded intended max width
  Web shell/layout issue, not an iPhone runtime regression.
- `019c5c43#1` intermittent favicon load crash on first activation/refresh
  Browser/web infrastructure issue.
- `019d19a3#1` Android background translations did not visibly update until foreground
  Android-only.
- `019d4f37#1` Android showed stopped/orange run button while STT still ran
  Android-only.
