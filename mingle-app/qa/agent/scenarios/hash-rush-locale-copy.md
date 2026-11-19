---
id: hash-rush-locale-copy
title: Hash Rush in every game language; no missing strings, names and labels fit, the right language per locale
priority: P2
environment: device
tags: [hash-rush, i18n, locale, copy]
taste: [T16, T17, T20]
paths:
  - mingle-app/src/features/hash-rush/copy.ts
  - mingle-app/src/features/hash-rush/engine/client/i18n.js
  - mingle-app/src/features/hash-rush/invite-copy.ts
  - mingle-app/src/features/hash-rush/HashRushHowToPage.tsx
history:
  - 2026-11-11 — 해시러시 메뉴 페이지, 방장 대기실, 랭킹
---

The game strings come from the web game's i18n (ko, en, ja, zh-Hans, zh-Hant; other UI locales fall back to English,
web #6) plus the app's own copy (`copy.ts`). Web sources: #6, #13, #58, #207 and the 10-20 English sweep.

## Steps

For each UI locale ko, en, ja, zh-Hans, zh-Hant, and one fallback locale (es):
1. Open the Hash Rush page, `게임 방법`, the lobby, a round, the score table, the result card and the champion card
   (or its screenshot from another run). Screenshot each.
2. No `undefined`, raw keys (`mapNames.x`), or Korean left in another locale (web #13, #58). Computer levels read
   naturally (`초보/중수/고수`, `Easy/Normal/Hard` …) in the seat menu and in the lobby (10-20 sweep).
3. In-field words (`꿀밤!`, `던지기!`, `해씨 캐는 중`, `집`, `연장전`, kill texts) are in the locale.
4. Run `qa-agent-device.mjs overflow` on the lobby and the result card: no clipped or overlapping text.
5. A computer's default name follows the locale (web #207); people keep their chat name.

## Oracle (pass when)

- Every screen is complete in each locale; fallbacks go to English, never mixed (T17, T20).
- Labels fit (T16).

## Signals

- The overflow scanner output per locale.
