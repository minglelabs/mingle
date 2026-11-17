---
id: sign-in-methods-detach
title: My Page lists the ways into the account, and one that was added later can be removed
priority: P1
environment: device
tags: [account, auth, sheet, mypage, confirm]
taste: [T5, T10, T16, T17, T19, T22]
paths:
  - mingle-app/src/components/account/**
  - mingle-app/src/components/my-page.tsx
  - mingle-app/src/server/identity/methods.ts
  - mingle-app/src/server/api/controllers/shared/sign-in-methods-controller.ts
  - mingle-app/src/app/api/account/sign-in-methods/**
  - mingle-app/src/i18n/sign-in-methods-copy.ts
  - mingle-app/src/app/api/*/*/account/sign-in-methods/**
history:
  - 2026-11-16 — One account per person: phone gate, number already in use, sign-in methods, permanent ban screen
---

## Preconditions

- Signed in as an account that has one original sign-in method and at least one that was attached later. The
  account O left by `phone-gate-one-account` (its step 8 attaches the extra number N3) is the simplest; run
  that scenario first. With only original methods, steps 3-6 are `blocked`.

## Steps

1. Open My Page, scroll to `로그인 수단` / "Sign-in methods" and tap it. Screenshot the sheet.
2. Note each row: its label (email, Google, Apple, `전화번호 ••••1234`), whether it says `Added later`, and
   whether it has a Remove button.
3. Tap Remove on a later-added method. Screenshot the confirmation.
4. Cancel. Screenshot. Tap Remove again and confirm. Screenshot.
5. Close the sheet and open it again. Screenshot.
6. Sign out and sign in with the removed method (for an extra number: phone sign-in with that number and the
   development code). Screenshot the result and My Page.

## Oracle (pass when)

- The sheet rises from the bottom over My Page, stays above the tab bar and the home indicator, and closes with
  the X and a tap outside (T10, T19).
- Phone numbers show only their last four digits.
- The method the account was made with has no Remove button. Only later-added rows have one.
- Remove asks first ("Once removed, it can no longer sign in to this account. Remove it?"). Cancel changes
  nothing. Confirm removes the row and says `Removed.` without a system alert (T22).
- After reopening, the removed row is still gone.
- Step 6 does not open O. A removed number signs in to an account of its own (a new one), never to O.
- Every string is in the app language (T17), and no label is clipped (T16).

## Signals

- Screenshots. `GET /api/account/sign-in-methods` before and after step 4 (through `eval` `fetch`).

## Manual follow-up

- Removing a Google or Apple method that was attached later (needs the owner's accounts).
