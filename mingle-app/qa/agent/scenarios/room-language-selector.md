---
id: room-language-selector
title: The room language selector opens on the first tap and saves the choice
priority: P1
environment: sim
tags: [language, selector, flags, navigation]
taste: [T8, T9, T17, T18, T6, T19]
paths:
  - mingle-app/src/components/LivePhoneDemo/LanguageSelector.tsx
  - mingle-app/src/components/LivePhoneDemo/language-selector*.ts
  - mingle-app/src/components/LivePhoneDemo/use-language-selector-navigation.ts
  - mingle-app/src/components/LivePhoneDemo/language-row-avatar-stack.tsx
  - mingle-app/src/components/language-flag.tsx
  - mingle-app/src/components/language-preference-picker.tsx
  - mingle-app/src/lib/translation-languages.ts
history:
  - 2026-09-12 - Preserve language-selector open intent on iOS
  - 2026-09-01 - Render language-selector member avatars local-first
  - P2 2026-08-16 Conversation language selector ordering
  - P2 2026-08-23 Conversation language defaults follow room selections
---

## Preconditions

- Signed in, inside a room.

## Steps

1. Tap the language flags in the room header once. Screenshot about 300 ms later. Repeat this 5 times (close it each time) and count how often one tap was enough.
2. With the selector open, screenshot the top (selected strip and featured group) and scroll through the list.
3. Add Spanish, remove Japanese, and close. Screenshot the header.
4. Reopen it and confirm the selection. Close it with an iOS edge swipe; only the selector should close.
5. Create a new room and check whether it starts with the same languages (the default follows the room selection).
6. Restore the original languages.

## Oracle (pass when)

- The selector opens on the first tap in 5 of 5 tries (T8).
- Member avatars appear together with the rows, not later (T12).
- The selected state uses the amber key colour and is clear but not heavy. English uses the US/UK flag (T17, T18).
- The choice persists after reopening and carries over to the new room's defaults (T9).
- The edge swipe closes only the selector (T6), and the selector looks like the profile language picker (T19).

## Signals

- Screenshots and the 1-tap success count.
- QA snapshot after closing.

## Real-device follow-up

- None.
