---
id: hash-rush-invite-link
title: Hash Rush invite link works in any browser until the chat room is deleted
priority: P1
environment: assisted
tags: [hash-rush, invite, share, browser, guest]
taste: [T8, T12, T16, T22]
paths:
  - mingle-app/src/server/hash-rush/invite.ts
  - mingle-app/src/server/api/controllers/shared/hash-rush-controller.ts
  - mingle-app/src/app/api/hash-rush/invite/**
  - mingle-app/src/app/api/conversations/*/hash-rush/invite/**
  - mingle-app/src/features/hash-rush/HashRushMenuPage.tsx
  - mingle-app/src/features/hash-rush/invite-copy.ts
  - mingle-app/src/i18n/live-rooms-copy.ts
history:
  - 2026-11-12 — 해시러시: 영구 초대 링크, 대기실 스크롤, 게임 방법 스크린샷
---

The Hash Rush page's `초대 링크 복사` copies a link that never expires. Anyone who opens it plays in a browser: a
member of the room under their name, anyone else as `Guest123`. Once the chat room is deleted, the link shows a
"no longer works" page.

## Steps

1. Room menu → Hash Rush page → `hash-rush-menu-pc-link` ("초대 링크 복사"). A toast says it was copied and that it
   works for anyone, on a computer or a phone, as long as the room exists (T16). Read the clipboard (`eval`).
2. Open the link in a desktop browser that is not signed in (the agent can use the in-app browser pane, or `curl -I`
   for the redirect): it lands on the Hash Rush page in the room's game as a guest (`Guest` + 3 digits) (T12).
3. With the app's game open on the phone as host, the browser guest appears in the lobby and never gets the host tag.
4. Open the same link again a day later (or after a 2-hour wait, manual): it still works.
5. In a throwaway room, copy its link, delete the room, open the link: a plain page "이 게임 링크는 더 이상 쓸 수
   없어요" (HTTP 410), not an error or the game.
6. Guests are not in the rankings (`hash-rush-ranking-page`) after a round with them.

## Oracle (pass when)

- One tap copies a link that opens the game in a plain browser, for members and non-members (T8).
- The link does not expire while the room exists, and stops cleanly once it is deleted (T22).
- A browser guest never hosts while an app player is in the room.

## Signals

- App log: `GET /api/hash-rush/invite/<code> 302` (410 after deleting).
- Game server: the guest's connection joins with `guest=1`.

## Manual follow-up

- Opening the link on a phone that has the app installed: it opens the browser game, not a broken app screen.
