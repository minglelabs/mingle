---
id: photo-viewer-translation
title: The photo viewer translates text in place and closes with a swipe
priority: P1
environment: sim
tags: [photo, translation, viewer, gestures]
taste: [T16, T21, T7, T3]
paths:
  - mingle-app/src/components/LivePhoneDemo/ConversationImageViewer.tsx
  - mingle-app/src/components/LivePhoneDemo/ZoomableConversationImage.tsx
  - mingle-app/src/components/LivePhoneDemo/PhotoTranslat*.tsx
  - mingle-app/src/components/LivePhoneDemo/photo-translation*.ts
  - mingle-app/src/components/LivePhoneDemo/photo-viewer-pager.logic.ts
  - mingle-app/src/components/LivePhoneDemo/use-photo-translation-text.ts
history:
  - 2026-10-01 — Photo viewer: label fit, progress, drag-away backdrop and paging through the room's photos
  - 2026-09-30 — English label for a vertical Japanese photo banner
  - 2026-09-26 — Swipe-down-to-dismiss for the full-screen photo viewer
  - 2026-09-30 — Photo text translation overlay in the full-screen viewer (client)
---

## Preconditions

- Signed in, in a room with English and Korean set.
- Two photos with clear foreign-language signage are in the simulator's library (`xcrun simctl addmedia <udid> <files>`). The verified fixtures from [docs/photo-translation-verification.md](../../../../docs/photo-translation-verification.md) live outside Git. If they are not on this machine, render two simple sign images (one horizontal Japanese line, one vertical Japanese banner) into `qa/agent/local/`.

## Steps

1. Send two fixture photos into the room.
2. Tap the first photo to open the viewer. Screenshot.
3. Turn on photo translation. Screenshot every second until the labels settle, noting the progress indicator.
4. Zoom into one label and screenshot.
5. Swipe left to page to the second photo, then back.
6. Drag the photo down halfway and release (it should snap back), then drag it down fully (it should close). Screenshot both.

## Oracle (pass when)

- Translated labels cover their source text, fit inside it in at most two lines, and do not overlap neighbouring labels (T16).
- The translations are accurate for the signage (rubric accuracy ≥ 4).
- Progress is visible while translating, and the labels replace it without a blank gap (T3).
- Paging moves through the room's photos in order.
- A half drag snaps back, and a full drag closes the viewer, with the backdrop fading as it moves (T7, T21).

## Signals

- Screenshots. The device log for photo-translation fetch errors.

## Real-device follow-up

- Camera capture (the simulator has no camera).
