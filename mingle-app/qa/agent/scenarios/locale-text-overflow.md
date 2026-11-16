---
id: locale-text-overflow
title: Long-locale labels stay inside their buttons, tabs and headers
priority: P1
environment: device
tags: [i18n, layout, overflow, locale]
taste: [T16, T17]
paths:
  - mingle-app/src/i18n/**
  - mingle-app/src/components/*-copy.ts
  - mingle-app/src/components/LivePhoneDemo/*copy*.ts*
  - mingle-app/src/components/bottom-tab-bar.tsx
  - mingle-app/src/components/notification-panel.tsx
  - mingle-app/src/components/follow-list-screen.tsx
  - mingle-app/src/components/follow-status-indicator.tsx
  - mingle-app/src/components/my-page.tsx
  - mingle-app/src/components/feed/**
  - mingle-app/src/components/search/**
  - mingle-app/src/app/globals.css
  - mingle-app/scripts/qa-text-overflow.mjs
  - mingle-app/scripts/qa-crawl.mjs
history:
  - 2026-08-14 - Profile language selector horizontal overflow
  - P2 2026-08-17 Shared English US/UK flag in language selectors
  - 2026-08-24 - Live Demo Preference i18n Coverage
---

## Why

The layouts were designed in Korean. Vietnamese, Spanish, German, French, Russian and English labels are often
two to three times wider than the Korean or Chinese ones, so a button, tab or header that fits in ko/ja/zh can
clip, wrap or run off the screen.

## Preconditions

- Signed in on the QA account, on a phone-width screen (the iPhone, or the simulator). Use the narrowest device
  available; an iPhone SE / mini width is the worst case.
- Optional watch list: `pnpm --dir mingle-app qa:i18n:long-labels` writes
  `mingle-app/qa/agent/local/i18n-long-labels.json`, the short labels that grow most against Korean. Make sure the
  screens those labels live on are in the sweep.

## Steps

1. Crawl every layer of the UI. `crawl` opens each screen, taps every safe control (and every control in the
   sheet, menu, tab or screen it opens), scans each state, then replays the same states in the other 14 locales:
   ```
   node mingle-app/scripts/qa-agent-device.mjs crawl --routes "<ko routes>" --locales ko --out <run>/discovery.json --shots <run>/shots
   node mingle-app/scripts/qa-agent-device.mjs crawl --routes "<ko routes>" --states <run>/discovery.json --locales en,ja,...,vi --out <run>/replay.json --shots <run>/shots
   ```
   Routes: every page under `src/app/[locale]` that the QA account can open — conversations, feed, connect (+ people
   search), mypage (+ follows both tabs, posts/archived|trash|hidden, share), notifications, public profiles (one
   follower-only, one mutual, one you follow), compose, new-group, add-members, account, translator, the post viewer
   and post edit for a seeded post. Seed follows, a post and a direct conversation first, so lists are not empty.
   Controls that change data or open native UI (send, delete, block, follow, purchase, camera, share, copy…) are
   never tapped (`isRiskyTarget` in `scripts/qa-crawl.mjs`); the run lists them under `skipped`.
2. For a single screen, `overflow --locale all --shots <dir> --out <file>` sweeps it in the 15 locales.
3. Look at the screenshots of every state with a `control: true` finding, and at a few clean ones per locale, for
   what the scan cannot judge: icons pushed out of line, a label that wraps but looks wrong, right-to-left mirroring in ar.
4. Native chrome (the bottom tab bar, native sheets and the login screen's native parts) is outside the WebView
   scan: check it by screenshot in vi, de and ru.

Switch the app back to Korean at the end.

## Oracle (pass when)

- No `control: true` finding of kind `offscreen`, `escapes-parent` or `overlap` in any locale (S1 each).
- No `control: true` `clipped` or `wrapped` finding on a tab, the bottom tab bar, a header title or a primary
  button (S2 each). A secondary chip or menu row that wraps neatly onto two lines is acceptable.
- `control: false` findings (names, previews, body text) are judged from the screenshot: ellipsis on a long name
  is fine; a cut-off sentence is S2.

## Signals

- In the report, list findings as `locale · screen · kind · "text" · px`, with the matching screenshot.
- When a truncation is intentional (names, message previews), the fix is `data-qa-allow-truncate` on that element,
  not a baseline: say so in the finding.

## Manual follow-up

- None.
