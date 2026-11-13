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

1. Screens reachable by URL. Open each one, then run the 15-locale sweep on it
   (`node mingle-app/scripts/qa-agent-device.mjs overflow --locale all --shots <run>/shots/<screen> --out <run>/overflow-<screen>.json`):
   - the conversation list (`/<locale>/conversations`) with the bottom tab bar
   - the feed (`/<locale>/feed`)
   - Explore / search (`/<locale>/connect`)
   - My Page (`/<locale>/mypage`) and the follow list (`/<locale>/mypage/follows`, both tabs)
   - notifications (`/<locale>/notifications`)
   - a public profile (`/<locale>/users/<id>`) with its follow button
2. Sheets, menus and rooms (a reload closes them). Switch the app language in My Page to vi, then de, then ru
   (the widest three for most labels) and, in each, open and run plain `overflow` on: the gear menu, a room
   header + composer + room menu, the language selector, the post composer, and the notification follow-back row.
3. Look at each locale's screenshot for anything the scan cannot judge: icons pushed out of line, a label that
   wraps but looks wrong, right-to-left mirroring in ar.

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
