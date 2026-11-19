---
id: hash-rush-chat-and-keyboard
title: Hash Rush game chat; the keyboard opens without squashing the game, chat lines fade on time, controls stay safe
priority: P1
environment: device
tags: [hash-rush, chat, keyboard, ime, layout]
taste: [T1, T5, T7, T8, T10, T13, T21]
paths:
  - mingle-app/src/features/hash-rush/HashRushGame.tsx
  - mingle-app/src/features/hash-rush/HashRushRoomLayer.tsx
  - mingle-app/src/features/hash-rush/QuickChatBar.tsx
  - mingle-app/src/features/hash-rush/quick-chat.ts
  - mingle-app/src/features/hash-rush/room-chat.ts
  - mingle-app/src/components/LivePhoneDemo/hash-rush-room-chat.ts
  - mingle-app/src/features/hash-rush/hash-rush-game.module.css
history:
  - 2026-11-12 — 해시러시: 채팅 입력창 위 대화록 높이
  - 2026-11-12 — 해시러시: 채팅 2초 페이드, 대기실 버튼 즉시 반응, 초대 카드 터치
  - 2026-11-01 — Hash Rush v2: 게임 중 대화를 해시챗 채팅으로 (시트 아래 입력창·최근 메시지·빠른 채팅)
---

On the web the keyboard over the game was fixed six times (`minglelabs/hash-rush` `docs/UIUX-ISSUES.md`, #136 →
#200): the screen squashed, the bar jumped, half-focused states stayed, scrolling with the keyboard up jittered. In the
app the game chat is the room's own composer (3단계 in
[docs/hash-rush-in-app-uiux.md](../../../../docs/hash-rush-in-app-uiux.md)), but the same failures can come back in the
WebView. This scenario checks them.

Run it in a lobby and again during a round (computers only is fine).

## Steps

1. Tap `hash-rush-chat-button`. Screenshot every ~200 ms for 1.5 s: the keyboard comes up, and the composer, the quick
   chips (`hash-rush-quick-chat`) and the talk panel sit right on top of it. The composer never shows at the top of the
   screen first (web #185). The game behind keeps its size and position: the map does not shrink, grow or slide up
   and down (web #145, #181, #187, T13).
2. There are exactly two states, closed and keyboard-up. Tap the map: the keyboard and the composer both go away at
   once; no half state with the composer still floating and no keyboard (web #146).
3. Open again, type `햄스터` with the Korean keyboard: every syllable composes (`햄스터`, not `햄ㅅㅌ`) (web #30). The
   input is at least 16 px, so iOS does not zoom.
4. With the keyboard up, drag the talk panel up and down: it scrolls without the page catching or the composer
   shaking (web #200). The talk panel never runs past the back pill (T10).
5. Tap three quick chips in a row: each goes out as a room message at once, and the keyboard stays up (T1, T8). The
   chip row scrolls sideways (web #201).
6. Send a typed message. The keyboard stays (T1). The line shows over my hamster as a bubble and in the floating
   lines.
7. Close the composer and at once press the pad and bonk where the composer was: for ~0.35 s nothing fires (the
   closing finger), then the controls answer normally.
8. With the composer closed, have a line arrive (second account, or the room on another device): the floating line is
   crisp then faint then gone, in the room's timing (about 2 s + 2 s, see `2026-11-12 — 해시러시: 채팅 2초 페이드…`).
   Tap the map while it floats: it clears at once. Tap a floating line instead: the whole talk opens, scrollable
   without the keyboard (web #190).
9. During the result card and the lobby, floating lines and bubbles are on top of the cards, not under them (web
   #214), and they do not stay faded once the round is over (web #222).
10. Android only: back closes the composer first, a second back lowers the game.

## Oracle (pass when)

- Opening and closing the keyboard never moves or resizes the game (T13).
- Only closed and keyboard-up exist; a tap on the map closes both (T5, T7).
- Korean composes, sending or chips keep the keyboard up, the talk panel scrolls smoothly (T1, T8).
- No stray pad or bonk from the closing finger; floating lines fade on time and clear with a tap (T7, T10).

## Signals

- `qa-agent-device.mjs eval`: the field's `getBoundingClientRect()` before, during and after the keyboard (must match).
- QA snapshot: the room's message count rises by one per chip and per sent message.

## Manual follow-up

- Voice mode in the game: Start, speak, the bubble appears over my hamster and 💬 shows the red dot.
- The keyboard's ⌃⌄✓ accessory bar: the web could not remove it (web #184); check whether the app shows it.
