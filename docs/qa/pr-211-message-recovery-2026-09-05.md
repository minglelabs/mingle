# PR 211: message recovery follow-up

## Scope

Follow-up to `pr-211-device-local-first-2026-09-05.md`, on branch `codex/messenger-client-sot-2.0.1`, after base commit `453ec755`. The original report's two failures are historical observations; the checks below exercise the new durable-finalization implementation.

- iPhone 11 Pro, iOS 18.6, app/API 2.0.1 build 89.
- Galaxy S9, Android 10, app/API 2.0.1 build 96.
- Existing authenticated app installations were reused. No app uninstall, native rebuild, account reset, or iPhone 14 operation.
- Existing Devbox services and Cloudflare endpoints were used with the previously loaded Vault `secret/mingle/prod` environment. The web changes were loaded by reloading the WebViews.
- Solo fixtures were created through the authenticated API to avoid the UI creation action's microphone auto-start. Actual text composers, language buttons, menus, and room back buttons were used. No seeded history or React state injection.
- Fault injection changed fetch behavior inside each test WebView. It simulates offline/API failures, not physical airplane mode. Native app termination/activation provided actual process restarts.
- No messages or invitations were sent to other users. Voice input and audible TTS were not tested; microphone state remained idle during the text checks.

## Device results

| Scenario | iOS 18.6 | Android | Observed assertions |
| --- | --- | --- | --- |
| Offline text submission | Pass | Pass | Complete original and translation intent exist in the journal synchronously; composer clears; original is visible |
| Missing selected translation | Pass | Pass | Selecting English while offline shows the Korean original plus a pending label, not a blank bubble |
| Reconnect after translation failure | Pass | Pass | Original and English translation reach the server automatically; exactly one message ID; journal drains; pending label disappears |
| Translation request held indefinitely | Pass | Pass | Source delivery is acknowledged independently, original exists in the warm cache, translation intent remains durable |
| Process termination followed by cold list start | Pass | Pass | Both apps were terminated after closing the room to the list, then relaunched; no room was reopened before the recovery assertion |
| Recovery while only the list is open | Pass | Pass | Active room remains null, journal drains, authenticated room API contains both test messages exactly once with complete translations |
| Reopening recovered room | Pass | Pass | Two messages render; switching English language badges displays recovered English content without a pending/blank bubble |
| Queued removal rejected by the server | Unit coverage | Pass | Offline submission survives the optimistic room clear; injected DELETE 403 restores the room; the pending original and translation subsequently persist exactly once |

Both restart fixtures contained one earlier offline/reconnect control message and one interrupted-translation message. Server reads after relaunch returned exactly those two original texts and English translations. The iOS rendered result was also inspected via a device screenshot.

## Automated coverage

- Final run: **151 unit-test files / 1,331 tests passed**, plus **6 script tests passed**. TypeScript no-emit checking and ESLint on all changed application/test files passed.
- Synchronous journal/cache persistence before network work, recovery between journal/cache writes, independent source acknowledgement, process-reload stage restoration.
- Offline retry, incomplete or malformed successful translation replies, detected-source-only replies, response-body timeout, overlapping flush/direct delivery, and reuse of successful AI output after failed persistence.
- Account/API isolation, tracking adoption, shared list/room ownership, old-account cancellation, removal tombstones, confirmed removal, rejected removal, and late in-flight response cancellation.
- Actual optimistic room-removal callback preserves delivery intent; rejected enqueue does not clear the room.
- Collapsed-bubble original fallback, late source-only hydration, initial source/title behavior, translation-update push suppression, and message analytics suppression.

## Cleanup

- Removed only this run's temporary solo rooms: one iOS recovery room, one Android recovery/removal room, one Android rejected-removal room, and one empty Android cleanup room used to allow the normal room preference-sync path to finish. Authenticated GETs returned 404 for all four after deletion; their test messages are no longer accessible through the application. No existing user rooms/messages were deleted.
- Finalization journals, the older message outboxes, and conversation mutation queues were empty on both devices. Original account preferences were unchanged and synchronized; text composers were closed. Reloading removed all fetch fault injection.
- Both apps were left logged in on the conversation list. Appium sessions and the testing server were stopped after verification; Devbox application/STT/messaging services and Cloudflare tunnels were left running for the user's voice test.

## Limits and handoff

This follow-up closes the two reproduced recovery gaps, not every theoretical storage/network failure and not a complete release sign-off. Translation still requires the server and provider. Storage-full/disabled scenarios, physical offline mode, real account switching, same-account concurrent phones, voice segmentation, and audible TTS remain outside device certification. The browser journal expires recovery records after 30 days and cannot survive app-data clearing/uninstalling before synchronization.

No automatic migration/resend of arbitrary older orphaned cache messages is attempted because their original ownership and delivery state cannot safely be inferred from display cache alone. The existing local-first coverage and server-authoritative membership/history boundaries remain as documented in the original report.
