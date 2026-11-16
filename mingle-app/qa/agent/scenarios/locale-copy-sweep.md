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
  - mingle-app/src/lib/discovery-source.ts
  - mingle-app/src/lib/usage-purpose.ts
  - mingle-app/src/components/LivePhoneDemo/language-selector.logic.ts
  - mingle-app/scripts/i18n-audit*
history:
  - 2026-08-24 - Live Demo Preference i18n Coverage
  - 2026-08-14 - App language setting and social-surface localization
  - P2 2026-08-17 Shared English US/UK flag in language selectors
  - 2026-09-02 - Clarify new conversation-room creation labels
---

## Preconditions

- Signed in. The app language can be changed from My Page ("App language").

## Steps

0. Run `pnpm --dir mingle-app test:qa:i18n` (static, all 15 UI locales). Every new finding goes on this card
   as `locale · source · path · string`. The device steps below then confirm what users see.

For each of ko, en, ja, es and de, plus ar (right to left) and any locale the diff touched or the static check flagged:
1. Switch the app language in My Page.
2. Screenshot: the bottom tab bar (Feed, Chats, Explore, My in English), the conversation list with its header
   (search, bell, gear) and the gear menu, the feed, a room (header, composer, menu), My Page and its settings, and the
   language selector header with its "Popular / All languages" section titles, and the sign-up survey
   ("How did you hear about HashChat?") option list when reachable.
3. Note any string in another language, any clipped or ellipsised label, and any button whose text wraps onto two lines.
   Layout overflow across all 15 locales is measured by the `locale-text-overflow` scenario; run it alongside.

Switch back to Korean at the end.

## Oracle (pass when)

- `test:qa:i18n` passes with no new findings.
- No fallback strings from another language on any captured screen (T17).
- No clipped header, button or tab label. Wrapping is acceptable only for body text (T16).
- Copy describes what happens, without filler or exclamation marks (T16).

## Signals

- One screenshot set per locale. In the report, list findings as `locale · screen · string`.

## Manual follow-up

- None.
