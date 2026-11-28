---
id: first-message-setup-gate
title: Before a first message to someone new, the app asks for a verified number and a face-verified profile photo
priority: P0
environment: assisted
tags: [message, phone, photo, face, gate, sheet, profile]
taste: [T5, T8, T10, T16, T17, T22]
paths:
  - mingle-app/src/components/first-message-gate.tsx
  - mingle-app/src/components/selfie-verify-screen.tsx
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
  - No history entry heading; bullet 2026-11-25-first-dm-face-verified-or-followed (selfie check replaces the face-in-photo check)
  - No history entry heading; bullet 2026-11-25-selfie-autostart-women-no-selfie-bio-continue (women: photo with a face only)
---

## Preconditions

- Local server only, `FIRST_MESSAGE_GATE` unset (on). Record whether `PHONE_REQUIRED=on` or an international SMS
  provider is set: without either, the number is asked only of Korean users (nationality KR or first language ko).
- A QA account that is a **man** (women are asked only for a profile photo with a face, never the selfie check,
  since `2026-11-25-selfie-autostart-women-no-selfie-bio-continue`), not an operator, official or review
  account, with no room with person P, no verified
  number (or one, to see the photo row alone), no profile photo and no passed selfie check (`faceVerifiedAt`
  empty). P does not follow the QA account (a person who follows you can be messaged without the face check).
  A second person P2 who does follow the QA account.
- The selfie check needs the owner's face in front of the front camera (**assisted**).
- Phone numbers: only fake US numbers `+1 202 555 01xx` with the development code. Never a +82 number.
- On the phone's gallery: one photo of the owner's face.

## Steps

1. Open P's profile and tap Message. Screenshot the sheet.
2. If the number row is there, tap its Verify button, enter a fake number and the development code. Screenshot
   the sheet after the SMS sheet closes.
3. Tap the photo row's `얼굴 인증` / "Verify face". With no profile photo, it asks for a photo first: pick the
   owner's photo. Screenshot the selfie screen.
4. The owner does the selfie check (it starts by itself). Screenshot the sheet once it closes.
5. Tap the sheet's continue button. Screenshot what opens.
6. In another run of step 1, close the sheet with ✕ instead, and check no room appears in the conversation list.
7. Open P2's profile (P2 follows the QA account) with an account that has not passed the selfie check, and tap
   Message. Screenshot.

## Oracle (pass when)

- Step 1 shows the sheet (`[data-qa=first-message-gate]`) with one row per missing item, in the app language,
  and no room opens behind it (T10, T16, T17).
- Step 2: the number row turns Done without leaving the sheet (T5, T8).
- Step 1: the photo row reads `얼굴 인증된 프로필 사진` / "A face-verified profile photo" with the hint that people
  who follow you can be messaged without it; the old "a photo with a face" row is not asked any more.
- Step 3: the selfie screen opens light, over the sheet, after the photo is added (see `selfie-verification`).
- Step 4: a passed check marks the row Done (the server stores `faceVerifiedAt`); a failed one leaves it to retry
  without closing the sheet (T5, T22).
- Step 5 sends again and opens the room on the first tap, unless the daily limit (a man to three new women a
  day) is used up, in which case the limit sentence shows (that also counts as the gate passing). A man
  writing to a woman on a coin-enforced account sees the 500 Hash sheet next (`dm-open-coins-attendance`).
- Step 7: no face row for a person who follows the QA account; only a missing number is still asked.
- Step 6: closing leaves the profile as it was, and the list has no room with P.
- An operator or official account, and a room that already exists, never show the sheet.

## Signals

- `POST /api/conversations/direct`: 403 with `{ error: "first_message_setup", needs }` in step 1, then 200 or 429.
- `GET /api/profile` after step 4 (`faceVerifiedAt`). `needs` in step 1 contains `face_verify`, not `face_check`.

## Manual follow-up

- The selfie check itself (the owner's face).
- Picking photos from the gallery when the agent cannot drive the system photo picker.
- Real SMS delivery on a real number (owner only).
