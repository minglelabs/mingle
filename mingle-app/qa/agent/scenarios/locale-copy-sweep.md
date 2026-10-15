---
id: locale-copy-sweep
title: Every UI locale shows complete, fitting copy on the main screens
priority: P2
environment: device
tags: [i18n, copy, layout, locale]
taste: [T16, T17]
paths:
  - mingle-app/src/i18n/**
  - mingle-app/src/components/*-copy.ts
  - mingle-app/src/components/LivePhoneDemo/*copy*.ts*
  - mingle-app/rn/src/i18n.ts
history:
  - 2026-08-24 - Live Demo Preference i18n Coverage
  - 2026-08-14 - App language setting and social-surface localization
  - P2 2026-08-17 Shared English US/UK flag in language selectors
  - 2026-09-02 - Clarify new conversation-room creation labels
---

## Preconditions

- Signed in. The app language can be changed from My Page settings.

## Steps

For each of ko, en, ja, es and de (add any locale the diff touched):
1. Switch the app language in My Page.
2. Screenshot: the conversation list (with the bottom create action), a room (header, composer, menu), My Page and its settings, and the language selector header.
3. Note any string in another language, any clipped or ellipsised label, and any button whose text wraps onto two lines.

Switch back to Korean at the end.

## Oracle (pass when)

- No fallback strings from another language on any captured screen (T17).
- No clipped header, button or tab label. Wrapping is acceptable only for body text (T16).
- Copy describes what happens, without filler or exclamation marks (T16).

## Signals

- One screenshot set per locale. In the report, list findings as `locale · screen · string`.

## Manual follow-up

- None.
