---
id: home-card-follow-message
title: Home cards follow and message on the spot, through the same checks as the profile
priority: P1
environment: device
tags: [home, follow, message, profile-basics, limit, room]
taste: [T5, T8, T13, T16, T19, T21, T22]
paths:
  - mingle-app/src/components/home/home-page.tsx
  - mingle-app/src/lib/use-start-direct-conversation.ts
  - mingle-app/src/app/api/users/discover/**
  - mingle-app/src/app/api/*/*/users/discover/**
history:
  - 2026-11-19 — Home cards follow and message on the spot; height on profiles, required for men
---

## Preconditions

- Signed in with a QA account that is not an operator or official account. For step 3, a man without a height (or
  any account still missing gender or birth date), so the profile basics question appears on the first follow.
- The home grid shows the official account's card and at least two other people the account does not follow and
  has no room with.

## Steps

1. Open Home. Screenshot the first two rows of cards. Read every card's `[data-qa=home-card-follow]` text.
2. Scroll one screen down and back up. Screenshot.
3. Tap Follow on a card that reads `팔로우` / Follow. Answer the profile basics question if it opens (type a height
   such as 182 and continue). Screenshot the card.
4. Tap the same button again. Screenshot.
5. Tap Message on the official account's card. Screenshot the room, then go back to Home.
6. Tap Message on a person's card (not the official account). Screenshot what opens.
7. Close whatever opened in step 6 with its ✕ or back. Screenshot Home.

## Oracle (pass when)

- Every card except your own has a Follow button and a round Message button under the name and badges; the
  buttons line up across a row and stay inside the card at 360 pt width (T16, T19, T21).
- Cards do not move or resize when the buttons' state changes or after a scroll (T13).
- Step 3: one tap is enough (T8). The card turns to `팔로잉` / Following right after the question closes, and the
  server agrees (`GET /api/users/discover` shows `isFollowing: true` for that person).
- Step 4: the card is back to `팔로우` / Follow, and the server shows `isFollowing: false` (T5).
- Step 5 opens the room with the official account on the first tap; a second visit opens the same room.
- Step 6 runs the profile's Message checks: the first-message setup sheet (`[data-qa=first-message-gate]`) when the
  account has no verified number or no photo with a face, the one-new-person-a-day sentence as a toast when that
  limit is used up, otherwise a new room. Nothing opens twice, and the button is not stuck on loading (T5, T22).
- Closing the sheet in step 7 leaves Home as it was: same cards, same scroll position, no room created.

## Signals

- `eval` `fetch('/api/users/discover')` before and after steps 3-4. `POST /api/conversations/direct` status
  (403 `first_message_setup`, 429 `daily_new_chat_limit`, 200) from the server log.

## Manual follow-up

- Whether two buttons per card feel too busy on a small phone.
