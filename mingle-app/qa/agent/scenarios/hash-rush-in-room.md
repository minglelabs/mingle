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
  - 2026-11-12 — 해시러시 입장 실패: 시간대 버그
  - 2026-11-12 — 해시러시: 채팅 2초 페이드, 대기실 버튼 즉시 반응, 초대 카드 터치
  - 2026-11-11 — 해시러시 메뉴 페이지, 방장 대기실, 랭킹
  - 2026-11-11 — 해시러시 방 메시지, 초대 카드, 나가기
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

1. Open the room menu and tap `live-demo-hash-rush-menu-item`: the Hash Rush page slides in from the right
   (`hash-rush-menu-page`) with the room's game status, the main button (`hash-rush-menu-enter`), `랭킹`, `게임 방법`
   and `초대 링크 복사`. Open `게임 방법`: the rules with three game screenshots between them (`hash-rush-howto-shot`).
   Back once, then tap `hash-rush-menu-enter`. Screenshot every ~300 ms for 2 s: the lobby comes up within ~3 s
   (no "게임 서버에 연결하지 못했습니다").
2. Lobby (`hash-rush-lobby`): the "‹ 채팅" pill (`hash-rush-game-back`) and the `나가기` pill (`hash-rush-game-quit`)
   are top left and not covered. The lobby itself is covered by `hash-rush-hosted-lobby`.
3. Start a round. During `hash-rush-countdown` and play, move with the pad (`hash-rush-pad`) and use `hash-rush-bonk`.
   Screenshot the field: the pad does not cover the bottom house row; the banner strip (`hash-rush-banner`) does not
   cover the sunflower at the top.
4. Open the score table (`hash-rush-score-button` → `hash-rush-score-table`), switch tabs, close it.
5. Open the chat (`hash-rush-chat-button`), send a quick chat (`hash-rush-quick-chat`). Go back to the room with the
   pill: the message is a normal room message.
6. Return to the game from the menu: it resumes in the same state (T9). Then press the system back gesture once: one
   level back (game → room), not out of the room (T6).
7. Let a round finish: result (`hash-rush-result`) and, for a winner, the champion card; the host starts the next
   round.
8. Leave the game with the back pill, wait 60 s in the room, enter again from the menu: it joins the same game at
   once (the 2026-11-12 time-zone bug refused every join after 45 s).
9. With a second member in the room (assisted): when the phone starts a game, the other device gets the invite card
   (`hash-rush-incoming`) low on the screen; both `hash-rush-incoming-decline` and `hash-rush-incoming-join` respond to
   one tap (it did nothing on an iPhone 11 before). `나가기` (`hash-rush-game-quit`) asks once, then ends the game for
   that phone and returns to the room.
10. On the other device, decline the invite card, close the app completely and open the room again: the card does not
    come back for that game (the room message's `참여하기` still joins). When every player has left, the card stops
    showing within a minute (the game is over), and the next new game offers a card again.

## Oracle (pass when)

- The game opens in the room without a web sheet or iframe and with no ad over it (T11, T12).
- Nothing important is covered: pad vs. houses, strip vs. sunflower, cards vs. the back pill (T10).
- Back goes one level; leaving and returning keeps the game state, and re-entering after a minute joins at once (T6, T9).
- The invite card's buttons answer one tap on every phone (T8).
- Game chat shows up as room messages; labels fit (T16). Pad and bonk are large and in thumb reach (T21).

## Signals

- Device log `--grep "hash-rush\|HashRush"` for socket errors.
- QA snapshot before and after leaving the game: room messages count increases by the quick chat.

## Manual follow-up

- Two or more players: movement sync, bonk hits, score table and the winner card on both sides.
- Voice talk during a game: the interpreting dot (`hash-rush-interpreting-dot`) and audio.
