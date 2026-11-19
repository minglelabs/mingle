---
id: hash-rush-field-cues-and-maps
title: Hash Rush field; every map is readable on a phone and the game explains itself (seed, house, portal, bonk)
priority: P2
environment: device
tags: [hash-rush, game, map, visuals, onboarding]
taste: [T10, T12, T16, T20]
paths:
  - mingle-app/src/features/hash-rush/engine/**
  - mingle-app/src/features/hash-rush/HashRushGame.tsx
  - mingle-app/src/features/hash-rush/layout.ts
history:
  - 2026-11-01 — Hash Rush 네이티브 이식 1단계: iframe 없이 대화방 안에서 직접 실행
  - 2026-11-01 — Hash Rush 네이티브 이식 1단계 실기기 문제 수정, 2단계: 대기실·점수표·결과·우승 카드
---

The app draws the field with the web game's engine (`src/features/hash-rush/engine`, copied from
`minglelabs/hash-rush`). The web fixed what a first-time player could not read on a phone: who is carrying, where home
is, what a portal is, why nothing happens next to the seed (`docs/UIUX-ISSUES.md`, "인게임 화면" and "맵·집·포털").
This scenario checks those cues on the phone, once per map. Rows in
[hash-rush-web-issues-coverage.md](../hash-rush-web-issues-coverage.md) point here.

Solo with computers. Play one short round per map (host lobby: pick the map, `hash-rush-start`).

## Steps

1. Portrait: the field is the tall map, as wide as the screen allows (web #3, #134). Hamsters and their names are
   readable without zooming (web #17, #18).
2. Walk next to the sunflower and stay still: `해씨 캐는 중` shows over my hamster, and while a computer mines,
   I cannot (web #135). Walking into a hamster does not pass through it; a one-lane path moves only back and forth
   (web #2).
3. Pick up the seed: my hamster gets the spotlight; near the other house a red warning and a hint show (web #40). The
   house floor glows and `🏠 집` / `집` is beside the nest, not under it (web #181, #184).
4. Walk onto a portal carrying the seed: it does not take me, and a hint shows above my head (web #181, #218). Without
   the seed the purple swirl takes me. Two hamsters bonking in the same instant never both faint (web #5).
5. Get bonked twice: footsteps and sweat show while slowed (web #69). A double kill shows `더블킬!` small and
   see-through, not over the middle of the field (web #63).
6. Each computer shows its level colour under it (web #78). In team play every hamster's ring and name are in its
   team's colour (web #148).
7. Reach overtime (let the timer run out tied): the houses widen in the overtime colour and the banner says `연장전`
   (web #8, N4).
8. Repeat steps 1–3 on every map in the lobby list (초원, 사막, 공장, 얼음, 해변, 하늘, 묘지 …). Screenshot each: the
   theme decoration is there (web #86), paths are narrow and winding with no sealed-off area (web #4, #88, #89, #94,
   #119, #122, #123), and on the sky map at night the ice is visible (web #92).
9. Top-of-field text (clock, banner, kill text) is see-through and never hides a hamster for more than a moment
   (web #82).

## Oracle (pass when)

- On every map a first-time player can see who carries, where home is, and why nothing happens (T12, T16).
- Hints sit beside what they describe and do not cover hamsters or the sunflower (T10).
- No map has a sealed area, a wall gap that traps, or unreadable ice (T20).

## Signals

- One screenshot per map at round start and one while carrying, in the run folder.

## Manual follow-up

- Whether returning home with the seed is still too hard (web open item 2-(2)), and whether the carrying side is too
  strong (web 10-19). Owner's call after a few rounds with people.
