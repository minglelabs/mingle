---
id: hash-rush-hosted-lobby
title: Hash Rush hosted lobby; settings for all (host-only changes), computers per open seat, scrolls, quick taps
priority: P1
environment: assisted
tags: [hash-rush, lobby, host, computers, scroll, chat]
taste: [T5, T7, T8, T10, T13, T14, T16, T18, T21]
paths:
  - mingle-app/src/features/hash-rush/HashRushCards.tsx
  - mingle-app/src/features/hash-rush/HashRushGame.tsx
  - mingle-app/src/features/hash-rush/hash-rush-cards.module.css
  - mingle-app/src/features/hash-rush/hash-rush-game.module.css
  - mingle-app/src/features/hash-rush/room-chat.ts
  - mingle-app/src/features/hash-rush/client.ts
  - mingle-app/src/features/hash-rush/copy.ts
history:
  - 2026-11-12 — 해시러시 대기실: 설정은 모두에게, 컴퓨터는 빈자리마다
  - 2026-11-12 — 해시러시: 채팅 입력창 위 대화록 높이
  - 2026-11-12 — 해시러시: 채팅 2초 페이드, 대기실 버튼 즉시 반응, 초대 카드 터치
  - 2026-11-12 — 해시러시: 영구 초대 링크, 대기실 스크롤, 게임 방법 스크린샷
  - 2026-11-11 — 해시러시 메뉴 페이지, 방장 대기실, 랭킹
---

The app's Hash Rush rooms have a host (the first one in). Everyone sees the room's settings; only the host changes
them and starts. The seat list shows every seat: people, then the computers the host put in, then each open seat.

## Second player

The host part runs on the phone alone. The non-host view needs a second member of `QA A` in the same game (the
owner's other device, or a second QA account on the simulator). Without one, steps 6–7 go on the manual list.

## Steps

Host (phone):
1. Room menu → `live-demo-hash-rush-menu-item` → `hash-rush-menu-enter` ("게임 만들기"). The lobby
   (`hash-rush-lobby`) opens; my row has `hash-rush-host-tag`.
2. No pad, bonk or throw button anywhere over the lobby (`hash-rush-pad`, `hash-rush-bonk` not visible).
3. Seats: "같이 하는 사람 · 1/8", my row, one computer row (`hash-rush-seat-bot`, the minimum of two hamsters), then
   six `hash-rush-seat-open` rows each with `hash-rush-add-bot` ("+ 컴퓨터 넣기").
4. Tap `hash-rush-add-bot` three times quickly. Screenshot right after each tap: each tap shows a new computer row at
   once (under ~150 ms), and the count settles at 4 computers. Tap `hash-rush-remove-bot` on one; the last computer
   cannot be removed while I am alone (button disabled).
5. Tap team (`hash-rush-setup-team`), another map and another computer level: each pressed state shows at once and
   stays (T5, T8). Scroll the card to its bottom with a slow swipe on the seat list: it scrolls, nothing is cut off,
   and `hash-rush-start` is reachable (T14). Then `hash-rush-start` starts a round with the pad and bonk showing.

Non-host (second player):
6. The second player sees the same settings, dimmed, under `hash-rush-host-only` ("방장만 바꿀 수 있어요"), no start
   button, and `빈자리` on open seats (no add button). Tapping a setting does nothing.
7. When the host changes the map or adds a computer, the second player's lobby follows within a second.

Chat over the game (phone):
8. Send a message from the room (or the second player). It floats over the map: crisp 2 s, faint 2 s, then gone.
   While floating, tap the map: the lines go away at once. Tap a floating line instead: the whole conversation opens.
9. Open the composer with `hash-rush-chat-button`: the conversation above it shows as many lines as the read-back
   one (`data-open="composer"` vs `"read"`, compare heights), and never runs past the back pill.

## Oracle (pass when)

- Settings are visible to everyone, changeable only by the host, and the selected option is obvious (T16, T18).
- Computers are added and removed per seat; every tap answers at once (T5, T8, T21).
- The lobby card scrolls when long; controls show only during a round and never cover the lobby (T10, T14).
- Floating chat fades in 4 s in all and a tap elsewhere clears it; the composer's conversation is as tall as the
  read-back one (T7, T10).

## Signals

- Game server log (`~/.mingle/hash-rush-dev/server.log` locally): `setup` messages from the host only.
- Device log `--grep "hash-rush"` for socket errors.

## Manual follow-up

- A round with team play and an uneven team split.
- Handing the host to the second player (`hash-rush-hand-host`), and the host leaving: the room passes on.
