---
id: profile-message-daily-limit
title: A profile leads with Message, and a man can start chats with three new women a day (other directions unlimited)
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
  - No history entry heading; bullet 2026-11-25-people-safety-filters-visitors (limit is now man → woman only, 3 a day)
---

## Preconditions

- Signed in with a QA account that is a **man**, not an operator or official account, and has opened no new
  1:1 room in the last 24 hours. A fresh account from the local signup API is the simplest. It must pass the
  first-message sheet (verified number, face-verified photo; see `first-message-setup-gate`) or the sheet stands
  in front of every step.
- The server runs with the default limit (`DAILY_NEW_CHAT_LIMIT` unset, which means 3 since 2026-11-25). Record
  the value in the notes.
- The QA account is not in `COIN_ENFORCE_USER_IDS`, so the 500 Hash sheet for a new chat with a woman does not
  show (that sheet is `dm-open-coins-attendance`). Record it if it is.
- Accounts the QA account has no room with: women P1, P2, P3 and P4 (one of them an operator account, because
  those count too), a man M1, and the official HashChat account.

## Steps

1. Open P1's profile from Home. Screenshot the buttons.
2. Tap `…`. Screenshot the extra actions, then tap `…` again.
3. Tap Message. An account that has not given its gender and birth date is asked first; answer and continue.
   Screenshot the room that opens. Send `hi`, then go back to the profile and to Home.
4. Open P1's profile again and tap Message. Screenshot.
5. Open P2's and P3's profiles and tap Message on each (rooms two and three of the day). Then open P4's profile
   and tap Message. Screenshot the profile about 1 s later.
6. Tap Message on P4 once more.
6a. Open M1's profile and tap Message. Screenshot.
7. Open the official account's profile and tap Message. Screenshot.
8. Open the welcome account's (Royce) room from the conversation list and send a message.

## Oracle (pass when)

- Row one is Follow, Share and `…`; row two is Message as the one filled button, with Gift next to it only when
  coin billing is on. Block and Report appear only after `…` (T19, T21).
- The buttons stay where they are while the profile finishes loading: Message does not slide down when the bio's
  translate row or the photo arrives (it did on 2026-11-17, and a tap landed on Share). A photo that fails to
  load shows the grey placeholder, not the name as text.
- Step 3 opens a room with P1 on the first tap (T8). Step 4 opens the same room, not a second one.
- Step 5 opens the rooms with P2 and P3, then none with P4 (the fourth new woman). The profile shows the limit
  sentence under the buttons (`오늘은 새로운 사람 3명에게만…`) in the app language, as text on the screen and not
  as a system alert (T16, T22). In English the copy reads "…with 3 new person a day": a T16 grammar finding
  until the plural is fixed. The Message button is usable again right after, not stuck on `…` (T5).
- Step 6 shows the same sentence again and nothing else changes.
- Step 6a opens a room with M1: man to man has no limit (nor woman to woman, nor woman to man).
- Steps 7 and 8 work: the official account and the welcome account are never limited.
- No room with P4 appears in the conversation list.

## Signals

- Screenshots. The `POST /api/conversations` status for P4 in step 5 (429) from the server log or `eval`.
- Conversation list QA snapshot: `conversationCount` before step 5 and after step 6 (two more: P2 and P3).

## Manual follow-up

- Sending a gift (the agent never buys or spends).
- Whether the limit sentence reads as fair to the owner.
