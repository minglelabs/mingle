---
id: composer-photo-attach
title: Attaching a photo keeps the keyboard and speech recognition alive
priority: P0
environment: sim
tags: [composer, keyboard, photo, stt, overlay]
taste: [T1, T2, T10, T19]
paths:
  - mingle-app/src/components/LivePhoneDemo/ConversationImageComposer.tsx
  - mingle-app/src/components/LivePhoneDemo/conversation-image-composer*
  - mingle-app/src/components/LivePhoneDemo/picker-focus-restore.ts
  - mingle-app/src/components/LivePhoneDemo/LivePhoneDemo.tsx
  - mingle-app/src/components/native-banner-route-guard.tsx
  - mingle-app/rn/src/nativeBannerZone.ts
history:
  - 2026-09-28 - Voice-mode photo tap stopped STT; keyboard-mode photo pick closed the keyboard
  - 2026-09-09 — Align conversation photo controls and anchor attachment menu
  - P2 2026-09-18 Native bottom banner obscured the attachment tooltip
---

## Preconditions

- Signed in, inside a room. The simulator photo library has the default sample photos.
- The microphone permission is granted. Speech is not needed; only the running state matters.

## Steps

Keyboard mode:
1. Open the keyboard (`live-demo-keyboard-open`) and type `photo test`.
2. Tap `+` (`live-demo-attachment-open`). Screenshot the menu, including the bottom of the screen where the banner sits.
3. Choose the photo item, then cancel the system picker. Screenshot after about 0.5 s.
4. Repeat: choose a photo, see the preview, close the preview without sending. Screenshot.
5. Repeat: choose a photo and send it. Screenshot the thread.

Voice mode:
6. Switch to voice mode and start STT (`live-demo-mic-button`). Wait until the mic shows running. Take a QA snapshot.
7. Tap the photo icon next to the mic three times, a few seconds apart (the bug was timing-dependent). After each tap, screenshot the mic and take a QA snapshot, then dismiss the upload menu.
8. Compare the voice-mode `+`/photo control height with the keyboard-mode control.

## Oracle (pass when)

- Keyboard mode: after cancel, after closing the preview, and after sending, the keyboard is open again and the draft text is intact (T1).
- The attachment menu is fully visible, anchored to the `+` button, and not covered by the native banner (T10).
- Voice mode: `micVisualState` stays `running` across all three photo taps. No `stt_session_stopped` event appears for those taps (T2).
- The photo controls in voice and keyboard mode sit at the same height (T19).
- The sent photo appears once, in order, without a duplicate or a broken thumbnail.

## Signals

- QA snapshot `micVisualState` before and after each voice-mode tap.
- `app_event_logs` since the step started: `event_type = 'stt_session_stopped'` must be absent. If present, record `metadata->>'reason'` and `metadata->>'source'`.
- Screenshots of the menu and of the bottom edge.

## Real-device follow-up

- The banner overlap only shows with a real AdMob fill. Repeat step 2 on a TestFlight build.
