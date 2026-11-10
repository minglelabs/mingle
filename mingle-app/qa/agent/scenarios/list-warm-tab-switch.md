---
id: list-warm-tab-switch
title: Switching tabs shows complete screens immediately, with no flashes
priority: P1
environment: device
tags: [conversation-list, tabs, local-first, my-page]
taste: [T12, T3, T9]
paths:
  - mingle-app/src/components/conversation-list*.ts*
  - mingle-app/src/components/bottom-tab-bar.tsx
  - mingle-app/src/components/my-page.tsx
  - mingle-app/src/components/auth-session-provider.tsx
  - mingle-app/src/components/route-transition-curtain.tsx
  - mingle-app/src/components/mobile-canvas-shell.tsx
history:
  - 2026-08-15 - Keep the complete conversation list warm between tab visits
  - 2026-08-15 - Render My Page identity and follow counts immediately
  - 2026-08-14 - Keep authenticated navigation free of session-checking flashes
  - 2026-09-08 - PR 217 delayed translation preview refresh
---

## Preconditions

- Signed in, with at least three rooms that have recent messages.

## Steps

1. Kill and relaunch the app. Screenshot every ~300 ms until the list is stable (4 s at most).
2. Switch Conversations → Search → My Page → Conversations, three times, as fast as the screens allow. Screenshot right after each tap.
3. Open a room, send a typed message, and go back. Screenshot the row right away and after 3 s.
4. Change the room's default display language (menu), go back, and check the row's preview.

## Oracle (pass when)

- Cold start: no white page between the splash and the list. Rows appear complete, with avatars, titles, previews and times (T12).
- Tab re-entry: no spinner, no login-checking flash, and no counts or handles that change after appearing (T12).
- Returning from a room: the row shows the new message as its preview right away (T3).
- The preview follows the display-language change (the PR 217 bug).

## Signals

- The screenshot bursts.
- List QA snapshot: `conversationCount` stays constant across tab switches.

## Manual follow-up

- The cold-start time on a real device over a cellular-like network.
