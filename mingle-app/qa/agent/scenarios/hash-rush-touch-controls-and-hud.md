---
id: hash-rush-touch-controls-and-hud
title: Hash Rush on a phone; pad, swipe and bonk feel right, the HUD never hides the field, score and result cards fit
priority: P1
environment: device
tags: [hash-rush, game, controls, touch, layout, score]
taste: [T5, T7, T8, T10, T13, T16, T21]
paths:
  - mingle-app/src/features/hash-rush/HashRushGame.tsx
  - mingle-app/src/features/hash-rush/HashRushCards.tsx
  - mingle-app/src/features/hash-rush/hash-rush-game.module.css
  - mingle-app/src/features/hash-rush/hash-rush-cards.module.css
  - mingle-app/src/features/hash-rush/layout.ts
  - mingle-app/src/features/hash-rush/score.ts
  - mingle-app/src/features/hash-rush/engine/**
history:
  - 2026-11-01 — Hash Rush 네이티브 이식 1단계 실기기 문제 수정, 2단계: 대기실·점수표·결과·우승 카드
  - 2026-11-01 — Hash Rush 네이티브 이식 1단계: iframe 없이 대화방 안에서 직접 실행
---

The web game (`minglelabs/hash-rush`, `docs/UIUX-ISSUES.md`) went through four phone control schemes and a long fight
over buttons covering the map before it settled. The app runs the same engine and the same pad, so the web's lessons
apply here. This scenario checks the ones that carry over: controls (web #130–#181), the HUD and covering (#82, #104,
#134, #165, #189, #216, #223) and the score/result cards (#142–#147, #218, #225). The app-side rules are in
[docs/hash-rush-in-app-uiux.md](../../../../docs/hash-rush-in-app-uiux.md) (N1–N7 and "판 사이 화면").

Solo is enough: start a round with computers only (host lobby → `hash-rush-start`).

## Steps

Controls (during a round):
1. Hold one direction on the pad (`hash-rush-pad`) for 5 s without lifting the thumb: the hamster keeps moving the
   whole time (web #181, never verified on the web). Then slide the same thumb to another quarter without lifting: the
   hamster turns at once.
2. Swipe on the field (`hash-rush-field`) in a diagonal, at least 32 px: the hamster goes diagonally, also inside a
   one-lane path (web #154, #158). A short tap on the field stops it (web #154). A swipe shorter than ~30 px does
   nothing. While swiping, the pad lights the matching direction.
3. Start a swipe on the field about 30 px from the left edge: it moves the hamster and does not trigger back. Only a
   swipe from the very edge (system back) lowers the game, one level (T6, T7).
4. Double-tap and long-press on the field and on the pad: no zoom, no text selection, no copy/look-up menu (G5:
   `touch-action: none`, `-webkit-touch-callout: none`).
5. Tap `hash-rush-bonk` once: a bonk goes out at once, with the `꿀밤!` label. Tap `hash-rush-throw` while carrying a
   seed: it throws; a held bonk never turns into a throw (web #129).

HUD and covering:
6. Screenshot the field at round start: the blue ring and `나` mark my hamster for the first 5 s and the `나` label
   stays above it after (web #134, #147). Name tags and `나` near an edge are pushed inside the field, not cut off (N5).
7. The pad and bonk sit below the field and do not cover the bottom house row; the home indicator does not overlap
   them (N2). The banner (`hash-rush-banner`) sits in the thin top strip and never covers the sunflower (N4).
8. Steer my hamster under the back pill (`hash-rush-game-back`), the 💬 button and the pad: each fades to about half
   while the hamster is under it, and is fully clear otherwise (web #189, #216, #223). The pad is never so faint a
   first-time player loses it.
9. The ⚙ and 🏆 buttons sit in the gap between pad and bonk. Tap each 3 times: neither ever fires a pad move or a
   bonk (N6).

Score and result:
10. Tap `hash-rush-score-button`: the score table (`hash-rush-score-table`) opens over a see-through card, 누적 tab
    first, wins the largest column, my row marked `나` (`hash-rush-score-me`). On a 375 px wide phone the 누적 tab's MVP
    badge is inside the card; a wider table scrolls sideways inside the card only (web #218, #225). Close with ✕
    (`hash-rush-board-close`), then with 🏆 again, then by tapping outside: all three close it (web #144, #218).
11. Keep tapping bonk as the round ends: the result card (`hash-rush-result`) is not dismissed by that thumb in its
    first 0.7 s (web #147). It shows `승리!!` / `패배`, the winner, and "다음 판은 N초 뒤…" or, in a hosted room, the
    host's next step. ✕ (`hash-rush-card-close`) or the dark area lowers it; the pad and bonk are hidden while it is up.
12. Repeat step 10 in English and Japanese UI: labels fit their buttons, no `undefined` or raw keys (web #13, #58,
    T16).

## Oracle (pass when)

- A held pad keeps moving; swipes give diagonals; a tap stops; no zoom or callout menu (T7, T8, T21).
- A field swipe near the edge moves the hamster; only the system edge gesture goes back, one level (T6, T7).
- Nothing covers the houses, the sunflower or my hamster for long; buttons over my hamster fade (T10).
- Score and result cards fit a 375 px screen, scroll inside themselves, and close three ways (T10, T13, T16).

## Signals

- `qa-agent-device.mjs eval`: the `hash-rush-pad` element's computed opacity with my hamster under it and away.
- Screenshots every ~300 ms around the round end (step 11).

## Manual follow-up

- Holding the pad with a thumb while another finger bonks (two touches at once).
- Whether the phone controls feel as good as a PC keyboard, played by the owner for a few rounds (web 10-12 goal).
