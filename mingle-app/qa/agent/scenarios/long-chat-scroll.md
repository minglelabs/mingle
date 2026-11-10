---
id: long-chat-scroll
title: A 500-message room scrolls smoothly, keeps its anchor and never hides new messages
priority: P1
environment: device
tags: [scroll, performance, bubbles, history]
taste: [T13, T14]
paths:
  - mingle-app/src/components/LivePhoneDemo/live-phone-demo.scroll.logic.ts
  - mingle-app/src/components/LivePhoneDemo/LivePhoneDemo.tsx
  - mingle-app/src/components/LivePhoneDemo/ChatBubble*.tsx
  - mingle-app/src/components/LivePhoneDemo/live-phone-demo.message-*.ts
history:
  - 2026-04-30 - Live Demo Chat Prepend Anchor Preservation
  - 2026-05-04 - Latest-Message Affordance Threshold Drift
  - 2026-04-30 - Live Demo New Message Auto-Follow Threshold
  - 2026-09-08 — Review and verify chat date markers on Android (PR #215)
---

## Preconditions

- Signed in, inside a room. The QA bridge is available.

## Steps

1. Seed history: run `window.__MINGLE_QA__.seedScrollPerformanceHistory()` through the WebView helper, then take a QA snapshot (`utteranceCount` should be about 500).
2. Confirm the room opens at the bottom (`isAtBottom: true`). Screenshot.
3. Swipe up 5 times quickly, then 5 times slowly. Screenshot after each group and note the floating date label.
4. Keep swiping up until older history loads. Just before it loads, note the top visible message, and check it is still visible at the same spot afterwards.
5. From about 250 pt above the bottom, send a text message from the composer. Screenshot.
6. Tap the scroll-to-bottom button. Screenshot.
7. Run `window.__MINGLE_QA__.resetPersistedHistory()` to clean up.

## Oracle (pass when)

- The room opens at the latest message (T14).
- Nothing jumps when older history loads; the anchor message stays put (T13).
- The floating date label matches the visible messages.
- With the view 101–400 pt above the bottom, a new message shows the scroll-to-bottom affordance, or auto-follows. It is never silently hidden below (T14).
- No blank areas or missing bubbles while swiping.

## Signals

- QA snapshots: `chatScrollTop`, `chatScrollHeight`, `isAtBottom`, `showScrollToBottom`.
- `window.__MINGLE_QA__.getLiveDemoChatScrollHandlerMeasurement()` after the swipes. Median ≤ 2 ms passes.

## Manual follow-up

- Smoothness verdict: run `pnpm test:qa:ui:ios:scroll-fps` on an iPhone 12-class device ([IOS_SCROLL_FPS_CAPTURE.md](../../mobile-ui/IOS_SCROLL_FPS_CAPTURE.md)).
