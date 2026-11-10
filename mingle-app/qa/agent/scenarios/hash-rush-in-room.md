---
id: hash-rush-in-room
title: Hash Rush opens inside the room, plays, keeps the room chat, and goes back cleanly
priority: P1
environment: assisted
tags: [hash-rush, game, room, back-stack, chat]
taste: [T6, T9, T10, T11, T12, T16, T21]
paths:
  - mingle-app/src/features/hash-rush/**
  - mingle-app/src/server/hash-rush/**
  - mingle-app/src/server/api/controllers/shared/hash-rush-controller.ts
  - mingle-app/src/app/api/conversations/*/hash-rush/**
  - mingle-app/src/app/api/ios/*/conversations/*/hash-rush/**
  - mingle-app/src/app/api/android/*/conversations/*/hash-rush/**
  - mingle-app/src/components/LivePhoneDemo/LivePhoneDemo.tsx
  - mingle-app/src/components/LivePhoneDemo/hash-rush-room-chat.ts
history:
  - 2026-11-10 — Hash Rush 네이티브 이식 4단계: iframe 시트와 v2 대화방 배치 코드 삭제
  - 2026-11-01 — Hash Rush 네이티브 이식 1단계 실기기 문제 수정, 2단계: 대기실·점수표·결과·우승 카드
  - 2026-11-01 — Hash Rush 네이티브 이식 1단계: iframe 없이 대화방 안에서 직접 실행
---

## Preconditions

- The devbox has `NEXT_PUBLIC_HASH_RUSH_SERVER` set and the Hash Rush game server answers (the room menu shows
  `live-demo-hash-rush-menu-item`). If it does not, the scenario is `blocked`.
- Signed in, in room `QA A`. A second player (second QA account on the simulator) is optional; without one, run the
  solo steps and put the multiplayer checks on the manual list.

## Steps

1. Open the room menu and tap `live-demo-hash-rush-menu-item`. Screenshot every ~300 ms for 2 s.
2. Lobby (`hash-rush-lobby`): the "‹ 채팅" pill (`hash-rush-game-back`) is top left and not covered; take a seat
   (`hash-rush-sit`).
3. Start a round. During `hash-rush-countdown` and play, move with the pad (`hash-rush-pad`) and use `hash-rush-bonk`.
   Screenshot the field: the pad does not cover the bottom house row; the banner strip (`hash-rush-banner`) does not
   cover the sunflower at the top.
4. Open the score table (`hash-rush-score-button` → `hash-rush-score-table`), switch tabs, close it.
5. Open the chat (`hash-rush-chat-button`), send a quick chat (`hash-rush-quick-chat`). Go back to the room with the
   pill: the message is a normal room message.
6. Return to the game from the menu: it resumes in the same state (T9). Then press the system back gesture once: one
   level back (game → room), not out of the room (T6).
7. Let a round finish: result (`hash-rush-result`) and, for a winner, the champion card; next round
   (`hash-rush-next-round`) works.

## Oracle (pass when)

- The game opens in the room without a web sheet or iframe and with no ad over it (T11, T12).
- Nothing important is covered: pad vs. houses, strip vs. sunflower, cards vs. the back pill (T10).
- Back goes one level; leaving and returning keeps the game state (T6, T9).
- Game chat shows up as room messages; labels fit (T16). Pad and bonk are large and in thumb reach (T21).

## Signals

- Device log `--grep "hash-rush\|HashRush"` for socket errors.
- QA snapshot before and after leaving the game: room messages count increases by the quick chat.

## Manual follow-up

- Two or more players: movement sync, bonk hits, score table and the winner card on both sides.
- Voice talk during a game: the interpreting dot (`hash-rush-interpreting-dot`) and audio.
