---
id: back-stack-nested-surfaces
title: Back closes exactly one surface at a time from any depth
priority: P1
environment: sim
tags: [navigation, back, gestures, menu, profile]
taste: [T6, T7, T10, T19]
paths:
  - mingle-app/src/components/slide-surface.tsx
  - mingle-app/src/components/LivePhoneDemo/swipe-to-dismiss.logic.ts
  - mingle-app/src/components/LivePhoneDemo/conversation-participants-panel.tsx
  - mingle-app/src/components/public-user-profile-screen.tsx
  - mingle-app/src/components/LivePhoneDemo/use-language-selector-navigation.ts
  - mingle-app/rn/src/nativeNavigationBridge.ts
history:
  - 2026-08-21 - Keep nested room surfaces on the correct back stack
  - 2026-08-21 - Give the topmost surface exclusive gesture ownership
  - 2026-08-21 - Keep the conversation hamburger transition visible without dimming the room
  - 2026-09-12 - Keep diagonal edge swipe-back gestures from becoming scrolls
---

## Preconditions

- Signed in, inside a room that has at least one other participant (or the QA account alone if no partner is available).

## Steps

1. Open the hamburger menu (`live-demo-menu-button`). Screenshot mid-slide and when settled.
2. Open Participants, then tap a participant to open their profile. Screenshot each level.
3. Edge-swipe back once. Screenshot. Repeat until you are back in the room, one screenshot per swipe.
4. Open the menu → the default display language page. Edge-swipe back once and confirm only that page closed.
5. Open the menu and do a slightly diagonal edge swipe (start ≤ 4 pt from the left edge, end 200 pt right and 60 pt down). Screenshot.
6. On a page with a vertical scroller (participants, or the language list), drag vertically with a small horizontal drift starting mid-screen. Screenshot.
7. Close everything and check that the room is not dimmed.

## Oracle (pass when)

- Each back gesture closes exactly one surface, in reverse order: profile → participants → menu → room (T6).
- The menu slides in and out as one continuous motion. No flash, and no closed panel's shadow or backdrop over the room (T10).
- The diagonal edge swipe dismisses or settles back cleanly, and the scroller does not take it over (T7).
- A mid-screen vertical drag scrolls and never starts a dismissal (T7).
- All right-side surfaces use the same slide and edge-swipe behaviour (T19).

## Signals

- Screenshots per gesture.
- QA snapshot: `menuOpen` and `menuScreen` after each back gesture.

## Real-device follow-up

- Android hardware back along the same path, one level per press.
