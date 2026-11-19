---
id: hash-rush-round-flow-multiplayer
title: Hash Rush rounds with two people; host and guest see the right next step, the title race, the champion card, smooth remote play
priority: P1
environment: assisted
tags: [hash-rush, rounds, results, champion, network, multiplayer]
taste: [T5, T9, T12, T13, T16, T22]
paths:
  - mingle-app/src/features/hash-rush/HashRushCards.tsx
  - mingle-app/src/features/hash-rush/HashRushGame.tsx
  - mingle-app/src/features/hash-rush/client.ts
  - mingle-app/src/features/hash-rush/score.ts
  - mingle-app/src/features/hash-rush/engine/client/predict.js
  - mingle-app/src/features/hash-rush/engine/client/net.js
history:
  - 2026-11-01 — Hash Rush 네이티브 이식 1단계 실기기 문제 수정, 2단계: 대기실·점수표·결과·우승 카드
  - 2026-11-11 — 해시러시 메뉴 페이지, 방장 대기실, 랭킹
---

Two devices in the same game: the phone as host and a second player. Web sources (`docs/UIUX-ISSUES.md`, "점수표·결과·한
판 더·라운드 흐름" and "연결"): #20, #95, #125, #142, #143, #150, #164–#170, #181, #160, #163, #167, #182, #12, #118,
#211.

## Steps

1. Round ends: both devices show the result card. The winner side reads `승리!!`, the other `패배`, a spectator
   `경기 종료`, with the winner's name; a timeout shows its reason (web #95). The score table appears on both every
   time (web #143).
2. After the result, the guest sees what happens next in plain words: waiting for the host (`방장 <name>님이 시작하기를
   기다리는 중…`) or the next round countdown; the guest never sees a start button that does nothing (web #20, #164,
   #165, #181).
3. Wins and losses per person are in the table, wins the largest column, 누적 first; the top name tags show each
   player's wins and the `10승 먼저 하면 우승` race chip (web #142, #167, #182). A deuce shows the red `듀스!`.
4. Close the app on the guest during the lobby and open it again: the guest comes back with their own wins (records
   follow the person, not the seat).
5. Play to a title (or use a short-title dev setting if the server has one): the champion card (`hash-rush-champ-title`)
   with the cup, the winners and the whole record. It has a working close and returns to the lobby; the record
   starts over, last champion listed in the lobby (web #125, #160, #163).
6. Put the guest on LTE (Wi-Fi off) and play a round: the guest's own hamster answers the pad at once, others move
   smoothly without jumps (web #118, #211). Record visible jumps per minute on each device.
7. Put the guest in a poor network (or airplane mode for 5 s): the failure shows its reason (`connectFailed` or
   `ticketFailed`) and `hash-rush-retry` rejoins (web #12).

## Oracle (pass when)

- Both devices agree on result, winner, records and the next step; no dead buttons (T5, T16, T22).
- The champion card closes and the title race restarts cleanly (T9, T12).
- Remote play stays smooth on LTE; a failure says why and retries (T13).

## Signals

- Game server log for `over` and `lobby` with `champ`.
- Screenshots of both devices at each result card.

## Manual follow-up

- Three or more people on mixed networks; the owner judges whether non-host stutter is acceptable (web open item).
