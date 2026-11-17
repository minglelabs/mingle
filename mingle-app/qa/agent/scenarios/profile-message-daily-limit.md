---
id: profile-message-daily-limit
title: A profile leads with Message, and a free account can start a chat with one new person a day
priority: P1
environment: device
tags: [profile, message, limit, buttons, room]
taste: [T5, T8, T16, T19, T21, T22]
paths:
  - mingle-app/src/components/public-user-profile-screen.tsx
  - mingle-app/src/server/daily-new-chat-limit.ts
  - mingle-app/src/app/api/conversations/**
  - mingle-app/src/i18n/home-copy.ts
  - mingle-app/src/server/api/controllers/shared/conversations-controller.ts
history:
  - 2026-11-16 — Home tab: people first, tabs are Home, Chats, Explore, My, and one new chat a day
---

## Preconditions

- Signed in with a QA account that is not an operator or official account and has opened no new 1:1 room in the
  last 24 hours. A fresh account from the local signup API is the simplest.
- The server runs with the default limit (`DAILY_NEW_CHAT_LIMIT` unset or `1`). Record the value in the notes.
- Three other accounts the QA account has no room with: P1, P2 (one of them an operator account, because those
  count too) and the official HashChat account.

## Steps

1. Open P1's profile from Home. Screenshot the buttons.
2. Tap `…`. Screenshot the extra actions, then tap `…` again.
3. Tap Message. Screenshot the room that opens. Send `hi`, then go back to the profile and to Home.
4. Open P1's profile again and tap Message. Screenshot.
5. Open P2's profile and tap Message. Screenshot the profile about 1 s later.
6. Tap Message on P2 once more.
7. Open the official account's profile and tap Message. Screenshot.
8. Open the welcome account's (Royce) room from the conversation list and send a message.

## Oracle (pass when)

- Row one is Follow, Share and `…`; row two is Message as the one filled button, with Gift next to it only when
  coin billing is on. Block and Report appear only after `…` (T19, T21).
- Step 3 opens a room with P1 on the first tap (T8). Step 4 opens the same room, not a second one.
- Step 5 opens no room. The profile shows the limit sentence under the buttons (`오늘은 새로운 사람 1명에게만…`
  / "You can start a chat with 1 new person a day…") in the app language, as text on the screen and not as a
  system alert (T16, T22). The Message button is usable again right after, not stuck on `…` (T5).
- Step 6 shows the same sentence again and nothing else changes.
- Steps 7 and 8 work: the official account and the welcome account are never limited.
- No room with P2 appears in the conversation list.

## Signals

- Screenshots. The `POST /api/conversations` status for step 5 (429) from the server log or `eval`.
- Conversation list QA snapshot: `conversationCount` before step 5 and after step 6.

## Manual follow-up

- Sending a gift (the agent never buys or spends).
- Whether the limit sentence reads as fair to the owner.
