---
id: first-message-setup-gate
title: Before a first message to someone new, the app asks for a verified number and a photo with a face
priority: P0
environment: assisted
tags: [message, phone, photo, face, gate, sheet, profile]
taste: [T5, T8, T10, T16, T17, T22]
paths:
  - mingle-app/src/components/first-message-gate.tsx
  - mingle-app/src/lib/first-message-setup.ts
  - mingle-app/src/lib/native-face-check.ts
  - mingle-app/src/i18n/first-message-gate-copy.ts
  - mingle-app/src/server/first-message-gate.ts
  - mingle-app/src/server/phone-verification.ts
  - mingle-app/src/app/api/profile/image/**
  - mingle-app/src/server/api/controllers/shared/conversations-controller.ts
  - mingle-app/src/server/api/controllers/shared/conversation-controller.ts
  - mingle-app/rn/ios/mingle/NativeQrImageModule.swift
  - mingle-app/rn/android/app/src/main/java/com/minglelabs/mingle/rn/NativeQrImageModule.kt
history:
  - 2026-11-19 — First message to someone new: a verified number and a photo with a face first
---

## Preconditions

- Local server only, `FIRST_MESSAGE_GATE` unset (on). Record whether `PHONE_REQUIRED=on` or an international SMS
  provider is set: without either, the number is asked only of Korean users (nationality KR or first language ko).
- A QA account that is not an operator, official or review account, with no room with person P, no verified
  number (or one, to see the photo row alone) and no profile photo.
- Phone numbers: only fake US numbers `+1 202 555 01xx` with the development code. Never a +82 number.
- On the phone's gallery: one photo with a clear face and one without a face (a plant or an object).

## Steps

1. Open P's profile and tap Message. Screenshot the sheet.
2. If the number row is there, tap its Verify button, enter a fake number and the development code. Screenshot
   the sheet after the SMS sheet closes.
3. Tap the photo row's Add photo and pick the photo without a face. Screenshot.
4. Tap Add photo again and pick the photo with a face. Screenshot.
5. Tap the sheet's continue button. Screenshot what opens.
6. In another run of step 1, close the sheet with ✕ instead, and check no room appears in the conversation list.

## Oracle (pass when)

- Step 1 shows the sheet (`[data-qa=first-message-gate]`) with one row per missing item, in the app language,
  and no room opens behind it (T10, T16, T17).
- Step 2: the number row turns Done without leaving the sheet (T5, T8).
- Step 3: the photo without a face is not uploaded; the sheet says it found no face
  (`[data-qa=first-message-gate-no-face]`) and asks for another (T22).
- Step 4: the photo with a face is uploaded (the server stores `imageFaceCheck: face`) and the row turns Done.
- Step 5 sends again and opens the room on the first tap, unless the one-new-person-a-day limit is used up, in
  which case the limit sentence shows (that also counts as the gate passing).
- Step 6: closing leaves the profile as it was, and the list has no room with P.
- An operator or official account, and a room that already exists, never show the sheet.

## Signals

- `POST /api/conversations/direct`: 403 with `{ error: "first_message_setup", needs }` in step 1, then 200 or 429.
- `GET /api/profile` after step 4 (`imageFaceCheck`). Android: `logs --grep face` for ML Kit results.

## Manual follow-up

- Picking photos from the gallery when the agent cannot drive the system photo picker.
- Real SMS delivery on a real number (owner only).
