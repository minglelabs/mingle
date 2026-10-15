---
id: bubble-display-modes
title: Message bubbles read like a messenger in both display modes
priority: P1
environment: sim
tags: [bubbles, translation, layout, flags]
taste: [T8, T13, T15, T17, T18]
paths:
  - mingle-app/src/components/LivePhoneDemo/ChatBubble*.tsx
  - mingle-app/src/components/LivePhoneDemo/TranslationBubbleRow.tsx
  - mingle-app/src/components/LivePhoneDemo/live-phone-demo.bubble-display*.ts
  - mingle-app/src/components/LivePhoneDemo/live-phone-demo.message-spacing.ts
  - mingle-app/src/components/language-flag.tsx
history:
  - P2 2026-08-23 Message-bubble display mode
  - P2 2026-08-23 Expanded message bubble layout regression
  - P2 2026-08-23 Speaker-based message bubble color
  - 2026-08-23 - Widen message-bubble language flag hit areas
  - 2026-08-25 - Add sender identity and KakaoTalk-style message alignment
---

## Preconditions

- Signed in, in a room with three or more languages and messages from the viewer. A message from another member is a bonus (seed history or a second account).

## Steps

1. In the default mode, screenshot a mix of short and long messages from the viewer (and from others, if any).
2. On one message, tap each language flag in turn, quickly. Screenshot after each tap.
3. Expand one message, then collapse it. Screenshot both states, plus the messages just above and below.
4. Open the menu and switch the bubble display mode (`live-demo-bubble-display-mode`) to the other option. Screenshot the same messages.
5. Switch back.

## Oracle (pass when)

- The viewer's messages are on the right, others' on the left with name and avatar. Colour marks the speaker (T15).
- Short messages are not artificially narrow, and long ones use the available width (T15).
- Each flag tap switches to that language on the first try, even the middle flag of three (T8).
- Expanding keeps the background and border around the text (the iOS strip bug), and the neighbouring messages do not move (T13).
- English shows the US/UK split flag (T17). The selected language uses the amber key colour (T18).
- Both display modes render without clipped text or overlapping controls.

## Signals

- Screenshots, zoomed on the bubble edges.
- For a disputed layout, use `getBoundingClientRect` on the bubble through the WebView helper.

## Real-device follow-up

- None, unless the simulator fonts differ visibly from the device's.
