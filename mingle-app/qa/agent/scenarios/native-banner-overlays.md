---
id: native-banner-overlays
title: The native ad banner never covers UI and stays off focused screens
priority: P1
environment: sim
tags: [banner, safe-area, overlay, layout]
taste: [T10, T11]
paths:
  - mingle-app/src/components/native-banner-route-guard.tsx
  - mingle-app/rn/src/nativeBannerZone.ts
  - mingle-app/rn/src/webViewLayout.ts
  - mingle-app/src/components/LivePhoneDemo/live-phone-demo.native-ui.logic.ts
  - mingle-app/src/components/LivePhoneDemo/live-phone-demo.chrome-contract.ts
  - mingle-app/rn/App.tsx
history:
  - P2 2026-09-18 Native bottom banner obscured the attachment tooltip
  - P2 2026-08-22 conversation creation banner and history stack
  - 2026-08-15 - Keep authentication banner hiding authoritative
  - P2 2026-04-18 Android 1.1.1 Internal Test Banner Follow-Up
---

## Preconditions

- A build with AdMob test IDs (the simulator gets test ads). Signed in.

## Steps

1. On the conversation list, screenshot the full screen. Note where the banner sits.
2. Open a room, scroll to the bottom, and screenshot. The last message must sit above the composer and banner.
3. Open the `+` attachment menu, the hamburger menu and a long-press menu, one at a time. Screenshot each.
4. Start creating a new conversation. Screenshot the creation screen and the new room when it opens.
5. Open a profile from the notification panel, if there is a notification. Screenshot.
6. Sign out (only the QA account) and screenshot the login screen. Sign back in.
7. Take a QA snapshot in the room: `nativeBannerLayoutPosition`, `effectiveNativeBottomBannerInsetPx`, `nativeBottomBarClearancePx`.

## Oracle (pass when)

- No menu, tooltip or message is covered by the banner. The transcript reserves space for it (T10).
- No banner on the creation screen, on the login screen, or behind an overlaid profile (T11).
- The banner moves together with the screen transitions and does not linger on the wrong screen.
- The safe areas have no wrong-colour bands at the top or bottom.

## Signals

- Screenshots, QA snapshots.

## Real-device follow-up

- A real ad fill on TestFlight (simulator test ads can differ in size and timing).
