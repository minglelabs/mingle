---
id: compose-hour-intro-call-forms
title: Each kind of post opens its own form: 1-hour shows a live deletion time, self-introduction and voice talk put their choices first without the keyboard
priority: P1
environment: device
tags: [compose, category, hour, intro, call, keyboard, preview, feed]
taste: [T1, T5, T12, T16, T17, T18, T20, T24, T26, T27]
paths:
  - mingle-app/src/components/compose/compose-screen.tsx
  - mingle-app/src/components/compose/compose-category-picker.tsx
  - mingle-app/src/components/compose/compose-intro-extras.tsx
  - mingle-app/src/components/compose/compose-call-card.tsx
  - mingle-app/src/components/compose/compose-editor.tsx
  - mingle-app/src/components/feed/post-category-strip.tsx
  - mingle-app/src/components/feed/feed-post-card.tsx
  - mingle-app/src/components/feed/feed-post-preview.tsx
  - mingle-app/src/lib/post-category.ts
  - mingle-app/src/i18n/compose-category-step-copy.ts
  - mingle-app/src/i18n/post-category-copy.ts
  - mingle-app/src/i18n/post-intro-extras-copy.ts
history:
  - No history entry heading; bullet 2026-11-25-post-categories (the history file's newer entries are id bullets)
  - No history entry heading; bullet 2026-11-27-compose-photo-first-and-intro-extras
  - No history entry heading; bullet 2026-11-27-compose-gallery-light-and-kind-forms
  - No history entry heading; bullet 2026-11-27-call-post-title
  - No history entry heading; bullet 2026-11-28-gallery-albums-and-title-only-call
---

## Preconditions

- As in `compose-gallery-first`. The QA account's profile has a nationality, an age, a height (men), at least one
  comfortable and one learning language with a level, and a profile photo; record them.
- Posts go to the local feed only. Delete them afterwards (a call post also stops taking calls after an hour).

## Steps

1-hour post:
1. Open the write screen, `글만 쓰기`, tap `1시간` (`compose-category-hour`). Screenshot.
2. Read the small grey line beside the photo and preview icons (`compose-hour-deletes-at`) twice, 2 s apart,
   with the phone clock in view (status bar).
3. Type `qa hour post`. Tap the preview icon. Screenshot the preview strip.
4. Close the preview and post (`게시`). On the feed, screenshot the new card; again 1 minute later.

Self-introduction:
5. Open the write screen, `글만 쓰기`, tap `자기소개` (`compose-category-intro`). Screenshot at once and 1 s later.
6. Read the bottom button and reason line. Tap two hobbies (`compose-hobby-travel`, `compose-hobby-music`), then
   one job (`compose-intro-job-student`), two personality chips and a drinking answer. Screenshot.
7. Try a sixth hobby after picking five; try a fourth personality chip after three. Screenshot.
8. Tap the text box and type `hi`. Read the reason line. Type more until 10 characters. Read it again.
9. Post. Screenshot the feed card.

Voice talk post (the app only):
10. Open the write screen, `글만 쓰기`, tap `1:1 보이스톡` (`compose-category-call`). Screenshot at once and 1 s later.
11. Zoom on the call card (`compose-call-card`). Screenshot.
12. Tap the title (`compose-call-title`), type `QA 방제 테스트`, tap return. Screenshot. Then type until the field
    stops (41+ characters). Clear the field. Screenshot (the default should come back as the placeholder).
13. Type the title `QA 방제 테스트` again, leave the text empty and add no photo. Read the bottom button. Tap the
    preview icon. Screenshot the preview, then tap the call block in it.
14. Close the preview and post. Screenshot the feed card (continued in `call-post-invite-card`).

## Oracle (pass when)

- Step 1: the caption box is focused with the keyboard up (a 1-hour post is text first) (T26).
- Step 2: the line reads `지금 게시하면 HH:MM:SS에 삭제돼요` (in the app language), the time is now + 1 hour in
  24-hour form, and it ticks every second (the two reads differ by about 2 s) (T5). It is small and grey and
  fits beside the icons without wrapping (T16).
- Step 3: the preview shows the strip `1시간 · 60분 남음`. `61분` or `0분` is a finding (S2) (T27).
- Step 4: the card shows the rose `N분 남음` pill, counting down (the minute value drops by one a minute later).
- Step 5: no keyboard; the form shows, in this order, the profile facts (flag and country, age, height, with a
  lock: not editable), the hobbies (`취미 0/5`), the optional extras (job, personality, favourite food,
  favourite animal, drinking, what they are into lately), then the text box (T26). Nothing is focused 1 s later.
- Step 6: picked chips turn amber with white text (T18). The reason line says a hobby is needed until one is
  picked, then that more text is needed; the button stays in place, off (T24).
- Step 7: the sixth hobby and the fourth chip of a multi list do nothing (the count stays at 5/5 and 3); job and
  drinking hold one answer each and a second tap clears it.
- Step 8: the reason line updates as typed; at 10 characters the button turns on and reads `게시`.
- Step 9: the card shows an amber `자기소개` badge (not white on white), flag and country, age, height, and the
  hobbies and extras as pills, labels in the app language (T17).
- Step 10: no keyboard; the call card comes first, above the text box (T26).
- Step 11: the card shows the author's photo with the nationality flag at its lower left (an initial in orange on
  white when there is no photo), the title line `1대1 보이스톡해요!` with a pencil and a dashed underline, and
  comfortable ⇄ learning languages with their levels.
- Step 12: the title is editable, stops at 40 characters, and an empty field shows the default again.
- Step 13: the button is on and reads `게시` with only the title (no text, no photo needed). The preview draws the
  same block as the feed card (photo + flag, the title, languages, the green phone circle) above the author
  row, plus `1:1 보이스톡 · 60분 남음`; tapping the block in the preview does nothing (no call starts) (T20, T27).
- Step 14: the post appears once with the title as written.

## Signals

- `eval` after steps 1, 5, 10: `document.activeElement?.id` (`compose-body` only after step 1).
- `eval` twice in step 2: `document.querySelector('[data-qa=compose-hour-deletes-at]').textContent`.
- The created posts via the feed API: `category`, `expiresAt` (≈ +60 min), `intro` (hobbies, extras, `callTitle`).

## Manual follow-up

- The 1-hour post really leaving the feed, profile grid and search after an hour (or with `expiresAt` moved on
  the local DB by a person).
