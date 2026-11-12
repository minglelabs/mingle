---
id: cold-start-restore-splash
title: Relaunching after iOS killed the app shows the splash until the restored screen works, never a dead capture
priority: P0
environment: device
tags: [cold-start, restore, splash, ios]
taste: [T8, T12, T20]
paths:
  - mingle-app/rn/App.tsx
  - mingle-app/rn/src/webViewRestore.ts
  - mingle-app/rn/ios/**/NativeSTTModule.swift
history:
  - 2026-11-12 — iOS restoring cold start keeps the splash instead of the last-screen capture
  - 2026-10-30 — iOS restored-screen capture never takes a touch
---

## Preconditions

- iPhone (or `--sim`). Signed in, with at least one room that has messages.
- The restore record lasts 12 h, and the app does not clear it on terminate, so `app terminate` + `app launch`
  stands in for iOS killing the app in the background.

## Steps

1. Open a room and scroll up a little. Send the app to the background (home), wait 2 s, then
   `qa-agent-device.mjs app terminate`.
2. `app launch`. Screenshot every ~300 ms for the first 5 s.
3. While the yellow splash is up, tap where the room's composer and back button will be, three times, ~500 ms apart.
   Note each tap's time against the screenshots.
4. As soon as the room is visible, tap the composer and type one character, then tap back once.
5. Repeat steps 1–4 from the conversation list and from the Feed tab.
6. Repeat steps 1–2 with the network throttled or off (Settings → Developer → Network Link Conditioner, or
   airplane mode on the simulator host), and time how long the splash stays.

## Oracle (pass when)

- No picture of the previous screen ever appears before the live page. The burst goes splash → restored screen,
  with no white flash and no half-loaded page in between (T12).
- Taps made during the splash do nothing: no navigation, no keyboard, no stray action once the page appears.
- The first tap after the restored screen appears works on the first try: the composer focuses, back goes back (T8, T20).
- The restored screen is the same room / list / tab and roughly the same scroll position.
- On a slow or dead network the splash leaves after 10 s at most; whatever shows then responds or shows a
  clear error, never a frozen-looking screen.

## Signals

- The screenshot burst with tap times. QA snapshot right after the page appears (route, `nativeSttStatus`).
- `logs --grep restore` for `native_web_restore_ready` timing.

## Manual follow-up

- A real background kill: leave the app in the background for a long time (or open several heavy apps), then
  reopen it, and confirm the same splash → working screen behaviour.
