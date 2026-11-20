---
id: profile-basics-lock-and-height
title: Gender and birth date are locked once set; men give their height, shown next to the age
priority: P1
environment: device
tags: [profile, onboarding, gender, birth-date, height, my-page, edit]
taste: [T5, T13, T16, T17, T19, T22]
paths:
  - mingle-app/src/app/api/profile/route.ts
  - mingle-app/src/components/my-page.tsx
  - mingle-app/src/i18n/profile-locked-copy.ts
  - mingle-app/src/i18n/profile-height-copy.ts
  - mingle-app/src/lib/profile-height.ts
  - mingle-app/src/lib/profile-basics.ts
  - mingle-app/src/components/profile-basics-gate.tsx
  - mingle-app/src/components/LivePhoneDemo/LanguageOnboardingModal.tsx
  - mingle-app/src/components/profile-gender-age-badge.tsx
history:
  - 2026-11-19 — Gender and birth date are set once, then locked
  - 2026-11-19 — Home cards follow and message on the spot; height on profiles, required for men
---

## Preconditions

- Local server. Account M: male, with a birth date, no height. Account F: female with a birth date (optional, for
  the "not asked" check). Record each account's starting gender, birth date and height.

## Steps

1. Signed in as M, trigger the profile basics (first follow from Home or a profile). Screenshot the height step.
2. Type `119` and screenshot; then type a height such as `182` and continue.
3. Open My page → profile edit. Screenshot the gender, birth date and height fields.
4. Clear the height and try to save. Screenshot. Put the height back and save.
5. Through `eval` `fetch`, PATCH `/api/profile` with a different gender, then a different birth date. Record the
   status codes.
6. Open M's profile from another account. Screenshot the gender-age pill.
7. (Optional) Signed in as F, follow someone new. Screenshot.

## Oracle (pass when)

- Step 1: the height step says the number shows on the profile, has a number keypad and `cm`, and Continue stays
  off until a number is typed (T16, T22).
- Step 2: `119` (or anything outside 120-230) is not accepted; `182` is saved (`GET /api/profile` `heightCm: 182`)
  and the follow goes through after the question closes (T5).
- Step 3: the set gender and birth date show as plain text with the note that they cannot be changed; no picker,
  no date field (T19). The height field shows 182 and can be edited.
- Step 4: a man cannot save without a height; the message is in the app language (T17).
- Step 5: `409 gender_locked` and `409 birth_date_locked`; the profile still shows the old values.
- Step 6: the pill reads age and height, e.g. `26 · 182cm`, and nothing shifts while it loads (T13).
- Step 7: a woman is never asked for a height.

## Signals

- `GET /api/profile` before and after each step; PATCH status codes from step 5.

## Manual follow-up

- Whether the height question feels intrusive on the first follow.
