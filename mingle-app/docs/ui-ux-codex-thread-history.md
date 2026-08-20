# Mingle App Codex Thread-by-Thread UI/UX Audit

## 2026-08-20 Android Instagram feedback link fallback regression

### `2026-08-20-android-instagram-feedback-external-navigation` | UI/UX issue found

1. **The Instagram feedback action could replace the 2.0.0 WebView with the legacy web app on Android**
   Problem: The feedback link opened inside the Android WebView. When Instagram was not installed, or when Instagram's logged-out web flow emitted an Android `intent://` navigation, the WebView load error activated the generic legacy-host fallback. Users then saw the old `mingle-app-xi.vercel.app` UI even though the installed native app was version 2.0.0.
   Fix: Instagram web and Android intent URLs are now handed to native linking, and WebView fallback activation is limited to failures during the initial Mingle host load. External app/browser failures no longer replace the active Mingle WebView with the legacy host.
   Data change: None. This is a native external-navigation and WebView recovery fix.
   Verification: Reproduced on Android 2.0.0 build 82 without Instagram installed; the post-fix release build was installed on the same device, and the Instagram web/intent handling is covered by focused tests and TypeScript validation. The device remained logged out of Mingle after reinstall, so the complete feedback tap could not be repeated without signing in.

## 2026-08-17 Shared English US/UK flag in language selectors

### `2026-08-17-english-us-uk-language-flag` | UI/UX issue found

1. **English was represented by a single US flag even though Soniox exposes English as one `en` language**
   Problem: The four language selection surfaces used a single US emoji for English, while the product does not distinguish US and UK English in its language data. Unicode also has no combined US/UK flag emoji.
   Fix: Added a shared `LanguageFlag` component that renders the existing US and UK flag emojis as a diagonal half-and-half mark only for English. All other language codes continue to use their existing emoji flags unchanged. The component is used by the conversation language selector, primary-language picker, default conversation-language picker, and app-language selector.
   Data change: None. This is a presentation-only change.
   Status: Implemented in-thread on 2026-08-17. Physical-device verification is pending.

### `2026-08-17-english-us-uk-conversation-display` | UI/UX issue found

1. **The English flag reverted to the US-only emoji after leaving the language selector**
   Problem: The conversation room's message language buttons, room header, default display-language menu, and preview rows still rendered the legacy string flag helper directly. English therefore appeared as only the US flag even though the selectors used the combined mark.
   Fix: Conversation-room display paths now use the shared `LanguageFlag` component, including the current and legacy room implementations. English keeps the diagonal US/UK emoji treatment, while all other language flags remain unchanged.
   Status: Implemented in-thread on 2026-08-17. Physical-device verification is pending.

### `2026-08-17-english-us-uk-all-language-surfaces` | UI/UX issue found

1. **Some language indicators outside the conversation room still showed only the US flag for English**
   Problem: Conversation-list rows, profile language stacks, usage breakdowns, and public profile image previews still rendered the old string flag helper or stored rendered flag strings. English therefore appeared inconsistently across the app.
   Fix: Language indicators now keep language codes until render time and use the shared `LanguageFlag` component across those surfaces. Nationality-only flags remain unchanged because they represent a country, not the English language.
   Status: Implemented in-thread on 2026-08-17. Physical-device verification is pending.

### `2026-08-17-notification-newest-first-order` | UI/UX issue found

1. **The notification drawer could show older read notifications above newer ones**
   Problem: The notifications API sorted by `readAt` before `createdAt`. Once notifications had been marked read at different times, an older read timestamp took precedence and made newer follow notifications appear lower in the first-tab notification drawer.
   Fix: Notifications are now fetched in descending creation time. The existing unread/read sections remain in place, while each section preserves newest-first order.
   Data change: None. This is an ordering-only API and presentation fix.
   Status: Implemented in-thread on 2026-08-17. Physical-device verification is pending.

### `2026-08-17-notification-profile-hide-admob` | UI/UX issue found

1. **The native AdMob banner remained visible behind a profile opened from a notification**
   Problem: Tapping a notification actor opened the public profile as a stacked surface above the notification drawer, but the native banner zone still treated the underlying conversations list as active. The profile therefore inherited a banner that should not compete with the profile details.
   Fix: Entering a notification profile posts the native `hidden` banner zone. Closing the profile through its header, edge/native back, or browser history restores the conversations-list `list` zone while keeping the notification drawer underneath.
   Data change: None. This is a native banner visibility and overlay-state fix.
   Status: Implemented in-thread on 2026-08-17. Physical-device verification is pending.

### `2026-08-17-conversation-target-language-selector-copy` | UI/UX issue found

1. **The target-language selector header used a long sentence that could be clipped in narrower locales**
   Problem: The Korean header asked “어떤 언어들로 번역해드릴까요?” and the corresponding localized sentences were long enough to be truncated in the compact top bar. The explanatory meaning also competed with the page title.
   Fix: Replaced the top-bar title with the concise localized equivalent of “번역 언어 선택” / “Select Target Languages”. Added a smaller explanatory sentence at the top of the scrollable content explaining that multiple selected languages are translated simultaneously. All supported room-management locales now have the same description field.
   Data change: None. This is a copy and layout-only change.
   Status: Implemented in-thread on 2026-08-17. Physical-device verification is pending.

### `2026-08-17-empty-conversation-start-guidance` | UI/UX issue found

1. **The empty conversation screen showed supported flags but did not clearly connect language recognition to the Start action**
   Problem: The empty room could say that any language was supported, but the carousel did not move automatically, the flags had no visible language names, and the screen did not guide the user toward the Start button.
   Fix: The 60-language carousel now auto-scrolls slowly in a seamless loop, pauses during touch, pointer, wheel, or keyboard interaction, and resumes after a short delay. Each flag has a localized language name beneath it. The main instruction now tells the user to press Start before speaking, and the existing stretched gray SVG arrow design connects the carousel to the bottom voice control. The existing white visual treatment and absence of carousel position indicators are preserved.
   Data change: None. This is a presentation-only change.
   Status: Implemented in-thread on 2026-08-17. Physical-device verification is pending.

## 2026-08-16 Unified conversation message bubbles

### `2026-08-16-unified-message-bubble-language-badges` | UI/UX issue found

1. **Original speech and translated outputs were rendered as separate stacked bubbles**
   Problem: Each utterance used one bubble for the spoken text and separate amber bubbles for every output language. This made one message look like several unrelated messages and increased the vertical space needed to read a turn.
   Fix: Each utterance now uses one white message bubble that displays one language at a time. The circular language buttons are appended directly before the displayed text without a separate row and are rendered at a compact 30px size with a small gap between buttons; selecting one switches the same bubble between the original text and the corresponding translation. The default display language comes from the signed-in user's profile primary language when that language is available, with the source language as the fallback. Only the original-language button carries a 12px white badge containing the provided black closing-quote image. The message copy button now copies only the currently displayed language, and its confirmation toast uses a black background with white text for contrast. Existing copy-all and selected-language pronunciation actions remain available.
   Status: Implemented in-thread on 2026-08-16. Physical-device verification is pending.

## 2026-08-16 Conversation language selector ordering

### `2026-08-16-conversation-language-featured-order` | UI/UX issue found

1. **The in-room language selector showed the full catalog without the same featured-language grouping as My Page profile editing**
   Problem: The My Page primary-language picker already surfaced seven featured languages first—English, Spanish, Korean, Japanese, Simplified Chinese, French, and Portuguese—while the conversation room selector showed one sorted list. This made the same language choice feel inconsistent and made common languages slower to reach.
   Fix: The room selector now uses the shared featured-language order, renders a `Popular languages`/`주요 언어` section first, and renders the complete locale-sorted or alphabetical catalog below it. Search filters both sections while preserving the fixed featured order. The section labels are resolved by the same helper used by My Page so the two surfaces remain aligned.
   Status: Implemented in-thread on 2026-08-16. Physical-device verification is pending.

## 2026-08-16 Profile QR Sharing and App Links

### `2026-08-16-profile-qr-app-link-flow` | UI/UX issues found

1. **Profile sharing still opened a placeholder route instead of a stable public profile link**
   Problem: The profile share surface generated a locale-specific My Page URL and its QR action was only a placeholder. A shared code could not reliably identify the intended profile after a handle change, and the browser route could render the profile instead of guiding an uninstalled user to the app.
   Fix: QR codes are generated on demand from the immutable profile user ID and an HTTPS `/p/{userId}` link. The QR image can be downloaded, the stable link can be copied or shared, and the browser route validates the ID without fetching or rendering profile content before offering the Mingle app links.

2. **There was no native scanner path for QR profile links inside the WebView app**
   Problem: A WebView-only camera scanner would make camera permissions and scan behavior inconsistent across iOS and Android. Invalid codes also had no product-level error boundary.
   Fix: The React Native shell now requests camera permission, presents a framed Camera Kit scanner, accepts only Mingle HTTPS or `mingle://profile/` links, and sends valid results back to the WebView for public-profile navigation. Invalid, cancelled, and unavailable-camera states have explicit feedback and settings fallback.

3. **Opening a shared HTTPS profile link did not have an app-link handoff**
   Problem: The native shell only handled the existing authentication callback scheme, so a shared profile URL could not reach the correct profile when the app was already running or cold-started.
   Fix: iOS Universal Links and Android App Links metadata were added, including the AASA and `assetlinks.json` endpoints. React Native handles both initial and subsequent URLs, queues the target until the WebView is ready, and then navigates to the localized public profile route. The first release intentionally uses link re-open or QR re-scan after installation instead of deferred deep-link persistence.

   Status: Implemented in-thread on 2026-08-16. iOS simulator and Android debug builds passed; production Android App Links remain inactive until the Google Play app-signing SHA-256 fingerprint is configured.

### `2026-08-16-profile-link-webview-routing` | UI/UX issue found

1. **Opening a shared profile link launched Mingle but did not reliably open the target profile**
   Problem: A profile link could reach the native shell while the WebView was still loading, or could be opened from a link inside the WebView without being routed through the profile handler. The resulting app launch left the user on the screen that was already open. The profile destination also omitted the active 2.0.0 API namespace and native WebView flags.
   Fix: Profile targets are now queued until the WebView is ready, intercepted for both external app links and in-WebView profile links, and opened with a history-preserving navigation to the localized public profile route. The destination carries the platform API namespace and native runtime flags so the target page uses the same 2.0.0 session as the rest of the app. Back/edge-swipe navigation can therefore return to the page that was open before the shared profile.
   Status: Implemented in-thread on 2026-08-16. Physical-device verification is pending.

### `2026-08-16-public-profile-layout-parity` | UI/UX issue found

1. **Public profiles used a different layout from My Page**
   Problem: Opening another user's profile showed a centered card with vertically stacked counts, while My Page used the compact avatar-and-stats layout with the name, handle, bio, and actions beneath it. The difference made the same profile information feel like two separate product surfaces.
   Fix: The public profile now follows the My Page layout and spacing, keeps the profile image preview and language display behavior, removes the edit action for other users, and uses the same action row for follow and profile sharing. Block and report remain available as secondary actions. Profile sharing now accepts the selected public user ID so a shared profile's QR/link represents that user rather than the signed-in account.
   Status: Implemented in-thread on 2026-08-16. Physical-device verification is pending.

### `2026-08-16-repeated-profile-link-open` | UI/UX issue found

1. **Opening the same shared profile link a second time could bring Mingle to the foreground without changing the WebView profile**
   Problem: The browser fallback always launched the identical `mingle://profile/{userId}` URL, while a warm native app depended on a single URL event and then navigated to a destination with the same route URL. Repeating the action could therefore be treated as a duplicate launch or appear to be a no-op when the same profile was already visible.
   Fix: The browser launch control now uses a real anchor default navigation so Chrome preserves the user's click activation. Each click updates the anchor with a fresh nonce while keeping the canonical `mingle://` scheme; the earlier scheme-alternation workaround is no longer used for browser launches. The native shell persists the latest profile URL at the app delegate/activity boundary, retries pending-link consumption briefly after warm activation, accepts a repeated identical URL after the short duplicate-event window, and records masked `[MingleProfileLink]` trace events across browser, native callback, Linking, pending storage, and WebView routing. Native WebView profile destinations still add a fresh navigation nonce while keeping the immutable user ID as the actual profile target.
   Status: Follow-up implementation started in-thread on 2026-08-16 after TestFlight 72 and 73 still reproduced the issue. Physical-device verification is intentionally left to the user on TestFlight 74.

### `2026-08-16-app-store-profile-link-install-branding` | UI/UX issue found

1. **The App Store install button used a generic outline apple instead of the recognizable Apple mark**
   Problem: The button used the Lucide `Apple` outline icon, which did not match the Apple logo users expect when choosing the App Store.
   Fix: The install page now renders a filled Apple mark directly in the button while keeping the existing store link and localized label unchanged.
   Status: Implemented in-thread on 2026-08-16. Physical-device/browser verification is pending.

## 2026-08-08 Native STT continuity across the My Page tab

### `2026-08-08-native-stt-mypage-event-loss` | UI/UX issue found

1. **Native STT appeared to stop when switching to My Page, although the native session was still running**
   Problem: When a user started STT in a conversation, switched to My Page, and returned to the conversations tab, the list could still display the running state. However, speech captured while My Page was open was not reflected in the conversation. Opening the room again appeared to turn STT on, and recognition resumed only from that point. Leaving the room directly for the conversations list did not reproduce the same loss.
   Root cause: The native STT session is owned by the React Native shell, but transcript event handling lived inside the room-only `useRealtimeSTT` hook. A top-level tab switch unmounted the conversation page and its native event listener without stopping the native microphone/WebSocket session. React Native continued injecting transcript events into the WebView, but no listener consumed them. The cached native status therefore remained `running` while partial and final transcript events were discarded.
   Fix: Native STT message events now carry the originating conversation ID and a queue ID. The WebView keeps a bounded in-memory queue of events that arrive while the room listener is absent, and React Native also retains messages briefly while the WebView itself is loading. When the conversations tab returns, it mounts the live room as a non-visible STT consumer instead of reopening the room UI; that consumer drains only its own queued events after storage hydration and keeps updating the list preview. Opening the room later promotes the same consumer to the visible room without restarting native STT.
   Regression coverage: Added unit coverage for message validation, conversation-scoped queue splitting, and delivered-event removal. Web lint and RN type-check pass. The Vault-backed devbox Release build was clean-installed on the connected iPhone, and the user confirmed that STT continues recognizing speech after switching through My Page and back to the conversations list without stopping or restarting when the room is opened.
   Status: Resolved in-thread on 2026-08-08. The native queue/bridge fix is included in the installed app; the list-side live STT consumer fix is served by the connected devbox WebView.

## 2026-08-08 Top-level tab navigation boundary while native STT is live

### `2026-08-08-native-stt-tab-root-boundary` | UI/UX issue found

1. **Switching from the conversation list to My Page and swiping back could reopen the live STT room instead of returning to the list**
   Problem: While native STT was running, the user could leave the conversation list for My Page and then use the iOS back gesture. The stale WebView history pointed back to the active conversation room, so returning to the conversations tab could reopen that room and appear to stop/restart the running STT session. This made a top-level tab change behave like an in-tab room navigation.
   Product decision: Conversations and My Page are top-level navigation roots. Switching tabs starts a fresh navigation boundary for the selected tab. The conversations tab always opens on the list after a tab switch; a room is entered only after the user explicitly taps a conversation. Native STT remains owned by the native shell and must continue without being stopped or restarted by the tab change.
   Fix: Tab links now use `replace` and add a `nativeTabRoot=1` marker while preserving only the native runtime parameters. The native bridge reports no back/forward gesture target while that marker is active, and the iOS WebView gesture gate rejects the stale cross-tab stack. The conversation list consumes the explicit tab-root/skip-restore marker without restoring the live room. When the user explicitly taps a room, the current tab-root list entry is converted back into an ordinary in-tab entry before the room is pushed, so room → list → room forward navigation remains available. The native shell also starts directly at `/conversations` instead of first loading the locale redirect, and clears its persisted room-restore hint whenever the WebView reaches a non-room route.
   Regression coverage: Added tab-root URL and native WebView gesture-gating tests, plus RN navigation-layout coverage. Physical-device verification is pending after rebuilding and reinstalling the devbox iOS app.
   Status: Implemented in-thread on 2026-08-08; the latest Release build was installed on the connected iPhone, with the final physical interaction check pending.

## 2026-08-08 Tab-root reset forward-navigation regression

### `2026-08-08-tab-root-reset-forward-navigation` | UI/UX issue found

1. **A normal room back gesture could return to the list but no longer allow a forward gesture**
   Problem: After the tab-root reset was introduced, opening a room from the conversations tab and swiping back to the list left forward navigation disabled. The user expected the ordinary in-tab sequence `room → list → room` to remain reversible; only an explicit top-level tab switch should discard the older cross-tab stack.
   Root cause: The initial implementation removed `nativeTabRoot=1` from the newly pushed room URL, but the preceding list history entry still carried the marker. When the room was popped, the native navigation bridge and iOS WebView gesture gate saw the marker on the list and treated the normal in-tab destination as a fresh tab root, hiding the forward target.
   Fix: On an explicit room open (`syncHistory: "push"`), the current tab-root list entry is first converted to an ordinary list entry with `replaceState`; the room is then pushed on top of it. A later room back therefore returns to an unmarked list entry, preserving forward navigation. Tab buttons still use `router.replace` and create the marked root, so only an actual tab switch resets navigation.
   Regression coverage: Focused web/RN tests pass, and the fix was committed as `caa7365c`. The connected iPhone was clean-installed with the Vault-backed devbox Release build; final manual confirmation of room → list → room and tab-switch behavior is pending.
   Status: Fix implemented in-thread on 2026-08-08.

## 2026-08-07 iOS room/list repeated back-forward regression follow-up

### `2026-08-07-ios-room-list-history-stale-popstate` | UI/UX issues found

1. **The first history fix could still leave a list screen in the forward stack after repeated edge swipes**
   Problem: After opening a room, swiping back, and swiping forward, the room could appear briefly and then snap back to the conversation list after roughly three seconds. From that list, another back swipe moved to the same list again, and a forward swipe restored the list instead of the room. The same failure family can appear when repeatedly navigating through room subpages such as the hamburger drawer, conversation management, or feedback.
   Root cause: The earlier mitigation separated the native-STT close guard from the popstate restore path, but still treated the delayed `popstate` event's route (or the transient URL) as authoritative. iOS can replay a stale list event from the previous back gesture after the WebView has already committed the forward room entry. The delayed event then closed the restored room, and the cleanup path could rewrite the current room history entry into another list entry. The native iOS restore-history seed also discarded the route metadata, leaving seeded entries without enough information to reject the stale event.
   Fix: Every conversation-list history entry now carries an explicit list-or-room route marker while preserving the native navigation index and other WebView state. Popstate handling resolves the current committed history entry before falling back to the event state or URL, so a delayed older list event cannot close the current room. List URL cleanup removes the legacy plain `conversationId` field, preventing a list entry from being mistaken for a room. The native iOS restore-history seed preserves the same markers, and the QA reset path now creates a clean marked list entry.
   Regression coverage: Unit, UI-contract, script, web production-build, and RN test suites pass. The physical iPhone edge-swipe scenario still needs manual confirmation because the connected iOS 26 WebDriverAgent cannot currently expose a usable WebView automation context.
   Status: Fix implemented in-thread on 2026-08-07; pending physical-device confirmation.

## 2026-08-07 iOS room/list repeated back-forward regression

### `2026-08-07-ios-room-list-history-regression` | UI/UX issues found

1. **Repeated iOS back/forward swipes could settle on the list while native history still pointed at a room**
   Problem: After opening a room, swiping back, and swiping forward, the WebView could remain unresponsive during the native transition and then show the conversation list again. A later back swipe appeared to slide the list over the same list, and a subsequent forward swipe restored the list instead of the room. The same history family had previously affected the room hamburger menu and its feedback/conversation-management subpages.
   Root cause: The conversation overlay close path marked every closed room with the native-STT restore suppression flag. When a legitimate forward `popstate` returned to that room, the route-sync and popstate-open paths treated it as an unwanted automatic restore and removed the `conversation` query with `replaceState`. That preserved the native stamped history index while changing the visible route to the list. The iOS native snapshot, delayed `popstate`, React overlay state, and URL then described different screens.
   Fix: Track the latest room/list target produced by an actual `popstate` separately from the native-STT suppression flag. History-forward restoration now consumes the close guard and reopens the room without rewriting the room history entry. App-driven back closes also keep route-sync from rewriting the current room entry before `history.back()` commits.
   Regression coverage: The iOS forward-swipe QA case now asserts the restored `activeConversationId`, not only the shared `/conversations` pathname.
   Status: Initial mitigation implemented in-thread on 2026-08-07; superseded by the stale-popstate follow-up above.

## 2026-05-08 STT 실행 중 뒤로가기 → 대화방 재진입 루프

### `2026-05-08-stt-back-reentry-loop` | UI/UX issues found

1. **STT 실행 중 뒤로가기 시 "대화방을 열지 못했습니다" alert와 함께 대화방이 자동으로 재오픈됨**
   Problem: native STT가 실행 중인 상태에서 뒤로가기(또는 iOS edge swipe back)를 하면 세 가지 결함이 연쇄적으로 발생했다.
   (1) `handleConversationRunningChange`의 status PATCH (active) `.catch` 블록이 native STT와 무관하게 `liveConversationId`를 null로 지우고 `window.alert(copy.openErrorMessage)`("대화방을 열지 못했습니다")를 띄웠다.
   (2) `liveConversationId=null + activeConversation=null`이 되면서 native STT restore effect(`isNativeSttStatusLive`)가 조건을 충족하고 방을 다시 `setActiveConversation`했다.
   (3) 재진입 때마다 `activeConversation pushState effect`가 또 `pushState`를 쌓아 `?conversation=abc` 항목이 history에 반복 적재됐다. 이후 popstate-open handler가 이 entry를 보고 또 방을 열어 루프가 반복됐다.
   Fix:
   - native runtime에서 status PATCH 실패 시 `liveConversationId`를 지우지 않고 alert도 띄우지 않으며 diagnostics log만 남긴다("native STT 실제 상태가 PATCH 응답보다 우선" 원칙).
   - `suppressNativeSttRestoreConversationIdRef`(conversationId 단위)를 추가. `closeConversationOverlay` 호출 시 세팅되어 native STT restore, route-sync open, popstate-open이 해당 방을 재오픈하지 않는다. suppress된 방의 URL이 들어오면 open 없이 URL만 정리(`replaceConversationOverlayUrl(null)`)한다. `openConversationSummary`에 `clearManualCloseSuppression` 옵션을 추가해 사용자가 목록에서 같은 방을 직접 탭할 때 suppress를 해제한다.
   - effect 기반 `activeConversation pushState`를 제거하고 `openConversationSummary`에 `syncHistory: "push" | "replace" | "none"` 옵션을 추가. restore/popstate-open 경로는 `none`, 사용자 클릭/새 방 생성은 `push`, QA 자동화는 `replace`를 사용해 history 중복 적재를 방지한다.
   Status: Fixed in-thread on 2026-05-08. 수정 파일: `src/components/conversation-list.tsx`.

2. **뒤로가기를 반복해도 대화목록으로 돌아가지 못하고 대화방이 또 나오는 증상**
   Problem: 위 루프(이슈 1)로 인해 `?conversation=abc`가 history에 여러 번 쌓여 popstate back이 대화방 항목으로 계속 돌아갔다. 사용자가 "갑자기 검정화면"이 뜨는 증상도 이 rapid remount/reload 사이클이 원인이었다.
   Fix: 이슈 1의 history 중복 적재 방지 및 suppress 플래그로 함께 해결됨.
   Status: Fixed in-thread on 2026-05-08.



## 2026-04-27 Android WebView Timestamp Update Loop

### `2026-04-27-android-chat-timestamp-update-depth` | UI/UX issues found

1. **Android WebView could show the Next.js error overlay while the room was otherwise still usable**
   Problem: `ChatBubbleTimestamp` scheduled its next relative-time refresh from the exact millisecond remainder before the next second/minute/hour boundary. If an utterance `createdAtMs` included a fractional millisecond or landed just before a boundary, `getNextChatBubbleTimestampUpdateDelayMs()` could return a sub-millisecond delay such as `0.25`. Android WebView can effectively run that as an immediate timeout; because the timestamp effect depends on `tick` and increments `tick`, the component could immediately reschedule itself until React showed `Maximum update depth exceeded`. The user-facing symptom was a red Next.js `1 Issue` badge and overlay in the conversation room, even though STT and the transcript UI could still be running underneath.
   Reproduction: Run the Android devbox app against the local/devbox Next server in development mode so the Next.js overlay is visible. Open a conversation containing at least one rendered chat bubble timestamp whose `createdAtMs` is fractional and just short of a relative-time boundary; the minimal logic case is `getNextChatBubbleTimestampUpdateDelayMs(nowMs - 10_999.75, nowMs)`, which returned `0.25` before the fix. In the real device path, that appears as a red `1 Issue` badge; opening it shows the stack at `src/components/LivePhoneDemo/ChatBubbleTimestamp.tsx:34`, where `setTick(current => current + 1)` runs inside the timestamp timeout. The same condition can be verified without a device by adding/running a unit assertion for the fractional-boundary case in `chat-bubble.timestamp.test.ts`.
   Fix: The timestamp scheduler now rounds the next delay up with `Math.ceil()` and clamps relative timestamp refreshes to a minimum of `50ms`, so Android WebView cannot turn a nearly-zero refresh into a synchronous render loop. A regression test covers the fractional-boundary input and expects the clamped delay.
   Status: Fixed in-thread on 2026-04-27 in commit `35ec7cdd`.

## 2026-04-20 Translator Landing Social Route Follow-Up

### `2026-04-20-translator-landing-social-route` | UI/UX issues found

1. **The `/landing/social` variant was not reachable through the translator domain**
   Problem: The social landing configuration still existed in `mingle-landing`, but the version route guard and the translator legal proxy only allowed `normal` and `gaming` under `/landing`. As a result, `/landing/social` and localized social URLs could show a 404 instead of the existing social-focused landing page.
   Fix: Restored `social` as an allowed landing version in the `/landing/[version]/[[...locale]]` entry point, kept the direct version route in sync, and updated the legal proxy rewrite rules so `/landing/social` and `/landing/social/{locale}` forward to `mingle-landing`.
   Status: Fixed in-thread on 2026-04-20.

## 2026-04-20 Translator Landing Locale Follow-Up

### `2026-04-20-translator-landing-15-locales` | UI/UX issues found

1. **Translator landing exposed too few locale choices after the review fix**
   Problem: The first review fix prevented untranslated locale selection by limiting the custom translator landing selector to English and Korean. That avoided broken fallback copy, but it no longer matched the broader 15-language primary UI locale catalog already used by `mingle-landing`, making the landing experience feel incomplete for a multilingual product.
   Fix: The custom static translator landing now exposes the same 15 primary UI locales and includes a complete message dictionary for each visible locale. The `/landing/{locale}` rewrite also accepts those landing locale paths, including Simplified and Traditional Chinese casing variants.
   Status: Fixed in-thread on 2026-04-20.

## 2026-04-18 Android 1.1.1 Internal Test Banner Follow-Up

### `2026-04-18-android-1.1.1-banner-scroll-inset` | UI/UX issues found

1. **Android conversation transcripts did not reserve scroll space for the native banner**
   Problem: The Android 1.1.1 internal-test build could load a test AdMob banner, but the in-room transcript scroll area still ended directly behind the native banner. With the banner at the bottom, the last transcript items could sit under the banner; with the banner at the top, the same contract expected an equivalent top clearance. iOS already behaved correctly, making the Android room feel cramped and partially occluded.
   Fix: The room now converts the effective native banner inset into explicit top/bottom spacer elements inside the transcript scroll content instead of relying only on scroll-container padding. The native runtime detection and cached banner-layout listener were also relaxed so Android WebView bridge timing cannot skip the native layout event. RN now emits conversation top inset when the native banner is in the top slot and gates conversation bottom inset on the same render-ready conditions. Android bottom inset handling also no longer subtracts bottom-bar clearance when RN has already reported the banner's own height.
   Status: Fixed in-thread on 2026-04-18. Focused native UI and RN WebView layout unit tests passed; Android real-device QA passed after rebuilding the devbox app and clearing the stale WebView 502 state.

2. **Android internal-test WebView could reuse the old banner layout without a URL change**
   Problem: After installing Android internal-test build `1.1.1 (52)`, the native shell was updated but the WebView still used the same production URL as build `51`. Android can preserve WebView cache across app updates, and the initial URL did not include the native banner position or client build. If the web runtime missed the first native banner-layout event or reused older cached JS, both the transcript spacer and scroll-to-bottom button stayed at their pre-banner offsets even while the native banner rendered at the bottom.
   Fix: The RN shell now appends `nativeBannerPosition`, the initial matching banner inset, `nativeClientVersion`, and `nativeClientBuild` to the WebView URL. This gives the web runtime an immediate fallback for top/bottom banner clearance and changes the URL on each uploaded build number, forcing Android WebView to re-resolve the current production page instead of silently reusing the previous build's cached route.
   Status: Fixed in-thread on 2026-04-18 for the next Android internal-test build.

3. **Android conversation banner fallback could still be overwritten by stale web layout state**
   Problem: Android internal-test build `1.1.1 (53)` was installed from Google Play, but the bottom native banner still covered the conversation transcript and scroll-to-bottom button. The RN shell correctly added `nativeBannerPosition=bottom` and `nativeBottomInsetPx` to the WebView URL, but the web runtime could cache an earlier list-zone `banner_layout` event with `position: "top"` and `bottomInsetPx: 0`. Because the displayed banner position preferred native layout state before the URL query, and because `nativeBannerLayout?.bottomInsetPx ?? nativeBottomInsetPxFromQuery` treats numeric `0` as a real value, that stale event could override the URL fallback and keep the effective bottom inset at `0`.
   Fix: The web position resolver now prefers the URL-provided native banner position before cached native layout position, so a stale list-zone `top` event cannot override the runtime URL. The conversation layout also only trusts native layout inset values when they are positive and match the active displayed position; otherwise it falls back to the URL-provided top/bottom inset. This preserves the Android bottom spacer and scroll-to-bottom offset even if the conversation-zone banner event is delayed or missed.
   Status: Fixed in-thread on 2026-04-18 for Android internal-test build `1.1.1 (54)` and iOS TestFlight build `1.1.1 (52)`.

4. **Native banner position toggles could desynchronize from the URL fallback**
   Problem: After the Android stale-layout fix, native runtime preferred the URL-provided banner position over persisted web preferences. That protected startup from stale localStorage, but an in-session user tap on the top/bottom banner setting could no longer override `nativeBannerPosition` from the URL. The web spacer math could stay on the URL's bottom setting while RN moved the physical banner to top.
   Fix: The room now tracks an explicit session-level banner-position override. Native runtime resolves position as session override → URL query → persisted preference → layout event, and the RN `native_set_ad_banner_position` command also prefers the session override and URL query before stored fallback values. Startup remains protected from stale storage while current user taps take effect immediately.
   Status: Fixed in-thread on 2026-04-18 before merging the 1.1.1 QA branch.

## 2026-04-17 Android/iOS 1.1.1 Devbox Local QA

### `2026-04-17-devbox-1.1.1-local-qa` | UI/UX issues found

1. **Android native/WebView remount could strand an in-progress conversation on the list**
   Problem: Android real-device QA reloaded the WebView to the conversation list after a native remount while native STT was still running. The list showed an in-progress conversation row, but the live room and QA bridge were unavailable, so the user-facing state looked paused even though native speech state was still active.
   Fix: The native shell now preserves the requested/current WebView URL across debug remounts, the room sends an explicit remount restore URL plus a short-lived restore marker, and the conversation list waits for loaded conversations before consuming that marker. The list also subscribes to native STT status events and performs a one-time active-conversation restore fallback when native status delivery is delayed.
   Status: Resolved on 2026-04-17. Android real-device QA passed 8/8 after restarting devbox and clearing the Android WebView/app data.

2. **iPhone physical-device automation initially stalled at the Appium/XCUITest device layer**
   Problem: The iPhone app was installed and launchable as version `1.1.1`, but the first Appium attempt could not create a usable XCUITest session for the connected physical device. The standard UDID failed with `Unknown device or simulator UDID`, while the CoreDevice identifier moved into a WebDriverAgent `xcodebuild` wait with no progress.
   Fix: Rechecked the device through `xctrace`, `devicectl`, and `idevice_id`, then reran the physical-device suite with the standard UDID once the device state returned to `connected`. The runner now waits for the stamped native history forward state and falls back to the same WebView history-forward path when Appium's synthetic iOS edge-swipe preview does not commit on the physical device.
   Status: Resolved on 2026-04-17. iOS real-device QA passed 9/9 against version `1.1.1`.

3. **The language selector accessibility contract had drifted from the current UI shape**
   Problem: The top-right language control now opens the full language selector surface, but one QA contract still treated it as a dropdown menu and expected `aria-haspopup="menu"`. That made the iOS chrome check fail even though the rendered selector is dialog-like and the visible affordance was intact.
   Fix: The shared chrome contract and mobile QA now expect the selector dialog contract while keeping the same visible chevron, border, and height affordance checks.
   Status: Resolved on 2026-04-17. The iOS real-device chrome case passed in the 9/9 QA run.

4. **Android devbox AdMob could show only the fallback `AD` badge**
   Problem: The Android device build and local version-policy server could inherit production AdMob values from vault during `--device-app-env dev`. The production Android banner unit returned `no-fill` during local QA, so the native fallback surface stayed visible as a lone `AD` badge instead of a real creative.
   Fix: Devbox now forces Google's official sample AdMob app IDs and banner unit IDs for non-production device app envs, and the Next/Metro devbox runtime receives the same sample values after sourcing vault env files. The RN banner also removes the production fallback badge after a no-fill failure instead of leaving `AD` on screen.
   Status: Resolved on 2026-04-17. Android should request the sample banner unit during local devbox verification.

5. **Native STT remount fallback could reopen a stale active room before status arrived**
   Problem: The remount recovery path treated a missing native STT status as a delayed live status and reopened the first active conversation. If RN later reported `idle`, the opened room could bypass the stale-active reconciliation path and keep a non-live room looking active.
   Fix: The list now restores a room only from an explicit remount marker or a live native STT status. A `null` status waits for RN's first status event instead of reopening an active room by inference.
   Status: Fixed in-thread on 2026-04-18 before merging the 1.1.1 QA branch.

## 2026-04-18 Admin Feedback Inbox

### `2026-04-18-admin-feedback-inbox` | UI/UX issues found

1. **The admin inbox route would have inherited the mobile WebView canvas and locale redirect**
   Problem: The root layout wraps app pages in the fixed 400px mobile canvas, and the proxy redirects unlocalized paths to locale-prefixed routes. A desktop admin inbox mounted at `/admin` would therefore either redirect away from the requested path or render as a clipped mobile viewport instead of a usable feedback-management surface.
   Fix: `/admin` now bypasses locale redirection in the proxy, and `MobileCanvasShell` renders admin routes without the mobile frame while preserving the existing mobile canvas for the app experience.
   Status: Resolved in-thread.

## 2026-04-12 iPhone Real-Device QA Follow-Up

### `2026-04-12-iphone-real-device-ui-qa` | UI/UX issues found

1. **The in-room top-banner toggle still fails to move the native iPhone banner out of the bottom slot**
   Problem: During the connected physical iPhone regression pass, the QA bridge could flip the live-demo preference to `top`, but the native banner layout stayed pinned to `bottom` and the real screen still rendered the bottom banner above the orange start control. This reopens the old in-room top-banner placement family around `019d4cae#13`: instead of merely sitting too low below the room header, the iPhone conversation surface can now fail to switch into the top-banner mode at all.
   Attempted fix: The iPhone QA path itself was repaired first so the physical-device runner now reaches the conversations surface through the same QA bridge/bootstrap path as Android, exports the QA bridge runtime flag from native config, and auto-infers WDA signing defaults from `scripts/devbox qa`. That removed the earlier session/bootstrap failures and isolated the remaining failure to the actual banner-position regression.
   Status: Reproduced on 2026-04-12 during the connected iPhone physical-device pass. Not resolved in-thread.

## 2026-04-12 Android Real-Device QA Follow-Up

### `2026-04-12-android-real-device-ui-qa` | UI/UX issues found

1. **Android native/WebView remount can still fall back to the orange idle/play state while native STT is supposed to remain running**
   Problem: On the connected physical Android device, the live-demo WebView still comes back in the idle visual state (`Tap play to start`, orange mic/play control) after a native-driven WebView remount, even when the native QA status injector keeps the underlying STT status pinned to `running`. That matches the old state-split regression where Android could show a stopped/orange button while STT was still effectively active underneath.
   Attempted fix: The Android regression suite now has both contract coverage for the native-to-WebView reconcile rules and a physical-device remount case that only checks the post-remount recovery path. Narrowing the test removed earlier bridge flakiness, but the real-device remount case still reproduces the idle-state fallback.
   Status: Reproduced on 2026-04-12 during the connected Android physical-device pass. Not resolved in-thread.

## 2026-04-11 Real-Device QA Follow-Up

### `2026-04-11-real-device-ui-qa-automation` | UI/UX issues found

1. **The iPhone WebView could load the ngrok root page but still fail to hydrate into the real UI**
   Problem: On a physical iPhone, the RN WebView could open the main `ngrok` URL and expose a `WEBVIEW_*` context, but Next.js client chunks under `/_next/static/...` were still being replaced by `ERR_NGROK_6024` HTML. That left the page title intact while the visible body stayed on the server-rendered loading shell, so the `window.__MINGLE_QA__` bridge never attached and the automated UI regression suite could not assert real UI state.
   Attempted fix: The native app now appends `ngrok-skip-browser-warning=1` to the initial WebView URL and sends the `ngrok-skip-browser-warning: 1` header on the first WebView request so the root page itself stops landing on the ngrok warning interstitial.
   Status: Partially resolved in-thread. The root page now loads as the real app, but subresource requests still do not inherit the bypass header, so full hydration on real-device ngrok remains blocked until the WebView can propagate the header to same-origin asset requests or the tunnel/provider path changes.

2. **Cloudflare removed the tunnel hydration issue, but iOS 26 real-device WebView automation still lost the JavaScript runtime**
   Problem: After switching the physical iPhone build from `ngrok` to the named `cloudflare` tunnel, the WebView finally opened the real `mingle-app-devbox.photo-for-passport.com` page. However, Appium could no longer run `title`, `execute`, or any QA bridge JavaScript inside that `WEBVIEW_*` context because WebKit returned `code=-32601, "'Runtime' domain was not found"`. The page rendered in the accessibility tree, but the automation layer could not evaluate `window.__MINGLE_QA__` or any DOM script, so real-device regression assertions still stalled at session start.
   Attempted fix: The QA runner was traced down to an outdated automation stack (`Appium 2.19.0` with `xcuitest 8.4.3`) that matches the upstream iOS 26 WebKit failure mode. The in-thread remediation is to move the local QA stack to `Appium 3.x` with a current `xcuitest` driver so real-device WebView commands can speak the newer WebKit target/runtime protocol.
   Status: Root cause identified in-thread. Tunnel hydration is resolved on Cloudflare, but real-device iPhone QA remains blocked until the Appium/XCUITest stack is upgraded and revalidated.

## 2026-04-11 Ongoing Dev Validation Notes

- **In-room language selection was too cramped to scan or control across the full language catalog**
  Problem: The room header still opened a tiny tooltip-style selector. Flags were much smaller than the conversation-list avatar reference, there was no search, names only reflected the current UI locale, and users had no way to switch between locale-sorted and alphabetical browsing.
  Fix: The room language selector was promoted to a full-screen overlay with avatar-sized flags, language search, dual-language labels (`localized / English / native` as needed), and a visible sort toggle for user-locale order vs. alphabetical order.
  Status: Resolved in-thread.

- **The full-screen in-room language selector could render invisibly behind the room overlay**
  Problem: The selector itself was portaled to `document.body`, but the active room is also rendered as a full-screen body portal from the conversation list. The selector shipped with a lower stacking order than the room container, and the follow-up `z-[140]` Tailwind utility still resolved to `z-index: auto` at runtime, so tapping the language button updated state but the overlay stayed hidden underneath the room.
  Fix: Raised the language-selector overlay above the room container and pinned the `z-index` with an inline style instead of relying on the missing utility class, so the full-screen selector reliably appears on top in both current and legacy room runtimes.
  Status: Resolved in-thread.

- **The full-screen language selector still behaved like a detached modal instead of a first-class room subpage**
  Problem: Even after the selector became visible, its top controls did not match the app's existing top-tab pattern, the selected-language area had no fast re-toggle strip, and closing it relied on local state only. That meant iOS edge-swipe / browser back could not dismiss it like a real screen, Android/native banner behavior did not mirror the hamburger drawer, and history replay risked a brief reopen flash right after a back gesture.
  Fix: Rebuilt the selector header around the app's standard 56px top chrome and tab-style sort toggles, added a horizontal recent-language flag strip with active/inactive re-selection states, pushed a dedicated selector history entry for real back navigation, and hid the native banner while the selector is open so it behaves like the room drawer instead of a floating modal.
  Status: Resolved in-thread.

- **Opening the full-screen language selector immediately forced the search field and mobile keyboard open**
  Problem: The selector auto-focused the search input on mount with repeated timers. On mobile this meant the keyboard jumped up every time the screen opened, even when the user only wanted to scan or tap recent flags first.
  Fix: Removed the automatic search focus path so the selector opens in a neutral browsing state and only raises the keyboard when the user explicitly taps search.
  Status: Resolved in-thread.

- **The full-screen language selector header still looked like a modal instead of the app's normal top tab**
  Problem: The selector header kept a right-side close affordance and left-aligned title, so it read like a dismissible popup instead of a room subpage. The expected chrome was a left chevron with the `언어 선택` title visually centered.
  Fix: Replaced the close icon with a left chevron back button and centered the selector title within the 56px top bar, keeping the right side as spacing only so the title stays visually centered.
  Status: Resolved in-thread.

- **Deselected recent-language flags did not look inactive enough**
  Problem: In the horizontal recent-language strip, deselected flags only lost some saturation on the emoji itself. The circular chip still read too close to the active state, so users could miss that the language was currently off.
  Fix: Shifted the entire deselected chip into a stronger gray treatment by darkening the chip background and border and lowering the flag opacity further, so the whole circular control reads as clearly inactive.
  Status: Resolved in-thread.

- **Recent-language chips were ordered by raw recency instead of by active state**
  Problem: The horizontal chip strip mixed active and inactive languages together based on the last interaction. That made it harder to scan the currently enabled set, because a recently deselected chip could sit ahead of still-active languages.
  Fix: Reordered the chip strip into two groups: active languages always render first in their original selection order (oldest selected on the left, newest selected on the right), and deselected languages render after them in deselection-recency order (most recently turned off first).
  Status: Resolved in-thread.

- **Changing room languages could trigger a cross-component React update warning**
  Problem: The room runtime notified `ConversationList` about selected-language changes from inside the `setSelectedLanguages` updater function. React can execute that updater while reconciling `LivePhoneDemo`, which produced the warning about updating `ConversationList` while rendering a different component.
  Fix: Kept the local language toggle synchronous, but deferred the parent callback into a follow-up effect that runs after `selectedLanguages` commits. That preserves the same UI behavior without issuing parent state updates from the child render path.
  Status: Resolved in-thread.

- **The search field and sort toggle row regressed into a boxy, cramped treatment**
  Problem: The 60/40 search-and-sort row met the structural requirement, but the controls lost the softer rounded treatment and inner padding from the original design language. The row read too angular, too short, and the Korean alphabetical label surfaced as `EN A-Z`, which felt unnecessarily technical in UI copy.
  Fix: Restored a taller rounded search field, converted the sort control back into a padded pill-style segmented toggle with rounded inner buttons, increased header-body spacing, and simplified the Korean alphabetical label to `A-Z`.
  Status: Resolved in-thread.

- **Language-card secondary labels sat too far below the localized title and read too small**
  Problem: In the language list cards, the gap between the localized language name and the `English / native` secondary label was slightly too loose, and the secondary line read smaller than intended for quick scanning.
  Fix: Tightened the vertical gap between the two lines and increased the secondary-label font size while keeping its weight unchanged.
  Status: Resolved in-thread.

- **Inactive recent-language chips became so gray that the underlying flag was hard to recognize**
  Problem: The first inactive-chip pass pushed the whole circular chip too far into gray, to the point where the flag identity was harder to read than the intended lightweight disabled treatment.
  Fix: Softened the inactive chip back toward the normal surface by using a lighter gray background and border and by dropping the full grayscale filter on the flag, leaving only a gentler opacity reduction similar to other disabled controls in the room UI.
  Status: Resolved in-thread.

- **The language-selector title sat too high instead of sharing the back button's row**
  Problem: The `언어 선택` title was absolutely centered inside a container that also mixed the safe-area inset into the same box. That made the title read like it was pinned toward the ceiling instead of sitting on the same visual baseline as the left chevron button.
  Fix: Split the safe-area inset into its own spacer and rebuilt the header as a normal 56px row, so the title and back button are vertically aligned within the same chrome line.
  Status: Resolved in-thread.

- **The recent-language horizontal strip showed a visible scrollbar under the flags**
  Problem: On mobile especially, horizontally scrolling the recent-language flag strip exposed a long native scrollbar under the chips, which made the compact selector header feel noisier than intended.
  Fix: Reused the app's existing `no-scrollbar` utility on the recent-language strip so horizontal swipe scrolling still works while the visible scrollbar stays hidden.
  Status: Resolved in-thread.

- **The language search and sort controls drifted into oversized pill shapes**
  Problem: After the earlier control pass, the search field and sort toggle became taller than intended, looked like full pills instead of lightly rounded rectangles, and still gave the search side more width than the sort side. The Korean locale-order label was also longer than necessary for the available space.
  Fix: Reduced both controls to a shorter rounded-rectangle treatment, changed the row split from 60/40 to 50/50, matched the inner sort buttons to the same smaller-corner shape, and shortened the Korean/Japanese/Chinese locale-order labels to `가나다`, `あいう`, `拼音`, and `注音`.
  Status: Resolved in-thread.

- **The language-selector back chevron still did not match the room header exactly**
  Problem: Even after the header row alignment was fixed, the selector's back button still used a different hit box, icon size, and hover treatment from the main conversation header chevron, so the mismatch was visible side by side.
  Fix: Reused the same `38px/40px` button box, `24px` chevron icon sizing, and focus/interaction treatment as the room header back button so the selector chrome now matches it exactly.
  Status: Resolved in-thread.

- **The selected-language count disappeared from the language-selector top bar**
  Problem: The header no longer showed the active selection count like `2/5`, so users lost the quick confirmation of how many languages were currently enabled while browsing the selector.
  Fix: Restored the count in the top-right header slot and aligned it to the same row as the back chevron and centered title, keeping the title visually centered while the count remains visible.
  Status: Resolved in-thread.

- **Alphabet-script locales still showed a redundant sort toggle beside search**
  Problem: For locales whose native ordering label was already `A-Z`, the selector still rendered a second `EN A-Z` toggle even though the UI cost outweighed the value for these users, making the search row feel cramped for little gain.
  Fix: When the locale-order label is `A-Z`, the sort toggle is hidden entirely and the search field expands to the full row width. In that state the selector also resets to its default sort mode so a previously chosen alternate mode does not leak into the hidden-toggle layout.
  Status: Resolved in-thread.

- **Selected languages still blended in slightly too much against nearby unselected items**
  Problem: The selected recent-language chips and selected list cards already used amber accents, but the emphasis was still a touch too subtle when scanning quickly. The user specifically wanted the selected state to read a little more clearly without becoming heavy-handed.
  Fix: Strengthened the selected treatment one small step by thickening the recent-chip amber border to `2px`, nudging the amber tone slightly deeper, and giving both the recent chips and selected cards a slightly stronger warm shadow while keeping the overall palette the same.
  Status: Resolved in-thread.

- **Scrolling the language list did not dismiss the focused search field or mobile keyboard**
  Problem: Once the search field was focused, users could start scrolling the language selector without making a selection, but the input stayed focused and the mobile keyboard remained open. That made simple browsing after a search feel cramped.
  Fix: The selector now blurs the search input as soon as a pointer interaction begins outside the search field, so starting a scroll gesture on the recent chips or the language list dismisses the keyboard immediately.
  Status: Resolved in-thread.

- **Touch selection styling and recent-strip visibility were fighting each other in the language selector**
  Problem: The shared selector applied the same neutral hover border to both selected and unselected buttons. On touch WebViews, a sticky `:hover` state could survive a tap and override the selected amber border, which made selected chips/cards look gray even though their other selected styles updated correctly. Separately, the selector was deciding whether a tap meant “select” or “deselect” from the last rendered `selectedLanguages` prop. During quick retoggles, that prop could be one render behind the user's latest tap, so deselecting a just-reselected language could miss re-registering it in the recent list and make the chip appear to disappear. The recent-language strip also intentionally reorders chips between the active-left and inactive-right groups, but it did not preserve visibility for the chip that had just moved, so the toggled flag could appear to “disappear” when it simply jumped outside the current horizontal scroll window.
  Fix: The selector now keeps selected hover styling separate from unselected hover styling so a selected item never reverts to the neutral gray hover border. It also tracks the latest intended selected-language set locally while processing taps, so rapid reselect/deselect sequences use the up-to-date state instead of a stale prop snapshot, and it preserves visibility of the just-toggled recent chip by scrolling the horizontal strip enough to keep that chip in view after each reorder.
  Status: Resolved in-thread.

- **Chinese locale sort labels overstated the actual sort implementation, and sort-toggle visibility depended on copy text**
  Problem: The selector labeled the locale-order option as `拼音` / `注音`, but the actual implementation only used locale-aware string comparison on localized names rather than explicit pinyin/zhuyin sort keys. Separately, the decision to hide the sort toggle for Latin-script locales was keyed off whether the translated label literally equaled `A-Z`, so a copy-only change could silently change layout behavior.
  Fix: Lowered the Chinese locale labels to the more neutral `中文顺序` / `中文順序`, and moved sort-toggle visibility into explicit locale metadata inside the selector logic so UI behavior no longer depends on translated strings.
  Status: Resolved in-thread.

- **Legacy bottom mic could render in the tiny composer size after hydration**
  Problem: On Android `1.0.11` WebView validation, the legacy translator occasionally rendered the default bottom bar with the composer-sized microphone. This was not a simple viewport scale issue; the actual mic shell was collapsing into the `2.3rem` composer layout while the rest of the bar stayed on the default layout.
  Cause: `LivePhoneDemoLegacy.tsx` and the `1.1.0` room runtime both reused the same Framer Motion `layoutId` values for the composer mic shell and the default bottom-bar mic shell. `isComposerOpen` hydrates from persisted input-mode state after first render, so the shared-layout transition could mix the two subtrees during hydration.
  Fix: Removed the shared `layoutId` bridge between the composer/default mic shell and keyboard toggle in both legacy `1.0.11` and `1.1.0` web runtimes. This keeps the hydration swap discrete instead of animating between incompatible layouts.
  Status: Resolved in-thread.

- **Ngrok interstitial can masquerade as a layout regression on mobile WebView**
  Problem: When device builds pointed at a free ngrok tunnel, the RN WebView could render ngrok's anti-abuse warning page instead of the app. On Android this looked like the 1.0.11 microphone/footer UI had suddenly shrunk or changed, even though the app screen was never reached.
  Fix: Native WebView requests now add `ngrok-skip-browser-warning: true` for `*.ngrok-free.dev` and `*.ngrok-free.app` URLs so local mobile validation reaches the actual app surface.
  Status: Resolved in-thread.

- **Android conversation list could get stuck because RN treated total history length as active back availability**
  Problem: The RN WebView bridge reported `canGoBack` from `window.history.length > 1`, which is not the same as “the current entry has a backward target.” After opening a room and returning to the list with `history.back()`, Android hardware back could still be consumed by the WebView even though web history was already at the first entry, leaving the user stuck on the conversation list.
  Fix: The native navigation bridge now stamps a synthetic per-entry history index into `history.state` and derives `canGoBack` from the current index instead of total history length.
  Status: Resolved in-thread.

- **Conversation-list search initially ignored Android OS back and iOS edge-swipe history**
  Problem: The search UI in the conversation list was only a local `showSearch` state with no dedicated history entry. On Android, pressing OS back while search was open could fall through to app exit instead of closing just the search drawer. On iOS, the same search surface had no real edge-swipe back/forward path and risked reproducing the room-menu replay glitches if a multi-depth history stack was copied over too literally.
  Fix: Search now uses a single dedicated history state (`list <-> search`) instead of a local-only flag. Android native back consumes that entry and closes only the search drawer, while iOS popstate synchronization restores or dismisses search instantly to match native history snapshots without reusing the room menu's deeper stack logic.
  Status: Resolved in-thread.

## Scope

- This pass is organized by session ID, not by merged issue theme.
- It covers 277 unique Codex sessions whose `cwd` matched `mingle`, including archived sessions.
- Source split in this rescan: 29 live sessions and 248 archived sessions.
- Sessions with standalone UI/UX issues: 33.
- Total standalone UI/UX issue atoms documented under standalone session headings in this file: 127.
- Additional ongoing validation-note UI/UX atoms documented in this file: 4.
- Total documented UI/UX issue atoms in this file: 131.
- Sessions with UI/UX feature/polish requests only: 15.
- Sessions where a UI/UX issue was only mentioned or handed off: 8.
- Sessions with no UI/UX issue found: 221.
- `019d4cae-5142-7be2-9c74-30f95bfb5787` is listed first, exactly as requested.
- If a session had no UI/UX issue, the entry says only `No UI/UX issue found.`

## Detailed First Thread

### `019d4cae-5142-7be2-9c74-30f95bfb5787` | UI/UX issues found

- Thread focus: Phase 1 multi-conversation rooms on web/API/DB first, followed by a long chain of multi-room UI/UX fixes.
- High-level verdict: this thread absolutely contained many separate UI/UX issues. It should not have been collapsed into one line item.
- Issue atoms currently listed for this thread: 78.

1. **The conversation-list header box was taller than the intended reference**
   Problem: `nativeTopInsetPx` was being added to the header box itself, so the list header looked larger than the older `bottom-tabs` chrome it was supposed to match.
   Attempted fix: The header was reset to a fixed `56px + safe-area` structure and native banner clearance was moved out of the header box.
   Status: Resolved in-thread.

2. **The `Start Conversation!` CTA had an unwanted orange glow**
   Problem: The CTA shadow read like a pale orange haze behind the button, making the bottom bar look washed out.
   Attempted fix: The orange glow shadow was removed and replaced with a neutral shadow while keeping the gradient.
   Status: Resolved in-thread.

3. **The top gap above the list was over-expanded by fallback spacer math**
   Problem: Even after the header size was corrected, the page was still pushed down because a fallback banner estimate and a header-adjacent spacer were both being applied.
   Attempted fix: The explicit native inset was trusted when present, the guessed `50px` fallback was demoted to old cases only, and the header-front spacer was removed. During later QA-automation work, the same symptom briefly reappeared only in the QA branch because failed test runs could leave the QA-only banner-position override persisted in local storage; the harness was then changed to reset QA demo state after every case instead of touching product layout again.
   Status: Resolved in-thread.

4. **Android hardware back initially did not return from a room to the list**
   Problem: The web overlay pushed history, but Android OS back was not bridged into the WebView history, so room navigation did not behave like native back.
   Attempted fix: A native back bridge was added on the RN side so hardware back could drive the same room-close history path.
   Status: Resolved in-thread.

5. **iOS swipe-back was initially unavailable**
   Problem: The WebView had back/forward gestures disabled, so iOS users could not use the normal left-edge history gesture.
   Attempted fix: `allowsBackForwardNavigationGestures` was enabled for the iOS path during the 1.1.0 RN work.
   Status: Resolved in-thread.

6. **The bottom launch area was still a button inside a footer instead of a full CTA bar**
   Problem: The requested UX was “the whole bottom area is the CTA,” but the implementation still looked like a white footer containing a smaller button.
   Attempted fix: The footer chrome was removed and the full bottom area was turned into one wide CTA surface.
   Status: Resolved in-thread.

7. **The in-room header was visually too tall and heavy**
   Problem: The room header read denser and larger than the list header, so entering a room felt like switching to a different chrome system.
   Attempted fix: Header height and padding were tightened to match the list chrome more closely.
   Status: Resolved in-thread.

8. **A legacy iOS tap-to-top fallback still sat above the room header**
   Problem: Old top-padding/tap behavior survived in the room view and made the upper chrome feel padded and inconsistent.
   Attempted fix: The fallback tap-to-top behavior and its extra padding path were removed.
   Status: Resolved in-thread.

9. **The in-room bottom control bar was bulkier than the list CTA bar**
   Problem: The room’s bottom control bar had more outer height and spacing than the list’s bottom CTA, so the two screens did not feel part of the same UI system.
   Attempted fix: Padding, min-height, and safe-area handling were repeatedly tightened.
   Status: Resolved in-thread after multiple passes.

10. **The in-room play/mic controls had too much chrome**
   Problem: Shadows and gray hover/background treatments around the main control made the room bar look noisy.
   Attempted fix: Extra shadows and adjacent gray chrome were stripped back.
   Status: Resolved in-thread.

11. **The iOS `/conversations` bottom safe area showed the wrong fill color**
   Problem: The native iOS safe-area fill stayed white under the conversation list instead of letting the web footer gradient continue downward.
   Attempted fix: RN palette handling was changed so `/conversations` does not paint the iOS bottom safe area with the native white fill.
   Status: Resolved in-thread.

12. **The list top banner sat too low below the header**
   Problem: The top ad/banner spacing for the list screen had too much clearance and did not visually lock to the header.
   Attempted fix: The list banner offset was tightened separately from the in-room banner offsets. Later QA-branch validation on real devices found two extra contributors: the pull-to-refresh chip was still rendered as a sticky flex child with `opacity: 0`, so it occupied about `50px` between the native top banner and the first conversation row even while idle, and RN was reserving the list top inset as soon as the list zone became active instead of waiting until the native banner was actually render-ready. The follow-up fixes moved the pull chip to an absolutely positioned overlay, gated the list inset reservation on banner readiness, and added a small empty-state-only top cushion so the placeholder does not kiss the banner edge.
   Status: Resolved in-thread.

13. **The in-room top banner sat too far below the room header**
   Problem: The room banner spacing still looked loose after the first banner pass because the list and room were sharing one clearance model.
   Attempted fix: Room top offsets were tuned independently from the list offsets.
   Status: Resolved in-thread.

14. **The in-room bottom banner sat too far above the control bar**
   Problem: The bottom banner clearance in a room did not feel anchored to the actual visible control area.
   Attempted fix: The bottom offset was recalculated against the visible control bar height rather than a looser container estimate.
   Status: Resolved in-thread.

15. **iOS still had a tiny bottom-banner hover gap after the main banner tightening**
   Problem: After the broad banner-offset fix, iOS alone still showed a small floating gap above the bottom controls.
   Attempted fix: An iOS-only bottom nudge was added.
   Status: Resolved in-thread.

16. **Banner transitions lagged during list/room history changes**
   Problem: The old banner could remain visible while the next screen was already animating because the app switched directly between zones without a neutral state.
   Attempted fix: A `hidden` banner zone was introduced so transitions pre-hide before the next zone asserts itself.
   Status: Resolved in-thread.

17. **Room swipe-back on iOS flickered by reopening the room during close**
   Problem: On gesture back, history close and route-sync reopen fought each other, producing a `room -> list -> room` flash.
   Attempted fix: History-driven closes were split into `instant` closes while app-driven closes kept animation.
   Status: Resolved in-thread.

18. **iOS forward-swipe failed to restore the room cleanly**
   Problem: After swiping back to the list, swiping forward could leave the list visible or replay a new room-open instead of restoring the prior room state.
   Attempted fix: Route sync was made to subscribe directly to the `conversation` query and reopen through the history-specific path. Later QA-branch validation found that RN still turned off `allowsBackForwardNavigationGestures` as soon as the current stamped history index hit `0`, even though a forward target still existed. The follow-up fix now keeps iOS back/forward gestures enabled whenever stamped history still has either a backward or forward entry.
   Status: Resolved in-thread.

19. **The drawer had its own swipe-back flicker on iOS**
   Problem: When swiping back out of the drawer, the drawer could briefly reappear and then disappear again because it replayed an exit animation after the native transition.
   Attempted fix: The drawer was given the same `animate / instant` split that the room overlay received.
   Status: Resolved in-thread.

20. **Room swipe-back felt too edge-dependent**
   Problem: Leaving a room required starting at the far-left edge, which felt too brittle for the new full-screen room UI.
   Attempted fix: A web-side whole-body right-swipe helper was added on top of the native edge gesture, excluding buttons, drawers, dialogs, and inputs.
   Status: Resolved in-thread.

21. **The visible CTA label was hardcoded in English**
   Problem: `Start Conversation!` was rendered as raw English text instead of using the conversations dictionary.
   Attempted fix: The visible CTA label was switched to dictionary-backed copy.
   Status: Resolved in-thread.

22. **Seven shipping locales were missing the new conversations copy**
   Problem: `zh-CN`, `zh-TW`, `ru`, `ar`, `hi`, `th`, and `vi` still fell back to English for the conversation-list experience.
   Attempted fix: All missing locale blocks were added to the `conversations` dictionary.
   Status: Resolved in-thread.

23. **The app did not restore the last viewed room/list state on full reopen**
   Problem: Re-entering `/[locale]/conversations` after a full reopen could dump the user at the generic list rather than the exact room/list view they had been using.
   Attempted fix: The last viewed conversations URL was stored per locale and tracking user, then replayed on the next conversations entry.
   Status: Resolved in-thread.

24. **`Start Conversation!` could create a room but fail to auto-start STT because the flag was consumed too early**
   Problem: The parent cleared the auto-start marker before the room had actually reached `running/connecting`.
   Attempted fix: The auto-start marker was only consumed after real running/connecting confirmation.
   Status: Resolved in-thread.

25. **Auto-start broke again because the start path depended too much on child mount timing**
   Problem: Relying on the child room effect alone meant the room could mount and still miss the auto-start action.
   Attempted fix: The parent was changed to trigger start after the room ref became ready.
   Status: Resolved in-thread.

26. **One auto-start fix introduced a ref-callback update loop**
   Problem: A ref callback wrote state during ref attachment and produced a `Maximum update depth exceeded` loop.
   Attempted fix: The ref-callback state update was removed and replaced with a one-time polling/wait strategy.
   Status: Resolved in-thread.

27. **Conversation rows initially lacked recent-message context**
   Problem: The list showed room labels/status but not the latest spoken content, making the new multi-room list hard to scan.
   Attempted fix: The list summary API was extended to include a recent finalized-message preview.
   Status: Resolved in-thread.

28. **Recent-message previews disappeared after some PATCH calls**
   Problem: Pausing a room or changing room languages could blank the newly added preview line until the next full refetch.
   Attempted fix: Single-row summary responses were changed to carry `latestMessagePreview`, and client replacement logic was tightened.
   Status: Resolved in-thread.

29. **The state model tied `live/paused` too closely to room open/close instead of real STT activity**
   Problem: Simply opening or closing rooms could make status appear live/paused in ways that did not match actual STT ownership.
   Attempted fix: Visible-room state was separated from live-STT ownership and room status was recalculated from STT activity.
   Status: Resolved in-thread.

30. **Closing a live room could kill the live session instead of backgrounding it**
   Problem: Unmounting the visible room also tore down STT, even when the intended UX was “close the room UI but keep STT running.”
   Attempted fix: Live rooms were kept mounted in the background when necessary instead of being immediately destroyed on close.
   Status: Resolved in-thread.

31. **Re-entering the same live room did not reliably restore the same live instance**
   Problem: Returning to a still-live room could fail to restore its red/live button state and current instance cleanly.
   Attempted fix: The hidden background instance was preserved and re-shown instead of creating a fresh visual state.
   Status: Resolved in-thread.

32. **Paused rooms could reopen without finalized history or usage after relaunch**
   Problem: After app relaunch, paused rooms could look empty or lose `usageSec` even though persisted finalized data existed.
   Attempted fix: A room-level GET and server fallback hydration path were added to merge persisted finalized state back into the client.
   Status: Resolved in-thread.

33. **Hidden non-owner rooms kept consuming global native STT events**
   Problem: Background-mounted rooms still listened to the same native STT event stream, so room 2 could ingest room 1 text.
   Attempted fix: Native STT event ownership was forced to a single room and non-owners ignored the events.
   Status: Resolved in-thread.

34. **Restored list rows could keep stale `active` badges**
   Problem: After restore/reopen flows, the list’s displayed room state could stay `active` even when the room was no longer the real live owner.
   Attempted fix: Running-state fallback was seeded from restored summaries and cleaned whenever conversation summaries refreshed.
   Status: Resolved in-thread.

35. **Stop actions could update `paused` state and row ordering too late**
   Problem: Stopping a live room could leave delayed list flicker because the parent list did not hear `paused` early enough.
   Attempted fix: `paused` was pushed to the parent list immediately on stop request.
   Status: Resolved in-thread.

36. **List ordering was using the wrong signal**
   Problem: Rooms could move based on stale status/updated metadata instead of the most recent finalized utterance time, so ordering felt wrong.
   Attempted fix: `latestMessageAt` was added and ordering/time display were moved to the latest finalized message signal.
   Status: Resolved in-thread.

37. **A non-owner room could look live just by being opened**
   Problem: Merely entering room 2 or room 3 while room 1 owned STT could make the newly opened room look like it was running.
   Attempted fix: Running UI was gated by real STT ownership instead of generic connection-ready state.
   Status: Resolved in-thread.

38. **Room-to-room handoff could try to start the new room before native stop ack**
   Problem: `room1 stop -> room2 start` could overlap, so room 2 received the start intent before room 1 had fully gone idle.
   Attempted fix: Handoff was changed to wait for native stop ack or timeout before allowing the next start.
   Status: Resolved in-thread.

39. **The old live room could unmount too early during handoff and lose its stop listener**
   Problem: The parent sometimes marked the first room non-live so early that its listener disappeared before the native stop ack arrived.
   Attempted fix: During handoff only, the previous live room stayed mounted until stop completion.
   Status: Resolved in-thread.

40. **The running button still showed a play icon**
   Problem: While STT was already running, the main red control still showed a play triangle instead of a stop square.
   Attempted fix: The running state icon was switched to a stop square while preserving the loading spinner for connecting.
   Status: Resolved in-thread.

41. **iOS mic-permission denial could trap the room in retry/error UI**
   Problem: Denying mic permission left the room stuck in a retry/error-looking state and the button path could become effectively dead.
   Attempted fix: Permission denial was reset back to `idle`, the control was kept re-clickable, and native cached status stopped restoring denial as persistent error.
   Status: Resolved in-thread.

42. **The first permission-denial recovery was too aggressive about opening Settings**
   Problem: One recovery pass jumped to iOS Settings immediately on denial, which was later judged too aggressive for the intended UX.
   Attempted fix: The flow was adjusted so denial returns to idle first and Settings opens only on the next explicit retry tap.
   Status: Resolved in-thread.

43. **iOS swipe-back regressed again later because gesture enablement became tied to menu-open state**
   Problem: After later merges, swipe-back silently became available only when the native menu overlay was open.
   Attempted fix: `allowsBackForwardNavigationGestures` was first restored to unconditional iOS enablement instead of `isNativeMenuOverlayOpen`, but later validation showed that QA-automation work must still preserve the original `canGoBack` gating so iOS forward-history behavior matches `main`.
   Status: Resolved in-thread.

44. **A later room-state pass hit an `isLikelyIOSPlatform` runtime error**
   Problem: The thread explicitly called out a runtime `Can't find variable: isLikelyIOSPlatform` during the multi-room state/ordering cleanup phase.
   Attempted fix: The missing runtime reference was repaired alongside the ownership/list-ordering patch set.
   Status: Resolved in-thread.

45. **iOS interactive swipe could still keep the old banner visible during the gesture**
   Problem: Even after pre-hide work, the banner could linger during the active interactive swipe because RN/WebView did not receive the gesture-start timing early enough.
   Attempted fix: The app already pre-hid as early as available and RN tried to infer the target zone from URL changes.
   Status: Not clearly solvable in-thread. Marked as unresolved structural limitation in the captured session.

46. **iOS `/conversations` could enter a “nothing responds” state because WebView touch handling was internally deadlocked**
   Problem: Later in the thread, the room/list surface could stop responding to taps entirely on iPhone. In the worst case, the user could tap conversation rows and other controls and nothing at all would happen. This was eventually traced to an RN-side WKWebView interaction rather than a web button-state issue.
   Attempted fix: The real regression was that `allowsBackForwardNavigationGestures` had been changed to unconditional iOS enablement at the same time that `/conversations` pages were still using `scrollEnabled={false}`. On iOS WKWebView, that combination let the underlying `UIScrollView` pan recognizer steal interaction in a way that made the web content feel untouchable. The thread later corrected this by gating `allowsBackForwardNavigationGestures` behind `!shouldDisableIosScroll` for those routes, while also fixing a cleanup omission in the legacy-import path.
   Status: Resolved in-thread once the RN gesture/scroll conflict was documented and reversed.

47. **Conversation rows could still log a route change without actually showing the room UI**
   Problem: Separate from the full touch-deadlock case, there was also a softer failure mode where tapping a room clearly triggered navigation work — server logs showed `/[locale]/conversations?...&conversation=<id>` requests and room GET calls returning `200` — but the visible screen never changed. The user described this as “touch logs appear but the screen does not move.”
   Attempted fix: Multiple hypotheses were tried in-thread because the failure looked like a presentation-layer regression rather than an API failure. These included: allowing room-open even while room status PATCHes were pending, forcing room entry to `instant`, reverting the move of auto-start logic from `mingle-home` into `LivePhoneDemo`, restoring query-based room open on first render, removing/reverting cold-start last-view restoration, and switching between `document.body` portal rendering and inline overlay rendering for the room surface. None of those attempts was treated as a final, clearly verified root-cause fix in the captured session.
   Status: Not conclusively resolved in-thread. The issue was important enough that the thread explicitly requested it be written down as a separate class of room-open regression, distinct from the pure iOS touch-deadlock above.

48. **iOS permission denial on `Start Conversation!` could still create a room and immediately strand it in `Connecting...`**
   Problem: The desired UX became “create the room, but do not auto-start STT if the initial iOS mic request was denied.” Instead, the room could still enter a visible `Connecting...` state and just sit there until the user manually backed out.
   Attempted fix: The create-room flow was changed so iOS native mic denial short-circuits auto-start, letting the room be created without pretending STT is actively connecting.
   Status: Resolved in-thread after follow-up permission-flow passes.

49. **After an iOS denial, the first explicit `Start` retry did not reliably open Settings**
   Problem: Once the user had denied microphone permission, re-entering the room and pressing `Start` was supposed to jump directly to the iOS Settings screen on the first retry. Instead, one pass left the room flashing or entering `Connecting...` once, and Settings opened only on a later interaction.
   Attempted fix: The thread cached the last native mic-permission outcome and reused it when re-entering rooms, so an already-denied state could trigger the Settings redirect immediately instead of burning the first retry tap.
   Status: Resolved in-thread after native permission caching was added and then refined.

50. **A hidden WebView site-level mic prompt appeared inside the native app**
   Problem: Even though the native app already owned microphone permission, `Start Conversation!` could still trigger a web-origin mic prompt (`Allow "...photo-for-passport.com" to use your microphone?`) from the embedded WebView. This was confusing and wrong for the intended native UX.
   Attempted fix: The room-creation warm-up path stopped calling `getUserMedia()` for native iOS/Android runtimes, so native permission stayed the only source of truth and the site-origin prompt stopped appearing.
   Status: Resolved in-thread.

51. **Web warm-up denial state and native denial state could drift apart**
   Problem: When denial happened through the warm-up path before the room UI was visible, the room-level `Start` logic did not always inherit that denial. This created a split-brain state where the room thought it should connect, while the earlier create-room flow had already learned that mic permission was denied.
   Attempted fix: The denial result from the create-room warm-up path was explicitly written into the same last-known native permission channel consumed by the room STT hook.
   Status: Resolved in-thread.

52. **STT could be truly running while the room UI stayed stuck in `Connecting...`**
   Problem: Later in the thread, the user found that `Connecting...` could remain on-screen even when STT was actually active. Evidence included server-side STT connection logs and, after navigating away and back, a red running button and working transcript ingestion.
   Attempted fix: Multiple state-reconciliation passes were added so the current room could recover native STT ownership on remount, re-read cached native status while connecting, and promote itself out of `connecting` when the native/runtime state proved STT was already alive.
   Status: Resolved in-thread after several iterations.

53. **The first STT server connection could be blocked until an unrelated user gesture**
   Problem: In one particularly confusing version of the bug, the STT server did not log a client connection until the user hit back or otherwise interacted again. This made it look like “the room is stuck,” even though the actual cause was a blocked async step in the front-end start pipeline.
   Attempted fix: The thread found that `primeAudioPlayback()` was being awaited before STT start, and on iOS/WebView that promise could stall waiting for a user gesture. The fix moved TTS priming to the background so the STT websocket start could happen immediately.
   Status: Resolved in-thread.

54. **Leaving a still-running room did not immediately update the list badge to `대화중`**
   Problem: The list badge for the live room sometimes remained stale after backing out of a room. The user could see that STT was active only after re-entering the room, at which point the red running button appeared and only then did the list eventually update to `대화중`.
   Attempted fix: Parent summary updates were made more eager, and the room/list ownership recovery path was expanded so the list could learn about the live owner even if the visible room UI had just unmounted.
   Status: Resolved in-thread after the later state-sync passes.

55. **The `Connecting...` overlay oscillated rapidly even while transcript text was already arriving**
   Problem: One later regression produced especially bad UX: the room would show `Connecting...`, words would begin arriving, and the overlay would flash on and off many times over the first few seconds. The user described it as the overlay appearing and disappearing more than twenty times while speech was already being recognized.
   Attempted fix: The native `running/silenced` statuses were kept in `connecting` only until the first real server-ready or transcript activity, and once the room reached `ready`, later repeated native running statuses were prevented from downgrading it back to `connecting`.
   Status: Resolved in-thread.

56. **The room-rename dialog sat too low and could be covered by the keyboard**
   Problem: Both the in-room rename dialog and the conversation-list rename dialog initially rendered around the vertical center of the screen. On iPhone, opening the keyboard could partially cover the field and action buttons.
   Attempted fix: The dialogs were moved to a safe-area-aware top offset instead of center alignment, and both implementations were normalized to use the same upper placement model.
   Status: Resolved in-thread after multiple follow-up passes.

57. **The first rename-dialog positioning fix was misleading because only one of the two dialogs actually moved**
   Problem: One pass moved the in-room dialog but left the list-side dialog centered, so the user kept reporting “the rename modal is still too low” even though one implementation had changed.
   Attempted fix: The list rename modal and the room rename modal were both audited and then moved together so they shared the same top anchoring behavior.
   Status: Resolved in-thread.

58. **Long-pressing a conversation row selected text instead of cleanly showing the room-actions tooltip**
   Problem: On the conversation list, a long press could trigger iOS-style text selection on the preview/time labels, producing blue text-selection affordances that fought the intended room-action menu.
   Attempted fix: User-select and touch-callout behavior were disabled on the room rows so long press opens the room-actions tooltip without text-selection chrome.
   Status: Resolved in-thread.

59. **Long-pressing a room avatar could open image-preview behavior instead of room actions**
   Problem: The avatar image on a conversation row still behaved like a draggable/previewable image on iOS, so long-pressing it could surface image preview behavior rather than the intended room-action tooltip.
   Attempted fix: Drag/image-preview behavior was disabled on the list avatars so long press remains dedicated to room actions.
   Status: Resolved in-thread.

60. **The room-delete action from the conversation list initially failed with `405 Method Not Allowed`**
   Problem: The UI exposed room deletion from the list, but versioned `/api/ios/.../conversations/:id` and `/api/android/.../conversations/:id` routes were not exporting `DELETE`, so the visible action failed immediately for users.
   Attempted fix: `DELETE` was added to the versioned iOS/Android conversation-detail routes and controllers so room deletion used the same soft-delete API through namespace-specific endpoints.
   Status: Resolved in-thread.

61. **Freshly created rooms could immediately 404 on follow-up GET/PATCH calls**
   Problem: A newly created room could appear to exist for one moment and then fail hydration/status requests because `is_deleted = NULL` rows were being filtered out as if they were deleted. This created visible “room not found” behavior right after room creation.
   Attempted fix: Conversation queries were changed to treat `is_deleted = NULL` the same as `false`, so newly created rooms remain queryable until explicitly soft-deleted.
   Status: Resolved in-thread.

62. **Deleting a live room from the list could revive the room or leave behind an empty shell**
   Problem: When STT was still active or just winding down, room deletion could race against live-state PATCHes and room-summary upserts. The user could see the room disappear and then reappear as a blank/initial-looking room, often accompanied by 404s.
   Attempted fix: Deleting-room IDs were tracked explicitly, running-state PATCHes were suppressed for deleting rooms, and delete success removed the room from all live/list state immediately instead of allowing later upserts to resurrect it.
   Status: Resolved in-thread after several passes.

63. **Pending STT finalization after delete could still write into a deleted room**
   Problem: Even after STT stopped, a pending finalization/translation turn could land after deletion and touch the just-deleted room again. This produced confusing server 404s and visible “why is this room still here?” moments.
   Attempted fix: A dedicated `prepareForDeletion()` path was added so pending turns and in-flight finalization work are discarded before the delete completes.
   Status: Resolved in-thread.

64. **Live-room deletion could surface a failure alert even when the room was already gone**
   Problem: The room visually disappeared, but a late `PATCH 404` or `DELETE 404` could still bubble up as `대화방을 삭제하지 못했습니다`, making the user think the delete had failed even though the room was already removed.
   Attempted fix: Late 404s that happen during or after confirmed deletion were treated as benign and no longer surfaced as a user-facing failure.
   Status: Resolved in-thread.

65. **The room-management menu briefly flashed the feedback screen while opening**
   Problem: The submenu carousel was implemented as `root -> feedback -> room management` on a shared three-panel strip. Jumping from the root menu to room management animated across the middle panel, making the feedback page flash by for a frame.
   Attempted fix: Direct root-to-room-management navigation now uses an instant screen transition instead of visibly sliding through the feedback panel.
   Status: Resolved in-thread.

66. **Global success/error toasts appeared too low and did not match the in-room toast style**
   Problem: Several user-facing messages such as room-delete success/failure and STT failure surfaced through a bottom-edge toast style that sat much lower than the in-room `Connecting...` or `Copied` toasts, making the feedback feel visually inconsistent.
   Attempted fix: The global toast stack was moved into the same visual lane and design language as the in-room toast treatment.
   Status: Resolved in-thread.

67. **Conversation-list action tooltips chose the wrong vertical direction near the top of the screen**
   Problem: Only the very first row opened its tooltip downward. Rows slightly lower in the upper part of the list still opened upward, which felt wrong and cramped near the top header area.
   Attempted fix: The positioning rule was expanded so conversation rows in roughly the top 40% of the list viewport also open their tooltip downward.
   Status: Resolved in-thread.

68. **Android OS back skipped the menu subpage stack and closed the room**
   Problem: When the hamburger menu was on `Feedback` or `Conversation Management`, Android hardware back did not close the submenu first. It fell through to the room-close handler, so the user was dumped back to the conversation list instead of stepping back inside the menu.
   Attempted fix: A higher-priority native back handler was registered inside the room menu so submenu/modals/dropdowns consume Android back before the room overlay does.
   Status: Resolved in-thread.

69. **Opening feedback from Android 1.1.0 hit a 404**
   Problem: The UI exposed the feedback page from the hamburger menu, but `/api/android/v1.1.0/feedback` and `/api/ios/v1.1.0/feedback` were missing, so entering the page could immediately fail with a 404 and an apparently broken empty state.
   Attempted fix: Versioned `feedback` route aliases were added for API `v1.1.0` on both Android and iOS, and the namespace routing contract test was expanded.
   Status: Resolved in-thread.

70. **iOS submenu transitions became unnaturally fast and snap-like**
   Problem: After the menu tree refactor, entering and especially leaving `Feedback`/`Conversation Management` felt too fast, with the close transition appearing half-smooth and then disappearing abruptly.
   Attempted fix: Menu subpage timing and back-direction animation handling were retuned so open/close transitions use the same smoother content transition path.
   Status: Resolved in-thread.

71. **iOS edge-swipe back from a submenu replayed the closed page and flashed it away**
   Problem: Swiping from the left edge did return from `Feedback`/`Conversation Management` to the root menu, but roughly half a second later the just-closed submenu could flash back in and then vanish. The user perceived this as a severe flicker/regression in the back gesture.
   Attempted fix: Natural iOS history-gesture `popstate` is now treated separately from app-requested back steps, so the system swipe no longer replays a second JS-side submenu animation after the native transition already completed.
   Status: Resolved in-thread.

72. **An iOS submenu back-gesture fix accidentally removed menu swipe-dismiss**
   Problem: To stop edge-swipe flicker, the menu’s own swipe-dismiss was briefly disabled on iOS, which regressed the expected ability to dismiss the menu by swiping inside the panel.
   Attempted fix: The gesture model was split by start region: the left-edge gutter is reserved for native iOS history swipe, while swipes starting farther inside the panel still trigger the custom menu dismiss.
   Status: Resolved in-thread.

73. **iOS forward-swipe could preview the menu and then let the room snap back over it**
   Problem: After returning from a menu/subpage to the room via iOS edge-swipe back, using the forward gesture could momentarily show the previous menu state and then abruptly let the room reclaim the screen. The system gesture preview looked correct, but the JS state refused to restore the menu.
   Attempted fix: The menu `popstate` handler was changed to accept forward restoration from depth `0 -> 1/2` instead of bailing out whenever the current menu depth was already zero.
   Status: Resolved in-thread.

74. **iOS forward-swipe still replayed a delayed room/menu double transition**
   Problem: Even after forward restoration was enabled, the system could show the menu correctly and then, about a second later, replay a `menu -> room -> menu` sequence. The UI looked like it had recovered, then the room suddenly covered it, then the menu slid back in.
   Attempted fix: Menu history restoration now reads the latest `window.history.state` instead of trusting a stale `popstate` payload, and it no longer invents fallback depths by decrementing the current depth. This avoids delayed second transitions from stale history snapshots.
   Status: Resolved in-thread.

75. **iOS natural history gestures could still emit one delayed room/menu replay across the room boundary**
   Problem: Even after stale-state handling was tightened, a completed iOS back/forward gesture could still be followed by one late `menu <-> room` reversal. Users saw the correct destination first, then a brief return to the opposite screen, then the intended screen again.
   Attempted fix: A short iOS gesture-settle guard now ignores delayed natural `popstate` replays that would bounce only between room depth `0` and menu depth `1/2`, while still allowing normal in-menu depth changes.
   Status: Resolved in-thread.

76. **iOS menu swipe history required one final stabilization pass before it stopped flickering**
   Problem: The earlier back/forward fixes each removed one layer of the glitch, but the room/menu boundary remained fragile enough that users still saw intermediate regressions while testing real gestures. The practical UX issue was not just one bug but a chain of related history/gesture mismatches that had to be iterated on until the same back/forward flow finally behaved consistently.
   Attempted fix: The thread ultimately converged on a stable combination of native edge-swipe handling, in-panel swipe-dismiss routing, forward restoration, stale-state avoidance, and delayed-replay suppression. Once those pieces were in place together, the user confirmed that the duplicate swipe replay issue appeared to be behaving correctly.
   Status: Resolved in-thread after multiple follow-up passes.

77. **Forward history after custom menu swipe-dismiss could restore a partially dragged menu snapshot**
   Problem: If the user closed the hamburger menu with the custom in-panel swipe-dismiss gesture instead of native edge-swipe back, a later iOS forward-swipe could restore an in-between frame rather than a clean full menu. The left side of the room stayed visible because iOS appeared to snapshot the menu at the exact drag offset where the finger was released, then React finished a second internal slide into the real destination.
   Attempted fix: The thread narrowed the cause to the custom swipe-dismiss path firing history navigation while the panel still visually reflected a partial drag offset. The likely remediation identified in-thread was to force the menu back to a clean fully-open frame before navigating history, but that final code fix had not been landed yet at the time of documentation.
   Status: Still open at thread end.

78. **Android create-room auto-start could misread cached mic denial as an iOS Settings recovery**
   Problem: On Android 1.1.0, denying microphone permission and then pressing `Start Conversation!` again could jump straight to app settings instead of showing the normal in-app permission prompt. Manual `Start` inside the room still behaved correctly, so the regression was isolated to the auto-start path used by newly created rooms.
   Attempted fix: The thread found that cached native mic-permission state was always being rehydrated as if it belonged to iOS, which converted any cached `denied` value into the `open_ios_settings` recovery path. The fix resolved the cached recovery action against the current API namespace platform so Android denial stays on the in-app retry path while iOS denial still routes to Settings.
   Status: Resolved in-thread.

## Other Issue Sessions

### `019c5304-b4b1-7bf0-b768-81ea87605468` | UI/UX issues found

1. **The app shell exceeded the intended 480px maximum width**
   Problem: The mobile-web shell had drifted beyond the intended 480px cap, so the centered service area looked too wide and lost the phone-frame feel the user expected.
   Attempted fix: The max width was reset from the larger rem-based cap back to a 480px-equivalent constraint.
   Status: Resolved in-thread.

### `019c5c43-c3ae-76f1-bfbf-a3be7fd105f3` | UI/UX issues found

1. **Thread-level UI/UX issue**
   Problem: intermittent favicon load crash on first activation/refresh.
   Attempted fix: serve favicon as a static public asset.
   Status: resolved.

### `019c6f40-5ed2-7933-9acd-9302b505584e` | UI/UX issues found

1. **Initial and refresh entry could settle at the wrong scroll position**
   Problem: When the conversation view hydrated, the newest content was not reliably anchored at the bottom, so users could land mid-history instead of on the live edge.
   Attempted fix: The bottom-anchor timing was reworked so the list waits for the right hydration point before doing its one-time bottom snap.
   Status: Resolved in-thread.

2. **Top pagination could trigger before bottom anchoring finished**
   Problem: The top-edge loading logic could wake up too early, fighting the intended bottom-follow behavior and making the initial scroll position feel unstable.
   Attempted fix: The top-pagination trigger was tightened so it no longer races the first bottom-settle pass.
   Status: Resolved in-thread.

3. **Translation bubble confirmation UI was tied to STT final instead of translation final**
   Problem: The translation bubble visually looked finalized as soon as STT finalized, even when the translation itself was still pending, which made the UI state misleading.
   Attempted fix: The translation bubble styling was split so the emphasized/final state only appears after translation finalization.
   Status: Resolved in-thread.

4. **Stopping STT during TTS playback could leave playback state stuck**
   Problem: If STT was stopped while TTS audio was already playing, playback could stop mid-stream, the playing effect could remain on screen, and later TTS playback could stop working until app restart.
   Attempted fix: This thread reached root-cause analysis and identified a stuck TTS state / missing completion path, but the captured session ended at investigation.
   Status: Unresolved in this session.

### `019c756e-8522-7eb0-ab7a-f3032bcd29ee` | UI/UX issues found

1. **The overlay disappeared too early during inertial scrolling**
   Problem: On mobile inertial scroll, the app dropped out of its user-scrolling state too early, so the overlay vanished while the screen was still visibly moving.
   Attempted fix: The scroll-state logic was changed to keep the overlay visible until scrolling had actually stopped.
   Status: Resolved in-thread.

### `019c95e8-00df-7180-8366-54a76bd59ccc` | UI/UX issues found

1. **Hamburger menu surfaces used the wrong background color**
   Problem: The hamburger panel and then the hamburger button itself did not match the navbar surface, so the top-right chrome looked visually inconsistent.
   Attempted fix: The menu panel and trigger button were restyled to use the same surface treatment as the navbar.
   Status: Resolved in-thread after multiple passes.

2. **Menu and login copy were not fully internationalized**
   Problem: Menu items and login-related text still leaked hardcoded English instead of following the 15-locale i18n system.
   Attempted fix: Missing translation keys and locale coverage were added for the menu and login flows.
   Status: Resolved in-thread.

3. **UI locale sources disagreed with each other**
   Problem: `Sign in`/`Sign out` could stay English while the language selector showed Korean, because page locale and selector locale were being derived from different sources.
   Attempted fix: The selector locale was unified with the page locale so the visible UI no longer split between two locale sources.
   Status: Resolved in-thread.

4. **Borders and depth around the hamburger menu were still wrong after the first styling pass**
   Problem: Even after the color fix, the menu still showed leftover borders or the wrong amount of chrome, so it did not match the requested flatter look.
   Attempted fix: The trigger and panel styling were iterated again, removing the extra border/depth where inappropriate and preserving only the container border that the user wanted.
   Status: Resolved in-thread after several corrections.

5. **Dropdown positioning regressed during the flattening passes**
   Problem: At one point the menu overlapped the navbar and even obscured the hamburger trigger, which was a direct positioning bug introduced during the flattening iteration.
   Attempted fix: The panel was moved back below the navbar and its border restored.
   Status: Resolved in-thread.

### `019c992c-911f-7b23-8a18-3a0e4d5007df` | UI/UX issues found

1. **Live message rows flickered as text updated**
   Problem: During diarization work, each incremental transcript update caused the whole visible message UI to flash, including the translation rows, which made the conversation feel unstable.
   Attempted fix: The partial-key / rerender path was tightened so existing bubbles no longer unnecessarily re-animate on every transcript update.
   Status: Resolved in-thread.

2. **Multi-speaker overlap still failed to finalize per speaker**
   Problem: A second overlapping utterance could appear, but the first speaker's utterance could stay stuck without finalizing because activity/finalize logic was not truly separated per speaker.
   Attempted fix: Speaker-specific idle/finalize handling was added end-to-end so each speaker can finalize independently.
   Status: Resolved in-thread.

### `019ca08b-fcff-7ba3-b22f-d4a11d6203a8` | UI/UX issues found

1. **Login screen safe areas showed ugly white bands**
   Problem: The RN iOS login screen rendered white safe-area strips above and below the content instead of extending the intended top and bottom colors, which made the shell look unfinished.
   Attempted fix: The iOS shell safe-area fill was reworked so login routes extend their intended colors into the top and bottom safe areas.
   Status: Resolved in-thread.

2. **The login flow initially lacked the requested swipe-to-terms step**
   Problem: The requested UX was social-login button -> slide to terms acceptance -> continue, but that intermediary terms panel did not exist at first.
   Attempted fix: The login UI was restructured to slide into a terms-consent step before continuing into provider auth.
   Status: Resolved in-thread.

3. **Apple and Google auth flows did not match the requested native UX**
   Problem: Apple needed a native Face ID-backed flow, and Google needed the system confirmation sheet plus bottom-sheet browser auth flow, but the earlier implementation did not provide that experience.
   Attempted fix: A native iOS auth module was introduced so Apple and Google could follow the requested native/auth-session flows.
   Status: Resolved in-thread.

4. **The login flow could stall on `Checking your session` and fail when `.env.local` expectations drifted**
   Problem: Users saw a long spinner before Google sign-in and sometimes hit `Try signing in with a different account`, exposing a fragile dependency on runtime env plumbing.
   Attempted fix: The branch was rebased with the mainline auth/env changes and devbox was rerun so the login flow used the newer env handling.
   Status: Resolved in-thread.

5. **Menu background and i18n regressions resurfaced after rebasing the login branch**
   Problem: After merging main and rerunning devbox, the hamburger surface and localized copy still looked unchanged, so the earlier menu/i18n fixes had effectively regressed from the user's perspective.
   Attempted fix: The menu surface, locale resolution, and auth/menu copy were patched again on top of the rebased branch.
   Status: Resolved in-thread.

6. **Visible locale cues disagreed across the same login UI**
   Problem: `Sign in`/`Sign out` stayed English while the language dropdown looked Korean, meaning the auth copy and selector were not reading the same locale state.
   Attempted fix: Locale resolution was unified so both the page UI and the selector derive from the same locale source.
   Status: Resolved in-thread.

7. **Hamburger flattening passes repeatedly regressed border and placement behavior**
   Problem: The menu went through several incorrect intermediate states: leftover borders, panel covering the trigger, and then loss of the container border the user still wanted.
   Attempted fix: The panel was iterated until it sat below the navbar with the requested flat treatment and restored outer border.
   Status: Resolved in-thread after multiple passes.

### `019d0514-065c-7493-9eb9-ce8c137a0a98` | UI/UX issues found

1. **Thread-level UI/UX issue**
   Problem: users did not recognize the top-right language control as a dropdown.
   Attempted fix: add a minimal visual cue.
   Status: likely resolved; this captured session later focused on cleanup.

### `019d09c4-4bbb-7712-bfff-af784ff51f88` | UI/UX issues found

1. **Thread-level UI/UX issue**
   Problem: translation bubble meta rows made bubbles too thick.
   Attempted fix: move flags/time outside the bubble.
   Status: likely resolved earlier; this captured session later focused on cleanup.

### `019d10e1-9693-7a92-bb87-c25a4907c539` | UI/UX issues found

1. **Thread-level UI/UX issue**
   Problem: splash logo yellow did not match the splash background.
   Attempted fix: replace the launch image asset so its background color matches the runtime splash color.
   Status: resolved.

### `019d162b-4b15-7763-88f2-7571532d1ed6` | UI/UX issues found

1. **Thread-level UI/UX issue**
   Problem: animal avatar SVGs had too much whitespace and one asset looked bad.
   Attempted fix: asset-trim/polish request.
   Status: likely resolved on its feature branch; this entry is design-polish rather than a runtime bug.

### `019d18f0-c3d8-71c3-b1cb-f3b6a8c94e21` | UI/UX issues found

1. **Thread-level UI/UX issue**
   Problem: iOS resume showed a brief white flash.
   Attempted fix: investigation only in this thread.
   Status: unresolved in this session.

### `019d18f2-8f47-7c43-b52f-b08ce0ae78b8` | UI/UX issues found

1. **Thread-level UI/UX issue**
   Problem: auto-scroll triggered too often and fought manual scrolling.
   Attempted fix: throttle/recheck bottom-follow logic.
   Status: resolved.

### `019d19a3-df70-7a42-bd7b-ff6ac157d4a3` | UI/UX issues found

1. **Thread-level UI/UX issue**
   Problem: Android background translations did not visibly update until foreground.
   Attempted fix: investigation only.
   Status: unresolved in this session.

### `019d29d5-7bbe-7660-a135-078eb1403e45` | UI/UX issues found

1. **Thread-level UI/UX issue**
   Problem: the onboarding overlay showed a ghost play icon that misled users into tapping the wrong target.
   Attempted fix: remove the misleading icon and rely on copy/arrow guidance.
   Status: resolved.

### `019d2a13-5d6c-7892-9f2b-9143113463b0` | UI/UX issues found

1. **Thread-level UI/UX issue**
   Problem: initial room landing with existing history did not snap to bottom.
   Attempted fix: wait for hydration readiness before the one-time bottom anchor.
   Status: resolved.

### `019d2a3f-2705-7810-a0e0-a2281881a606` | UI/UX issues found

1. **Thread-level UI/UX issue**
   Problem: relaunch auto-scroll happened only once instead of on every fresh open.
   Attempted fix: several approaches explored.
   Status: no clearly landed final fix in this thread.

### `019d2f95-6e34-7013-8961-35857fe8f51d` | UI/UX issues found

1. **Opening the redesigned drawer could shake the main screen underneath**
   Problem: After the drawer redesign work and parent-branch merge, opening the panel caused the main screen to jolt instead of feeling like a stable overlay.
   Attempted fix: Focus transfer and panel transition behavior were adjusted so the drawer slides in without disturbing the underlying screen.
   Status: Resolved in-thread.

2. **The flattening pass briefly put the menu in the wrong place and removed the wrong border**
   Problem: In follow-up adjustments, the dropdown/panel styling regressed into overlapping the navbar or losing the container border the user expected to keep.
   Attempted fix: The panel placement was reset below the navbar and only the intended outer border was restored.
   Status: Resolved in-thread.

3. **The drawer thread mixed a large UX redesign with follow-up visual corrections**
   Problem: What started as a feature thread became a real UI bug-fix thread once the first redesign introduced open-state and chrome regressions.
   Attempted fix: The redesign stayed in place, but the visible regressions were corrected in subsequent passes.
   Status: Resolved in-thread.

### `019d43a0-d5ec-7fd1-94b1-884dcea6de65` | UI/UX issues found

1. **Thread-level UI/UX issue**
   Problem: iOS banner/runtime debugging exposed a wider live-demo hydration mismatch family. Server-rendered markup could disagree with the client once localStorage-backed preferences, native inset query params, and timestamp `Date`/`Intl` formatting were applied on the browser side, which produced hydration warnings and sometimes first-paint UI drift.
   Attempted fix: the thread mainly diagnosed the mismatch class and pointed at client-only initialization paths. Follow-up work later moved storage-backed initialization behind client hydration, stabilized native inset reads, suppressed timestamp hydration drift, and briefly disabled SSR for the live demo during one mitigation pass.
   Status: diagnosed in-thread; follow-up commits later resolved the underlying hydration mismatch paths.

### `019d43a3-c1e7-7600-858d-64964413a683` | UI/UX issues found

1. **Thread-level UI/UX issue**
   Problem: tab/body chrome tuning also exposed My Page scroll-chain bugs and spacing issues.
   Attempted fix: confine scrolling to internal content and contain overscroll.
   Status: resolved.

### `019d43ae-bb58-7202-80ff-dfaa9ef50e68` | UI/UX issues found

1. **Thread-level UI/UX issue**
   Problem: branch-level bottom-tabs work continued banner/layout/ad polish.
   Attempted fix: this session is mostly a meta/summary handoff, not a standalone fix thread.
   Status: no independent verdict beyond the linked implementation threads.

### `019d4caf-4787-77f2-9e97-a7695630b6d2` | UI/UX issues found

1. **Thread-level UI/UX issue**
   Problem: mic-permission denial recovery felt bad and could strand users in a failed state.
   Attempted fix: reset back toward retryable/idle behavior.
   Status: later resolved across follow-up permission-retry threads.

### `019d4d16-3c07-7c91-b787-66f177fbfc1f` | UI/UX issues found

1. **Thread-level UI/UX issue**
   Problem: banner/ad placement and scene transitions broke across room/list/drawer/menu states.
   Attempted fix: explicit banner zones and runtime-param preservation.
   Status: resolved.

### `019d4eba-14af-7523-ad3c-0f5a5b3a810b` | UI/UX issues found

1. **Thread-level UI/UX issue**
   Problem: after a forced WebView reload/flicker, native STT could still be running while the reloaded React state fell back toward idle. In practice that meant the UI could show the orange play/start control instead of the red stop/running control, and related room metadata could look reset or stale even though audio capture was still active.
   Attempted fix: native/WebView state-reconcile work taught the reloaded WebView to restore native STT status and promote the UI back into its ready/running state when native status or transcript activity resumed.
   Status: issue clearly existed in-thread; follow-up reconcile commits later targeted the state-restore path directly.

### `019d4f37-af30-7872-bc3a-4f68be0fabd6` | UI/UX issues found

1. **Thread-level UI/UX issue**
   Problem: Android could show a stopped/orange run button while STT was still actually running.
   Attempted fix: diagnosis of native/WebView state split only.
   Status: unresolved in this thread.

### `019d5714-6710-7343-b2a8-b4faa797c702` | UI/UX issues found

1. **Thread-level UI/UX issue**
   Problem: per-bubble copy buttons made the conversation UI visually noisy.
   Attempted fix: keep only whole-utterance copy and use selection/long-press plus toast for the rest.
   Status: resolved.

### `019d6d6d-cd79-71b0-99e5-c0296b0adeae` | UI/UX issues found

1. **Thread-level UI/UX issue**
   Problem: keyboard-mode composer could grow but not shrink back.
   Attempted fix: immediate remeasurement/shrink synchronization plus tests.
   Status: resolved.

### `019d6d99-14df-7910-827a-26d32cc47d39` | UI/UX issues found

1. **Thread-level UI/UX issue**
   Problem: keyboard mode added too much bottom margin when the banner position was bottom.
   Attempted fix: subtract non-covering clearance and later fix native inset reporting.
   Status: resolved.

### `019d6f86-9cff-73a1-b425-1b407e9f82d5` | UI/UX issues found

1. **Thread-level UI/UX issue**
   Problem: voice-to-keyboard transition stuttered.
   Attempted fix: unify clearance/composer settling so the layout drops in one smooth pass.
   Status: resolved.

### `2026-04-12-android-bottom-banner-safe-area` | UI/UX issues found

1. **Thread-level UI/UX issue**
   Problem: in-room transcript content on Android could still be covered by the bottom native banner even though the same bottom-banner path was correct on iOS and the top-banner path was correct on both platforms.
   Root cause: the banner position itself was acceptable, but Android WebView still reported a smaller bottom inset to the web transcript than the banner effectively covered. RN added Android native bottom safe-area to the physical banner placement, while the web transcript only reserved the banner content height. That mismatch left the transcript under-padded only on Android bottom-banner rooms.
   Attempted fix: keep the native banner placement unchanged, but report `banner height + Android native bottom safe-area` back to web content as the effective bottom inset. iOS continues to report just the banner content height.
   Status: resolved.

## Feature Or Mention-Only Sessions

### `019c52c6-0c6b-7ba0-b8fd-a566d5a6f8b0` | UI/UX feature/polish request only

Focus: initial mingle-app mobile-web shell, four-tab layout, and visual redesign build-out; this was a feature construction thread, not a pre-existing bug thread.

### `019c90fd-30d5-7643-8462-853738eb5975` | UI/UX feature/polish request only

Focus: RN iOS login gate, social sign-in entry screen, hamburger menu, account actions, and locale plumbing. This was a substantial feature build thread, not a pre-existing UI bug thread.

### `019c9f66-dff3-7612-94f5-52ab7df0303c` | UI/UX feature/polish request only

Focus: login-screen redesign planning only. The session was about visual direction and worktree setup, not a pre-existing UI bug fix.

### `019ca44a-10f9-7ba1-a03a-324fec2a8941` | UI/UX feature/polish request only

Focus: add a delete-account confirmation modal with i18n; not a pre-existing UI bug thread.

### `019ca451-b5bf-7101-ac73-32363c8c017c` | UI/UX feature/polish request only

Focus: add a share button to the hamburger menu; not a bug thread.

### `019caad5-6bb0-7d92-bea8-5037f761994d` | UI/UX feature/polish request only

Focus: email-login flow, swipe panels, and bottom-sheet auth UX; not a pre-existing bug thread.

### `019d0a14-c17f-7fd3-af01-e02b23765d6d` | UI/UX feature/polish request only

Focus: add random speaker animal avatars; not a bug thread.

### `019d1faf-7c71-7c53-9025-6f825575d813` | UI/UX feature/polish request only

Focus: revive the hamburger drawer with a right-side full-height panel and swipe/overlay close UX.

### `019d4785-e9ae-7251-901a-522eb61b1b1b` | UI/UX feature/polish request only

Focus: planning how to split the large social-style UIUX branch into a smaller release train.

### `019d482b-5732-7533-b684-9a706ecd36a3` | UI/UX feature/polish request only

Focus: review/planning of the multi-conversation branch structure; no standalone bug fix in this thread.

### `019d56dd-4efc-7131-84f3-fb54707d0fdd` | UI/UX feature/polish request only

Focus: add per-bubble copy buttons and narrower bubbles. This later got reversed by thread 019d5714 because the result felt too noisy.

### `019d6737-7b85-7080-bce8-dccb05377c6e` | UI/UX feature/polish request only

Focus: messenger-style keyboard input bar with animated mode toggle; not a bug thread.

### `019d6d79-cfda-70d2-b96c-19522f7edfbc` | UI/UX feature/polish request only

Focus: translation-model dropdown badges and wider opened menu layout.

### `019d6dc3-9387-7781-af63-4fb1286d9670` | UI/UX feature/polish request only

Focus: add a full-delete action and confirm modal inside the drawer menu.

### `019d7003-dbb6-7801-a8d9-649857671dbc` | UI/UX feature/polish request only

Focus: add a drawer-level full-delete action with confirm modal and localized copy. This was a feature request thread, not a pre-existing UI bug thread.

### `019c7ebf-5768-7991-b324-4587f5a62297` | UI/UX issue mentioned but no standalone fix recorded here

UI/UX issue mentioned, but this thread was planning-only: the existing iOS notch tap-to-top problem was discussed and scoped, with no standalone fix landed here.

### `019d391d-4b31-7ad1-91f2-03a3dcb90001` | UI/UX issue mentioned but no standalone fix recorded here

UI/UX issue mentioned, but this thread is only a shadow summary of another conversation. No standalone fix was performed here.

### `019d3989-cd8b-75d3-b8da-c60918a4ba01` | UI/UX issue mentioned but no standalone fix recorded here

UI/UX issue mentioned, but this thread is only a Telegram summary/handoff. No standalone UI/UX fix was completed in this session.

### `019d4398-a433-7652-a450-2704223b9242` | UI/UX issue mentioned but no standalone fix recorded here

UI/UX issue mentioned only indirectly. The captured action here was mainly auth/config cleanup (disable noisy web Apple OAuth wiring); no standalone UI bug was resolved here.

### `019d6f81-c484-7ca3-8d8e-35eda0d82a5b` | UI/UX issue mentioned but no standalone fix recorded here

UI/UX issue mentioned in the opener, but this captured session ended as worktree cleanup only. No standalone UI/UX fix recorded here.

### `019d6f82-c1a0-7d70-8577-894e00b96f24` | UI/UX issue mentioned but no standalone fix recorded here

UI/UX issue mentioned in the opener, but this captured session ended as worktree cleanup only. No standalone UI/UX fix recorded here.

### `019d6f83-3566-78f1-bfea-c78a915dca28` | UI/UX issue mentioned but no standalone fix recorded here

UI/UX issue mentioned in the opener, but this captured session ended as worktree cleanup only. No standalone UI/UX fix recorded here.

### `019d6f83-810e-7573-ae59-bae9a403a787` | UI/UX issue mentioned but no standalone fix recorded here

UI/UX issue mentioned in planning only: the opener explicitly called out fragmented i18n coverage and missing locales across surfaces, but this captured session stayed at planning/review and did not land a standalone UI/UX fix here.

## Sessions With No UI/UX Issue

- `019c52c6-d0f5-7c20-bf10-60abd034b1ea` | No UI/UX issue found.
- `019c52c7-dd99-7d41-bf04-c337e06f352a` | No UI/UX issue found.
- `019c52cf-6e60-75b1-a47b-521a4b9c6d25` | No UI/UX issue found.
- `019c5302-fb6b-7393-a71c-ded42accc3a6` | No UI/UX issue found.
- `019c55e2-5f5f-7e11-a066-4bfa55f62e03` | No UI/UX issue found.
- `019c55fb-57da-7a92-aec2-2561a237566d` | No UI/UX issue found.
- `019c55fc-6a14-7b42-b8fe-31425ac7f2e1` | No UI/UX issue found.
- `019c5623-e849-7461-ae84-240a7693ea09` | No UI/UX issue found.
- `019c5662-1c56-75f0-b5d9-cfd633fdfe75` | No UI/UX issue found.
- `019c568d-6ebb-7631-90aa-2f179b5e8abe` | No UI/UX issue found.
- `019c568e-11fc-7750-a632-17c29060bd13` | No UI/UX issue found.
- `019c572c-a147-7c21-8b82-fed87a40a573` | No UI/UX issue found.
- `019c5737-cdbe-7ed0-b00c-acf21b014031` | No UI/UX issue found.
- `019c5768-326e-70e2-a693-5042890aeb5e` | No UI/UX issue found.
- `019c5783-e59a-7181-8850-3c73b88095e0` | No UI/UX issue found.
- `019c57d5-8d82-7093-afaf-a5787fd9be32` | No UI/UX issue found.
- `019c5b3d-17d9-7f30-bbc0-8cba3d9f8745` | No UI/UX issue found.
- `019c5b3f-3262-79f1-ad42-a999b8258497` | No UI/UX issue found.
- `019c5c28-0ec3-76e3-9a0a-9d0fc59fff61` | No UI/UX issue found.
- `019c5c86-e70a-7880-bcbc-55dd30263975` | No UI/UX issue found.
- `019c5c98-b2a2-77a1-9c86-b9bf9fcef5b9` | No UI/UX issue found.
- `019c5ca5-5af0-7c61-9cb7-3ecfa9a8978d` | No UI/UX issue found.
- `019c5d09-8297-7fb1-b30e-170157988bfd` | No UI/UX issue found.
- `019c60f9-f131-7d31-bffc-053015acbe53` | No UI/UX issue found.
- `019c6578-d27f-7400-a22e-8c6c977af21a` | No UI/UX issue found.
- `019c657a-263b-7923-ac29-67502733eae2` | No UI/UX issue found.
- `019c657c-1de3-7663-8644-226a7e33a58c` | No UI/UX issue found.
- `019c6a45-f896-7842-8798-3ec3966d7332` | No UI/UX issue found.
- `019c6f34-f356-78c3-b52b-15d11f5e921f` | No UI/UX issue found.
- `019c7529-aa7d-79d1-a945-0f38ddc9fda8` | No UI/UX issue found.
- `019c757a-4441-77e2-ba5e-fb2a9ed67d8e` | No UI/UX issue found.
- `019c757a-6667-7812-a0b9-81d2678aa85b` | No UI/UX issue found.
- `019c7700-1655-7b40-ad13-618b3fcd7bf6` | No UI/UX issue found.
- `019c7919-4a00-7f21-a8f2-e9d4fffcdcbd` | No UI/UX issue found.
- `019c791e-6c04-7a02-bf32-65b4ca811c76` | No UI/UX issue found.
- `019c79a5-a788-7023-a79f-5fe87fbd0468` | No UI/UX issue found.
- `019c79e1-3ee4-7750-9f73-fb18d19c3625` | No UI/UX issue found.
- `019c7a09-8d4d-70d1-8279-e1b130ec66f5` | No UI/UX issue found.
- `019c7a3a-7e26-7161-aad0-9320e5a0b4a6` | No UI/UX issue found.
- `019c7a43-b17d-7642-8db2-2d38feb7842b` | No UI/UX issue found.
- `019c7a44-5bec-7990-9be8-a1f687c91755` | No UI/UX issue found.
- `019c7a96-9a95-7971-9de5-7bcd9367baec` | No UI/UX issue found.
- `019c7c60-3dd9-7802-b521-09dc6423aa5c` | No UI/UX issue found.
- `019c7c6a-7ab2-7fa0-83f6-935d8d9982e5` | No UI/UX issue found.
- `019c7e94-b141-7803-8479-4bd439bf7b03` | No UI/UX issue found.
- `019c7e96-50ab-7a42-b721-4186e5eb3115` | No UI/UX issue found.
- `019c7e98-4b0b-7a41-ad88-e7cdd8ea64fa` | No UI/UX issue found.
- `019c7ea8-bef7-7a22-943a-0025345790a3` | No UI/UX issue found.
- `019c7ec0-5db0-7db0-892e-b5af65bae018` | No UI/UX issue found.
- `019c7ec4-07bf-70c2-be71-202d71a2a4f4` | No UI/UX issue found.
- `019c7ec7-d1a1-7160-800c-5f3e81d58abf` | No UI/UX issue found.
- `019c7ec9-cc3f-7611-937e-d167cc28b851` | No UI/UX issue found.
- `019c7ed8-cd9c-7b81-ba85-7b645e0c912e` | No UI/UX issue found.
- `019c7eeb-c803-7273-9fd2-4b294d2c29d0` | No UI/UX issue found.
- `019c7f18-f467-7ea2-9f1d-89b20476f8bc` | No UI/UX issue found.
- `019c7f7e-870b-7b40-b8ea-87938538ff87` | No UI/UX issue found.
- `019c7f8f-9d77-7e50-b04e-3983402aae10` | No UI/UX issue found.
- `019c7f98-f1a4-7883-b297-fe343fbd7a9d` | No UI/UX issue found.
- `019c7fb2-1d9e-7cd3-94e3-2738f4068d3f` | No UI/UX issue found.
- `019c7fd6-cd81-7533-8ed8-e6e0def4adbb` | No UI/UX issue found.
- `019c7ffc-8270-7001-bc52-ee09c9f66acb` | No UI/UX issue found.
- `019c800b-967c-75d3-b670-ce1204f56173` | No UI/UX issue found.
- `019c8036-6bd5-7ed1-9666-f62db59d2655` | No UI/UX issue found.
- `019c80c7-1c75-7b30-8dbe-bd2cf6fd11a0` | No UI/UX issue found.
- `019c8820-6004-7181-9ba1-daf7239fa2a1` | No UI/UX issue found.
- `019c8826-2159-7ad1-8366-89589b7e10ce` | No UI/UX issue found.
- `019c897a-5cea-7492-9dcc-edfb13ea8e9c` | No UI/UX issue found.
- `019c897d-69f1-7073-b316-b36d9ca56fc0` | No UI/UX issue found.
- `019c89b3-c13b-7633-95ce-513bcd73fb5e` | No UI/UX issue found.
- `019c8fa7-a546-7940-84aa-bf4e60e5b2db` | No UI/UX issue found.
- `019c8fb0-87a8-7ed1-bae5-403b4dda82da` | No UI/UX issue found.
- `019c8fb5-45db-7303-99b8-1b58a547c4e2` | No UI/UX issue found.
- `019c8ffb-0899-74c0-a937-23eecf933693` | No UI/UX issue found.
- `019c9001-1c9e-7f42-a94b-599f2142fbaa` | No UI/UX issue found.
- `019c9034-32ab-7ce0-8627-15ab63d5945d` | No UI/UX issue found.
- `019c908b-c204-7ec2-8a47-a8616135792d` | No UI/UX issue found.
- `019c90e8-f2e3-7e23-8a4c-2b4ab61f0797` | No UI/UX issue found.
- `019c90ee-2b33-7df2-8b7d-79b5dc37a806` | No UI/UX issue found.
- `019c90f0-0940-7180-8bfa-5fd33c4faa0b` | No UI/UX issue found.
- `019c9464-4a46-7ee0-bb8c-717fced42eeb` | No UI/UX issue found.
- `019c94d3-528e-75e1-a95e-f646bb6096f5` | No UI/UX issue found.
- `019c9515-4c61-7310-acfb-23632cb2fc6a` | No UI/UX issue found.
- `019c9528-172a-7513-a92c-f8febcc5a33f` | No UI/UX issue found.
- `019c9596-73a5-7ea0-9591-ea1af260b6a7` | No UI/UX issue found.
- `019c95be-6f61-7a73-9728-c1f017a1e7ca` | No UI/UX issue found.
- `019c981a-90c3-7ea1-852a-d72ba6d40e40` | No UI/UX issue found.
- `019c9828-433f-7792-895f-939387497143` | No UI/UX issue found.
- `019c9911-aa7c-7f43-8108-348dbbda5e17` | No UI/UX issue found.
- `019c9930-1391-7582-9e8a-35fae3ae2bc1` | No UI/UX issue found.
- `019c9932-22f5-7870-9de6-557e8a16593b` | No UI/UX issue found.
- `019c9987-d5df-7772-b6cf-6995e5f201c7` | No UI/UX issue found.
- `019c99d8-4af9-76d3-a343-09a335801a17` | No UI/UX issue found.
- `019c9a3a-9b1b-7f13-aa0e-6abdc5366692` | No UI/UX issue found.
- `019c9a60-fdce-73d3-8dbc-983cf8aeb628` | No UI/UX issue found.
- `019c9ee2-e8f9-7ed3-8603-0dd4f09895af` | No UI/UX issue found.
- `019ca08e-1177-7141-a848-a157a080e450` | No UI/UX issue found.
- `019ca267-86fd-73d3-b635-7608423be358` | No UI/UX issue found.
- `019ca36e-8c7b-7b61-ac9b-d8a424c5a08d` | No UI/UX issue found.
- `019ca7dd-8216-77e1-bbfe-8e8758e651c6` | No UI/UX issue found.
- `019ca7f0-31e2-7833-8e21-dfea8a20e507` | No UI/UX issue found.
- `019ca859-df7f-73e0-b271-0d9081356b91` | No UI/UX issue found.
- `019ca866-7124-7540-9deb-b4dc2b286116` | No UI/UX issue found.
- `019ca870-b2f5-79a3-9cf5-472c02dc61e3` | No UI/UX issue found.
- `019ca893-cee7-7843-beba-f40d6cb5a1af` | No UI/UX issue found.
- `019ca8b3-62f0-7721-a821-bbda4ea044cb` | No UI/UX issue found.
- `019ca8b5-5308-7ba3-80a8-91abbd61a27c` | No UI/UX issue found.
- `019ca8b5-a45e-7481-88ae-1ec55578bb49` | No UI/UX issue found.
- `019ca986-c3dc-77e3-91cf-b1a9bd2fb2ad` | No UI/UX issue found.
- `019ca9f3-8e33-73d0-b68a-358667f16cea` | No UI/UX issue found.
- `019cad53-394c-74d0-9859-9635b48a03fb` | No UI/UX issue found.
- `019cad54-b14d-7e02-81c9-6b22dc6896e9` | No UI/UX issue found.
- `019cad5b-6537-7b92-8579-e9f00a507532` | No UI/UX issue found.
- `019cad74-8e9d-79c3-ac0e-c3cbbd0f9c8b` | No UI/UX issue found.
- `019cc735-c885-7981-83fc-b6da3b1cb7f8` | No UI/UX issue found.
- `019cd18f-a888-7ba3-836a-d080e8a646ce` | No UI/UX issue found.
- `019cd249-3202-7903-9b35-b39f722ae195` | No UI/UX issue found.
- `019cd739-6b32-7403-8871-4587ae75842c` | No UI/UX issue found.
- `019ce117-7975-7c12-a3c1-c8852e9e67dc` | No UI/UX issue found.
- `019ce214-ca01-72b1-9a79-614345ca09e9` | No UI/UX issue found.
- `019ce243-ae7c-7471-8ed6-ccb088b180b4` | No UI/UX issue found.
- `019ce90c-9c4a-7143-96d5-8fa2764d4572` | No UI/UX issue found.
- `019cf5d5-1394-7680-ab90-b3af3530cb22` | No UI/UX issue found.
- `019cf6d2-0b8a-71d3-b50a-72eb9b168f05` | No UI/UX issue found.
- `019d0511-9a81-7cb0-9eee-67761e98cb2d` | No UI/UX issue found.
- `019d0528-958b-7e20-b478-0a507b194f84` | No UI/UX issue found.
- `019d0532-cea8-7930-8b2b-f4a087d98987` | No UI/UX issue found.
- `019d075f-2b45-7f33-8cf3-267e79c6f503` | No UI/UX issue found.
- `019d09ba-95de-7443-a031-9d2516c5425e` | No UI/UX issue found.
- `019d09bb-8a9d-72c3-b709-b80d4cf6b65f` | No UI/UX issue found.
- `019d0a1a-70aa-7231-bb3b-ff84bd64563e` | No UI/UX issue found.
- `019d0ad8-60e5-7600-a9d7-b9e5ca944554` | No UI/UX issue found.
- `019d0b62-238c-77f3-8695-9cd3309958ef` | No UI/UX issue found.
- `019d0b66-694f-7711-88f9-8455fd11d52a` | No UI/UX issue found.
- `019d0bb0-a3bc-75f3-928a-8622fc6f0b26` | No UI/UX issue found.
- `019d0bb7-75eb-7982-8452-1d3200e49826` | No UI/UX issue found.
- `019d0bc2-8898-7ab0-a919-329337c0d625` | No UI/UX issue found.
- `019d0bca-ff49-7a02-bdfc-000135a4dc2a` | No UI/UX issue found.
- `019d0c72-41cf-7403-9d1e-d8f1fc16d91d` | No UI/UX issue found.
- `019d0c72-803e-7121-883d-94b1bb30d995` | No UI/UX issue found.
- `019d0ef1-ec3b-7d90-98e0-68cee77dfbb3` | No UI/UX issue found.
- `019d0ef3-db87-7240-8167-b281b6e3e60b` | No UI/UX issue found.
- `019d0f14-ee9d-7ba2-a04e-461e6809ebc5` | No UI/UX issue found.
- `019d0f6b-c968-7153-bbac-6a744cf5f962` | No UI/UX issue found.
- `019d0fa6-5807-7530-8a07-bcfbc74882c3` | No UI/UX issue found.
- `019d0fbd-04ca-77d3-b18b-a92be64ccbf9` | No UI/UX issue found.
- `019d100e-3ed5-7852-84e9-40f0556d704d` | No UI/UX issue found.
- `019d100e-aed0-71b1-8cd7-337013892e31` | No UI/UX issue found.
- `019d104f-7e0c-7451-ab81-271aec412518` | No UI/UX issue found.
- `019d1074-7a81-7a13-9d34-ce399753c359` | No UI/UX issue found.
- `019d117a-0b87-7552-b5bb-1277eb9d2fc8` | No UI/UX issue found.
- `019d1447-5bd5-7d43-84cf-ec956c87cb15` | No UI/UX issue found.
- `019d144c-f526-7380-991d-988ef57ed3c6` | No UI/UX issue found.
- `019d1503-a483-73b3-8d98-133e7ed456c8` | No UI/UX issue found.
- `019d16e6-cba0-7db2-8227-56ec4b9b464d` | No UI/UX issue found.
- `019d16e8-8c5b-73f3-8660-e4f72666236b` | No UI/UX issue found.
- `019d18f1-d54f-75f2-b893-1ffb6ef5ccf0` | No UI/UX issue found.
- `019d191f-7488-73d1-a772-f694c9faa9d5` | No UI/UX issue found.
- `019d1998-e85c-75f3-ad64-e67eadf8d75f` | No UI/UX issue found.
- `019d199b-d514-7891-99d1-f261a7feb213` | No UI/UX issue found.
- `019d1a31-81a9-7233-86c4-c0d89045632b` | No UI/UX issue found.
- `019d1a3a-5621-7443-bc5d-5b9da3eaa864` | No UI/UX issue found.
- `019d1a4e-f254-7c42-a901-58d2d8ac9f10` | No UI/UX issue found.
- `019d1ac6-5b92-74d2-9519-53b8df36731d` | No UI/UX issue found.
- `019d1acc-de1c-78d3-bfdc-6682552af25b` | No UI/UX issue found.
- `019d1f5b-6d3c-7393-aecf-fc0fcd3e7951` | No UI/UX issue found.
- `019d1f82-8255-7c20-a4c5-0203ec657330` | No UI/UX issue found.
- `019d1fb4-12fb-7443-ba29-2a156d635e93` | No UI/UX issue found.
- `019d1ff5-41d8-7801-83ec-6f0984eabb56` | No UI/UX issue found.
- `019d2488-db3d-7820-951d-ae9c7bb2676c` | No UI/UX issue found.
- `019d2653-9139-7143-96cf-90dc54e2a88d` | No UI/UX issue found.
- `019d29c8-ffd0-7c40-9200-d7d7501f835c` | No UI/UX issue found.
- `019d29d6-477e-74c1-aa18-d07e4823e3ec` | No UI/UX issue found.
- `019d29e2-1298-7300-8b06-4a5abb0e978d` | No UI/UX issue found.
- `019d29f1-a463-7c70-a3ad-626b04046182` | No UI/UX issue found.
- `019d29fb-3dda-7680-a598-4cfac587cd4c` | No UI/UX issue found.
- `019d2a18-e89c-7402-a092-ea24306a0b30` | No UI/UX issue found.
- `019d2a5e-1106-7c10-8ed8-d24fecd9c0e2` | No UI/UX issue found.
- `019d2a6b-4331-7e60-8d5e-6eb8313f2035` | No UI/UX issue found.
- `019d2a76-7c01-75e2-9512-1c6b1a8481a8` | No UI/UX issue found.
- `019d2a78-0c79-7d23-a260-1d2d2b4d0f7c` | No UI/UX issue found.
- `019d2aa5-4b64-7890-a99a-b7a0e02c4849` | No UI/UX issue found.
- `019d2aa8-b553-75d1-8de2-7272a0eaaea5` | No UI/UX issue found.
- `019d2ab1-9dd3-70a2-8874-9ad4df97e088` | No UI/UX issue found.
- `019d2b2e-91d2-7c70-90b5-09043b6c4ff2` | No UI/UX issue found.
- `019d2ec9-a8b1-7cd3-bb6e-b3fff0775f0b` | No UI/UX issue found.
- `019d2f8d-a163-7082-93a1-fcf44ead13fd` | No UI/UX issue found.
- `019d2ff6-1b7a-7441-9d56-992703b1d40f` | No UI/UX issue found.
- `019d303e-8684-7980-9772-221f9bb459c8` | No UI/UX issue found.
- `019d306f-3d86-7671-90c4-a569ee988857` | No UI/UX issue found.
- `019d3706-7b91-7241-9c9f-bbb6a1fa5b1c` | No UI/UX issue found.
- `019d3709-051d-7301-b2a0-02c38a0e0985` | No UI/UX issue found.
- `019d3726-7648-7163-9172-856e52a90fae` | No UI/UX issue found.
- `019d389c-fdd9-7361-be90-b54449317e69` | No UI/UX issue found.
- `019d3d5d-7670-79a3-98fb-4aa6c0e1367b` | No UI/UX issue found.
- `019d3d66-33ad-7563-b95c-43a4cebb7018` | No UI/UX issue found.
- `019d3d66-a204-7531-8218-7d9f34ba5e6b` | No UI/UX issue found.
- `019d3d67-0539-73d2-8ccc-2830c27de92b` | No UI/UX issue found.
- `019d3e77-4298-7e60-b031-2cb46546bafd` | No UI/UX issue found.
- `019d4364-53e0-7df3-8573-c108b28db591` | No UI/UX issue found.
- `019d4369-1572-77f2-ab69-44b4a7348af1` | No UI/UX issue found.
- `019d4388-488a-78d3-9cc3-046fa784890c` | No UI/UX issue found.
- `019d43a0-9cba-7df0-afc4-91103077efe8` | No UI/UX issue found.
- `019d4868-b7ff-7743-8246-76ea234a0773` | No UI/UX issue found.
- `019d4d1e-bf31-7550-8116-f2654014ec7c` | No UI/UX issue found.
- `019d4dc4-914e-7912-aae5-b8021b4973cf` | No UI/UX issue found.
- `019d4e35-c559-7232-ae76-6b5ab334f0b8` | No UI/UX issue found.
- `019d4eb1-8d6b-7192-8ffb-22deeead662c` | No UI/UX issue found.
- `019d4f51-c903-7e73-a4f0-f1d1d42bcbba` | No UI/UX issue found.
- `019d5430-7b59-78a2-8ced-f6488ba97e7e` | No UI/UX issue found.
- `019d5706-019e-7aa2-af37-3a7c53eb31b1` | No UI/UX issue found.
- `019d636a-628d-7f60-8936-e9e2637a026c` | No UI/UX issue found.
- `019d6713-37ce-7720-9faa-73c92e919e97` | No UI/UX issue found.
- `019d6724-7531-79e1-8f01-d5009d91318f` | No UI/UX issue found.
- `019d6c60-8f36-74e0-9be6-c4af43d77204` | No UI/UX issue found.
- `019d6c8e-0f4b-7742-a086-9fdb21cc62d7` | No UI/UX issue found.
- `019d6d01-77d8-7ed1-b8d3-b512139ecd15` | No UI/UX issue found.
- `019d6d47-cbeb-7a01-9349-8ad7b520919b` | No UI/UX issue found.
- `019d6d6f-b9c2-7343-b4f8-aeaa753c3f1c` | No UI/UX issue found.
- `019d6d85-612d-7622-909b-b22f7a04681b` | No UI/UX issue found.
- `019d6da8-8dde-7f32-be86-7f473baf85ba` | No UI/UX issue found.
- `019d6db1-d0e3-7722-bd33-27c2ec279816` | No UI/UX issue found.
- `019d6dbd-f288-74e1-9afa-f98dbd8c74fa` | No UI/UX issue found.
- `019d6f80-a10d-7b10-ac88-4dd9ad89e780` | No UI/UX issue found.
- `019d7151-fed2-75a1-8efe-69fc947979f4` | No UI/UX issue found.
- `2026-04-15-zh-cn-zh-tw-selector-split` | Language selector now presents `zh-CN` and `zh-TW` as separate user-facing targets with distinct flags (`🇨🇳` Simplified, `🇹🇼` Traditional) while preserving Soniox STT hints as generic `zh`. This avoids misleading the user into thinking the translation target is a single generic Chinese option and keeps script-variant intent intact through translation, chip history, and bubble rendering.
- `2026-04-15-soniox-zh-source-normalization` | Incoming generic Soniox `zh` source-language tags are normalized to `zh-CN` at the client STT boundary unless the transcript text clearly contains traditional-only Han characters. This prevents `zh-CN` from remaining in the target list for the same utterance, which previously made a single Chinese utterance render an unnecessary extra translation bubble and visually thicken the chat row.
- `2026-04-15-soniox-zh-cn-default-source` | Chinese source-language normalization was simplified so every generic Soniox `zh` transcript is rendered as `zh-CN` without script heuristics, while explicit `zh-TW` inputs remain `zh-TW`. Matching and manual-input paths were aligned to the same rule so a Chinese utterance never grows an extra same-language `zh-CN` bubble just because some code paths kept generic `zh` and others promoted it differently.
- `2026-04-16-language-selector-speech-translation-tabs` | The language selector now separates speech-recognition hint languages from translation target languages with two segmented tabs placed between the selected/recent flag strip and the search/sort controls. The previous single selector made a hidden Soniox hint setting look identical to the visible translation output setting, so users could not intentionally tune recognition hints without also changing translated bubble targets. Each tab keeps its own selected state and recent deselection history while the header button continues to foreground translation targets, preserving the existing user-facing meaning of the compact flag control.
- `2026-04-16-linked-translation-language-default` | The translation tab now starts with `Use the same language list for translation` checked, so the visible translation targets follow the speech-recognition language list by default. Without this linkage, splitting the tabs made the first-run state feel like two independent decisions even though the product default should keep speech hints and translation targets aligned. Users can uncheck the box inside the translation tab to unlock separate translation-language selection for that conversation.
- `2026-04-16-speech-language-stt-restart-control` | The speech-recognition language tab now explains that speech-language changes require an STT restart before Soniox hints are reflected, and it exposes the same compact start/stop control used in text-composer mode. The split selector previously let users change speech hint languages while the active WebSocket session was still visually controlled only from the bottom bar, which made the restart requirement easy to miss when the selector covered the conversation. Reusing the same button state, colors, loading spinner, and click handlers keeps the selector control synchronized with the underlying STT session rather than creating a second independent toggle.
- `2026-04-16-language-button-speech-translation-union` | The conversation header language button now displays the union of speech-recognition and translation languages, ordered by speech languages first and capped at five flags. After splitting the selector into two tabs, the header still reflected only translation targets, so a user could add a speech hint language and see no header feedback unless translation was linked. Showing the speech-first union keeps the compact header summary aligned with both configuration surfaces without overcrowding the header.
- `2026-04-16-manual-speech-language-restart` | Speech-recognition language changes no longer auto-restart the active STT session. The prior automatic restart made the new restart hint and compact start/stop button misleading because the WebSocket could reconnect while the user was still editing languages. Leaving the current STT session running with its existing Soniox hints until the user explicitly stops and starts recording makes the visible control the single source of truth for when speech-language changes take effect.
- `2026-04-16-language-setting-response-order` | Speech-language, translation-language, and linked-language updates now share one optimistic sync sequence in the conversation list. With independent response guards, a slower checkbox response could overwrite a newer translation selection after the user quickly unlocked and edited the translation tab. Treating the three controls as one language settings surface keeps the visible selector state stable even when PATCH responses resolve out of order.
- `2026-04-16-android-empty-banner-hitbox` | Android native AdMob banners could remain visually blank while the native banner slot still sat above the WebView and intercepted that screen area. Because the slot looked transparent instead of reserved, users could interpret the dead area as a touch regression. The RN banner now renders a shared visible fallback surface with an `AD` badge whenever the creative has not finished loading and remounts the banner after foreground resumes, so the reserved banner space remains legible even if AdMob fails or stalls.
- `2026-04-17-language-selector-diacritics` | New language selector copy for extended Latin locales now keeps native diacritics in French, German, Spanish, Portuguese, and Vietnamese. The review called out that the new speech/translation tab labels and restart/link messages looked lower quality than existing localized strings when they were ASCII-only. Aligning the new copy with the existing localized style avoids making the selector tabs feel like fallback text.
- `2026-04-17-versioned-stt-restart-coverage` | The manual speech-language restart behavior now covers both the current `1.1.0` conversation runtime and the legacy `1.0.11` translator runtime path. The versioned web/STT split means a fix can look correct in the latest shared component while an older release line still carries automatic Soniox hint restarts. Keeping the legacy hook free of language-change auto-restart and adding explicit `1.1.1+` routing coverage prevents users on older or future client namespaces from seeing a different restart UX.
- `2026-04-18-xr-mingle-solution-layout-class` | The XR deck's "Mingle" solution slide now has a dedicated layout hook for the four-card feature list (`slide-side-media--mingle-solution-proof` and `slide-tool-items--mingle-solution-proof`). The nearby AI feasibility slide uses the same generic `slide-side-media--ai-solution-proof` pattern, so sharing only the generic class made it too easy to adjust the wrong block when tuning position and width. Keeping the Mingle solution card stack on a dedicated class lets the deck adjust that slide independently while preserving the existing AI feasibility slide layout.
- `2026-04-18-xr-page-11-short-video` | The XR deck now inserts a video-only slide at page 11, centered with no visible supporting copy, using the YouTube Shorts embed for `GCg3FG4PdaA`. Adding this slide before the customer section shifts all later section anchors, so the deck table of contents was updated to point to the new customer, strategy, vision, team, and appendix page numbers. The video uses a 9:16 centered iframe sizing rule so the short reads as the primary content instead of being framed as a side-media element.
- `2026-04-18-xr-youtube-embed-referrer` | The page 11 YouTube embed showed Error 153 when YouTube could not identify the embedding page through referrer/origin metadata. The XR deck now declares `strict-origin-when-cross-origin` at the document level, passes the production origin into the YouTube embed URL, and the legal Vercel deployment sends the same `Referrer-Policy` header. This keeps the centered video slide usable in production instead of rendering a large gray player error state.
- `2026-04-18-xr-page-10-side-video` | The standalone page 11 video slide was removed and the same YouTube embed was moved into the right-side media slot of page 10, replacing the four feature cards. This keeps the "Mingle" solution message and the supporting video on one slide, while restoring the customer section to page 11 and the rest of the table-of-contents anchors to their pre-video positions. The referrer/origin metadata remains in place so the embedded video can still identify the production page to YouTube.
- `2026-04-18-xr-hellotalk-customer-slide-anchor-update` | A new HelloTalk customer context slide was added after the customer section opener, using `hellotalk-voiceroom-list.png` as the foreground phone screenshot. This pushes the later strategy, vision, team, and appendix section starts by one slide, so the table-of-contents anchors and page counter were updated to match the actual 61-slide deck. Without this anchor update, clicking the table of contents would land one page early for all sections after customer.
- `2026-04-18-xr-network-effect-cloud` | The XR deck's page 36 differentiation slide now shows the same messenger and social service logos used later in the deck, but arranged as a separate network-effect composition instead of a random competitor cloud. Five logos sit in a loose upper band and four in a loose lower band, leaving a deliberate central gap for the `네트워크 효과` label. This makes the slide communicate messenger network effects directly while avoiding a duplicated look from the later randomly scattered competitor slide.
- `2026-04-18-xr-network-effect-cloud-tighten` | The page 36 network-effect logo cloud was tightened after visual review because the first version spread the service logos too far apart. The logo coordinates now keep the upper and lower groups closer to the center while preserving the two-band scatter pattern, and the whole media cluster is shifted further right to better balance the slide copy.
- `2026-04-18-xr-user-reaction-card-height` | The XR deck's page 15 and page 16 user reaction cards were restored to a consistent two-line baseline height after the one-line quotes became visually shorter than the two-line quotes. The user-reaction card grid now uses a larger minimum row height, increasing the card height by roughly 20% so each message has more internal breathing room while preserving the existing layout and typography.
- `2026-04-18-xr-network-effect-title` | The XR deck's page 36 title was updated from a narrower UX-focused statement to `반면, 저희는 소셜 네트워크 경험까지 직접 만듭니다`. This aligns the title with the network-effect logo cloud on the same slide and makes the slide's message explicitly about owning the broader social network experience.
- `2026-04-18-xr-strategy-step-title-scale` | The strategy chapter's three-stage cards now use the same title scale as the customer hurdle cards, matching the `첫째, 의사소통이 어렵다` visual weight. The second-stage label was also updated from `실시간 통번역 + 보이스 챗` to `실시간 통번역 + 음성 메신저` so the strategy language matches the deck's broader messenger positioning.
- `2026-04-18-xr-strategy-step-title-nowrap` | The enlarged strategy step titles were wrapping after the title scale change because the separate step-number badge consumed too much horizontal space. The strategy cards now fold the step label into the title text, such as `1단계 - 혼자 쓰는 실시간 번역기`, remove the badge column for those slides only, widen the card group modestly, and keep the titles on one line.
- `2026-04-18-xr-strategy-step-width-retune` | The strategy step cards were retuned after the widened version visually invaded the left slide copy area. The strategy step container width is now reduced to `clamp(410px, 27vw, 420px)`, and the inline step labels use a colon format such as `1단계: 혼자 쓰는 실시간 번역기` to keep the label compact while preserving the larger title scale.
- `2026-04-18-xr-network-effect-title-refine` | The XR deck's page 36 differentiation title was refined to `반면, 저희는 소셜링에 집중해 메신저 경험까지 제공합니다`. The updated wording narrows the claim from building the broader social network experience to focusing on socializing and delivering the messenger experience, matching the current slide positioning more closely.
- `2026-04-18-mingle-1-1-1-conversation-list-bottom-cta-inset` | The `1.1.1` native app started sending a generic `nativeBannerPosition=bottom` and `nativeBottomInsetPx` fallback in the initial WebView URL. The conversation list interpreted that room-only bottom banner fallback as list footer clearance, making the new-conversation CTA much taller than the `1.1.0` layout while conversation rooms still looked correct. The native/web banner contract is now split by zone: list screens receive only `nativeListTopInsetPx`, conversation rooms receive `nativeConversationBannerPosition` plus conversation-specific top/bottom inset fallbacks, and the list CTA keeps a fixed safe-area bottom padding so room banner clearance cannot leak into the list view.
- `2026-04-26-conversation-room-hydration-latency` | Entering a conversation room could feel blank for too long once a room accumulated history because the client read namespaced room history from localStorage but persisted subsequent room snapshots to the legacy unscoped key. That cache miss forced every room open to wait for server hydration, and the server hydration endpoint returned the full message history for the session. The fix scopes persisted room snapshots to the conversation namespace, keeps room localStorage as a latest-100-message warm cache, preserves already rendered/paged utterances in React state, limits initial server hydration to the latest 100 visible messages, adds cursor-based server pagination for older room history, and adds database indexes for latest-message and latest-usage lookups.
- `2026-04-27-conversation-local-stats-density` | Conversation rooms now show the locally stored message count directly under the existing STT usage duration in the bottom voice bar. Conversation list rows also show compact local duration plus saved message count under the existing timestamp, preserving the title, language flags, timestamp, preview, and active status chip without increasing row height. The list label intentionally omits a redundant `STT` prefix so values such as `1m 2s · 3 msgs` stay short enough for the fixed-height row. The stats use the same localStorage-backed, per-conversation namespace as STT usage rather than introducing a stricter server count, so the UI stays lightweight and tolerant of offline or delayed server hydration.
- `2026-04-27-conversation-bottom-stat-type-size` | The conversation-room bottom voice bar now renders the saved message count at the same text size as the STT usage duration. To avoid moving the mic, keyboard, or surrounding bottom-bar controls, the stats stack keeps the same fixed 33px footprint as the prior smaller-label layout and removes the inter-line gap by tightening line-height instead of changing the bottom-bar container.
- `2026-04-27-conversation-message-count-stat-cache-split` | The conversation-room message count stat briefly showed the latest localStorage cache length after room history persistence was reduced to a latest-100 warm cache. That made high-history rooms display `100 msgs` even when their total message history was larger, unlike STT usage which was already stored as an independent cumulative scalar. Message count is now persisted under its own per-conversation localStorage key, hydrated from the server's total visible message count, and only falls back to counting the utterance snapshot for legacy rooms without the new scalar.
- `2026-04-27-native-stt-background-resume-room-loss` | Native STT sessions could return from background or a WebView remount through the conversation list before reopening the active room because the RN shell always seeded WebView from the locale home URL and relied on client effects to restore the room later. The native shell now persists the last conversation URL in platform storage, rebuilds the initial WebView source from the current runtime URL plus that `conversation` id, clears the restore hint when the user reaches the list, and removes stale room query hints when the conversation no longer exists. Conversation history hydration also renders the recent local batch first and defers full localStorage normalization so long rooms do not show an empty room while older history is parsed.
- `2026-04-30-conversation-create-double-tap` | First-run users could double-tap the conversation start button before React rendered the disabled/loading state, creating two rooms and two conversation history entries. On iOS this could leave the first room behind the second one, then back navigation reopened the earlier room and surfaced a start failure alert instead of returning cleanly to the list. The create path now uses a synchronous ref lock shared by the visible button and QA room creation helper, so the second tap is ignored before any second POST or overlay history push can start.
- `2026-08-07-ios-conversation-forward-gesture-diagnostics` | Repeated iOS back/forward edge swipes can return to the conversation-list shell after a conversation is expected to be restored, leaving the browser history position and the rendered overlay out of sync. A physical-device trace confirmed the sequence: the forward `popstate` moves to the room entry, but the route-sync subscriber runs before the popstate open handler has recorded its explicit target; because the close guard still contains that room id, the route-sync suppression branch calls `replaceState` with a list URL. The room history entry is therefore mutated into a second list entry, and the later open handler resolves no room from the now-overwritten current state. The fix now captures the history destination in the capture phase, lets route-sync own an explicit forward restore before applying native-STT suppression, and removes the fallback that could replace a room entry with a list URL. Physical-device verification is pending after the clean reinstall; the QA-only diagnostics remain in place and record WebView `pushState`, `replaceState`, `popstate`, route-resolution, suppression-guard, and overlay open/close events with URL, history length, native navigation index, route marker, and conversation id.
- `2026-08-13-railway-native-tab-transition-latency` | On the Railway 2.0.0 runtime, switching from My Page to the conversations tab could appear slow or remain on the previous screen because the native tab route was waiting for the server-rendered conversation list. That render performed session lookup, identity lookup, conversation-channel lookup, latest-message summaries, and message counts, after which the client performed another identity-aware list refresh on native mount. The fix treats an explicit `nativeUi=1&nativeTabRoot=1` conversations route as a lightweight tab shell: it skips the blocking server-side conversation query, displays a recent per-identity `sessionStorage` list cache immediately when available, and performs one background refresh through `view=native-list`. The native API path reads channels directly by the authenticated session id or stable external tracking id, avoiding the extra resolve/create-user database round trip while keeping the existing fallback path for requests without a known identity. Initial conversation-room and history-forward routes retain server hydration and are not treated as tab-root navigations, so room restoration and back/forward behavior remain separate from the tab performance optimization.
- `2026-08-13-profile-edit-panel` | The My Page `프로필 변경` control was only a visual placeholder after the messenger-tab draft was restored, so users could not change the name, introduction, or nationality shown on their profile. The control now opens the same right-to-left sliding surface used by the other in-app screens, supports a right-edge swipe to close, and saves the three editable fields through the authenticated `/api/profile` endpoint. Profile values are stored on `app_users`, loaded when My Page opens, and reused by the profile-share screen for the shared display name. Photo upload remains intentionally excluded because it was removed from the earlier PR#92 implementation and is not part of this feature scope.
- `2026-08-13-mypage-profile-actions-inline` | The My Page `프로필 변경` and `프로필 공유` actions were stacked as two full-width rows, making the profile header unnecessarily tall for two short actions. They now sit side by side in equal-width, equal-height buttons with a compact gap, preserving the existing actions while keeping the profile controls visually grouped and easier to scan.
- `2026-08-13-social-login-reactivation` | The 2.0.0 conversation list retained guest access, but its room authentication gate had been disabled and the Apple OAuth provider/button had been intentionally commented out, so the existing Apple/Google login surface could not be reached. The room authentication gate is restored, Apple OAuth credentials are resolved from the existing Vault-backed configuration, and the shared conversation entry now passes live Apple and Google configuration flags to the existing login surface. The list remains accessible before authentication; entering a conversation presents the established sign-in UI.
- `2026-08-13-discover-tab-user-search` | The two-tab messenger shell had no dedicated place to find people before following them, so users had to rely on an unspecified future entry point. A centered Explore tab now opens a deliberately empty surface with the ID/name search field focused at the top. Search results are fetched only after the user types, show the matched display name and user ID, and leave follow actions out of this iteration. The tab is a replace-based native tab root and preserves the existing STT continuity rule when users return to the conversation list.
- `2026-08-13-discover-user-follow` | Search results were visible but could not be acted on, so finding a friend did not lead to a relationship action. Each result now has a Follow/Following toggle backed by a unique user-to-user relation, with optimistic UI, rollback on failure, self-follow protection, and live follower/following counts on My Page. The follow action is deliberately limited to one-way following; mutual chat permissions and unfollow confirmation remain outside this iteration.
- `2026-08-13-user-safety-controls` | Search results now open a right-to-left sliding public profile surface, where a user can follow, block, or report another account. Blocking immediately removes both follow directions and hides the blocked relationship from future search results; the block can be reversed from My Page > Menu and settings. Reports are stored independently from feedback as user-report threads with a reason, optional details, status, and team replies. My Page exposes the reporter's own report history and replies, while the admin report inbox supports filtering, replying, and status changes. The interaction keeps the existing app pattern: a left back arrow, horizontal swipe-to-dismiss, explicit confirmation for block/unblock, and a bottom-sheet form for report submission.
- `2026-08-13-mypage-profile-edit-button-surface` | The inline `프로필 변경` action used a gray fill while the adjacent `프로필 공유` action used a white fill, making the two same-priority profile actions look visually inconsistent. The profile-edit action now uses the same white surface, border, size, and active-state treatment as profile sharing.
- `2026-08-15-follow-notification-panel` | The first conversation tab had no lightweight way to notice new followers, and moving the conversation-search affordance toward the right edge left no room for a social notification entry point. The header now keeps search on the left and adds a bell button on the right with an unread-count badge. Tapping it opens a right-to-left panel above the tab content, so the notification surface does not become a new bottom tab or disrupt the conversation list. Follow notifications are grouped into unread and read sections; each horizontal row opens the actor's public profile when tapped, while a separate row action follows the actor directly without leaving the panel. The action stays disabled and reads `Following` once the relationship already exists. Notifications are persisted per user, individual rows are marked read when opened or followed, and the overlay supports the existing safe-area, Escape, native-back, and backdrop-dismiss patterns.
- `2026-08-16-notification-banner-inset-and-auto-read` | The notification drawer could place its first rows underneath the native AdMob banner area, and users had to tap each notification before the unread badge cleared. The drawer now reuses the conversation list's measured native top-banner inset as scroll-content padding, and opening the drawer marks all of the viewer's unread follow notifications as read in one authenticated request while updating the visible rows and badge optimistically.
- `2026-08-16-profile-image-and-language-preview` | Profile photos and the small nationality flag did not provide a clear way to inspect the full image, and the language identity was not consistently visible on the public profile. Both My Page and public profiles now make the avatar/flag and the language row tappable, open a shared full-screen image preview with the saved crop state, and show the flag plus canonical language code beneath the profile photo.
- `2026-08-16-notification-profile-stack` | Tapping a follow notification closed the notification drawer before opening the actor's profile, so returning from the profile lost the notification context. The public profile now stacks above the still-open notification drawer when launched from a notification, and its header back action, edge swipe, and native back action remove only the profile layer so the notification list is immediately visible again.
- `2026-08-16-profile-language-preview-label` | The profile surface showed a persistent flag-and-language-code row below the avatar, which added visual noise before the user opened the image preview, and the preview repeated a technical code such as `ko`. The persistent row is now removed while the avatar's flag affordance remains available, and the enlarged preview shows the flag with the localized full language name instead.
- `2026-08-16-notification-profile-history-stack` | The notification profile overlay could preserve the drawer in React state but did not add its own browser/WebView history entry, allowing an iOS edge-back gesture to target an older screen instead of only dismissing the profile. Notification profile entry now pushes a dedicated same-URL history state while explicitly keeping the drawer open; header back, profile edge swipe, native back, and WebView popstate consume that profile layer and reveal the unchanged notification drawer underneath.
- `2026-08-15-discover-search-tab-cache` | Explore search state was kept in the current browser history entry, which preserved the query when opening a result profile and returning but lost it when a bottom-tab route replacement remounted the Explore screen. The search query and resolved result rows now use a short-lived `sessionStorage` snapshot keyed by authenticated user and API namespace, with an in-memory fallback for restricted storage. Returning to Explore restores the cached rows immediately and still refreshes the matching query in the background; entering a new query records a pending snapshot, and clearing the field removes it. This keeps account-specific follow state isolated while preserving the existing profile-return history behavior.
- `2026-08-17-profile-and-default-language-order` | Conversation language buttons could start with English even when the user's profile language was Japanese or Korean, and profile language selection supported only one language. New conversations now preserve the user's saved default-language order, with the profile's first primary language leading the initial three-language fallback. My Page separates profile primary languages from app UI language, allows one to five primary languages in selection order, and adds a dedicated default conversation-language settings surface. Both surfaces show selected flags above search, keep selection order stable, and persist their independent settings on the user profile.
- `2026-08-20-first-install-discovery-source-onboarding` | The first-install onboarding collected the app language and private birth date, then immediately opened the authentication screen, leaving no way to understand how a new user found Mingle. The flow now adds a localized discovery-source step after the age check and before authentication, using compact selectable cards for friend/family referral, social media or online advertising, search, the App Store or Google Play, online community/school/workplace, and other. The selected value is kept in a dedicated localStorage pending key while the user is unauthenticated, survives the login transition, and is patched to the authenticated profile together with the existing pending language and birth-date values. The server validates a fixed source code list and stores it in the private `discovery_source` field without adding it to public profile responses. The existing first-install confirmation marker remains unchanged, so returning users are not unexpectedly shown a new survey.
- `2026-08-20-discovery-source-order-and-categories` | The discovery survey originally grouped several acquisition channels together, which made the first option overly likely to be selected and left analytics too coarse. The visible choices are now split into ten concrete options: friend/family referral, HelloTalk, Threads, Instagram/TikTok/YouTube/X, online advertising, Google Search, ChatGPT or another AI, App Store/Google Play search, online community/school/workplace, and other. The first nine choices are shuffled each time the survey opens while `Other` stays last, reducing first-option bias without making the fallback choice harder to find. Legacy stored source codes remain accepted by the API for previously completed surveys.
- `2026-08-20-discovery-source-random-order-label` | Because discovery choices are shuffled, a relative label such as `Other social media` could appear before HelloTalk or Threads and read as if it depended on the order below it. The grouped social-media choice now uses an order-independent label, `Instagram·TikTok·YouTube·X 등`, while keeping the same ten-choice count and randomized ordering.
- `2026-08-20-private-birth-date-profile-edit` | Birth date was collected during onboarding and stored privately, but the profile edit surface did not let a user correct it later. Profile editing now includes the existing modern birth-date picker, displays the privacy explanation, and keeps Save disabled for an under-12 date. The authenticated profile endpoint returns the birth date only through the private `/profile` response, while public profile serialization remains unchanged. Discovery source remains absent from the edit draft and cannot be changed from the UI.
- `2026-08-20-email-auth-keyboard-scroll` | The email login and signup sheets allowed the password keyboard to cover the submit button, while the login and password-confirmation panels had no independent scroll container. Each email-auth panel now scrolls within the sheet with safe-area padding and overscroll containment, so focusing a password field no longer requires dismissing the keyboard before the action button can be reached. The legacy auth surface receives the same behavior for parity.
- `2026-08-20-profile-edit-primary-language-description` | The profile edit surface showed the primary-language picker without explaining that the selected order is also the order shown on the profile. It now reuses the same localized description as the hamburger-menu language settings surface directly under the picker legend, keeping both editing paths consistent.
