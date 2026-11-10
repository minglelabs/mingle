---
id: text-message-translation
title: Typed messages translate naturally and the keyboard stays open
priority: P0
environment: device
tags: [composer, keyboard, translation, bubbles]
taste: [T1, T3, T4, T9, T15]
paths:
  - mingle-app/src/components/LivePhoneDemo/LivePhoneDemo.tsx
  - mingle-app/src/components/LivePhoneDemo/live-phone-demo.composer*
  - mingle-app/src/components/LivePhoneDemo/client-message-outbox.ts
  - mingle-app/src/components/LivePhoneDemo/TranslationBubbleRow.tsx
  - mingle-app/src/components/LivePhoneDemo/ChatBubble*.tsx
  - mingle-app/src/app/api/translate/**
  - mingle-app/src/lib/translator.ts
  - mingle-app/src/lib/translation-*.ts
history:
  - 2026-08-23 — Keep the keyboard open after text-message submission
  - 2026-08-16 - Isolate text composer drafts by conversation
  - 2026-09-08 - Remove the translation waiting label
---

## Preconditions

- Signed in with the QA account. Room A has at least Korean, English and Japanese set as its languages.
- A second room B exists (any languages).

## Steps

1. Open room A and switch the composer to keyboard mode (`live-demo-keyboard-open`).
2. Type and send the messages in [fixtures/text-messages.md](../fixtures/text-messages.md), one at a time. After each Send, take a screenshot before typing anything else.
3. After the last message, wait 5 s and take a screenshot of the whole thread. Scroll up if needed so every message is visible at least once.
4. Type `draft for A` without sending. Go back to the list, open room B, and check its composer. Go back to room A and check its composer.
5. Take a QA snapshot (`isComposerOpen`, `composerTextareaHeightPx`, `utteranceCount`).

## Oracle (pass when)

- After every Send the keyboard is still open and the caret is in the empty textarea (T1).
- Every message shows a row for each room language other than its source, with the original-language marker on the source flag (T4).
- No "translating…" or fallback filler text stays visible once the translation has arrived (T3).
- Translation quality: each message scores average ≥ 4.0 with no dimension ≤ 2 on the [rubric](../rubric.md#translation-quality-15-per-dimension). Score each message against the intent noted in the fixture.
- Room B's composer is empty, and room A's composer still holds `draft for A` (T9).
- Own messages are right-aligned, and consecutive messages are grouped tightly (T15).

## Signals

- Screenshots after each Send and of the full thread.
- QA snapshot: `isComposerOpen` stays `true` during the whole sequence.
- Time from Send to the translation rows being visible, estimated from successive screenshots (rubric latency column).

## Manual follow-up

- None.
