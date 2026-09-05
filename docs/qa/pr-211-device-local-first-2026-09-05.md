# PR 211: non-voice device verification

## Scope and environment

- Tested commit: `0d147844`, branch `codex/messenger-client-sot-2.0.1`.
- Comparison/service branch: `codex/messenger-tabs-device-test`; not modified.
- iPhone 11 Pro, iOS 18.6, app/API 2.0.1, build 89.
- Galaxy S9, Android 10, app/API 2.0.1, build 96.
- Existing authenticated sessions were preserved. QA inspection was enabled by an overwrite installation, without uninstalling either app. iPhone 14 was excluded.
- Devbox device profile, Cloudflare tunnels, and Vault `secret/mingle/prod` were used. This is local-server testing against the production database, not a production performance benchmark.
- Appium native taps, an actual iOS edge swipe, Android hardware-back events, and DOM UI actions were used. DOM/cache snapshots and authenticated API reads provided assertions. No React state setters or seeded message-history helpers were used.
- API failures/delays were injected inside each test WebView. These simulate fetch failures, delayed replies, a permanently rejected mutation, or a never-resolving translation request. They are not physical airplane-mode tests. Relaunch removes these injections and restores normal network access.
- Two temporary solo rooms per platform isolated all text messages, rename/delete mutations, and destructive checks. Existing zero-unread shared rooms were opened read-only to inspect avatars and history. No messages/invitations were sent to other users.
- Voice input was not tested. The existing new-room action automatically requested voice start; it was immediately stopped, with zero voice utterances observed. The iOS microphone prompt was dismissed rather than recording audio. Voice testing will require enabling that permission again.

## Verdict

The common local-first edit/loading paths passed the checks below, but this is **not a release sign-off**. Two translation/delivery recovery gaps were reproduced on both platforms. The most serious gap leaves a locally cached, blank message without a durable server-delivery job after process termination.

## Confirmed issues

### P1: termination during an unresolved translation strands the message

1. In a temporary solo room, send two control text messages and allow their delivery to finish.
2. Hold the next `/translate/finalize` request indefinitely before it reaches the network.
3. Submit a third text message through the composer. The room reports three messages, but the durable message outbox remains empty.
4. Terminate the app process, then relaunch with normal networking.
5. On both devices, the room/cache contain three messages, while an authenticated room API read contains only the two control messages. The interrupted text is still absent from the server and the outbox is empty after subsequent refreshes.
6. With a translated language selected, the third message renders as a blank bubble: its local original text exists, but its translation map is empty.

Evidence is consistent across both devices, not just a visual timing observation. The initial 900ms sample still had only two persisted cache entries; by termination the third entry had reached the cache. Thus this run proves stranded synchronization and blank rendering, not immediate destruction of every local copy. Cache eviction, storage clearing, or changing devices would make the missing server copy consequential.

Code path: `submitExternalUtterance` calls `finalizeTurnWithTranslation`; the durable `stt_turn_finalized` outbox record is created by `logClientEvent` only after the translation promise resolves. Restoring the bounded utterance cache does not reconstruct that missing delivery job.

Recommended fix: persist the original message and an idempotent delivery job before starting translation. Track translation as a separate durable pending/failed/completed operation. On restart, resume both jobs and display original text while translation is unavailable. Do not delete a message's delivery intent merely because a translation request has not completed.

### P2: failed offline translation does not automatically recover

1. Reject API fetches and send a text message.
2. The original text appears locally and reaches the durable message outbox after the failed translation attempt.
3. Restore networking and allow the outbox to flush.
4. Both devices deliver exactly one server message, but its language is `unknown` and its translation map remains empty. Returning to the room and refreshing does not retry translation.

Code path: `translateViaApi` converts non-OK responses and exceptions into `{ translations: {} }`. The message outbox then retries `/log/client-event`, not `/translate/finalize`. This is a remaining capability gap in the tested code; the test does not establish that PR 211 originally introduced it.

Recommended fix: retain translation intent, targets, and an idempotent message identity in a durable retry queue; distinguish a legitimate empty result from a failed request and show a retryable status.

## Device results

| Check | Android | iOS 18.6 | Evidence / limits |
| --- | --- | --- | --- |
| Existing login after QA overwrite install | Pass | Pass | No app data reset |
| Solo room creation and online rename | Pass | Pass | Temporary fixtures only; creation auto-start was stopped |
| Online text delivery and translation | Pass | Pass | Server contains one copy of the control message with translations |
| Delayed-response text-size edit | Pass | Pass | Final value remains after a five-second reply delay |
| Offline text size and rapid slider edits | Pass | Pass | Last slider value persists locally; preferences marked pending |
| Language removal/reselection while offline | Pass | Pass | Removed chip stays unselected; rapid changes coalesce; room and profile-default jobs exist |
| Default display language plus unrelated rename/read | Pass | Not directly exercised | Android retained Japanese through queued rename/read and server reconciliation |
| Offline rename and cached room reentry | Pass | Pass | Correct title/messages, without waiting for API success |
| Per-room composer draft after reentry | Pass | Pass | Draft restored after reopening composer |
| A/B room isolation | Pass | Pass | Empty B never displayed A's messages in sampled transitions |
| Account preference changes across A/B | Pass | Pass | New B text size appears in A; old-room state does not revert it |
| Bubble display and banner position edits | Pass | Pass | Immediate cache/UI changes; restored afterward |
| Translation model menu | Inspected | Inspected | Only the current Gemini option was observed; no different-model transition claimed |
| Offline text original delivery after reconnect | Pass | Pass | Exactly one server copy; outbox drains; translation recovery fails separately |
| Permanent rename rejection | Pass | Pass | Injected HTTP 403 restores the original title and removes pending edit |
| Pending rename followed by delete | Pass | Pass | Immediate tombstone; reconnect yields server 404 and clears both queued edits |
| Back navigation and subsequent search | Pass | Pass | Android hardware back; actual iOS edge swipe; search opens afterward |
| Warm avatar/language-picker presentation | Pass | Pass | Loaded avatar URLs remain stable after API failures; image-byte network was not blocked |
| Older message pagination | Pass | Not exercised | Android room expands from 100 to 142 visible messages; local persistent window stays 100 |
| Process termination with pending title and draft | Pass | Pass | Title, draft, and text composer restore; pending title reaches server |
| Process termination during unresolved translation | Fail | Fail | Local message stranded; server missing it; blank translated bubble |
| Failed translation retry after reconnect | Fail | Fail | Original delivered, translation never retried |

Warm-room sampling observed Android hydration/title around 100ms, and one iOS run around 441ms hydration / 578ms title. Another iOS B transition settled around 150ms. These are single, instrumented observations, not latency percentiles or a claim that cold loading is fixed. Some first visits required longer waits. Cold start still downloads/initializes the WebView and performs uncached server work.

The iOS edge-swipe sample did not reenter list hydration or lose the creation-button hit target after the room closed. A room restored directly after process restart did perform a document navigation when returning to the list; this is a separate path from the warmed in-document edge swipe and is not certified as flicker-free by this test.

## What is actually local-first?

Local-first here means cached UI state and pending user intent take precedence over stale server responses. The server remains the durable, shared authority. It does not mean every database field has become client-owned.

| Data | Current coverage |
| --- | --- |
| List summary | Cached IDs, title, status, selected/speech/display languages, linkage, attribution, latest-message preview/time/speaker/avatar, message/unread counts, member thumbnails, and timestamps; account/API-scoped warm snapshot with pending edits overlaid |
| Title, active/paused state, selected/speech/link/display languages | Optimistic local state plus durable ordered/coalesced mutation jobs; server validates and reconciles |
| Read marker, delete/leave | Optimistic unread/tombstone plus durable retry and permanent-error rollback; membership authorization remains server-side |
| Account preferences | Account/API-scoped cache and serialized writer for text size, segmentation/slider values, model, banner, bubble display, input mode, speaker/echo preferences |
| Recent room messages | Bounded latest-100 cache of original text, translations/finalization flags, target/source languages, time and sender/avatar metadata; server pagination for older messages |
| Message delivery | Durable outbox once the finalized event is enqueued; **not end-to-end safe before the translation promise completes**, as reproduced above |
| Composer/search/scroll UI | Local drafts and UI persistence; this is not a server-data ownership migration for every UI field |
| Member/profile presentation | Cached summary/profile metadata and avatar URLs; background revalidation remains. Actual image bytes rely on network/browser cache, not a complete local image store |
| Membership, invitations, blocks, permissions, identity, usage/billing, notices | Server-authoritative data; caching some presentation does not make writes offline-capable or client-owned |
| Complete history/all rooms | **Not implemented**: no complete client database, one-time full-history download, or guaranteed full offline history |

List/member caches expire after seven days; preference snapshots after 90 days. The conversation mutation queue is bounded at 200 records and 30 days; the finalized-message outbox at 500 records and 30 days. These are additional boundaries, not unlimited durable offline storage.

## Not covered / cleanup

- No STT, microphone accuracy, TTS, recording lifecycle, or STT finalization-preview regression test.
- No logout/account-switch, provider signup, identity migration, billing, invitation acceptance, block/leave authorization, real multi-device same-account conflict, physical network loss, or storage-pressure/expiry test.
- No proof of all possible cold-start, reconnect ordering, gesture, or WKWebView process-eviction interleavings.
- Cleanup completed: all four temporary rooms return HTTP 404, both mutation queues and message outboxes are empty, and no test room remains in either list. Test-only residual message-count/usage cache keys were removed. Original text size, slider values, bubble/banner/model settings, input mode, and selected-language defaults were restored; preference caches report no pending sync. Existing rooms/messages were not deleted or edited.
- Both authenticated apps were left on the conversation list. Test network injections were removed. Local Devbox servers and Cloudflare tunnels remain available; automation sessions are stopped after verification.
- Product source is not changed in this verification task. Fixes for the two confirmed issues require a subsequent implementation pass.
