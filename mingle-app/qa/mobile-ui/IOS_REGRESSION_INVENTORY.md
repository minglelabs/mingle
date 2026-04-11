# iOS Regression Inventory

This inventory expands the iOS side of the mobile UI regression suite so the current automation no longer looks like a single-case smoke test.

- Historical issue atoms in [docs/ui-ux-codex-thread-history.md](/Users/nam/.codex/worktrees/a92b/mingle/docs/ui-ux-codex-thread-history.md): `92`
- Current automated iOS validation targets: `23`
- These targets cover only the current React Native shell plus live-demo WebView surface.
- Older multi-room conversation-list atoms stay documented in the history file, but they are intentionally marked as not in the current app surface until that UI returns.

## Executed by `pnpm test:qa:ui:ios:regressions`

| Validation target | Mode | Historical issue atoms | Gate |
| --- | --- | --- | --- |
| `ios-webview-layout-contracts` | contract | `2026-real-device#2`, `019d4cae#5`, `019d4cae#43` | `src/lib/rn-webview-layout.test.ts` |
| `ios-native-ui-bridge-contracts` | contract | `019d4cae#8`, `019d4cae#11`, `019d4cae#12`, `019d4cae#13`, `019d4cae#14`, `019d4cae#15`, `019d4cae#45` | `src/components/LivePhoneDemo/live-phone-demo.native-ui.logic.test.ts` |
| `ios-scroll-platform-contracts` | contract | `019c6f40#1`, `019c6f40#2`, `019c756e#1` | `src/components/LivePhoneDemo/live-phone-demo.scroll.logic.test.ts` |
| `ios-composer-layout-contracts` | contract | `019d4cae#9`, `019d4cae#10`, `019d4cae#21`, `019d4cae#22` | `src/components/LivePhoneDemo/live-phone-demo.composer.logic.test.ts` |
| `ios-preference-hydration-contracts` | contract | `019d4cae#23`, `019d4cae#32` | `src/components/LivePhoneDemo/live-phone-demo.preferences.test.ts`, `src/components/LivePhoneDemo/live-phone-demo.account-preferences.test.ts` |
| `ios-locale-catalog-contracts` | contract | `019d4cae#22`, `019c95e8#2`, `019c95e8#3`, `019ca08b#5`, `019ca08b#6` | `src/i18n/config.test.ts`, `src/i18n/get-dictionary.test.ts` |
| `ios-localized-surface-copy-contracts` | contract | `019d4cae#21`, `019d4cae#22`, `019c95e8#1`, `019c95e8#2`, `019c95e8#3`, `019ca08b#5`, `019ca08b#6`, `019ca08b#7` | `feedback-copy`, `delete-copy`, `copy-actions`, `tts-actions`, `app-update.logic` tests |
| `ios-bubble-structure-contracts` | contract | `019c6f40#3`, `019c992c#1`, `019d09c4#1` | `chat-bubble`, `chat-bubble.timestamp`, `translation-bubble-row` tests |
| `ios-copy-affordance-contracts` | contract | `019d09c4#1`, `019d5714#1` | `copyable-bubble-surface`, `copyable-bubble-surface.logic`, `live-phone-demo.copy` tests |
| `ios-speaker-avatar-contracts` | contract | `019d162b#1` | `speaker-avatar` tests |
| `ios-auth-gate-contracts` | contract | `019ca08b#1`, `019ca08b#2`, `019ca08b#4` | `src/components/mingle-home.auth-contract.test.ts` |
| `ios-native-auth-route-contracts` | contract | `019ca08b#3` | `native-auth-bridge`, `[locale]/auth/signin/page`, `[locale]/auth/native/page` tests |
| `ios-menu-chrome-contracts` | contract | `019c95e8#4`, `019c95e8#5`, `019d0514#1`, `019d2f95#1`, `019d2f95#2`, `019d2f95#3`, `019d43a3#1` | `src/components/LivePhoneDemo/live-phone-demo.chrome-contract.test.ts` |
| `ios-native-mic-recovery-contracts` | contract | `019c992c#2`, `019d4cae#41`, `019d4cae#42`, `019d4caf#1` | `use-realtime-stt.logic` tests |
| `qa-bridge-hydrates-live-demo-real-device` | physical iPhone | `2026-real-device#1`, `2026-real-device#2` | `scripts/mobile-ui-qa.mjs` |
| `banner-position-updates-insets-real-device` | physical iPhone | `019d4cae#11`, `019d4cae#12`, `019d4cae#13`, `019d4cae#14`, `019d4cae#15` | `scripts/mobile-ui-qa.mjs` |
| `bottom-anchor-restores-after-storage-hydration-real-device` | physical iPhone | `019d4cae#23`, `019d4cae#32` | `scripts/mobile-ui-qa.mjs` |
| `composer-roundtrip-restores-compact-bottom-bar-real-device` | physical iPhone | `019d4cae#9`, `019d4cae#10` | `scripts/mobile-ui-qa.mjs` |
| `menu-chrome-keeps-dropdown-cue-and-stable-overlay-real-device` | physical iPhone | `019c95e8#4`, `019c95e8#5`, `019d0514#1`, `019d2f95#1`, `019d2f95#2`, `019d2f95#3`, `019d43a3#1` | `scripts/mobile-ui-qa.mjs` |
| `menu-label-matches-korean-locale-real-device` | physical iPhone | `019d4cae#21`, `019d4cae#22`, `019c95e8#2`, `019c95e8#3`, `019ca08b#5`, `019ca08b#6` | `scripts/mobile-ui-qa.mjs` |
| `empty-state-keeps-single-start-control-real-device` | physical iPhone | `019d29d5#1` | `scripts/mobile-ui-qa.mjs` |
| `menu-label-matches-korean-locale-simulator` | iOS simulator | `019d4cae#21`, `019d4cae#22`, `019c95e8#2`, `019c95e8#3`, `019ca08b#5`, `019ca08b#6` | `scripts/mobile-ui-qa.mjs` |
| `permission-denial-recovers-to-idle-simulator` | iOS simulator | `019d4cae#41`, `019d4cae#42` | `scripts/mobile-ui-qa.mjs` |

## Intentionally excluded from the current iOS suite

- The old conversation list, room stack, and multi-room swipe/navigation atoms from the RN 1.1.0 thread are not in the current app surface.
- Those atoms stay tracked in the history document, but they should not be counted as current regressions unless that UI ships again.
