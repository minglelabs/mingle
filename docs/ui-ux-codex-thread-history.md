# Mingle UI/UX Bug History from Codex Threads

## Scope

- This document was built by exhaustively rescanning 277 unique Codex sessions whose `cwd` matched `mingle`.
- Coverage explicitly includes both `~/.codex/sessions` and `~/.codex/archived_sessions`.
- First-seen breakdown in the rescan: 29 live sessions, 248 archived sessions.
- From that full set, 33 sessions were treated as UI/UX candidates and then reduced into the landed-fix and investigation entries below.
- It includes explicit user-facing UI/UX bugs, regressions, and UX cleanup threads.
- It excludes pure backend-only bugs, release/build-only work, and planning-only threads with no concrete UI issue.
- Thread IDs below are local Codex session IDs from `~/.codex/sessions` / `~/.codex/archived_sessions`.
- Some long-running threads later turned into merge or cleanup work. In those cases, the fix summary below is based on the intermediate assistant message where the actual fix was described.
- One long-running session can contribute many separate entries. Thread `019d4cae-5142-7be2-9c74-30f95bfb5787` is one such case and is now broken out below instead of being collapsed into a single Phase 1 summary.

## Confirmed Landed Fixes

### 2026-02-14 | Intermittent favicon crash in `mingle-landing`

- Symptom: `GET /favicon.ico` intermittently failed with `MODULE_NOT_FOUND` on first load, refresh, or tab re-activation.
- Root cause: favicon was being served through the Next metadata route under `app/favicon.ico`, and dev recompiles/cache churn could leave the compiled route in a bad state.
- Fix: moved favicon handling to `mingle-landing/public/favicon.ico` so it is served as a static asset instead of a generated app route.
- Evidence: thread `019c5c43`; commit `8723c41`.

### 2026-03-21 | Splash screen color mismatch

- Symptom: the center launch graphic looked like a different yellow than the surrounding splash background.
- Root cause: the runtime launch/background color was already `#F3C35A`, but the PNG used by `LaunchLogo` carried a different yellow in the asset itself.
- Fix: updated `mingle-app/rn/ios/mingle/Images.xcassets/LaunchLogo.imageset/launch-logo.png` so the PNG background matches `#F3C35A`.
- Evidence: thread `019d10e1`; commit `97f9efd`.

### 2026-03-23 | Auto-scroll was too eager and fought manual scrolling

- Symptom: while the user was still near the bottom, message growth kept re-triggering auto-scroll too often and made it hard to scroll upward manually.
- Root cause: auto-follow stayed enabled whenever the viewport was within `400px` of the bottom, and scroll actions could fire repeatedly on every content change.
- Fix: changed the scroll scheduler so auto-scroll can run at most once per `1000ms`, re-checks the condition when the timer fires, and also seeds the throttle window after manual/initial bottom anchoring.
- Evidence: thread `019d18f2`; PR `#68`; merge commit `2dd46c2`.

### 2026-03-26 | Initial landing did not snap to the newest saved history

- Symptom: when the app opened with an existing conversation already in local history, the first screen did not reliably land at the bottom unless the user tapped the bottom-jump affordance.
- Root cause: the initial bottom anchor happened too early; when conversation history hydrated asynchronously after mount, the one-time anchor was already spent.
- Fix: exposed hydration completion from the STT/history hook and made the initial landing perform a single bottom anchor only after saved history is actually ready.
- Evidence: thread `019d2a13`; commit `b1229eb`; PR `#80`.

### 2026-03-21 to 2026-03-31 | My Page layout and content-scroll cleanup

- Symptoms:
- The default avatar looked like a small inner circle sitting inside a larger empty frame.
- English `Posts / Followers / Following` labels broke the visual spacing of the stats row.
- The profile photo / bio block felt too far left, while the gap to the stats area was too wide.
- The `Posts` button could scroll the whole shell, including top and bottom chrome, instead of only the My Page content area.
- Disabled photo-upload affordances were still visible even though the actual flow was not ready.
- Fixes:
- Made the default avatar fill the whole circular frame.
- Switched the stats row to an even three-column layout with non-wrapping labels.
- Rebalanced left/right spacing around the avatar and bio block.
- Replaced `scrollIntoView()` with direct internal `scrollTop` control and added `overscrollBehaviorY: "contain"` so only the page body scrolls.
- Removed the profile photo upload controls and left a neutral placeholder until that feature is real.
- Evidence: threads `019d0f14`, `019d43a3`; commits `796c165`, `b89a3bf`, `22a182d`, `8a71369`, `a97a89d`.

### 2026-04-02 to 2026-04-09 | Banner zone collisions across tab screens, conversation screens, and overlays

- Symptoms:
- The same native ad banner control path was being driven by overlapping booleans, route checks, and scene flags.
- Conversation, tab screens, drawers, edit panels, and follower/following overlays could leave the banner in the wrong position or keep stale state alive across SPA transitions.
- Some SSR/client mismatches were also introduced by render-phase native bridge checks.
- Fixes:
- Introduced explicit banner zones: `tab-screen`, `conversation`, and `overlay-hidden`.
- Reworked the WebView-side banner helpers and wrappers so bottom-tab screens, suppressors, and conversation scenes publish a single zone model instead of conflicting route/overlay signals.
- Added clear/reset behavior for route/context changes so stale zone overrides do not leak across SPA navigation.
- Removed render-phase `window` branching from `native-bottom-tab-banner-slot` so SSR and the first client render agree.
- Evidence: threads `019d4d16`, `019d43a0`, `019d43a3`; commits `9847384`, `aaa114c`, merge `baa9668`.

### 2026-03-31 to 2026-04-09 | AdMob dev/test/runtime issues in the WebView-bottom-tabs branch

- Symptoms:
- iOS and Android could lose the intended banner position after client-side navigation.
- iOS dev/test installs could momentarily show a placeholder (`AdMob loading`) and then lose the banner because a server version-policy response overwrote the test unit ID.
- iOS could also crash on startup because the root `react-native-google-mobile-ads` import touched TurboModule paths too early.
- Fixes:
- Preserved `nativeUi`, `apiNamespace`, and related native banner query parameters across tab navigation.
- Forced dev/test flows to use test banner units in the right environments and ignored server-side banner-unit overrides when a local test unit was already active.
- Switched iOS away from the root AdMob package import path to avoid startup crashes from early module initialization.
- Evidence: threads `019d4398`, `019d43a0`, `019d4d16`; commits `4b054ac`, `2366d42`, `942f06d`.

### 2026-04-02 to 2026-04-09 | Phase 1 conversation-list header and CTA chrome regressed repeatedly

- Symptoms:
- The conversation-list header box became taller than the reference `bottom-tabs` chrome.
- The top gap kept getting overcounted by mixed safe-area, banner, and spacer math.
- The launch CTA also looked washed out or sat inside an unwanted white footer shell instead of owning the whole bottom bar.
- Fixes:
- Restored the header to the same `56px + safe-area` structure as the reference chrome.
- Stopped using header-level spacer hacks for banner avoidance and moved that clearance into the list body.
- Removed the CTA's orange glow shadow and converted the footer into a full-width bottom-bar CTA surface.
- Evidence: thread `019d4cae`; commits `e80df44`, `4419177`, `4d44bce`, `6ec8a87`.

### 2026-04-02 to 2026-04-09 | Native banner offsets around the conversation list and room chrome were too loose

- Symptoms:
- The conversation-list banner floated too far below the top tab.
- In-room top and bottom banners sat farther from the actual chrome than intended.
- On iOS, the conversation bottom banner could still hover a few pixels above the control bar.
- Root cause: list and room scenes were sharing stale banner offset assumptions, and iOS safe-area / coordinate rounding needed a separate nudge.
- Fix: split list-specific vs room-specific banner offsets, tightened chat clearance around in-room banners, and added a tiny iOS-only bottom offset correction.
- Evidence: thread `019d4cae`; commits `4ff1181`, `79b7674`, `4534439`.

### 2026-04-02 to 2026-04-09 | Banner transitions lagged during room/list history moves

- Symptom: when moving between the list and a room, the old banner could linger briefly before the destination screen asserted its own zone.
- Root cause: transitions were switching directly between visible zones instead of first going through a neutral hidden phase.
- Fix: added a `hidden` banner zone so open/close/history paths pre-hide the current banner before the next screen reasserts its zone.
- Evidence: thread `019d4cae`; commit `283dfde`.

### 2026-04-02 to 2026-04-09 | In-room header, bottom bar, and run control looked bulkier than the list chrome

- Symptoms:
- The in-room header and lower control bar looked taller than the conversation-list surfaces.
- An old top safe-area tap fallback still existed above the header.
- The main running control also looked visually heavy or ambiguous.
- Fixes:
- Reduced in-room header/control-bar density to match the list chrome.
- Removed the legacy tap-to-top fallback from the top safe-area region.
- Matched the bottom bar height to the list CTA, reduced the mic button size, removed extra chrome/shadow, and clarified the running-state icon to a stop square.
- Evidence: thread `019d4cae`; commits `792c50f`, `0cb05fe`, `cb5465d`, `eef6043`, `d6feadb`.

### 2026-04-02 to 2026-04-09 | `Start Conversation!` could open a room without actually starting STT

- Symptom: the CTA could create and enter a room but fail to auto-start STT, or destabilize into a ref-callback update loop while trying.
- Root cause: auto-start was being consumed before the room mount / running transition had actually been confirmed.
- Fix: moved auto-start to the post-mount path, removed the ref-callback loop, and only consumed the flag after `running` or `connecting` was really observed so the CTA behaves like a real button press.
- Evidence: thread `019d4cae`; commits `f4c61a3`, `ff102f46`, `d81e5a1`.

### 2026-04-02 to 2026-04-09 | Conversation rows initially lacked recent-message context

- Symptom: the list could show room labels and status but not the latest utterance, making the new room list hard to scan.
- Fix: added a recent finalized-message preview to each room row and truncated it for compact display.
- Evidence: thread `019d4cae`; commit `9d6878c`.

### 2026-04-02 to 2026-04-09 | Conversation-row previews could disappear after status or language PATCH calls

- Symptom: after adding recent-message previews, a room could lose that preview line as soon as the user paused it or changed languages, until the next full refetch.
- Root cause: single-room PATCH responses were overwriting the client summary without carrying `latestMessagePreview`, and the client replaced the whole row with that partial response.
- Fix: repopulated preview data in single-room summary responses and added a client-side defensive merge so the row preview stays stable.
- Evidence: thread `019d4cae`; commit `9269cee`.

### 2026-04-02 to 2026-04-09 | Recently viewed room context was lost on full app reopen

- Symptom: reopening the app would drop the user back to a generic list entry point instead of restoring the last list/room context they had just been using.
- Fix: stored the last viewed conversations URL per locale and tracking-user identity, then restored that state on the next `/[locale]/conversations` entry with a safe fallback to the list when the room no longer exists.
- Evidence: thread `019d4cae`; commit `ac60813`.

### 2026-04-02 to 2026-04-09 | Paused rooms could reopen without their finalized history or usage

- Symptom: after app relaunch, reopening a paused room could show missing usage or missing finalized utterances even though that room had already accumulated real data.
- Root cause: the reopen path trusted local restore too much and had no server-side hydration fallback when WebView-local state had been reset.
- Fix: added a room-level read path and a server fallback hydration step so paused rooms can repopulate finalized messages and usage when local state is missing.
- Evidence: thread `019d4cae`; commit `5d3e166`.

### 2026-04-02 to 2026-04-09 | Multi-room STT ownership and list status synchronization were repeatedly wrong

- Symptoms:
- A non-owner room could ingest another room's live partial/final text.
- Closing a live room could drop visible state or make the wrong room look live.
- Restored rooms could keep stale `active` badges, and `paused` / ordering updates could land late.
- Root cause: multiple mounted room instances could listen to the same native STT global events, and list badges were mixing room visibility, restored summaries, and real STT activity.
- Fixes:
- Enforced a single native STT event owner.
- Made `live/paused` reflect real STT activity instead of mere room visibility.
- Seeded list status from restored summaries and pushed `paused` back to the list immediately when stop is requested.
- Evidence: thread `019d4cae`; commits `125704b`, `be08d36`, `e6b7f9c`, `0b8e079`.

### 2026-04-09 | iOS mic-permission denial trapped the room in retry/error UI

- Symptom: denying mic permission could leave the room stuck in retry/error UI and make recovery or navigation confusing.
- Root cause: the web layer held onto `error` too long, and the RN side could cache `mic_permission` as a failed state that got replayed on room reopen.
- Fix: reset denial to `idle`, kept the mic control re-clickable, cached `mic_permission` as `idle` on RN, then refined the behavior so Settings opens only on the next explicit retry instead of immediately on denial.
- Evidence: thread `019d4cae`; commits `a4b2957`, `545b96b`.

### 2026-04-09 | iOS swipe-back gestures were accidentally disabled except while the menu overlay was open

- Symptom: regular iOS swipe-back stopped working because WKWebView gestures were effectively enabled only when the native menu overlay was open.
- Root cause: `allowsBackForwardNavigationGestures` had regressed into being gated by `isNativeMenuOverlayOpen`.
- Fix: restored gesture enablement for iOS generally instead of tying it to the menu-open state.
- Evidence: thread `019d4cae`; commit `ff49065`.

### 2026-04-09 | iOS room swipe-back flickered when returning to the conversation list

- Symptom: swiping back from a room could show a `room -> list -> room re-open flicker` because history-close animation and route-sync reopen competed.
- Root cause: the current branch was missing the native-history flag / close-mode split that the reference implementation already used.
- Fix: restored native-history signaling and made history-driven closes go `instant`, while keeping animate mode only for explicit app-driven back actions.
- Evidence: thread `019d4cae`; commit `d194388`.

### 2026-04-09 | iOS drawer swipe-back flickered on the way back to the room

- Symptom: after swiping back out of the drawer, the room could briefly show the drawer again and then close it a second time.
- Root cause: unlike the main room overlay, the drawer had no `instant` path for natural iOS `popstate`, so it replayed its own exit animation after the system transition.
- Fix: rolled back an earlier edge-only workaround and added the same `animate / instant` split that the room overlay already used.
- Evidence: thread `019d4cae`; commits `8736f28`, `0b52462` (reverting the earlier `d8ce298` workaround).

### 2026-04-09 | iOS forward navigation could fail to restore the conversation cleanly

- Symptom: after swiping back to the list, swiping forward could leave the list visible, or replay a fresh room-open animation/flicker instead of restoring the existing room state.
- Root cause: route sync was not subscribing directly to the URL's `conversation` query, and history-based reopen paths were not using an instant/optimistic flow.
- Fix: made route sync subscribe directly to the conversation query and reopen via the history-specific instant path.
- Evidence: thread `019d4cae`; commits `4715de0`, `19e98b5`.

### 2026-04-09 | Room swipe-back was too edge-dependent on iOS

- Symptom: users had to start from the far-left edge to leave a room, which made back navigation feel brittle inside the new multi-room UI.
- Fix: kept the native edge swipe intact and added a web-side helper so a rightward swipe from most of the room body can also go back, while excluding buttons, inputs, drawers, and dialogs.
- Evidence: thread `019d4cae`; commit `f0f76b4`.

### 2026-04-09 | Conversation-list copy shipped partially in English

- Symptom: the visible `Start Conversation!` CTA was hardcoded in English, and 7 of the 15 shipping locales fell back to English for the new conversation-list copy.
- Fix: removed the hardcoded CTA label and filled the missing locale dictionaries for `zh-CN`, `zh-TW`, `ru`, `ar`, `hi`, `th`, and `vi`.
- Evidence: thread `019d4cae`; commit `33358e9`.

### 2026-04-04 | Copy buttons became visually noisy

- Symptom: per-bubble copy buttons made the conversation UI look crowded and distracting.
- Fix: kept only the whole-utterance copy control on the original bubble, removed the per-bubble copy buttons, moved copy interaction toward selection/long-press behavior, and added a tiny one-second i18n toast.
- Evidence: thread `019d5714`; branch `codex/remove-utterance-copy-buttons`.

### 2026-04-08 | Composer height could grow but not shrink back

- Symptom: in keyboard mode, multiline input could expand the textarea and wrapper, but clearing or sending text did not reliably shrink the composer back down.
- Root cause: textarea measurement and wrapper height sync depended too much on after-render effects, so shrink transitions could be missed.
- Fix: remeasured the textarea from `auto`, synchronized wrapper height immediately on draft changes and after submit, and added regression tests around shrink/max-height behavior.
- Evidence: thread `019d6d6d`; commit `54d69c6`; PR `#108`.

### 2026-04-08 | Bottom banner created too much scroll gap in keyboard mode

- Symptom: after keyboard mode shipped, the conversation scroll area gained too much bottom gap whenever the banner position was `bottom`.
- Root cause: the web layer treated `bottomInsetPx` as if it were “pure banner height,” but it actually included `bottom bar clearance + banner height`.
- Fix:
- Web hotfix: subtract the live bottom-bar clearance so only the part that actually covers the conversation is used as bottom padding.
- Native follow-up: change the RN layout helper so bottom banners report only banner height going forward.
- Compatibility note: the web-side compatibility layer was intentionally left in place so both old and new app builds stay safe during rollout.
- Evidence: thread `019d6d99`; commits `986d25f` (web hotfix), `0969a0a` (native fix); PR `#112`, merge `7d59d86`.

### 2026-04-09 | Voice mode to keyboard mode transition stuttered

- Symptom: switching from voice mode to keyboard mode caused a jerky two-step drop because banner clearance, bottom-bar height, and composer height were all being remeasured or animated more than once.
- Root cause: clearance re-sync ran through multiple delayed passes and the composer height could animate through overlapping mechanisms.
- Fix: collapsed clearance re-sync to a single settle pass, routed animation-complete handling through the same scheduler, and removed the duplicate textarea height animation path by using motion-layout for the wrapper.
- Evidence: thread `019d6f86`; fix described against `LivePhoneDemo.tsx`.

## Investigated or Partially Closed (No Clearly Confirmed Standalone Fix in the Thread)

### 2026-03-23 | White flash when resuming the app

- Symptom: after switching away from the RN iOS app and coming back, the user could briefly see a white flash for roughly half a second.
- Investigation finding: it looked less like the splash screen returning and more like the WebView/root container briefly exposing a default white background during foreground resume or renderer re-creation.
- Status in extracted threads: investigation clearly happened, but a standalone landed fix was not clearly confirmed in the same session trail.
- Evidence: thread `019d18f0`.

### 2026-03-23 | Android background translation results were not reflected until foreground

- Symptom: Android could keep STT and translation requests alive in the background, but the WebView UI did not reflect translated results until the app returned to the foreground.
- Investigation finding: native STT could outlive the WebView JS/runtime path, so Android background behavior exposed a UI sync gap that iOS background audio/runtime behavior happened to hide better.
- Status in extracted threads: architecture/root-cause discussion exists, but a standalone landed UI fix was not clearly confirmed there.
- Evidence: thread `019d19a3`.

### 2026-03-31 to 2026-04-09 | Hydration mismatch from render-time `Date/Intl` formatting

- Symptom: iOS surfaced `Hydration failed because the server rendered text didn't match the client`, especially around conversation list time labels.
- Investigation finding: `conversation-list.tsx` was formatting time labels during render with `new Date()` and `Intl.DateTimeFormat()`, so server-rendered text and client-rendered text could diverge depending on engine/locale/time-zone differences. The structure of the bug was not iOS-only, but iOS WebKit appeared more likely to reveal it first.
- Status in extracted threads: the root cause was identified, but a clearly confirmed fix for the time-label mismatch was not found in the extracted session set.
- Evidence: threads `019d43a0`, `019d6f83`.

### 2026-03-26 | App relaunch auto-scroll should happen on every fresh open, not only the first time ever

- Symptom: the “initial landing auto-scroll to bottom” behavior worked once, but on later app relaunches it no longer consistently happened.
- Investigation finding: a true app relaunch and a mere foreground return are hard to distinguish from inside the WebView alone. Several approaches were explored, including RN `AppState` and WebView visibility-based detection.
- Status in extracted threads: a couple of fix branches were created and later cleaned up, but the extracted session trail does not show a clearly landed final fix on a persistent branch.
- Evidence: thread `019d2a3f`.

### 2026-04-03 | Android production could show “stopped” UI while STT was actually still running

- Symptom: on Android production, the run button could turn orange again and the scroll-to-bottom affordance could flicker as if STT had stopped, even though transcripts kept arriving.
- Investigation finding: the likely cause was a native/WebView state split where the Android foreground STT service stayed alive, while the WebView-side UI state reloaded or reset and failed to recover the active session state cleanly.
- Status in extracted threads: the state mismatch was diagnosed, but a clearly confirmed landed UI fix was not found in the extracted session set.
- Evidence: thread `019d4f37`.

### 2026-04-09 | Late-session Phase 1 room-state bundle still had some unclosed items

- Symptoms mentioned together in the same late-session pass included an `isLikelyIOSPlatform` runtime error, non-owner rooms still looking live when merely opened, and list ordering needing to follow the latest utterance rather than stale status changes.
- Investigation finding: the session clearly identified a second-wave ownership/status split where `connectionStatus` was still leaking into non-owner room UI, but the extracted trail ends while those final edits are still in progress.
- Status in extracted threads: adjacent fixes for ownership and list-status sync did land earlier in the same session, but this final five-item bundle was not clearly closed by a final assistant confirmation inside the extracted trail.
- Evidence: thread `019d4cae`.

## Notes

- The `codex/mingle-app-webview-bottom-tabs` branch produced many iterative UI fixes. Those fixes are grouped above instead of being repeated as separate micro-entries for every spacing, avatar, or banner tweak.
- If this history needs to become release-facing documentation later, it should be split into:
- “User-visible regressions fixed”
- “UX polish / cleanup”
- “Investigated but still open”
