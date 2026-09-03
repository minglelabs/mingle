# UI/UX Codex Thread History

## 2026-08-24 - Live Demo Preference i18n Coverage

- Surface: `mingle-app/src/i18n/dictionaries/*.ts`, `mingle-app/src/i18n/dictionaries/generated.ts`, `mingle-app/src/components/LivePhoneDemo/LivePhoneDemo.tsx`, `mingle-app/src/components/LivePhoneDemo/LivePhoneDemoLegacy.tsx`
- Issue: The newly added live-demo preference labels for segmentation mode, silence duration, endpoint tuning, and ad position were fully localized only in the Korean and English dictionaries. Other primary UI locales inherited the default dictionary for part of the controls.
- User impact: Users who selected one of the other primary UI languages could see English or fallback-language labels for the speech-splitting controls, making the new settings inconsistent with the rest of the interface.
- Resolution: Added localized labels for all live-demo preference controls to the seven generated primary dictionaries and the six dedicated locale dictionaries, preserving the existing dictionary merge architecture. Added a source-level coverage test for all 15 primary UI locales so future preference controls cannot silently fall back.
- Verification: Run the i18n dictionary tests and the existing live-demo preference tests; verify the mode selector, silence-duration control, endpoint tuning control, and ad-position selector in each primary UI locale.

## 2026-08-24 - STT Mode Selection Emphasis

- Surface: `mingle-app/src/components/LivePhoneDemo/LivePhoneDemo.tsx`, `mingle-app/src/components/LivePhoneDemo/LivePhoneDemoLegacy.tsx`
- Issue: The active STT segmentation mode used a white selected button on a gray segmented control, so it had less visual emphasis than the existing ad-position selector.
- User impact: Users could see the current mode label but had to inspect the control more closely to distinguish the active mode.
- Resolution: Reused the amber key-color selected state from the ad-position selector for both current and legacy STT mode controls, while preserving the existing pressed and disabled behavior.
- Verification: Run the live-demo preference tests and verify the selected End/Fin option remains visibly highlighted on the mobile builds.

## 2026-08-24 - Mode-specific STT Segmentation Controls

- Surface: `mingle-app/src/components/LivePhoneDemo/LivePhoneDemo.tsx`, `mingle-app/src/components/LivePhoneDemo/LivePhoneDemoLegacy.tsx`, `mingle-app/src/components/LivePhoneDemo/live-phone-demo.preferences.ts`
- Issue: The silence-based speech split mode had its silence-duration control hidden while the endpoint-mode five-step speech-length control remained visible. Users could therefore see a misleading “speech length per utterance” setting when they had selected silence-based splitting.
- User impact: Silence-based splitting did not expose the original silence-duration control, and the visible control described a different segmentation behavior.
- Resolution: Show the 500–5000ms silence-duration slider only for silence-based splitting, with a 1000ms default, and show the existing five-step endpoint tuning slider only for automatic endpoint detection. The endpoint safety cap remains 500–3000ms, so extending the Fin silence window does not change End behavior.
- Verification: Update the preference UI contract test and verify both current and legacy live-demo menus switch controls when the segmentation mode changes.

## 2026-08-24 - Per-user STT Speech Split Mode Selector

- Surface: `mingle-app/src/components/LivePhoneDemo/LivePhoneDemo.tsx`, `mingle-app/src/components/LivePhoneDemo/LivePhoneDemoLegacy.tsx`, `mingle-app/src/i18n/dictionaries/en.ts`, `mingle-app/src/i18n/dictionaries/ko.ts`
- Issue: Soniox speech segmentation was controlled only by the server-wide `SONIOX_SEGMENTATION_STRATEGY`, so a user who needed conservative silence-based `fin` splitting could not choose it without affecting every active session. The account-preference hydration contract also had no visible control for the newly stored per-user value.
- User impact: Users could not control whether a live transcript used automatic provider endpoint detection (`end`) or silence-based manual finalization (`fin`). Changing the mode during an active STT session could also make the next session's behavior ambiguous if the control remained interactive.
- Resolution: Added a two-option segmented control in both current and legacy live-demo menus. Existing `null` preferences remain the server fallback but render as the default `Automatic detection` option. The user-facing labels do not expose provider strategy names. The main branch's five-step speech-length control is restored for endpoint mode and remains available alongside the mode selector. Both controls are disabled while STT is connecting or active, and changes are persisted through the existing account-preference sync path. Added Korean and English copy while other locales inherit the English fallback through the dictionary merge.
- Accessibility: The control uses a labeled `role="group"`, `aria-pressed` state per option, visible focus rings, and disabled-state feedback during an active recording.
- Verification: Targeted account-preference tests pass; manual device verification should confirm that changing the selector, starting a new recording, and switching between web and native STT produces the selected mode in the session handshake.

## 2026-08-16 - Admin Dashboard Daily Metric Loading Delay

- Surface: `mingle-app/src/app/admin/dashboard/page.tsx`, `mingle-app/src/lib/admin-dashboard-query.ts`, `mingle-app/prisma/schema.prisma`
- Issue: Every dashboard request recomputed signup count, DAU, message count, usage seconds, and four latency series with six aggregate queries over the production tables. Switching between the 7-day, 30-day, and 90-day ranges repeated the same historical work and left the administrator waiting on the loading state.
- User impact: The service dashboard felt slow and made repeated date-range inspection impractical, even though the historical daily values did not change during normal use.
- Resolution: Added the `admin_dashboard_daily_metrics` daily snapshot table, persisted all calculated values for historical dates on first request, and served subsequent range changes from a primary-key date lookup. The current UTC day is refreshed on each request so live admin numbers remain current; completed dates remain stable snapshots. The existing chart, cumulative view, table layout, and loading copy were preserved.
- Tests: Added cache-hit, missing-history population, and current-day refresh coverage in `admin-dashboard-query.test.ts`; the targeted dashboard metric test suite passes.

## 2026-04-30 - Live Demo Chat Scroll Surface Paint Boundary

- Surface: `mingle-app/src/components/LivePhoneDemo/LivePhoneDemo.tsx`
- Issue: The chat transcript scroller sits inside the same phone screen tree as static background chrome, scroll overlays, and bottom controls. During 500-utterance iOS WebView touch scrolling, repaint invalidation from the moving transcript should stay bounded to the chat surface instead of leaking into surrounding decorative phone UI.
- User impact: Long transcript scrolling could feel less stable on iPhone-class WebViews while preserving the same visible phone frame, chat background, date label, scrollbar, and scroll-to-bottom affordance.
- Resolution: Added a shared chat surface style with `contain: layout paint style` and `isolation: isolate` on the non-scrolling chat area wrapper outside the inner DOM scroller. The inner WebView-owned scroll container, native WebView scroll-disabled contract, padding, overlays, and message visuals remain unchanged.

## 2026-04-30 - Live Demo Chat Message Paint Isolation

- Surface: `mingle-app/src/components/LivePhoneDemo/LivePhoneDemo.tsx`
- Issue: Each rendered chat message row contains bubble surfaces with borders, subtle shadows, badges, image avatars, and occasional inline playback animations. In a 500-utterance iOS WebView scroll, invalidation from those descendants can be more expensive if every row participates in the same unconstrained layout/style scope.
- User impact: Long transcript scrolling could feel less stable on iPhone-class WebViews even though the chat list remains visually unchanged.
- Resolution: Added a shared repeated-row style that isolates each message row with `contain: layout style` and `isolation: isolate`, avoiding paint clipping, per-row layer promotion, color changes, or bubble class changes so the existing chat appearance and interaction affordances remain intact.

## 2026-04-30 - Live Demo Chat iOS Scroll Viewport Styles

- Surface: `mingle-app/src/components/LivePhoneDemo/LivePhoneDemo.tsx`
- Issue: The live demo chat scroll container did not explicitly opt into iOS WebView momentum scrolling or vertical pan gesture handling at the inner DOM viewport that owns transcript scrolling.
- User impact: On iPhone-class WebViews with roughly 500 utterances, the transcript could leave more scroll gesture work to WebKit defaults, increasing the risk of uneven touch scrolling even though the visible layout was unchanged.
- Resolution: Kept the native WebView scroll disabled contract and the existing chat padding/layout intact, but applied iOS-friendly scroll viewport styles (`-webkit-overflow-scrolling: touch`, vertical overscroll containment, vertical touch-action, and a scroll-position will-change hint) to the inner chat scroller.

## 2026-04-30 - Live Demo Chat Scroll FPS Capture Harness

- Surface: `mingle-app/src/components/LivePhoneDemo/LivePhoneDemo.tsx`, `mingle-app/scripts/ios-live-demo-scroll-fps-capture.mjs`, `mingle-app/qa/mobile-ui/IOS_SCROLL_FPS_CAPTURE.md`
- Issue: The 500-utterance iOS WebView chat scroll work needed a repeatable physical-device touch-scroll FPS and jank capture path that did not rely on the app's dev-only scroll-handler counter.
- User impact: Without a repeatable capture harness, final smoothness checks on iPhone 12-class devices could vary by operator gesture and accidentally run with instrumentation enabled.
- Resolution: Added a devbox/Appium iOS scroll FPS harness that seeds the deterministic 500-utterance history, clears and verifies the app scroll instrumentation is off, drives native touch gestures against the inner chat DOM scroll container, and records per-run FPS, frame interval, jank, long-frame, dropped-frame, and repeatability summaries.

## 2026-04-30 - Live Demo Chat Scroll Handler Median Verification

- Surface: `mingle-app/src/components/LivePhoneDemo/LivePhoneDemo.tsx`, `mingle-app/src/components/LivePhoneDemo/live-phone-demo.scroll.logic.ts`, `mingle-app/src/components/LivePhoneDemo/live-phone-demo.scroll.logic.test.ts`
- Issue: The optimized chat scroll handler needed an explicit verification record for the 2ms median-cost budget before considering heavier windowing work.
- User impact: On iPhone 12-class WebViews with roughly 500 utterances, a handler that exceeds the per-scroll median budget can make transcript touch scrolling feel uneven even when the visible UI is unchanged.
- Resolution: Locked the representative `chat-scroll-handler` median budget to `<= 2ms` in the scroll logic tests and verified the optimized 500-utterance logical handler path with 240 samples at median `0.000ms` and max `0.007ms`; final pass/fail device FPS measurement should still run separately with instrumentation OFF.

## 2026-04-30 - Live Demo Chat Scroll Height Read Guard

- Surface: `mingle-app/src/components/LivePhoneDemo/LivePhoneDemo.tsx`, `mingle-app/src/components/LivePhoneDemo/live-phone-demo.scroll.logic.ts`
- Issue: The optimized chat scroll handler still evaluated `node.scrollHeight` on every native scroll event while deciding whether a pending older-message prepend needed a `scrollTop` snapshot.
- User impact: On iPhone-class WebViews with roughly 500 utterances, that unnecessary layout-height read could add work to touch scrolling even when no prepend was in progress.
- Resolution: Reused the cached `scrollTop` read for the synchronous anchor snapshot and moved the `scrollHeight` read behind a finite pending-prepend guard, preserving the existing prepend anchor behavior while keeping the normal scroll path lighter.

## 2026-04-30 - Live Demo Chat Late Height Measurement

- Surface: `mingle-app/src/components/LivePhoneDemo/LivePhoneDemo.tsx`, `mingle-app/src/components/LivePhoneDemo/live-phone-demo.scroll.logic.ts`
- Issue: Late per-message height changes can shift content above the current viewport anchor after cached chat offsets have already been used for scroll-derived state.
- User impact: In long iOS WebView demo chats, delayed translation or bubble layout changes above the visible anchor could otherwise create subtle transcript drift during review.
- Resolution: During measured anchor refresh, compared previous and next per-message heights, detected changed messages above the viewport anchor, and compensated the chat `scrollTop` from the saved anchor top offset so delayed layout changes preserve the visible message position without adding DOM scans to the scroll event path.

## 2026-04-30 - Live Demo Chat Viewport Anchor Snapshot

- Surface: `mingle-app/src/components/LivePhoneDemo/LivePhoneDemo.tsx`, `mingle-app/src/components/LivePhoneDemo/live-phone-demo.scroll.logic.ts`
- Issue: Late chat layout changes need a stable reference to the message currently anchoring the viewport before cached offsets are refreshed. Without an explicit message-id/top-offset snapshot, later scroll correction work would have to infer the anchor after content already changed.
- User impact: In long iOS WebView demo chats, delayed message height changes could otherwise make the visible transcript drift during review.
- Resolution: Added a ref-backed viewport anchor snapshot that records the current top-visible utterance id and its viewport-relative top offset from cached scroll anchors, including before older-message loading and DOM-change refresh scheduling.

## 2026-04-30 - Live Demo Chat Scroll DOM Scan Contract

- Surface: `mingle-app/src/components/LivePhoneDemo/LivePhoneDemo.tsx`, `mingle-app/src/components/LivePhoneDemo/live-phone-demo.scroll.logic.test.ts`
- Issue: Long iOS WebView chat sessions need the touch-scroll event path to stay free of full DOM scans. The date-label anchor cache can still be refreshed after content/layout changes, but scroll events must not reintroduce `querySelector*`, child traversal, or the anchor refresh scan.
- User impact: With roughly 500 utterances loaded, any per-scroll full DOM scan could compete with WebView touch scrolling and make the transcript feel sticky or uneven.
- Resolution: Added a focused source contract test that locks `handleScroll` and the rAF-throttled scroll-derived state path to cached anchors only, with no full-DOM scan calls per scroll event.

## 2026-04-30 - Live Demo Prepend Snapshot rAF Integration

- Surface: `mingle-app/src/components/LivePhoneDemo/LivePhoneDemo.tsx`, `mingle-app/src/components/LivePhoneDemo/live-phone-demo.scroll.logic.ts`
- Issue: Scroll-derived React state was rAF-throttled, but older-message prepend retention still depended on the latest `scrollTop` snapshot. If the user scrolled after triggering older-message loading and before the rAF callback ran, the prepend correction could use a stale snapshot.
- User impact: A long iOS WebView transcript could jump slightly when older history finished loading during active touch scrolling, even though the retention logic was intended to keep the currently visible message pinned.
- Resolution: Kept rAF throttling for expensive derived state updates, but captured the pending prepend `scrollTop` ref synchronously during pagination while the DOM height still matches the pre-prepend height.

## 2026-04-30 - Live Demo New Message Auto-Follow Threshold

- Surface: `mingle-app/src/components/LivePhoneDemo/LivePhoneDemo.tsx`, `mingle-app/src/components/LivePhoneDemo/live-phone-demo.scroll.logic.ts`
- Issue: New-message auto-follow used the same 400px distance threshold as the floating scroll-to-bottom affordance, which could pull users farther from the bottom than the intended near-bottom chat-follow behavior.
- User impact: In long iOS WebView demo chats, a user reviewing messages within that wider range could be moved to the latest message unexpectedly, while a user exactly near the bottom still needed reliable follow behavior when a new message changed content height.
- Resolution: Changed the new-message auto-follow threshold to 100px, preserved the existing 400px scroll-to-bottom button visibility threshold, and based append follow eligibility on the pre-append distance so users within 100px continue to land at the bottom after the new message renders.

## 2026-04-30 - Live Demo Chat Scroll Date Label Performance

- Surface: `mingle-app/src/components/LivePhoneDemo/LivePhoneDemo.tsx`, `mingle-app/src/components/LivePhoneDemo/live-phone-demo.scroll.logic.ts`
- Issue: The live demo chat scroll overlay recalculated the visible date label during scroll by querying every message node and reading each bounding rect, which could add avoidable main-thread work in long iOS WebView conversations.
- User impact: Users scrolling a long transcript could feel less smooth movement because the scroll handler performed layout reads across the whole message list.
- Resolution: Moved date-label anchor measurement to render/DOM-change moments, cached message offsets, and made scroll-time date selection use only `scrollTop` plus cached offsets while preserving the existing top-visible-message rule and date formatting.

## 2026-04-30 - Live Demo Chat Prepend Anchor Preservation

- Surface: `mingle-app/src/components/LivePhoneDemo/LivePhoneDemo.tsx`, `mingle-app/src/components/LivePhoneDemo/live-phone-demo.scroll.logic.ts`
- Issue: Loading older utterances at the top of a long live demo chat depended on applying the raw `scrollHeight` delta to the current `scrollTop`. If the WebView or a pending user scroll changed `scrollTop` before React's layout effect ran, the first visible message could drift instead of staying visually pinned.
- User impact: On iPhone-class WebViews, paging into older chat history could feel like the conversation jumped by a small amount, making long-history review harder.
- Resolution: Kept the existing `prevScrollHeightRef` delta correction, added a pending `scrollTop` snapshot for the same prepend operation, and centralized the corrected scroll-top calculation with tests that assert the visible message remains within the 1px tolerance.

## 2026-04-27 - Feedback History Clickable Links

- Surface: `mingle-app/src/components/LivePhoneDemo/LivePhoneDemo.tsx`, `mingle-app/src/components/LivePhoneDemo/LivePhoneDemoLegacy.tsx`, `mingle-app/src/components/LivePhoneDemo/live-phone-demo.feedback-links.tsx`
- Issue: Feedback history messages rendered user questions and team replies as plain text, so URLs pasted into either side of the conversation were not tappable in the mobile app.
- User impact: Users had to manually copy links from support replies or their own feedback records, which made follow-up instructions and external support references harder to use on mobile.
- Resolution: Added safe URL linkification for `https://`, `http://`, and `www.` links in feedback history message text, preserving normal text escaping and leaving sentence punctuation outside the clickable target.

## 2026-04-27 - Feedback Page Instagram Contact Button

- Surface: `mingle-app/src/components/LivePhoneDemo/LivePhoneDemo.tsx`, `mingle-app/src/components/LivePhoneDemo/LivePhoneDemoLegacy.tsx`, `mingle-app/src/components/LivePhoneDemo/live-phone-demo.feedback-copy.ts`
- Issue: The in-app feedback page only exposed the compose/history tabs, so users who found the feedback form inconvenient or needed a clearer support path had no obvious alternate contact route.
- User impact: Users could leave terse or repeated feedback because the current UI did not make the team's Instagram support channel discoverable at the point where they were already trying to contact Mingle.
- Resolution: Added a localized full-width Instagram contact button above the feedback send/history tabs in both current and legacy live demo feedback panels, linking to `https://www.instagram.com/mingle.labs/`, and added Thai copy coverage for the new label.

## 2026-04-26 - Mobile WebView Swipe-To-Close Removal

- Surface: `mingle-app/src/components/LivePhoneDemo/LivePhoneDemo.tsx`, `mingle-app/src/components/LivePhoneDemo/LivePhoneDemoLegacy.tsx`
- Issue: The conversation root and right-side menu panel had custom left-to-right swipe-to-close handlers inside the mobile WebView, which overlapped with iOS edge-swipe back behavior and could make horizontal touches inside a conversation feel like accidental navigation.
- User impact: Mobile users could unintentionally leave a conversation or close the menu while performing horizontal touch interactions, especially on iOS where the OS already provides an edge back gesture.
- Resolution: Removed the app-level swipe-to-close pointer sessions, drag thresholds, drag state, and swipe-only touch-action overrides while keeping explicit back/close buttons, backdrop tap close behavior, browser/native history handling, and OS back gestures.

## 2026-04-20 - Blog Felo And Transync Turn Criteria Corrections

- Surface: `mingle-app/public/legal/blogs/ai-translators-comparison.html`
- Issue: Felo's messenger-like sentence turns were understated as `Partial`, while Transync's sentence-turn and speaker-diarization cells were overstated as `Partial`.
- User impact: Readers could misread Felo's sentence-level transcript behavior and Transync's live transcript behavior against the table's stricter messenger-turn and diarization criteria.
- Resolution: Updated Felo `Messenger-like sentence turns` to `Yes`, and updated Transync `Messenger-like sentence turns` plus `Realtime speaker diarization` to `No`.

## 2026-04-20 - Blog Transync External Audio Correction

- Surface: `mingle-app/public/legal/blogs/ai-translators-comparison.html`
- Issue: Transync was marked as `Partial` for `External app audio capture`, implying some external-app audio capture support.
- User impact: Readers could incorrectly interpret Transync as supporting external app audio capture in the same comparison category.
- Resolution: Updated the Transync `External app audio capture` cell to `No` and clarified that meeting integrations do not make it an external app audio capture layer.

## 2026-04-26 - Mingle App Composer Jitter During STT/TTS Playback

- Surface: `mingle-app/src/components/LivePhoneDemo/LivePhoneDemo.tsx`
- Issue: In long conversations, switching to keyboard mode while STT/TTS was active could make the composer subtly flicker and move the caret away from the expected typing position. The risky paths were controlled textarea draft updates re-rendering the full live demo on every keystroke, animated textarea/container height changes, Framer layout measurement on the active bottom bar, and 1px-level `visualViewport` inset jitter feeding bottom padding.
- User impact: Text entry felt unreliable because the input area and caret could visually shift while the user was typing, especially with a large transcript and concurrent playback/recognition updates.
- Resolution: Moved the composer text draft to a ref-backed uncontrolled textarea, kept React state only for send-button availability and actual height changes, removed height transitions from the composer shell/textarea, disabled bottom-bar layout animation while text mode is open, and added a small stability threshold for keyboard viewport inset updates.

## 2026-04-20 - Blog Felo Price Copy

- Surface: `mingle-app/public/legal/blogs/ai-translators-comparison.html`
- Issue: The Felo Translator price cell mixed KRW and USD conversion details, making the table less clean for English readers.
- User impact: Readers saw an unnecessary currency conversion instead of a direct dollar-only price comparison.
- Resolution: Updated the Felo Translator price to a dollar-only public pricing summary, `About $2/hour; public web pricing lists 120 minutes at $3.90.`, and removed the KRW exchange reference from the source notes.

## 2026-04-20 - Blog Comparison Table Row Order

- Surface: `mingle-app/public/legal/blogs/ai-translators-comparison.html`
- Issue: Felo Translator and Transync appeared immediately after Mingle, ahead of the broader consumer translator set.
- User impact: The table ordering made newer comparison additions feel over-prioritized instead of supplemental to the core translator set.
- Resolution: Kept Mingle first, moved Google Translate, Apple Translate, Microsoft Translator, Papago, and DeepL directly after it, and placed Felo Translator and Transync as the final two rows.

## 2026-04-20 - Blog Comparison Table AI Performance Column

- Surface: `mingle-app/public/legal/blogs/ai-translators-comparison.html`
- Issue: The translator comparison table listed language counts and workflow features but did not summarize perceived AI performance as a scannable criterion.
- User impact: Readers had to infer model quality from adjacent feature descriptions instead of comparing a direct `Good` or `Standard` performance signal.
- Resolution: Added an `AI performance` column immediately after `Supported languages`, marked Mingle, Google Translate, Transync, and DeepL as `Good`, marked Felo Translator, Apple Translate, Microsoft Translator, and Papago as `Standard`, and widened the table to preserve cell spacing.

## 2026-04-20 - Blog Landing Page Reference Button

- Surface: `mingle-app/public/legal/blogs/ai-translators-comparison.html`
- Issue: The comparison article ended at source references without a clear path back to the Mingle product landing page.
- User impact: Readers who reached the bottom of the article had to use navigation or manually change URLs to inspect the referenced product page.
- Resolution: Added a centered bottom reference button linking to `https://translator.minglelabs.xyz/landing/`, styled to match the article's restrained button language.

## 2026-04-20 - Blog Comparison Table Felo And Transync Rows

- Surface: `mingle-app/public/legal/blogs/ai-translators-comparison.html`
- Issue: The live AI translator comparison table did not include Felo Translator or Transync, two relevant real-time voice translation products.
- User impact: Readers could not compare Mingle against adjacent live translation products with hourly or meeting-oriented pricing.
- Resolution: Added Felo Translator and Transync rows directly after Mingle, including their logos, platform coverage, pricing, language support, live caption behavior, detection behavior, and other existing comparison criteria.

## 2026-04-20 - Blog Translator Comparison Table Logo

- Surface: `mingle-app/public/legal/blogs/ai-translators-comparison.html`
- Issue: The Mingle row in the translator comparison table used `/assets/logo-mingle.png`, which rendered as a text-like white tile and did not match the branded icon in the blog navigation.
- User impact: The first row of the comparison table looked visually inconsistent with the navbar brand and weaker than the other translator logo cells.
- Resolution: Updated the Mingle table row to use the same navbar asset, `/assets/mingle-icon.png`, while leaving the surrounding table layout and other translator rows unchanged.

## 2026-04-20 - Blog Translator Comparison Platform Coverage

- Surface: `mingle-app/public/legal/blogs/ai-translators-comparison.html`
- Issue: The comparison table listed price and feature coverage but did not show platform availability, making it harder to compare whether each translator supports iOS, Android, Web, or desktop surfaces.
- User impact: Readers could not quickly distinguish mobile-only translators from products that also work on the web or desktop.
- Resolution: Added a `Platforms` column, updated the Mingle pricing copy to `Free consumer app.`, and expanded the source notes to include platform references.

## 2026-04-20 - Blog Hero App Screenshot Framing

- Surface: `mingle-app/public/legal/blogs/ai-translators-comparison.html`
- Issue: The Mingle app screenshot in the article hero was too zoomed in, and the hero section felt too short for the article framing.
- User impact: The app screen was harder to recognize as a full Mingle interface, and the top of the article did not give enough visual weight to the comparison.
- Resolution: Reduced the hero screenshot background size, centered it more calmly, increased hero vertical spacing, and added a second hero paragraph summarizing that Mingle ranks best overall among mobile apps across the 10 comparison criteria.

## 2026-04-20 - Blog Comparison Table Width And Live Chat Criteria

- Surface: `mingle-app/public/legal/blogs/ai-translators-comparison.html`
- Issue: The comparison table cells felt too narrow after multiple feature columns were added, and the table did not yet compare real-time speaker diarization or whether each product can function as its own messenger and voice chat app.
- User impact: Readers had to parse cramped cells and could miss two core differentiators for Mingle as a live social translation product.
- Resolution: Increased the table minimum width, widened table padding and the translator column, added `Realtime speaker diarization` and `Messenger + voice chat app` columns, and updated the hero summary from 10 to 12 criteria.

## 2026-04-20 - Blog Comparison Table Column Balance

- Surface: `mingle-app/public/legal/blogs/ai-translators-comparison.html`
- Issue: The `Translator`, `Price`, and `Platforms` columns consumed more horizontal space than needed while feature columns still felt compressed.
- User impact: The most important feature comparison cells were harder to scan, especially after the table gained additional criteria.
- Resolution: Switched the table to fixed layout, narrowed the first three columns, increased the overall table width, and widened the remaining feature columns with larger default cell widths.

## 2026-04-20 - Blog Comparison Table Feature Order

- Surface: `mingle-app/public/legal/blogs/ai-translators-comparison.html`
- Issue: `Continuous note-style translation` and `Live captions + transcript` were placed later in the table, after detection and multilingual routing features.
- User impact: Two core live-output criteria were harder to compare immediately after basic language support.
- Resolution: Moved both columns to immediately follow `Supported languages` across the header and all translator rows, without changing the feature values.

## 2026-05-04 - Live Chat Conversation List Status Race And Misleading Open/Pause Alerts

- Surface: `mingle-app/src/components/conversation-list.tsx`
- Issue: On the chat-scroll-performance branch devbox build, opening/stopping a conversation room produced false `대화방을 열지 못했습니다` (Failed to open) and `대화방을 정지하지 못했습니다` (Failed to pause) toasts that did not appear on App Store 1.1.3. Two underlying problems:
  1. The conversation status PATCH (active/paused) was fire-and-forget without a per-conversation mutation version guard. On devbox the PATCH takes ~4s, so an in-flight `active` response could land after a newer `paused` response and overwrite local state, retriggering room re-entry.
  2. The same generic `openErrorMessage` toast was reused for unrelated `selectedLanguages`/`speechLanguages`/`translationLanguagesLinked` PATCH failures, so a single language-sync glitch produced up to three misleading `Failed to open` toasts even when the room was already open.
- User impact: Users on slow networks or devbox saw repeated fake `Failed to open` toasts while the room actually opened, plus a fake `Failed to pause` after stopping STT, with the app sometimes appearing to "reopen" the room because stale status responses overrode local pause state.
- Resolution:
  - Added a per-conversation monotonically increasing status mutation tracker plus AbortController in `conversation-list.tsx`. The status `then`/`catch` now ignores stale and aborted responses; only the most recent mutation can update local state, roll back, or alert.
  - Removed the misleading `window.alert(openErrorMessage)` from the three language-setting PATCH catches. Optimistic rollback remains the visible signal; the error is still recorded via the new diagnostics logger.
  - Added a devbox-only diagnostics logger (`conversation-list.diagnostics.ts`) gated on `NODE_ENV !== "production"` that captures call-site label, method, path, response status/body, error name/message, and stale/aborted flags for every mutation failure path.
  - Route-open and popstate-open catches now suppress their alert when the underlying error is an `AbortError` and always log diagnostics for further debugging.
- Tests: Race scenarios (`active`/`paused` overlap, stale failure suppression, latest failure alerts once, isolation across conversations) live in `conversation-list.logic.test.ts`. Diagnostics behavior is covered in `conversation-list.diagnostics.test.ts`.

## 2026-05-04 - Latest-Message Affordance Threshold Drift

- Surface: `mingle-app/src/components/LivePhoneDemo/LivePhoneDemo.tsx`, `mingle-app/src/components/LivePhoneDemo/live-phone-demo.scroll.logic.ts`
- Issue: New-message auto-follow stopped past 100px from the bottom (`AUTO_SCROLL_BOTTOM_THRESHOLD_PX`), but the scroll-to-bottom button only became visible past 400px (`SCROLL_TO_BOTTOM_BUTTON_THRESHOLD_PX = 400`). This created a 101–400px UX dead zone where new content sat below the viewport with no auto-follow and no recovery affordance, breaking the legacy alignment pattern from `LivePhoneDemoLegacy.tsx` where both thresholds shared the same constant.
- User impact: When a user was scrolled 101–400px above the bottom, incoming messages were neither followed automatically nor advertised by a tappable indicator, so they could miss messages without realizing it.
- Resolution: Moved `SCROLL_TO_BOTTOM_BUTTON_THRESHOLD_PX` into `live-phone-demo.scroll.logic.ts` aliased to `AUTO_SCROLL_BOTTOM_THRESHOLD_PX`, removed the duplicated literal in `LivePhoneDemo.tsx`, and added a regression test in `live-phone-demo.scroll.logic.test.ts` that asserts the parity and that the button is visible across the entire user-scrolled-away band.

## 2026-05-07 - Conversation List URL Store Desync And Auto-Reentry Loop

- Surface: `mingle-app/src/components/conversation-list.tsx`
- Issue: On the chat-scroll-performance branch devbox build, exiting a running room produced a `대화방을 열지 못했습니다` toast, the OK dismiss briefly returned to the list, then the room re-mounted with STT auto-restarting. Pressing back again repeated the loop. New conversations also showed a `대화방을 열지 못했습니다` toast on first STT activation even though the room opened correctly. Root cause: `subscribeToLocationSearch` (the `useSyncExternalStore` source backing `routeConversationId`) only listened to `popstate` and `hashchange`. Programmatic history mutations via `replaceConversationOverlayUrl` (close path) and the `setActiveConversation` → `pushState` effect (open path) silently changed the URL without notifying subscribers. After a close, `activeConversation` flipped to `null` while `routeConversationId` stayed at the old value for a render or two, so the route-sync `useEffect` re-opened the same room and re-armed STT. The same desync caused the create-flow status PATCH to land on a still-propagating record and surface the generic "open failed" toast.
- User impact: Users could not reliably exit a running conversation; pressing back or the in-room close button bounced them back into the room with STT re-running. New conversation creation showed misleading open-failure toasts even though the operation succeeded.
- Resolution:
  - Added a `mingle:conversation-location-sync` custom event. `replaceConversationOverlayUrl` and the `activeConversation` `pushState` effect now dispatch it, and `subscribeToLocationSearch` listens to it alongside `popstate`/`hashchange`. `routeConversationId` now converges to the URL on the same render as the close/open call site, so the route-sync effect no longer re-enters a just-closed room.
  - `updateConversationStatus` now retries transient failures (HTTP 404 or 5xx) once after a 500ms backoff before surfacing the failure to the catch path. This absorbs the read-after-write window where a brand-new conversation’s first status PATCH would otherwise alert the user even though the conversation exists. The retry honors the existing AbortController and preserves the 404+deleting short-circuit.
- Tests: existing `conversation-list.logic.test.ts` race-scenario tests still cover the version-tracker semantics. The location-sync event is exercised end-to-end on iOS devbox; an automated regression test for the `useSyncExternalStore` event subscription is deferred (would require a JSDOM popstate harness) and is captured in the manual QA checklist.

## 2026-05-08 - Conversation List Message Count Source Drift

- Surface: `mingle-app/src/components/conversation-list.tsx`, `mingle-app/src/lib/app-conversations.ts`
- Issue: Conversation rows displayed message counts from the WebView local warm cache instead of the server-side conversation transcript. Long rooms could show `100` messages in the list after app relaunch because `LivePhoneDemo` intentionally caps local utterance cache persistence to the latest 100 items, while the room hydration endpoint correctly knew the full server count, such as `648`.
- User impact: Users saw inconsistent counts between the conversation list and the room. Opening the room and paginating older messages could temporarily raise the row count to the correct total, but relaunching the app could drop it back to the local cache limit.
- Resolution:
  - Added `messageCount` to `ConversationChannelSummary` as an optional server-provided field.
  - `listConversationChannelsForUser` now batches visible `AppMessage` counts by `sessionKey` with `groupBy`, so `GET /conversations` can return authoritative server totals without adding a denormalized column or Prisma migration.
  - The list row display now uses `max(serverMessageCount, localMessageCount)` so server totals win after relaunch while still preserving optimistic local increments for live STT turns that have not reached the server yet.
- Tests: `app-conversations.test.ts` covers the `groupBy` count payload and `conversation-list.logic.test.ts` covers the server-vs-local display count fallback.

## 2026-05-08 - Native STT Manual Back Re-entry Loop

- Surface: `mingle-app/src/components/conversation-list.tsx`
- Issue: In the native iOS WebView, pressing back or using edge-swipe while STT was running could show a misleading `Failed to open` alert, return to the list briefly, then re-open the same conversation and restart STT. Root cause: a status PATCH failure was treated as authoritative and rolled back live UI state even though native STT was still running, while route-sync, popstate-open, and native STT restore paths could still re-open a conversation the user had just manually closed. The effect-based `pushState` also stacked duplicate `?conversation=` entries whenever `activeConversation` changed through non-user restore paths.
- User impact: Users could not reliably leave a running conversation; repeated back actions could loop through room re-entry, STT restart, and occasional blank transition states.
- Resolution:
  - Native runtime status PATCH failures now log diagnostics without rolling back local live state or showing a blocking alert; the native STT runtime is treated as the source of truth for whether recording is actually running.
  - Added a conversation-id-scoped manual-close suppression ref and applied it to native STT restore, route-sync open, and popstate-open paths so a just-closed room is not reopened automatically.
  - Moved conversation URL history synchronization into `openConversationSummary` with explicit `push`, `replace`, and `none` modes. User list taps push history and clear suppression, while route/popstate/QA restore paths avoid duplicate history pushes.
  - Follow-up: close now updates the active conversation ref synchronously before waiting for `history.back()`, and the in-room back button closes the overlay immediately before moving browser history. This prevents a later handler in the same `popstate` tick from seeing stale active state and re-opening the room.
- Tests: `pnpm test:scripts` passed. Full TypeScript verification is still blocked by pre-existing unrelated test type errors in `language-selector.logic.test.ts` and `get-dictionary.test.ts`.

## 2026-05-08 - Native WebView Source Reload On Conversation Navigation

- Surface: `mingle-app/rn/App.tsx`
- Issue: RN persisted the current conversation URL for cold-start restore, but the same live restore state was also fed back into `webViewSource.uri`. Normal in-page navigation between the conversation list and `?conversation=...` updated `conversationRestoreUrlHint`, which could change the WebView `source` prop and trigger a full reload instead of staying inside the SPA.
- User impact: Opening or leaving a room could flash white/black during a WebView reload. While STT was running, the reload could combine with native restore state and make the same room re-enter with STT restarting after the user backed out to the list.
- Resolution: Latched the initial native conversation restore URL in a ref at mount time and removed live `conversationRestoreUrlHint` from `webUrl`/`webViewSource` calculation. Post-mount room/list navigation still updates native restore storage for future cold starts, but no longer changes the current WebView source URI.
- Tests: `pnpm --dir mingle-app/rn test -- __tests__/webViewRestore.test.ts __tests__/webViewLayout.test.ts --runInBand` and `pnpm --dir mingle-app test:scripts` passed.

## 2026-05-25 - Native Conversation List Cold-Start Delay

- Surface: `mingle-app/src/web/shared/v1.1.0/conversations-entry.tsx`, `mingle-app/src/lib/app-conversations.ts`, `mingle-app/src/components/conversation-list.tsx`, `mingle-app/src/components/LivePhoneDemo/use-realtime-stt.ts`
- Issue: Native WebView startup could show the splash screen and then a white page while `/conversations?nativeUi=1` waited on server-side conversation hydration. The initial page request loaded every conversation with latest-message previews and full visible-message counts, then the client immediately fetched the conversation list again after hydration. The list bundle also pulled in the full room/STT implementation even when the user had not opened a room yet.
- User impact: As conversation and transcript history grew, users could wait longer before seeing the conversation list after launch. On cold server starts or slower mobile networks, the forced splash timeout could expose a blank white WebView before the list finished painting.
- Resolution:
  - Added an `includeMessageSummaries` option to `listConversationChannelsForUser`. Native list SSR now sends lightweight conversation shells first and skips the AppMessage latest-preview/count scans on the blocking request.
  - Marked native shell lists as requiring a background refresh, so the row shell can paint first and then fetch authoritative latest-message/count data after a short delay.
  - Kept non-native web behavior unchanged: SSR still includes summaries when `nativeUi=1` is absent.
  - Moved lightweight realtime storage helpers into `realtime-storage.ts` and lazy-loaded `MingleHome`, so the initial conversation list no longer eagerly imports room/STT code.
- Tests: `scripts/devbox test --target app -- src/lib/app-conversations.test.ts src/components/conversation-list.logic.test.ts src/components/LivePhoneDemo/use-realtime-stt.logic.test.ts` passed. `pnpm -C mingle-app build:release:ios:v1_1_4` passed. Full `tsc --noEmit` remains blocked by pre-existing unrelated test type errors in `language-selector.logic.test.ts` and `get-dictionary.test.ts`.

## 2026-05-25 - Native Conversation List Preview Refresh Identity Drift

- Surface: `mingle-app/src/web/shared/v1.1.0/conversations-entry.tsx`, `mingle-app/src/components/conversation-list.tsx`
- Issue: After the cold-start optimization skipped latest-message summaries during native SSR, some native WebView starts showed conversation rows without the latest message preview until the user opened and closed a room. The background `/api/conversations` refresh used the client localStorage tracking ID, while the SSR list could have been resolved from the `mingle_uid`/`mingle_sid` cookie identity. When those identities diverged, the refresh queried a different anonymous user and did not fill the lightweight rows.
- User impact: The optimized list appeared quickly, but rows could look incomplete on first launch. Opening a room later updated preview state through the room path, making the message appear only after extra navigation.
- Resolution: Pass the SSR tracking identity into `ConversationList` and reuse it for client conversation refresh/mutation headers, falling back to localStorage only when SSR provided no identity. This keeps the fast initial shell while making the post-hydration summary refresh target the same user.
- Tests: `conversation-list.logic.test.ts` covers header construction preferring the SSR identity over the local fallback.

## 2026-05-25 - Native STT Stop Button Flicker

- Surface: `mingle-app/src/components/LivePhoneDemo/use-realtime-stt.ts`
- Issue: During native STT stop, the web hook optimistically moved the session to `idle` immediately after sending `native_stt_stop`, while the iOS native module stayed in a graceful stop window until `stop_recording_ack` or a timeout. Late native `running` status or transcript message events could then promote the web UI back to `connecting`/`ready` before the final native close event moved it back to `idle`.
- User impact: Pressing Stop could briefly show the mic as stopped, then running/connecting again, then stopped. Recording ultimately stopped, but the control visually flickered and made the action feel unreliable.
- Resolution: Added a stop-pending guard for native bridge status/activity handling. While `isStopping` or `nativeStopRequested` is true, the web layer now ignores native statuses and ready server messages that would re-enter a live UI state and suppresses transcript-activity promotion, while still allowing terminal idle/close/error and `stop_recording_ack` handling to complete.
- Tests: `scripts/devbox test --target app -- src/components/LivePhoneDemo/use-realtime-stt.logic.test.ts` covers the stop-pending status and activity-promotion guard.
## 2026-08-22 — Admin conversation history review controls

- Surface: `mingle-app/src/app/admin/conversations/page.tsx`, `mingle-app/src/app/admin/conversations/admin-conversations-view.tsx`
- Issue: The admin conversation history view loaded all matching rooms and messages in one unbounded page. The page did not own a scroll viewport, deleted records were difficult to distinguish, and source/translation language codes were shown without readable language names or flags. This made long user histories difficult to inspect and made targeted support investigations slow.
- User impact: Administrators could lose access to the lower part of a long transcript, could not efficiently find a phrase in the records already loaded, and could not distinguish deleted rooms, messages, and content at a glance.
- Resolution: Added a bounded full-height scroll viewport, server-side room pagination (10 rooms per page), per-room message pagination (200 messages per page), room sorting, separate room/message deletion filters, deletion status badges, and client-side search restricted to the currently loaded records. Source and translation contents now show a flag, role, and English language name.
- Tests: TypeScript validation was run; the repository still reports pre-existing errors in unrelated language-selector, dictionary, and dashboard BigInt test files.

## 2026-08-22 — Admin conversation room drill-down and infinite history

- Surface: `mingle-app/src/app/admin/conversations/page.tsx`, `mingle-app/src/app/admin/conversations/admin-conversations-view.tsx`, `mingle-app/src/app/admin/conversations/[conversationId]/messages/route.ts`
- Issue: Showing every conversation room and its transcript on one screen made room selection and long-history review cumbersome. The message order and room pagination also needed to match support-review behavior: newest records first, with older records revealed progressively below.
- User impact: Administrators had to scan large transcript blocks before finding the room they needed, and long conversations were difficult to review without loading excessive data at once.
- Resolution: The default view now shows a latest-first room list with 20 rooms per page. Selecting a room opens a dedicated transcript view ordered newest-to-oldest; it loads 200 messages initially and automatically requests the next 200 older messages as the transcript scroll reaches the bottom. Existing deletion filters, language badges, and loaded-content search remain available.

## 2026-08-22 — Admin conversation browser session cache

- Surface: `mingle-app/src/app/admin/conversations/admin-conversations-view.tsx`, `mingle-app/src/app/admin/conversations/[conversationId]/messages/route.ts`
- Issue: Reopening an already reviewed room caused the browser to wait for the same transcript pages again, making repeated support investigation unnecessarily slow.
- User impact: Administrators had to wait through repeated transcript loads when switching between a room and the room list or revisiting messages in the same tab.
- Resolution: Cached loaded room lists and transcript pages in versioned `sessionStorage` keys scoped by user, room, deletion filter, sort, and page. Cached transcript pages are shown immediately and older pages continue to append through the existing authenticated endpoint. The server no longer renders the first 200 messages on every room navigation; it returns the room shell and the client fetches or reuses the first page.

## 2026-08-22 — Admin conversation cache-first refresh

- Surface: `mingle-app/src/app/admin/conversations/page.tsx`, `mingle-app/src/app/admin/conversations/admin-conversations-view.tsx`, `mingle-app/src/app/admin/conversations/data/route.ts`
- Issue: Although transcript pages were cached in the browser, a hard refresh still waited for the server page to query the user, count rooms, load the room list, and aggregate message counts before the client could read `sessionStorage`.
- User impact: Returning to an already reviewed user still showed a slow blank/loading page, defeating the purpose of the browser cache.
- Resolution: Reduced the server page to an authenticated shell. The client now reads the scoped `sessionStorage` snapshot immediately, renders it, and refreshes the same data in the background through the authenticated admin data endpoint. The endpoint returns room metadata only; transcript pages continue to load lazily and use the existing per-room cache.

## 2026-08-22 — Admin cache-first update apply control

- Surface: `mingle-app/src/app/admin/conversations/admin-conversations-view.tsx`
- Issue: Background refreshes still replaced the visible cached room list or transcript as soon as the server response arrived, causing the page to re-render while an administrator was reviewing records.
- User impact: A support reviewer could see the currently displayed list or transcript shift unexpectedly after a refresh completed.
- Resolution: Cached data remains the visible source after a lookup. Background responses now update `sessionStorage` first and only enable the top-level `새 데이터 적용` button when the response differs. Clicking the button applies the cached snapshot to the visible list or transcript in one client-side render. The same behavior applies to the initial room message refresh and preserves lazy 200-message loading.

## 2026-08-22 — Admin room loading state during cache/API handoff

- Surface: `mingle-app/src/app/admin/conversations/admin-conversations-view.tsx`
- Issue: When navigating from the cached room list to a room, the previous request's data state could remain visible for one render while the new room request was still pending. If that stale snapshot had no selected room detail, the UI incorrectly showed `해당 대화방을 찾을 수 없습니다.` before the API response arrived.
- User impact: Operators could mistake a transient cache/API handoff state for a genuinely missing conversation.
- Resolution: Scoped rendered data and error state to the current request key. A room with no usable cached detail now stays in the loading state until the database response completes; only a completed response that confirms the room is absent shows the not-found message. Usable cached room detail remains visible while background refresh waits for manual application.

## 2026-08-23 — Admin conversation client-side controls

- Surface: `mingle-app/src/app/admin/conversations/page.tsx`, `mingle-app/src/app/admin/conversations/admin-conversations-view.tsx`, `mingle-app/src/app/admin/conversations/data/route.ts`, `mingle-app/src/app/admin/conversations/[conversationId]/messages/route.ts`
- Issue: Room sorting, deletion filters, and room pagination were coupled to the database lookup request, so changing a browsing control could trigger another server query and made the cached review experience less responsive.
- User impact: Administrators could not treat sorting and filtering like the existing client-side search over the already loaded support data.
- Resolution: The lookup now fetches the complete room metadata dataset and unfiltered message pages for the selected user. Room deletion filtering, message deletion filtering, sorting, and 20-room pagination run entirely in the browser over the cached/fetched data; the server is only contacted for user/room data retrieval and lazy 200-message pages.
- Tests: Targeted ESLint and TypeScript validation were run; the repository still reports the known unrelated test type errors in language-selector, dictionary, and dashboard BigInt files.

## 2026-08-23 — Admin conversation latest-message sorting

- Surface: `mingle-app/src/app/admin/conversations/admin-conversations-view.tsx`, `mingle-app/src/app/admin/conversations/data/route.ts`
- Issue: Room sorting included room update time, creation time, and title, but not the timestamp of the newest message.
- Resolution: Added a latest-message timestamp to the cached room metadata and a `최근 메시지 최신순` client-side sort option. Rooms without messages are placed after rooms with messages.

## 2026-08-23 — Admin conversation single-scroll cache-first room view

- Surface: `mingle-app/src/app/admin/conversations/page.tsx`, `mingle-app/src/app/admin/conversations/admin-conversations-view.tsx`
- Issue: The room view had both a page-level scroll area and a fixed-height transcript scroll area. Cache hydration also used a transition, so a repeat lookup could keep showing the loading state while the background database refresh was pending.
- User impact: Operators had to manage two scrollbars while reading a transcript and could wait for the database refresh instead of seeing the same user's cached room list immediately.
- Resolution: Removed the inner transcript scroll container and kept one full-height admin page scroll area. Older message loading now listens to that single page scroll position. Cached user data is applied synchronously as soon as the client starts, while the fresh response continues in the background and only enables the manual update control.

## 2026-08-24 — Admin conversation staged browser history

- Surface: `mingle-app/src/app/admin/conversations/page.tsx`, `mingle-app/src/app/admin/conversations/admin-conversation-lookup-form.tsx`, `mingle-app/src/app/admin/conversations/admin-conversations-view.tsx`, `mingle-app/src/app/admin/dashboard/page.tsx`
- Issue: The admin conversation review flow had an unnecessary dashboard entry point, and the initial external-user lookup could remain in browser history. Pressing Back from a room could therefore return to the pre-lookup screen instead of the room list.
- User impact: Operators could lose the loaded room list while navigating through a user’s history and had to repeat the lookup before continuing their review.
- Resolution: Removed the dashboard conversation button, changed external-user lookup navigation to replace the pre-lookup URL, and kept room selection as an explicit history push. Browser Back now moves from a room to its room list while preserving the loaded user context.

## 2026-09-02 — Short XR presentation goal split

- Surface: `mingle-app/public/legal/xr-short.html`
- Issue: The shortened XR presentation needed an additional third page to explain the two competing motivations behind the language-exchange problem. The existing centered slide treatment did not provide enough visual separation or emphasis for the two goals.
- User impact: Viewers could not immediately distinguish between wanting to make foreign friends and wanting to learn a foreign language, which weakened the problem framing in the short presentation.
- Resolution: Added a centered third slide with the `문제` kicker and `닭 vs 달걀 문제` title. Added a responsive two-column goal layout with larger type, separate accent treatments, gradient key-color bars, soft tinted panels, and mobile sizing that preserves the side-by-side comparison. Updated the static page counter to six slides; the existing slide navigation continues to derive the final count from the slide elements.
- Tests: Verified six top-level `.slide` elements, confirmed the requested page order and text, and ran `git diff --check`.

## 2026-09-02 — Short XR goal slide kicker alignment follow-up

- Surface: `mingle-app/public/legal/xr-short.html`
- Issue: The new third slide used centered content, but the absolutely positioned `문제` kicker still inherited the default left anchor from the generic slide-copy style.
- User impact: The kicker appeared on the left while the title and two goal cards were centered, creating a visible alignment inconsistency at the top of the slide.
- Resolution: Centered the goal slide kicker independently with a 50% anchor and horizontal translation. The rule applies across desktop and mobile layouts.
- Tests: Rechecked the third-slide DOM layout and ran `git diff --check`.

## 2026-09-02 — Short XR market comparison slide

- Surface: `mingle-app/public/legal/xr-short.html`, `mingle-app/public/legal/assets/`
- Issue: The shortened XR presentation needed a market-context page showing that multiple product categories already address parts of the foreign-friend and language-learning problem. A plain competitor list would not communicate the breadth of the market or keep the slide visually scannable.
- User impact: Without a compact market map, viewers could miss the distinction between language exchange, sincere voice conversation, global dating, and offline meetups, as well as the competitive context for Mingle.
- Resolution: Added a fourth slide with a left-aligned `시장` message and a right-side 2x2 category grid. Each category uses a distinct key color, soft tinted panel, and irregularly scattered local service icons without divider lines. Grouped K Friends, HelloTalk, Tandem, Hilokal, and Yeetalk under `언어교환`; Maum, Connecting, and Wakie under `진솔한 음성 대화`; Meeff, Azar, Tinder, and Yubo under `글로벌 데이팅`; and Timeleft and Meetup under `오프라인 모임`. Added local app artwork assets and updated the presentation count to seven slides.
- Tests: Verified the page-four text, category counts, local image loading, and `04 / 07` counter in the local browser at desktop and mobile sizes. Confirmed no viewport overflow and ran `git diff --check`.

## 2026-09-02 — Short XR market category simplification

- Surface: `mingle-app/public/legal/xr-short.html`
- Issue: The category panels on the market slide added visual weight that competed with the service icons and made the market map feel more like four separate cards than one comparison field.
- User impact: Viewers could focus on the panel decoration instead of quickly scanning the category names and the services grouped beneath them.
- Resolution: Removed category backgrounds, rounded-card treatment, shadows, glow ornaments, and corner dots. Kept the 2x2 placement, category names, per-category title colors, and irregular icon clouds as the only visual structure.
- Tests: Rechecked the market slide at desktop and mobile sizes, confirmed all 14 local icons load, and ran `git diff --check`.

## 2026-09-02 — Short XR market category spacing refinement

- Surface: `mingle-app/public/legal/xr-short.html`
- Issue: After simplifying the market slide to names and icons, category labels were left-aligned, the overall grid sat too close to the viewport edge, and the icon clouds left too much unused space inside each 2x2 area.
- User impact: The category groups felt visually unbalanced and the service icons had less emphasis than the market comparison needed.
- Resolution: Centered every category title, added balanced outer padding around the market grid, reduced the internal category and icon-cloud insets, and increased the title and icon scale while preserving the irregular positions and responsive 2x2 layout.
- Tests: Verified all four titles use centered alignment, all 14 local icons load, the `04 / 07` counter remains correct, page three remains centered, and the layout has no body overflow at desktop and mobile sizes.

## 2026-09-02 — Short XR language-exchange market proof page

- Surface: `mingle-app/public/legal/xr-short.html`, `mingle-app/public/legal/assets/logo-market-kfriends-blue.jpg`
- Issue: The market comparison needed to show the scale of the language-exchange category before the broader four-category map. The existing Kfriends artwork represented a separate service from the provided KFriends app, so the competitor set also needed both apps without conflating their download sizes.
- User impact: Viewers could not immediately see how many large language-exchange services compete in this space or distinguish the two similarly named KFriends products.
- Resolution: Added a centered fourth slide stating that many language-exchange services still do not solve the chicken-and-egg problem. Added a single horizontal row of six apps ordered by estimated Android downloads—HelloTalk, Tandem, Yeetalk, K-Friends, Hilokal, and Kfriends—with each app name and estimate on two lines. Added the provided blue KFriends artwork as a separate local asset and added it to the language-exchange group on the following market map slide. Removed residual logo shadows so the category areas remain visually flat.
- Tests: Verified the new page as `04 / 08`, the moved market map as `05 / 08`, six horizontal overview items, six language-category icons, local image loading, centered page-four content, no body overflow on desktop/mobile, and no browser console warnings or errors.

## 2026-09-02 — Short XR market category row refinement

- Surface: `mingle-app/public/legal/xr-short.html`
- Issue: The language-exchange proof page made the language-exchange group redundant on the following market map, while the remaining categories were still shown as a 2x2 side panel beside left-aligned copy.
- User impact: The market page did not read as a single centered comparison, and the three remaining competitive spaces were harder to scan as a sequence.
- Resolution: Removed the language-exchange category from the market map, centered the market kicker and title, and changed the remaining sincere voice conversation, global dating, and offline meetup groups to one horizontal row. Preserved the irregular icon scattering within each category and added responsive sizing for the three-column layout.
- Tests: Verified page `05 / 08` at desktop and mobile sizes, confirmed the three category titles and icon counts of 3/4/2, confirmed local image loading and no viewport overflow, and found no browser console warnings or errors.

## 2026-09-02 — Short XR download estimate refresh

- Surface: `mingle-app/public/legal/xr-short.html`, `mingle-app/public/legal/assets/logo-market-kof.png`
- Issue: The language-exchange proof page presented Android-only figures without making the platform scope clear. The final Kfriends entry also represented the smaller Bibimbap Story app, while KOF had a larger publicly visible Android footprint and was a better market comparison.
- User impact: The scale comparison understated several competitors and made the source scope of the figures ambiguous. The similarly named Kfriends entry could also distract from the more relevant KOF competitor.
- Resolution: Recalculated the rounded figures using public Android and iOS indicators where available: HelloTalk `약 7,000만+`, Tandem `약 3,500만+`, Yeetalk `약 1,100만`, K-Friends `약 450만`, Hilokal `약 170만`, and KOF `약 60만`. Replaced the Bibimbap Story Kfriends artwork with a local KOF icon, added a platform-scope caption, and increased the app-name and estimate type sizes while preserving the six-item horizontal row. KOF is marked as Google Play-based because no matching Apple App Store listing was found.
- Tests: Verified page `04 / 08` at desktop and mobile sizes, confirmed the six apps remain in descending order, confirmed all local images load, checked the page-five 3/4/2 category layout for regression, confirmed no viewport overflow, and found no browser console warnings or errors.

## 2026-09-02 — Short XR market title and spacing refinement

- Surface: `mingle-app/public/legal/xr-short.html`
- Issue: The market page title needed to explain the broader connection-market problem, while the scattered competitor icons sat too far below their category labels.
- User impact: The message was less specific than intended, and the large vertical gaps weakened the visual relationship between each category and its services.
- Resolution: Replaced the market title with the requested two-line statement about abundant services and recurring language barriers. Reduced the category logo-cloud inset for the three-column market row on desktop and mobile, preserving the irregular icon positions and centered layout.
- Tests: Verified page `05 / 08` at desktop and mobile sizes, confirmed the exact title text and three category titles, confirmed local image loading and no viewport overflow, and found no browser console warnings or errors.

## 2026-09-03 — Short XR goal resolution and flow cue

- Surface: `mingle-app/public/legal/xr-short.html`
- Issue: The new solution pages needed a clearer visual distinction between the language-learning goal that translation removes and the resulting conversation flow from that solved state.
- User impact: The original second goal looked equally active on the first solution page, and the relationship between the updated right-side message and the left-side social goal was not immediately apparent on the following page.
- Resolution: Added the existing `xr.html`-style red cross treatment to the first solution page's language-learning goal, reduced that goal's text opacity, and overlaid a large `통번역 제공` badge at its right edge. Added a large curved right-to-left arrow across the second solution page while preserving the two-column goal content and responsive layout.
- Tests: Verified pages `06 / 10` and `07 / 10` at desktop and mobile sizes, confirmed the cross, badge, and arrow render without viewport overflow, confirmed the updated right-side message remains visible, and checked for browser console warnings or errors.

## 2026-09-03 — Short XR cause and four-category market page

- Surface: `mingle-app/public/legal/xr-short.html`
- Issue: The shortened presentation needed a centered cause page after the two goal slides, with the language-exchange category restored as the first part of the broader service landscape. The existing three-category market page also left more separation between categories and scattered icons than necessary.
- User impact: The reason social-linking services have not provided translation was not stated before the presentation moved on, and the market comparison was less compact than the intended visual rhythm.
- Resolution: Added a new eighth slide with the requested centered cause title and a four-column market row ordered as language exchange, sincere voice conversation, global dating, and offline meetups. Reused the six language-exchange app icons from the download proof page, reduced the fifth-page category gap, and tightened its irregular icon distribution while preserving the flat category treatment and key colors. The four-column row becomes a responsive 2x2 layout on mobile.
- Tests: Verified pages `05 / 11` and `08 / 11` at desktop and mobile sizes, confirmed all category titles and 15 local icons load, confirmed the requested title and page order, confirmed no viewport overflow, and found no browser console warnings or errors.

## 2026-09-03 — Short XR AI requirement problem page

- Surface: `mingle-app/public/legal/xr-short.html`
- Issue: The shortened presentation needed to explain why existing AI could not satisfy the demanding requirements of a social-linking conversation before presenting the solution.
- User impact: The transition from the market and cause slides to the proposed translation service lacked a concrete explanation of the technical and cost barriers.
- Resolution: Added a centered ninth slide with the requested problem kicker and title, followed by seven compact requirement cards covering continuous translation, speech recognition, multilingual ability, real-time translation, language switching, speaker separation, and price. The cards use a responsive three-column layout on desktop and a readable single-column layout on mobile.
- Tests: Verified page `09 / 12` at desktop and mobile sizes, confirmed all seven labels and descriptions, confirmed the title is centered, confirmed no viewport overflow, and found no browser console warnings or errors.

## 2026-09-03 — Short XR AI cost and performance page

- Surface: `mingle-app/public/legal/xr-short.html`
- Issue: The new AI requirement page needed a follow-up explanation of why existing translation services still fall short on price and practical conversation performance.
- User impact: The presentation moved directly from the seven requirement gaps to the solution without showing concrete examples of the current service limitations.
- Resolution: Added a new tenth slide based on page nine of `xr.html`, preserving its original cause kicker, title, and four service cards for Felo Translator, Google Translator, Apple Translator, and Papago. The existing responsive tool-card styles are reused, and the page counter now reflects 13 total slides.
- Tests: Verified page `10 / 13` at desktop and mobile sizes, confirmed all four service logos and descriptions load, confirmed the title and card stack remain within the viewport, and found no browser console warnings or errors.

## 2026-09-03 — Short XR page 8 icon scale refinement

- Surface: `mingle-app/public/legal/xr-short.html`
- Issue: The four-category service landscape page still felt sparse because its scattered app icons were too small for the available category areas.
- User impact: The service clusters read as disconnected points, weakening the comparison between each category and the apps inside it.
- Resolution: Increased the page-eight category icons to approximately 1.5 times their previous size while preserving their irregular positions, so the existing centers naturally produce tighter spacing. Applied the same scale increase to the responsive mobile layout while keeping the four-category page as a 2x2 grid.
- Tests: Verified page `08 / 13` at desktop and mobile sizes, confirmed all 15 local icons load, checked that the enlarged clusters stay within their category areas and the viewport, and found no browser console warnings or errors.

## 2026-09-03 — Short XR page 9 compact requirement cards

- Surface: `mingle-app/public/legal/xr-short.html`
- Issue: The eight AI requirement details became too wide and left excessive empty space after the speaker-separation item was split into separate speech and speaker separation gaps.
- User impact: The requirement comparison felt sparse, and the distinction between sentence segmentation and multi-speaker separation was not visible.
- Resolution: Reworked the ninth slide into a compact four-column desktop grid with narrower cards, kept a single readable column on mobile, and split the former `발화 분리` item into `발화 분리 — 문장 단위로 끊어주질 않음` and `발화자 분리 — 여럿이 말해도 분리가 안됨`.
- Tests: Verified page `09 / 13` at desktop and mobile sizes, confirmed all eight labels and descriptions in order, confirmed no viewport overflow, and found no browser console warnings or errors.

## 2026-09-03 — Short XR page 7 arrow alignment

- Surface: `mingle-app/public/legal/xr-short.html`
- Issue: The page-seven flow arrow was drawn across most of both goal cards, used a gradient, and did not visually stay within the space between the two goals.
- User impact: The arrow competed with the goal copy and made the intended right-to-left transition feel imprecise.
- Resolution: Changed the arrow to a solid red stroke and recalculated its path from the right card's inner-left 10% point to the left card's inner-right 10% point. The geometry is recalculated on load and viewport changes so the relationship remains correct across desktop and mobile layouts.
- Tests: Verified page `07 / 13` at desktop and mobile sizes, confirmed the solid red stroke and endpoint alignment against both goal boxes, confirmed no viewport overflow, and found no browser console warnings or errors.

## 2026-09-03 — Short XR AI capability comparison pages

- Surface: `mingle-app/public/legal/xr-short.html`
- Issue: The AI requirement problem page needed a ninth capability to explain the text-only limitation of existing voice interpretation, and the following page needed to present the corresponding AI-enabled solution capabilities in the same visual language.
- User impact: Voice interpretation was missing from the requirement comparison, the price item used a negative label after the comparison shifted toward value, and the solution transition did not directly map the nine problem requirements to nine achievable capabilities.
- Resolution: Added `음성 통역 — 텍스트밖에 출력 안됨` to page nine and renamed `비싼 가격` to `가성비`. Changed the shared requirement grid to three columns, producing a 3x3 layout for the nine desktop cards while retaining a single readable column on mobile. Replaced the former page-ten service-cost list with a copied requirement-card layout using the `해결책` kicker, the requested AI title, and the nine solution pairs for continuous translation, real-time translation, voice interpretation, speech recognition, multilingual ability, language switching, speech separation, speaker separation, and value.
- Tests: Verified pages `09 / 13` and `10 / 13` at desktop and mobile sizes, confirmed all nine labels and descriptions on both pages, confirmed the desktop cards form three equal columns and three rows, confirmed the exact solution title and kicker, confirmed no viewport overflow, and found no browser console warnings or errors.

## 2026-09-03 — Short XR requirement card width refinement

- Surface: `mingle-app/public/legal/xr-short.html`
- Issue: Changing the requirement grid from four columns to three left the full 1080px media width in place, so each card became substantially wider than the preceding requirement cards.
- User impact: The 3x3 comparison lost the compact card rhythm established on the earlier page, and the larger cards made the requirement groups feel too spread out.
- Resolution: Constrained the shared requirement grid to a centered maximum width of 810px. This keeps the three-column desktop cards at approximately their previous 260px width while preserving the 3x3 structure and letting the mobile layout continue to use the full responsive content width.
- Tests: Verified pages `09 / 13` and `10 / 13` at desktop and mobile sizes, confirmed centered desktop cards at approximately 261px each, confirmed three rows and three columns on desktop, confirmed all nine cards remain full-width and readable on mobile, confirmed no viewport overflow, and found no browser console warnings or errors.

## 2026-09-03 — Short XR page 7 arrow vertical alignment

- Surface: `mingle-app/public/legal/xr-short.html`
- Issue: After the arrow endpoints were shortened to the inner edges of the two goal cards, the arrow remained anchored near the cards' top edge instead of sitting at the visual center of the lower content.
- User impact: The arrow looked disconnected from the two messages and made the intended right-to-left flow cue feel top-heavy.
- Resolution: Centered the arrow element vertically against the goal-card row with a 50% anchor and vertical translation. Updated the SVG path baseline and control points so the red arrow stroke itself, including its head, sits at the cards' vertical midpoint across responsive sizes.
- Tests: Verified page `07 / 13` at desktop and mobile sizes, confirmed the arrow center matches the goal-card center, confirmed the short red path and inner-edge endpoints remain intact, confirmed no viewport overflow, and found no browser console warnings or errors.

## 2026-09-03 — Short XR page 5 market icon density

- Surface: `mingle-app/public/legal/xr-short.html`
- Issue: The three-category market page used smaller app icons and wider visual gaps than the later four-category market page, making the earlier comparison feel sparse and inconsistent.
- User impact: The voice conversation, global dating, and offline meetup groups received less visual emphasis, and the relationship between each category and its services was weaker than on page eight.
- Resolution: Reused page eight's enlarged icon scale, irregular positions, tighter cloud inset, and reduced category gap for page five while retaining its three-column layout and removing the language-exchange category from that copied structure. Synchronized the static page counter with the user's removal of the redundant former solution-proof page, bringing the current deck fallback count to 12.
- Tests: Verified pages `05 / 12` and `08 / 12` at desktop and mobile sizes, confirmed page five contains only the three requested categories and nine local icons, confirmed page-five icon dimensions match page eight's corresponding groups, confirmed the three-category row remains centered and within the viewport, confirmed no viewport overflow, and found no browser console warnings or errors.

## 2026-09-03 — Short XR requirement order alignment

- Surface: `mingle-app/public/legal/xr-short.html`
- Issue: The ninth-page problem cards used a different order from the corresponding solution cards on page ten, so related capabilities did not line up when the two pages were compared.
- User impact: Viewers had to mentally remap the requirement pairs instead of scanning the problem and solution pages in the same sequence.
- Resolution: Reordered page nine to match page ten exactly: continuous translation, real-time translation, voice interpretation, speech recognition, multilingual ability, language switching, speech separation, speaker separation, and value. Preserved the page-nine title and descriptions already customized by the user.
- Tests: Verified pages `09 / 12` and `10 / 12` at desktop and mobile sizes, confirmed the nine title sequences match exactly, confirmed the desktop 3x3 grids and mobile single-column layout remain intact, confirmed no viewport overflow, and found no browser console warnings or errors.

## 2026-09-03 — Short XR page 7 arrowhead visibility

- Surface: `mingle-app/public/legal/xr-short.html`
- Issue: The page-seven arrow was correctly positioned at the goal-card center, but its arrowhead wings were too narrow and one wing visually blended into the curved stem.
- User impact: The direction cue could be read as an incomplete or uneven arrow, reducing the clarity of the right-to-left flow between the two messages.
- Resolution: Expanded the arrowhead rise and drop to approximately twice their previous angles while keeping the arrow's position, solid red color, curved stem, and inner-edge endpoints unchanged. Updated the static SVG fallback to match the responsive JavaScript-generated geometry.
- Tests: Verified page `07 / 12` at desktop and mobile sizes, confirmed both arrowhead wings are visibly separated from the stem, confirmed the arrow remains centered between the goal cards, confirmed no viewport overflow, and found no browser console warnings or errors.

## 2026-09-03 — Short XR requirement bar color separation

- Surface: `mingle-app/public/legal/xr-short.html`
- Issue: The requirement cards on pages nine and ten shared an orange-to-red gradient bar, so the problem and solution pages did not have distinct visual states.
- User impact: The problem/solution contrast was weaker, and the gradient added unnecessary visual noise to each card's left edge.
- Resolution: Removed the gradient from the shared bar style. Page nine now uses a solid red bar (`#dc2626`), while page ten uses the solid primary brand accent (`var(--accent)`) so the two pages remain visually related but clearly differentiated.
- Tests: Verified pages `09 / 12` and `10 / 12` at desktop and mobile sizes, confirmed all nine bars on each page use solid colors with no background image, confirmed the expected red and accent RGB values, confirmed no viewport overflow, and found no browser console warnings or errors.

## 2026-09-03 — Short XR solution bar blue refinement

- Surface: `mingle-app/public/legal/xr-short.html`
- Issue: The solution page's yellow requirement bars felt too close to the warm page palette and did not provide enough contrast with the problem page's red bars.
- User impact: The problem/solution distinction felt less crisp, and the solution cards did not convey a calm, reliable finish.
- Resolution: Replaced the solution-page bars with a solid blue solution accent (`#2563eb`) while keeping the problem-page bars solid red and removing gradients from both states.
- Tests: Verified pages `09 / 12` and `10 / 12` at desktop and mobile sizes, confirmed page nine uses solid `rgb(220, 38, 38)` bars and page ten uses solid `rgb(37, 99, 235)` bars, confirmed no viewport overflow, and found no browser console warnings or errors.

## 2026-09-03 — Short XR video start position

- Surface: `mingle-app/public/legal/xr-short.html`
- Issue: The page-twelve Mingle video needed to open at the relevant moment from the shared YouTube link, but the watch-page `t=43s` syntax is not the correct parameter for an embedded player.
- User impact: Viewers would begin at the default video position instead of the intended 43-second context.
- Resolution: Added YouTube's embed-compatible `start=43` parameter to the existing `/embed/Esq6htnQj98` source while preserving the inline-playback and related-video settings.
- Tests: Verified page `12 / 12` through the local HTTP preview, confirmed the iframe keeps video ID `Esq6htnQj98` and resolves `start=43`, and confirmed no viewport overflow.

## 2026-09-03 — Short XR default video playback rate

- Surface: `mingle-app/public/legal/xr-short.html`
- Issue: The page-twelve video needed to begin at the requested 43-second point and play at a faster default speed for the presentation flow.
- User impact: Viewers would otherwise need to manually change the YouTube playback speed every time they started the video.
- Resolution: Enabled the YouTube IFrame Player API for the short-video iframe, set the page origin dynamically for both local HTTP previews and production, and apply a `1.5x` playback rate in the player's ready callback. The existing `start=43` position remains unchanged.
- Tests: Verified page `12 / 12` through the local HTTP preview, confirmed the iframe retains video ID `Esq6htnQj98`, resolves `start=43`, includes `enablejsapi=1` and the current HTTP origin, confirmed the YouTube API initializes, and confirmed no viewport overflow.

## 2026-09-03 — Short XR voice conversation bridge page

- Surface: `mingle-app/public/legal/xr-short.html`
- Issue: The short presentation needed to show the initial workaround of keeping a voice-conversation service open alongside Mingle before presenting the final integrated experience.
- User impact: The story moved from the requirement solution directly to the final video, leaving the practical two-service usage step unexplained.
- Resolution: Added a new thirteenth slide after the video slide with the `밍글` kicker and the requested title, reusing the original page-fourteen HelloTalk Voiceroom and Mingle image stack from `xr.html`. The runtime counter derives its total from the slide count.
- Tests: Verified page `13 / 13` at desktop and mobile sizes, confirmed both local images load and the stacked layout stays within the slide, confirmed the page counter and total slide count, confirmed no viewport overflow, and found no browser console warnings or errors.

## 2026-09-03 — Short XR customer reaction page

- Surface: `mingle-app/public/legal/xr-short.html`
- Issue: The short presentation needed to follow the two-service workaround with direct customer evidence from people who had tried Mingle.
- User impact: The presentation lacked a concise proof point showing why the experience was positively received after the workaround and feature comparison.
- Resolution: Added a new fourteenth slide after the voice-conversation bridge page with the `고객 반응` kicker, the requested title, and three right-side reaction cards based on the original page-fifteen response layout from `xr.html`. Replaced the source reactions with the requested continuous-translation, cross-language comprehension, and speech-recognition statements, and updated the static page counter to `01 / 14`.
- Tests: Verified page `14 / 14` at desktop and mobile sizes, confirmed all three reaction cards and their exact text render in the right-side stack, confirmed the card stack stays within the slide, confirmed no viewport overflow, and found no browser console warnings or errors.
