# Mobile UI Regression Coverage

This document maps the documented UI/UX issue atoms in [docs/ui-ux-codex-thread-history.md](/Users/nam/.codex/worktrees/a92b/mingle/docs/ui-ux-codex-thread-history.md) onto the current mobile QA suite.

Use these documents together:

- [ATOM_CLASSIFICATION.md](/Users/nam/.codex/worktrees/a92b/mingle/mingle-app/qa/mobile-ui/ATOM_CLASSIFICATION.md) for the global `131`-atom classification.
- [IOS_REGRESSION_INVENTORY.md](/Users/nam/.codex/worktrees/a92b/mingle/mingle-app/qa/mobile-ui/IOS_REGRESSION_INVENTORY.md) for exact iOS target-to-atom mappings.
- [ANDROID_REGRESSION_INVENTORY.md](/Users/nam/.codex/worktrees/a92b/mingle/mingle-app/qa/mobile-ui/ANDROID_REGRESSION_INVENTORY.md) for exact Android target-to-atom mappings.
- [IOS_REGRESSION_BACKLOG.md](/Users/nam/.codex/worktrees/a92b/mingle/mingle-app/qa/mobile-ui/IOS_REGRESSION_BACKLOG.md) and [ANDROID_REGRESSION_BACKLOG.md](/Users/nam/.codex/worktrees/a92b/mingle/mingle-app/qa/mobile-ui/ANDROID_REGRESSION_BACKLOG.md) for platform-specific coverage gaps relative to the inventories.

## Current Coverage Snapshot

| Coverage view | Validation targets | Explicitly linked atoms |
| --- | --- | --- |
| iOS inventory | `28` | `69 / 131` |
| Android inventory | `27` | `70 / 131` |
| Either mobile platform | `55` | `79 / 131` |

## Active Mobile Regression Domain

The current mobile regression domain is broader than the original live-demo-only pass. It now includes:

- The React Native shell and native history/safe-area bridge.
- The live translator WebView surface.
- The `1.1.0` conversations/list/room/navigation surface that now ships on mobile.
- Mobile route aliasing and soft-delete visibility for shipping mobile namespaces.

The suite no longer assumes that old conversation-list or room-navigation atoms are automatically out of scope. If an atom still belongs to the current mobile product surface, it should either be explicitly automated or be listed in [ATOM_CLASSIFICATION.md](/Users/nam/.codex/worktrees/a92b/mingle/mingle-app/qa/mobile-ui/ATOM_CLASSIFICATION.md) as backlog.

## Covered Regression Categories

| Regression category | Representative automated targets | History coverage source |
| --- | --- | --- |
| Native WebView history and back-availability bridge | `ios-webview-layout-contracts`, `android-native-navigation-history-contracts`, `hardware-back-closes-history-overlay` | [IOS_REGRESSION_INVENTORY.md](/Users/nam/.codex/worktrees/a92b/mingle/mingle-app/qa/mobile-ui/IOS_REGRESSION_INVENTORY.md), [ANDROID_REGRESSION_INVENTORY.md](/Users/nam/.codex/worktrees/a92b/mingle/mingle-app/qa/mobile-ui/ANDROID_REGRESSION_INVENTORY.md) |
| Conversation-list search/history state | `ios-conversation-list-history-contracts`, `android-conversation-list-history-contracts` | inventory docs |
| Conversation-list preview, ordering, active badge, and row action positioning | `ios-conversation-list-summary-contracts`, `android-conversation-list-summary-contracts`, `ios-conversation-row-action-contracts`, `android-conversation-row-action-contracts` | inventory docs |
| Conversation routes, versioned mobile aliases, and soft-delete visibility | `ios-conversation-route-contracts`, `android-conversation-route-contracts`, `ios-versioned-mobile-route-contracts`, `android-versioned-mobile-route-contracts` | inventory docs |
| Native safe-area/banner/chrome layout contracts | `ios-native-ui-bridge-contracts`, `android-native-ui-bridge-contracts`, `banner-position-updates-insets`, `banner-position-updates-insets-real-device` | inventory docs |
| Live-demo scroll, bubble, copy, locale, auth, menu, and avatar contracts | `ios-scroll-platform-contracts`, `ios-bubble-structure-contracts`, `ios-copy-affordance-contracts`, `ios-auth-gate-contracts`, `ios-menu-chrome-contracts`, with Android counterparts | inventory docs |
| Native STT recovery, reconcile, and remount behavior | `ios-native-mic-recovery-contracts`, `android-shared-stt-restore-contracts`, `android-native-stt-reconcile-contracts`, `native-remount-restores-running-mic-state` | inventory docs |
| Real-device hydration, bottom-anchor, composer, locale, and empty-state smoke paths | `qa-bridge-hydrates-live-demo`, `bottom-anchor-restores-after-storage-hydration`, `composer-roundtrip-restores-compact-bottom-bar`, `menu-label-matches-korean-locale`, `empty-state-keeps-single-start-control` | inventory docs |

## Remaining Backlog At The Union Level

The current union-level classification across both platforms is:

| Category | Atom count |
| --- | --- |
| Automated by at least one mobile suite | `79` |
| Current mobile surface, but not automated yet | `44` |
| Oracle still unclear | `2` |
| Reproduction rule still unclear | `1` |
| Deferred or deprioritized | `3` |
| Web-only or non-mobile | `2` |

See [ATOM_CLASSIFICATION.md](/Users/nam/.codex/worktrees/a92b/mingle/mingle-app/qa/mobile-ui/ATOM_CLASSIFICATION.md) for the exact atoms in each bucket.

## Execution Guidance

- Use `pnpm --dir mingle-app test:qa:ui:contracts` or `scripts/devbox qa --contracts` for the fast contract gate.
- Use `scripts/devbox qa --ios-regressions --ios-real-udid <physical-udid> --ios-sim-udid <sim-udid>` for the expanded iOS inventory.
- Use `scripts/devbox qa --android-regressions --android-serial <serial>` for the expanded Android inventory.
- Use `qa/mobile-ui/reports/<timestamp>/` for the latest execution evidence.

## Known Limitations

- Some real-device cases still depend on the QA bridge because black-box Appium alone cannot deterministically seed native STT, hydrated history, or remount state.
- Real iPhone automation still depends on working WebDriverAgent signing and a compatible Appium 3 stack.
- The historical atom denominator is now `131`. Do not use the older `92`-atom denominator from earlier drafts of this QA documentation.
