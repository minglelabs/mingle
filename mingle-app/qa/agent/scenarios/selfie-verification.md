---
id: selfie-verification
title: Selfie verification turns the head left then right on the phone, and gives a Verified badge
priority: P2
environment: assisted
tags: [my-page, selfie, camera, face, badge, permission]
taste: [T5, T12, T16, T17, T22]
paths:
  - mingle-app/src/components/selfie-verify-screen.tsx
  - mingle-app/src/components/public-user-profile-screen.tsx
  - mingle-app/src/i18n/verification-badges-copy.ts
  - mingle-app/src/lib/selfie-liveness.ts
  - mingle-app/src/i18n/selfie-verify-copy.ts
  - mingle-app/src/app/api/profile/face-verification/**
  - mingle-app/public/models/human/**
  - mingle-app/rn/App.tsx
history:
  - 2026-11-19 — Selfie check on the phone for a "Verified" badge (free, nothing leaves the phone)
  - No history entry heading; bullet 2026-11-25-verification-chips-explore-after-signup (the badge became chips)
  - No history entry heading; bullet 2026-11-25-my-page-two-checks
  - No history entry heading; bullet 2026-11-25-selfie-autostart-women-no-selfie-bio-continue
---

## Preconditions

- Signed in with a QA account. For the full pass (assisted): a profile photo of the person who will stand in front
  of the phone. The agent alone covers steps 1-4 with nobody in front of the camera.
- Do not play sound or raise the volume.

## Steps

1. Open My page. Screenshot the `[data-qa=my-page-selfie-verify]` button.
2. Tap it. Screenshot the intro.
3. Tap Start (`[data-qa=selfie-verify-start]`). Accept the camera permission if the system asks. Screenshot
   every ~1 s for 6 s.
4. With nobody in front of the camera, wait 20 s. Screenshot the message.
5. (Assisted) A person with their face as the profile photo looks straight, turns the head left, then right, then
   back. Screenshot each prompt and the end.
6. (Assisted) Open the person's profile from another account. Screenshot the name row.
7. Change the profile photo, then open the profile again.

## Oracle (pass when)

- The button is on My page in the app language, and the intro says nothing leaves the phone (T16, T17).
- The camera preview appears within about 5 s of Start, mirrored, with the hint
  (`[data-qa=selfie-verify-hint]`) and the gauge (`[data-qa=selfie-verify-gauge]`) (T12).
- With no face, the hint asks to show the face, and the run ends on a message that says it could not finish, never
  on Verified; the app shell does not fall to its error screen (T22).
- Step 5: the prompts read "왼쪽으로" then "오른쪽으로" (the person's own sides, matching the mirrored preview),
  with arrows on the side to turn toward, and the gauge fills as the head turns. The end says Verified.
- Step 6 shows a green check on the profile photo (`[data-qa=profile-avatar-face-verified]`) and a green
  `얼굴 인증` chip in the row under the name (`[data-qa=profile-verified-face]`, next to `profile-verified-phone`
  when the number is verified). Step 7 removes both face marks.
- Since 2026-11-25 the check starts by itself once the screen opens; a `시작하기` button still waiting to be tapped
  is a finding. My page shows two buttons side by side (face, phone), each `✓` when done.

## Signals

- `POST /api/profile/face-verification` status and the similarity it sent (only a number, no image).
- `GET /api/profile` `faceVerifiedAt` before and after steps 5 and 7.

## Manual follow-up

- The full pass with a real face (steps 5-6): the agent cannot turn a head.
- Whether the bar (0.55) lets the same person pass with an older or different-looking photo.
