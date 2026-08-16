# UI/UX Codex Thread History

## 2026-08-17 - My Page Usage Summary

- Surface: My Page hamburger menu and usage detail panel.
- Issue: Users had no in-app view of their accumulated speech activity, message volume, or conversation count.
- User impact: Personal usage history was difficult to understand, and there was no way to compare speech recognition activity with translation language usage.
- Resolution: Added a Usage menu item and a slide-in usage panel with total time, total messages, total conversation rooms, speech-language time/message breakdowns, and translation-language message counts. The panel keeps the existing edge-swipe back interaction and loads private usage data only when opened.

## 2026-08-16 - Admin Dashboard Daily Metric Loading Delay

- Surface: `mingle-app/src/app/admin/dashboard/page.tsx`, `mingle-app/src/lib/admin-dashboard-query.ts`, `mingle-app/prisma/schema.prisma`
- Issue: Every dashboard request recomputed signup count, DAU, message count, usage seconds, and four latency series with six aggregate queries over the production tables. Switching between the 7-day, 30-day, and 90-day ranges repeated the same historical work and left the administrator waiting on the loading state.
- User impact: The service dashboard felt slow and made repeated date-range inspection impractical, even though the historical daily values did not change during normal use.
- Resolution: Added the `admin_dashboard_daily_metrics` daily snapshot table, persisted all calculated values for historical dates on first request, and served subsequent range changes from a primary-key date lookup. The current UTC day is refreshed on each request so live admin numbers remain current; completed dates remain stable snapshots. The existing chart, cumulative view, table layout, and loading copy were preserved.
- Tests: Added cache-hit, missing-history population, and current-day refresh coverage in `admin-dashboard-query.test.ts`; the targeted dashboard metric test suite passes.

## 2026-08-13 - My Page Safety History Empty and Auth States

- Surface: My Page hamburger menu safety management panel.
- Issue: The panel requested block and report history with `Promise.all`, so an unauthenticated 401 response from either endpoint replaced both sections with the generic `관리 내역을 불러오지 못했습니다.` message. This was especially confusing because My Page remains visible while the translator auth gate is disabled.
- User impact: Users could not distinguish an empty history from a request failure, and one failed collection prevented the other collection from being displayed.
- Resolution: Load block and report history independently. The panel now always renders both management sections, shows an explicit sign-in state when the account session is unavailable, keeps an empty state for authenticated users with no records, and limits the generic error state to the collection that actually failed.

## 2026-08-14 - Profile Primary Speech Language

- Surface: My Page profile edit panel.
- Issue: The profile form asked for a country even though Mingle uses the value to represent the user's speech-input language for STT.
- User impact: The field's meaning did not match the product behavior, and users could select only the small primary-UI locale subset rather than the full speech-language catalog.
- Resolution: Renamed the visible field to primary language, reused the shared STT language catalog and flags, localized the language names for the active UI locale, and updated profile validation to accept every selectable STT language. Chinese Simplified and Chinese Traditional remain separate selectable speech variants, matching the existing STT selector.

## 2026-08-14 - My Page Profile Header Counts and Alignment

- Surface: My Page profile summary header.
- Issue: The header displayed a placeholder posts count even though post creation is not available, while the follower/following counts and profile identity block felt horizontally unbalanced.
- User impact: The placeholder suggested an unavailable feature, and the profile photo, name, and bio appeared too far left relative to the intended composition.
- Resolution: Removed the posts count, changed the stats row to follower/following only with a slight left adjustment, and added a small right inset to the profile photo, name, and bio.

## 2026-08-13 - Profile Edit Swipe Snap Behavior

- Surface: `mingle-app/src/components/my-page.tsx` profile edit panel.
- Issue: A short rightward swipe could leave the profile edit panel resting at an intermediate horizontal offset instead of returning to its fully open position or closing completely.
- User impact: The panel looked partially dismissed and required an extra gesture, making the back interaction feel unreliable.
- Resolution: Added explicit drag-settle behavior. Swipes below the distance and velocity thresholds animate back to `x: 0`, while qualifying swipes run the full exit animation before closing. The animation controls are guarded by the panel lifecycle to avoid starting animations after unmount.

## 2026-08-07 - Messenger Bottom Tabs and My Page Draft Surface

- Surface: `mingle-app/src/components/conversation-list.tsx`, `mingle-app/src/components/bottom-tab-bar.tsx`, `mingle-app/src/components/my-page.tsx`
- Issue: The conversation list used a full-width start-conversation footer and did not provide persistent navigation to a personal page.
- User impact: Users could not switch between the conversation list and a personal page without leaving the main flow, and the primary new-conversation action occupied the entire bottom edge.
- Resolution: Replaced the footer with a two-tab bottom bar, moved search slightly left, added a chat-plus new-conversation action in the header, and added an Instagram-style personal-page header with a disabled lower placeholder. Profile editing, sharing, settings, and post uploads remain out of scope for this draft.

## 2026-08-07 - Remove My Page Plus Action Placeholder

- Surface: `mingle-app/src/components/my-page.tsx`
- Issue: The My Page header still displayed an inactive Instagram-style plus button even though Mingle has no post-creation feature in this scope.
- User impact: The disabled control suggested an unavailable posting action and occupied an unnecessary interactive-looking area.
- Resolution: Removed the plus button while retaining a non-interactive 40px layout spacer so the profile title stays centered and the menu action remains aligned.

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

## 2026-08-07 - Live STT navigation from My Page to conversation list

- Surface: Native app bottom-tab navigation between My Page and the conversation list.
- Issue: When STT was running, selecting the conversation-list tab after visiting My Page reopened the active chat room instead of showing the list.
- User impact: Users could not continue using the app outside the running STT room.
- Resolution: Mark the My Page-to-list tab transition as an intentional list request, consume the marker on the list screen, and suppress only the automatic live-room/remount restoration for that transition.
- Scope: App-start recovery and other native remount restoration paths remain unchanged.

## 2026-08-07 - Conversation header action spacing

- Surface: Search and new-conversation actions in the conversation-list header.
- Issue: The search and new-conversation icons were visually too close together, while their tap targets were limited to the existing fixed button size.
- User impact: The adjacent actions were harder to distinguish and tap comfortably.
- Resolution: Replaced the fixed 40px button boxes with padding-based 44px minimum tap targets. Icon sizes remain unchanged, and no margin was added.

## 2026-08-07 - Profile share screen

- Surface: My Page profile actions and the new profile-share route.
- Issue: The profile-share action was only a visual placeholder, so users could not share their profile or copy its link.
- User impact: The Instagram-style profile surface had no usable profile-sharing flow.
- Resolution: Added a dedicated profile-share screen with a gradient layout, back navigation, left-edge swipe-back support, native navigation state reporting, Web Share API fallback, and clipboard link copying. QR scanning, QR rendering, and download remain explicit coming-soon actions for this iteration.

## 2026-08-07 - Profile share panel transition

- Surface: `mingle-app/src/components/profile-share-screen.tsx`
- Issue: Opening the profile-share route replaced the My Page view immediately, unlike the existing conversation and hamburger-menu panels that enter from the right. The existing swipe-back handler only detected the completed gesture, so the panel did not visually follow the user's finger while closing.
- User impact: Profile sharing felt like a sudden page change rather than a consistent in-app panel transition, and swipe-back dismissal could feel abrupt.
- Resolution: Added the shared right-to-left entrance/exit timing, made the profile-share view a right-side motion panel, and enabled horizontal drag dismissal. A sufficiently long or fast right swipe now follows the gesture, completes the slide-out, and then returns to My Page; shorter swipes spring back into place.

## 2026-08-07 - Live STT preview in conversation list

- Surface: `mingle-app/src/components/LivePhoneDemo/LivePhoneDemo.tsx`, `mingle-app/src/components/conversation-list.tsx`
- Issue: While STT was running, the conversation list continued to show the previous finalized utterance until the current speech segment was committed. Users who left the room could not tell that speech recognition was actively progressing.
- User impact: The list felt stale during an active conversation, especially when users navigated away from the room while continuing to speak.
- Resolution:
  - Added a separate live-preview callback sourced from the room's `liveUtterances` state.
  - Debounced interim updates to 250ms so rapid STT revisions do not cause excessive list renders.
  - Rendered the interim text only in the list/search row, with muted italic styling and a trailing ellipsis.
  - Kept interim text out of `ConversationChannelSummary`, persistence, message counts, and recency sorting. The existing finalized-utterance callback remains the only path that updates the stored summary and reorders the list.
  - Cleared the preview when the utterance is finalized, discarded, or the live STT buffer is emptied.

## 2026-08-07 - Profile share swipe animation lifecycle guard

- Surface: `mingle-app/src/components/profile-share-screen.tsx`
- Issue: A horizontal swipe ending while the profile-share panel was being removed could call Framer Motion's `controls.start()` after the component had unmounted.
- User impact: The browser console showed a lifecycle warning during swipe navigation, and the return animation could race with route teardown.
- Resolution: Track the panel mount lifecycle and guard both drag-snapback and back-navigation animation calls. Navigation now runs only if the panel remains mounted after the exit animation completes.

## 2026-08-14 - App-start authentication gate and My Page sign-out

- Surface: App startup conversation list and the My Page menu/settings panel.
- Issue: The existing authentication UI was mounted only inside a conversation room, so an unauthenticated user could see the conversation list and did not encounter sign-in until creating or opening a room. The My Page menu also had no sign-out action.
- User impact: Authentication felt delayed and inconsistent with the account-required translator flow, and users had no clear way to end the current session from My Page.
- Resolution:
  - Reused the existing authentication surface as an app-start gate over the conversation list while the session is loading or unauthenticated. Authenticated users pass through automatically without an extra login step.
  - After authentication becomes available, the conversation list performs a fresh session-backed refresh so a guest/empty initial list does not remain visible after sign-in.
  - Added a sign-out action to the My Page menu/settings panel. Sign-out returns to the native-aware conversation-list tab root and suppresses stale room restoration.

## 2026-08-14 - Public username (handle) separate from internal user ID

- Surface: Profile editing, My Page, Explore search, public user profiles, and profile sharing.
- Decision: Store the public identifier as `username` and call it `아이디` in the Korean UI. Render it as `@username`. Keep `User.id` as the private, immutable database identifier and do not use `id` as the public field name.
- Naming: The editable visible name remains `displayName` and is labeled `이름` in the UI. The existing `name` field is retained as the authentication-provider/legacy source name and fallback; it is not the public handle.
- Rules: Usernames are normalized to lowercase and may contain only ASCII letters, numbers, `_`, and `.`; the stored value is limited to 30 characters and is now required after the follow-up backfill migration below.
- Resolution: Added unique username persistence, profile editing, username/name search, `@username` display on user surfaces, and profile routes that accept either the existing internal ID or the new username for backward compatibility.

## 2026-08-14 - Explore search top spacing

- Surface: Explore tab search field.
- Issue: The search field started immediately below the safe-area inset, so it felt attached to the status bar and visually tighter than the Instagram-like reference.
- Resolution: Added a 12px top inset after the safe-area padding while keeping the existing field size, horizontal padding, focus state, and bottom spacing unchanged.

## 2026-08-14 - My Page safety management subpages

- Surface: My Page hamburger menu, blocked-user management, and report history.
- Issue: The hamburger panel rendered both potentially long management lists inline, making the menu act like a history page instead of a compact navigation surface.
- Resolution: Replaced the inline lists with two menu rows that open dedicated right-to-left subpages. The blocked-user row uses the `UserRoundX` icon, the report-history row uses the `Siren` icon, and each subpage supports the existing back button and horizontal swipe-to-dismiss behavior. Unblocking and report-reply viewing remain available inside their respective subpages.

## 2026-08-14 - My Page hamburger swipe dismissal

- Surface: My Page hamburger menu and its management subpages.
- Issue: A short rightward swipe could leave the panel partially displaced instead of settling to a stable open or closed state.
- Resolution: Added the same snap-back/snap-dismiss behavior used by the profile edit panel. Swipes below the dismissal threshold animate back to the left edge, while qualifying swipes animate fully off-screen before closing the panel.

## 2026-08-14 - App language setting and social-surface localization

- Surface: My Page hamburger menu, app-language subpage, profile editing, profile sharing, Explore search, public user profiles, and block/report management.
- Product distinction: The app language is separate from the profile's primary speech language. The profile setting continues to control the user's STT language identity; the new app-language setting controls the Mingle interface only.
- Issue: The app had a primary UI locale catalog, but there was no user-facing way to change it from My Page. Several recently added profile and social screens also used Korean/English inline fallbacks, so switching the route locale could leave parts of the new UI untranslated.
- User impact: Users could not choose their preferred Mingle interface language, and the profile/social surfaces could show mixed-language labels, errors, and accessibility text.
- Resolution:
  - Added an `App language` row to the hamburger menu. It opens a right-to-left subpage with exactly the 15 `PRIMARY_UI_LOCALES` options, preserving the existing panel back button and swipe-dismiss interaction.
  - Selecting a language stores the preference locally and replaces the current `/{locale}/...` route with the selected locale so the server dictionary and UI re-render immediately. The root sync also restores the stored app locale on the next app launch and updates the document language tag.
  - Added supplemental locale copy for the app-language screen and the recently added profile edit, profile share, Explore search, public profile, blocked-user, and report-history surfaces across all 15 primary UI locales.
  - Kept the profile editor's `Primary language`/STT language selector backed by `STT_LANGUAGE_OPTIONS`; it is intentionally not reused for the app-language list.
- Tests: Added coverage that the 15 app-language options and the new social/profile copy resolve for every primary UI locale. Existing i18n and lint checks pass; the repository's full `tsc --noEmit` still reports the two previously known unrelated test typing issues in `language-selector.logic.test.ts` and `get-dictionary.test.ts`.

## 2026-08-14 - Profile primary-language picker and default public handle

- Surface: Profile editing's `Primary language` field, My Page profile summary, and account creation/sign-in persistence.
- Issue: The profile editor used a compact three-column language grid that did not match the conversation-room language picker and was difficult to scan across the full STT language catalog. Empty bios also showed a sample sentence, making an unset profile look populated. Public `@username` values were optional, so newly created or legacy users could be missing the identifier used by Explore and public profiles.
- Resolution:
  - Reused the conversation-room language selector's localized language names, flags, card layout, search normalization, locale-aware sorting, and English A-Z sorting for the profile's single primary STT language choice.
  - Removed the bio textarea placeholder and stopped rendering the sample bio on My Page when the user has not written one.
  - Added deterministic default public usernames for email signup, OAuth/native sign-in, and anonymous tracking-user creation. Existing null usernames are backfilled from the account name/email with collision suffixes, then the database field is made `NOT NULL`; users can still change the value later within the existing character rules.
- Data contract: `User.id` remains the private database identifier; `User.username` is the required public handle, and `User.displayName` remains the editable visible name.

## 2026-08-14 - Profile language selector horizontal overflow

- Surface: Profile edit screen's primary speech-language selector.
- Issue: The selector was copied visually from the conversation-room picker, but it was nested inside a native `fieldset`. The fieldset's browser default minimum-content width prevented the search/sort flex row from shrinking to the profile panel's content width, so the edit screen could scroll horizontally on narrow devices.
- Resolution: Reset the fieldset and selector wrappers to `min-width: 0`/`max-width: 100%`, constrain the search/sort row and language list, truncate sort labels when needed, and explicitly disable horizontal overflow on the profile panel's vertical scroller. The conversation-room selector remains unchanged.

## 2026-08-14 - Profile edit language list nested scrolling

- Surface: Profile edit screen's primary speech-language selector.
- Issue: The profile screen's main vertical scroller contained a second vertical scroller inside the language selector. This made browsing the full language list awkward and required the user to switch between two scroll areas. The selector also carried the conversation-room picker's cream-colored surface styling into the otherwise white profile edit screen.
- Resolution: Removed the selector's fixed height and inner vertical overflow so the profile edit screen's single main scroller covers the entire form. Kept the conversation-room selector's visual language—rounded cards, search field, sort controls, language rows, and selection indicator—while using a white and neutral-gray palette for the profile edit context.

## 2026-08-14 - My Page settings subpage dismissal and profile share loading

- Surface: My Page hamburger settings, blocked-user/report/app-language subpages, profile sharing, and the empty post area.
- Issue: Opening a settings subpage removed the hamburger panel from the DOM. A right-swipe dismissal then made the subpage exit and the parent panel re-enter at the same time, which could leave a stale fixed layer over the My Page header; the hamburger button stopped responding until a tab transition reset the stack. Profile sharing also waited for a cold client navigation to the share route before showing its panel.
- Resolution:
  - Keep the hamburger settings panel mounted beneath the active subpage and animate only the subpage out on a right swipe, so the swipe returns to a usable menu instead of closing both layers.
  - Prefetch the profile-share route while My Page is mounted so tapping `Share profile` can enter the already-prepared panel without the full route delay.
  - Changed QR-only coming-soon feedback to `QR features are not available yet` (localized), and removed the unused coming-soon message from the empty post area.

## 2026-08-14 - Login agreement checkbox consistency

- Surface: 2.0.0 native login agreement panel.
- Issue: The all-required-agreements control used a rose circular background and a literal check character, while the privacy and terms controls used browser-native checkbox rendering. The three controls therefore had different shapes, check marks, and colors on iPhone.
- User impact: The all-agreements state looked visually unrelated to the two required agreement rows, and the inconsistent check treatment made the selected state harder to scan.
- Resolution: Replaced the mixed checkbox visuals with one shared rounded-square checkbox treatment. The all-agreements control now uses the same check icon as the two required rows, with a Mingle amber selected state and a neutral transparent unselected state. Native checkbox inputs remain keyboard- and screen-reader-accessible but are visually hidden.

## 2026-08-14 - Profile identity naming simplification

- Surface: OAuth/native account creation, profile editing, My Page, Explore search, public profiles, profile sharing, and legacy-compatible user persistence.
- Issue: The product exposed three overlapping concepts—internal `User.id`, public `username`, and both `name`/`displayName` for the visible profile name. This made it unclear which value users should share, search, or edit, and made the OAuth-provided name appear separate from the editable name.
- Product decision: `User.id` remains the internal database key. The public, unique user ID is stored as `handle` and displayed as `아이디`/`@handle` in the Korean UI. The existing `name` column is the single visible name: OAuth's initial name is saved there, profile editing updates that same value, and later logins do not overwrite the user's edit. The duplicate `display_name` concept is removed from the 2.0.0 UI and schema.
- Resolution: Renamed the 2.0.0 Prisma/API/client contract from `username` to `handle`, removed `displayName` usage, routed profile/search/social surfaces through `name` plus `handle`, and kept admin-login `username` terminology isolated because it is unrelated to user profiles.
- Compatibility: The migration installs an `app.app_users` insert trigger that derives a unique handle when the shared 1.1.4 server inserts a user without knowing the new column. Existing `name` data is preserved, and any earlier `display_name` data is used only when `name` is empty before the duplicate column is removed.

## 2026-08-14 - Hide native banner ads on login

- Surface: Native iOS/Android login and authentication routes.
- Issue: The native AdMob banner could remain visible while the WebView was transitioning from the conversation list into the login screen. The ad made the authentication surface feel like an accidental continuation of the signed-in conversation layout.
- User impact: Login looked visually cluttered and the banner occupied space on a screen that should focus on account entry and agreement actions.
- Resolution: Treat localized and non-localized authentication paths as an explicit native-banner hidden state. The native banner is now hidden immediately from the current WebView pathname, and the WebView receives zero banner inset while authentication is active. Conversation-list and conversation-room ad behavior remains unchanged.

## 2026-08-14 - Hide the banner behind the conversation-list authentication gate

- Surface: The native conversation-list authentication gate shown before Apple/Google sign-in.
- Issue: The login UI is an `authOnly` overlay rendered over `/ko/conversations`, not a separate `/ko/auth` pathname. The native banner pathname guard therefore continued to classify the screen as the conversation list and left the AdMob banner visible behind the login surface.
- User impact: The login screen still showed the banner after the earlier route-based hide fix, making the authentication layout look unfinished and reducing its usable space.
- Resolution: The conversation list now posts the native banner zone as `hidden` whenever the session is loading or unauthenticated, and returns it to `list` only after authentication succeeds. Search and conversation overlays retain the existing hidden behavior.

## 2026-08-15 - Keep authentication banner hiding authoritative

- Surface: The 2.0.0 native login gate rendered over the conversation-list route.
- Issue: TestFlight build 67 still showed a production AdMob banner above the login controls. The web authentication gate correctly posted the `hidden` banner zone, but the native URL observer still saw `/ko/conversations` and restored its last stable `list` zone. The native banner also initialized as `list`, allowing an advertisement to appear before the web session state had hydrated.
- User impact: Signed-out users saw a third-party advertisement on the account-entry screen even though login was intended to be an ad-free surface. This made the login layout look broken and could distract users from required agreement and authentication actions.
- Resolution:
  - Initialize the native banner zone as `hidden`; authenticated web state must explicitly enable the list or conversation banner.
  - Restore a stable banner after URL navigation only when native navigation itself created a pending transition. A web-requested hidden state for authentication or search is no longer overwritten by a same-route navigation callback.
  - Update native banner refs synchronously with bridge commands so closely spaced WebView navigation events cannot observe stale visibility state.
  - For TestFlight builds before 68, reassert the unauthenticated `hidden` zone from the deployed web client while the login gate remains active. This provides a Railway-delivered compatibility fix without waiting for users to install the new native build.
- Data contract: No API or database changes. The existing `native_set_banner_zone` bridge message remains backward-compatible.
- Testing notes: On build 67 after the Railway deployment, restart the app while signed out and confirm the login screen remains ad-free. On build 68, verify no banner flash occurs during startup, the conversation-list banner appears only after authentication, and search/conversation overlay behavior remains unchanged.

## 2026-08-15 - Render My Page identity and follow counts immediately

- Surface: The 2.0.0 My Page profile header reached from the bottom tab bar.
- Issue: The visible name could render from the server-hydrated session, but the public handle and follower/following counts initialized as missing/zero and appeared only after a client-side `/api/profile` request completed.
- User impact: Entering My Page showed an incomplete identity block and counts that visibly changed after the screen was already present, making the profile feel slow and unstable.
- Resolution:
  - Load the authenticated user's profile and relationship counts on the My Page server route and pass them into the client component as its initial state.
  - Prefetch the My Page route from the bottom tab bar so the server-rendered profile payload is normally ready before the user taps the tab.
  - Keep the existing client profile request as a background refresh, preserving current values on the first frame while still reconciling recently changed profile or relationship data.
- Data contract: No API or database changes. The page and `/api/profile` now share the same profile selection and serialization helper.
- Testing notes: Enter My Page from both Conversations and Explore and confirm the name, handle, follower count, and following count all appear together without zero/empty placeholders. Follow or unfollow an account, return to My Page, and confirm the background refresh reconciles the count.

## 2026-08-15 - Keep the complete conversation list warm between tab visits

- Surface: The 2.0.0 Conversations tab list reached from Explore or My Page.
- Issue: A short-lived session cache already existed, but the component initialized with an empty list and read that cache only after mounting. This still exposed the blocking loading spinner on every tab re-entry. Local STT usage and message counts, plus client-formatted recent-message times, were also initialized separately and appeared after the rows.
- User impact: Returning to Conversations felt like opening the list for the first time, while avatars, titles, languages, message previews/times, STT usage, and message counts visibly assembled instead of appearing as one stable list snapshot.
- Resolution:
  - Keep an account- and API-namespace-scoped in-memory snapshot so a remounted Conversations tab can use the previous complete list as its initial React state rather than waiting for an effect.
  - Persist the same snapshot in session storage for remount recovery. It includes conversation summary metadata used for the avatar, title, language flags, latest message and time, server message count, and per-room local STT usage/message counts.
  - Treat the snapshot as stale-while-revalidate for up to seven days within the browser session: show it immediately, then run the existing no-cache server request in the background and replace the snapshot with fresh values.
  - Preserve account and iOS/Android API namespace isolation so one user's or release namespace's rows cannot warm another list.
- Data contract: No API or database changes. The existing conversation-list response and local per-room STT statistics are cached together on the client.
- Testing notes: Load Conversations once, visit Explore or My Page, and return. Confirm the complete rows are visible on the first frame with no blocking spinner, then verify a newly finalized message or changed room language is reconciled by the background refresh. Also confirm switching accounts never exposes the previous account's cached rows.

## 2026-08-14 - Group the profile primary-language selector into three sections

- Surface: The primary-language selector inside the My Page profile-edit panel.
- Issue: The selector previously presented one long searchable list, so the current language was not persistently visible and commonly used languages were mixed into the full catalog.
- User impact: Users had to search or scroll to confirm the active language, and the most useful language choices were not easy to reach.
- Resolution: Search and sort controls remain at the top. The list now shows the current language first, a fixed seven-language group in the order English, Spanish, Korean, Japanese, Chinese, French, Portuguese, and then the complete locale/alphabetically sorted catalog. The current language remains checked in its original position in the complete catalog as well as in the first section. Search filters the featured and complete sections without hiding the current-language summary.

## 2026-08-14 - Match profile language selection emphasis to the conversation picker

- Surface: The primary-language selector inside the My Page profile-edit panel.
- Issue: The current-language summary and selected rows used a dark, thick border and dark check control that visually overpowered the rest of the selector and differed from the conversation-room language picker.
- User impact: The selected language felt over-emphasized, and the profile editor did not carry the Mingle amber selection language used elsewhere in the app.
- Resolution: Reused the conversation picker’s amber border, soft amber background, restrained shadow, amber check circle, and neutral unselected card treatment for both the current-language summary and its duplicate rows in the featured and complete lists.

## 2026-08-14 - Increase My Page follower labels

- Surface: The follower and following stats in the My Page profile header.
- Issue: The stat labels were smaller than the nearby profile-action labels, so they looked visually weak beneath the similarly sized counts.
- Resolution: Increased both labels from 12px to 13px to match the profile-action text scale while preserving the existing count size, color, spacing, and layout.

## 2026-08-14 - Expand Explore profile result tap targets

- Surface: Explore search results and public user profile navigation.
- Issue: Only the small display-name text was a navigation button. Tapping the result avatar, handle, or surrounding identity area did nothing, which made the first tap feel unreliable on a phone.
- User impact: Users had to aim at a narrow text target or tap repeatedly before opening a searched user’s profile.
- Resolution: Made the complete identity area—avatar, display name, and handle—a prefetched Next link with a full-row tap target and visible keyboard focus state. The follow action remains a separate button.

## 2026-08-14 - Preserve Explore search results after profile back navigation

- Surface: Explore search results when returning from a public user profile with the iOS back swipe.
- Issue: The search query and result list lived only in the Explore component's local state. Opening a public profile unmounted that component, so returning to Explore showed an empty search screen even though the user had just searched.
- User impact: Users had to repeat the same search after inspecting every profile, which made comparing multiple profiles unnecessarily slow.
- Resolution: Store the active search query and result snapshot on the current browser history entry. Restore it immediately when the Explore route mounts, keep the list visible while the latest search request refreshes follow status, and remove the snapshot when the search is cleared or changed.

## 2026-08-14 - Add follower and following list navigation

- Surface: My Page follower/following statistics, the follower/following list, and nested public user profiles.
- Issue: The follower and following counts were static labels with no way to inspect the corresponding users. There was also no list-level search or navigation path for opening a user's public profile from a relationship list.
- User impact: Users could not verify who followed them or whom they followed, and could not move from a relationship list into a profile and back without losing the intended navigation depth.
- Resolution: Made both statistics interactive and added a dedicated right-entering `/mypage/follows` screen. The screen has follower/following tabs, name/handle search, full-row user links, edge-only back dismissal, and a route history sequence of My Page → relationship list → public profile. Returning from a public profile therefore lands on the relationship list first; a second back returns to My Page.

## 2026-08-14 - Remove the profile-share handle hydration flash

- Surface: Profile share screen opened from My Page.
- Issue: The share route started with an empty handle and fetched the same profile a second time after mounting. The QR/share card therefore showed a fallback handle briefly before switching to the saved public handle.
- User impact: The profile identifier visibly changed after the screen appeared, making the share card look unstable and suggesting that the profile data had not been saved.
- Resolution: My Page now carries the already-hydrated public handle into the prefetched share route. The share screen uses it on its first render and still performs the existing server refresh for direct-entry or stale cases.

## 2026-08-14 - Strengthen the selected app-language state

- Surface: The app-language selector inside the My Page menu and settings panel.
- Issue: The selected state was represented by a small amber text check mark, which was difficult to see and did not sufficiently distinguish the selected row from the other languages.
- User impact: Users could miss which interface language was active, especially on a small phone screen.
- Resolution: The selected row now uses a dark high-contrast background, bold white label, and a larger circular check indicator with a standard icon. Unselected rows keep a light outlined indicator, while keyboard focus receives an inset focus ring.

## 2026-08-14 - Match app-language selection to the key color

- Surface: The app-language selector inside the My Page hamburger menu.
- Issue: The selected language's dark filled row and white controls were visually heavier than the profile-edit language selector and did not use the Mingle key color.
- User impact: The active language looked like a separate dark action state instead of a consistent, easy-to-scan selection focus.
- Resolution: Replaced the dark treatment with a soft amber background, restrained amber inset outline, neutral selected text, amber flag-card accent, and the same amber check treatment used by the profile-edit selector. The keyboard focus ring now uses the same key color as well.

## 2026-08-14 - Restrict profile-surface swipe dismissal to the edge

- Surface: Profile editing, the My Page hamburger menu and its blocked-user/report/app-language subpages, and profile sharing.
- Issue: The full surface listened for horizontal drag gestures, so a vertical scroll with a small horizontal deviation could begin dismissing the page. Profile sharing also animated itself off-screen before routing back, briefly exposing a blank white page background.
- Resolution:
  - Start the horizontal drag only when the pointer begins within the first 32px of the panel's local left edge, matching the expected iOS back-swipe origin.
  - Lock the gesture direction and keep `touchAction: pan-y` so vertical content scrolling remains the native interaction everywhere else.
  - Prefetch My Page on mount so the return route is ready when profile sharing closes.

## 2026-08-14 - Animate profile-share route exit before returning to My Page

- Surface: The profile-share route opened from My Page.
- Issue: Profile sharing called `router.back()` immediately, so the route disappeared before its visual surface could leave the screen. The route's gradient was also the moving element itself, allowing the white or gray canvas background to appear at the left edge.
- User impact: Swiping back closed this page abruptly and exposed a brief white strip, unlike the profile-edit and settings panels.
- Resolution: Profile sharing now finishes the same rightward exit transition used by the public profile screen before navigating back. A stationary outer gradient backdrop remains behind the moving surface, so the route canvas cannot flash white during the transition.

## 2026-08-14 - Keep native history gestures out of profile panels

- Surface: iOS WebView navigation on My Page and profile sharing.
- Issue: The native WKWebView back/forward gesture remained enabled on profile routes while the web UI also owned an edge-swipe dismissal. Both navigation layers could react to one gesture, and the native history transition briefly exposed the WebView's white background.
- Resolution: Disable native WebView back/forward gestures for the `/mypage` route family. Profile editing, hamburger subpages, and profile sharing now use the web panel's edge-only gesture exclusively, while native history gestures remain available for conversation navigation.

## 2026-08-14 - Keep authenticated navigation free of session-checking flashes

- Surface: The top-level tab transition from My Page to the conversation list and any room that uses the shared authentication gate.
- Issue: The client session provider started without the server-known session, so a route transition could briefly expose the `loading` state. The conversation list treated that transient state as unauthenticated and displayed the login surface with the Korean copy “로그인 상태 확인 중...”.
- User impact: A logged-in user saw an unnecessary login-checking screen while moving between tabs. Repeating the same tap often hid the flash, which made the navigation feel unreliable.
- Resolution: Hydrate the shared session provider with the server session on the first render, stop refetching on window focus, show the auth gate only after a definitive `unauthenticated` result, and extend the JWT lifetime so the session remains valid until explicit sign-out.

## 2026-08-14 - Restore the bottom new-conversation action

- Surface: The 2.0.0 conversation-list screen above the native-aware bottom tab bar.
- Issue: The new-conversation action was moved into the upper-right header beside search. On a phone, this made the primary action harder to discover and less comfortable to reach than the full-width action used before the messenger tabs were introduced in 1.1.4.
- User impact: Starting a conversation required aiming at a small header icon instead of using the familiar, easy-to-reach action at the bottom of the conversation list.
- Resolution:
  - Removed the new-conversation icon from the conversation-list header, leaving search as the only header action.
  - Restored the 1.1.4 full-width amber-to-orange `Start Conversation` button with its existing label, arrow, loading state, and create-flow handler.
  - Rendered the button outside the scroll container as an absolute upper layer positioned directly above the bottom tab bar, so long lists can continue scrolling behind the button and the button remains visually fixed.
  - Added scroll-bottom padding equal to the button height plus the existing breathing space, so the final conversation row can still be scrolled above the overlay when the list reaches its end.
- Data contract: None. The existing conversation creation endpoint, create lock, accessibility label, and auto-start behavior are unchanged.
- Testing notes: Verify on a real iPhone that the button remains fixed above the bottom tabs, long lists pass underneath it while scrolling, the last row is not permanently hidden at the scroll limit, and the loading state still prevents duplicate creation.

## 2026-08-14 - Autofocus the explore search field

- Surface: The 2.0.0 Explore tab user search field.
- Issue: Entering the Explore tab focused the search input only during the first mount attempt. Route-transition and WebView timing could leave the field visually available but require a second tap before typing.
- User impact: Users had to tap the search field again after opening Explore, adding friction to the primary action of the tab and delaying the keyboard.
- Resolution:
  - Added the native `autoFocus` hint to the search input.
  - Added focus attempts on mount, the next animation frame, and two short post-navigation delays so the input remains focused after the route and WebView finish settling.
  - Updated the iOS WebView shell to allow programmatic keyboard presentation, which is required for the focused input to open the keyboard without a second tap.
  - Kept the focus helper shared with the clear-search action so clearing the query returns directly to typing.
- Data contract: None. Search requests, history snapshots, and follow actions are unchanged.
- Testing notes: Verify on iPhone TestFlight build 68 after the Railway deployment that entering Explore focuses the field and opens the keyboard without a second tap.

## 2026-08-15 - Add an editable profile-image crop surface

- Surface: My Page profile editing and profile avatars shown in search and public profiles.
- Issue: Profile images had no upload flow, and a saved image could not preserve the user's circular crop when the profile was edited again.
- User impact: Users could not set a profile photo or control which part of a source image appeared in the avatar. Reopening profile editing would also lose the intended framing.
- Resolution:
  - Added a circular crop viewport that keeps the source image intact, supports photo dragging, and uses two-pointer pinch gestures for zooming.
  - Store a normalized zoom scale and x/y crop coordinates alongside the original R2 object key. Reopening the editor uses the original source URL and restores the same crop state.
  - Apply the stored crop to search-result and public-profile avatars so the framing is consistent throughout the app.
  - Keep the crop surface outside the text form flow so changing an image does not interfere with handle, name, bio, or language editing.
- Data contract: Added profile image object-key and crop metadata fields, a multipart profile-image upload endpoint, and iOS/Android v2.0.0 route wrappers. The object key remains server-only; the public image URL and crop values are returned to clients.
- Testing notes: Verify JPG/PNG/WEBP selection, drag and pinch behavior on a real phone, replacing an existing image, and reopening the editor to confirm the original source and crop coordinates are restored.

## 2026-08-16 - Add edge-swipe dismissal to notifications

- Surface: The notifications panel opened from the conversation-list header.
- Issue: Notifications could be closed with the header arrow or backdrop, but did not follow the edge-swipe dismissal pattern used by the other full-screen app surfaces.
- User impact: Returning from notifications required a deliberate tap and felt inconsistent with profile, follow-list, and settings navigation.
- Resolution: Added a left-edge-only horizontal drag that dismisses the notification panel to the right after the same distance or velocity threshold used by the surrounding screens. Vertical scrolling remains available because the panel keeps `touchAction: pan-y`, and taps outside the panel or on the header arrow retain their existing behavior.
- Data contract: None.
- Testing notes: Verify that a rightward gesture beginning within the first 32px closes the panel, a vertical list scroll does not close it, and gestures beginning away from the left edge do not take over the interaction.

## 2026-08-16 - Separate app display language from profile primary language

- Surface: My Page app-language settings and the profile-edit primary-language selector.
- Issue: When a profile did not yet have a saved primary language, My Page used the current UI locale as a fallback. This made the app display language and the profile's primary language appear to be one setting, even though they represent different user choices.
- User impact: Changing or viewing the Mingle interface language could silently change the language shown on the user's profile, and a profile without a choice could incorrectly display the UI language's flag and name.
- Resolution:
  - Keep the app display language in the route/local-storage preference used to render the Mingle UI.
  - Keep the profile primary language in the existing profile field and preserve its nullable state; never derive it from the UI locale.
  - Hide the profile language badge and preview label when the user has not selected a profile primary language yet.
  - Rename the Korean settings copy to `앱 이용 언어` and clarify that it controls the Mingle UI/UX.
- Data contract: None. Existing saved profile language values remain unchanged, and the existing nullable profile field continues to accept `null`.
- Testing notes: Verify that selecting English as the app display language does not select English in profile editing, that a saved profile language remains unchanged after a UI-language change, and that an unset profile language shows no flag or language label.

## 2026-08-16 - Mirror feedback and app updates in My Page settings

- Surface: The My Page hamburger menu and its nested management panel.
- Issue: Feedback and app-update controls were available from a conversation room, but not from the My Page settings menu. Users had to open a room before they could contact the team or check the installed app version.
- User impact: Support and update actions were inconsistent across the two primary navigation surfaces.
- Resolution:
  - Added the same localized feedback entry to the My Page hamburger menu and opened the same compose/history workflow from a nested full-screen panel.
  - Reused the existing feedback API, draft persistence key, category copy, Instagram contact link, and history presentation so messages behave consistently from either surface.
  - Mirrored the native-only app-update card in My Page, including installed/latest version status and the native store-opening action.
  - Kept the conversation-room menu unchanged.
- Data contract: None. Feedback continues to use the existing `/feedback` endpoint, and app updates continue to use the existing native bridge command.
- Testing notes: Verify feedback compose/history navigation from My Page, draft restoration, successful submission, and that the app-update card appears only in native runtime and opens the correct store when an update is available.

## 2026-08-16 - Isolate text composer drafts by conversation

- Surface: The text-input mode composer inside conversation rooms.
- Issue: Every room read and wrote the same local-storage draft key, so text typed as a pending message in one room appeared in other rooms.
- User impact: Users could accidentally send text intended for another conversation and could not keep separate unfinished messages per room.
- Resolution:
  - Scope the composer draft key by the conversation ID, falling back to the existing storage namespace only for non-room surfaces.
  - Reload the textarea from the newly selected room's draft when the active room changes without remounting the composer.
  - Keep the existing unscoped key for the standalone/live surface, while room drafts no longer read from or write to that shared value.
- Data contract: None. This is local-storage namespacing only; message submission and conversation APIs are unchanged.
- Testing notes: Verify that drafts in two rooms remain independent, returning to each room restores its own text, submitting one draft clears only that room's draft, and the standalone live surface remains usable.

## 2026-08-16 - Simplify the profile-link install screen

- Surface: The browser fallback screen shown when opening a shared Mingle profile link.
- Issue: The screen repeated the same information across a verification label, title description, button hint, installation divider, store description, and fallback notice.
- User impact: The primary actions were buried in a tall card, making it harder to immediately open the profile or install Mingle.
- Resolution:
  - Keep only the Mingle mark, a short profile-opening title, the `Open in app` action, and the relevant store buttons.
  - Remove redundant verification, explanatory, divider, and post-click guidance text from the valid-link state.
  - Preserve the invalid-link message and platform-specific store filtering.
- Data contract: None. Deep-link validation, app URL handling, and store URLs are unchanged.
- Testing notes: Verify the valid profile-link screen on iOS, Android, and desktop, confirm the app and store actions remain visible, and confirm invalid links still show their error state.

## 2026-08-16 - Save profile QR codes to the device gallery

- Surface: The QR download action on the profile-sharing screen in the native app.
- Issue: The web implementation created an anchor for a data URL. That works as a browser download, but the React Native WebView did not handle the download, so tapping the button could show a success message without creating a device image.
- User impact: Users could not find the downloaded QR code in the iPhone Photos app or Android gallery.
- Resolution:
  - Send the generated PNG data URL through the WebView-to-native bridge when the screen is running in the app.
  - Save the image to the iOS Photos library through `PHPhotoLibrary` and to the Android Pictures/Mingle media collection through `MediaStore`.
  - Request iOS add-only photo access and support legacy Android storage permission handling while keeping modern Android storage permission-free.
  - Return a native success or failure event to the web screen so the status message reflects the actual save result.
- Data contract: Added only a native WebView command/event pair; no server or database changes.
- Testing notes: On iOS, tap QR download and confirm the image appears in Photos after granting permission. On Android, confirm it appears in Pictures/Mingle or the device gallery, and verify denied permission shows a failure message.
