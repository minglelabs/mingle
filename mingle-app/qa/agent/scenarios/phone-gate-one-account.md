---
id: phone-gate-one-account
title: The phone gate keeps one account per number: a used number is refused, and an empty new account moves into the number's account
priority: P0
environment: assisted
tags: [onboarding, phone, auth, account, session, error]
taste: [T5, T12, T16, T17, T22]
paths:
  - mingle-app/src/components/onboarding/phone-gate.tsx
  - mingle-app/src/components/contacts/phone-verify-sheet.tsx
  - mingle-app/src/server/phone-verification.ts
  - mingle-app/src/server/identity/**
  - mingle-app/src/server/app-access.ts
  - mingle-app/src/server/api/controllers/shared/phone-contacts-controller.ts
  - mingle-app/src/server/api/controllers/shared/app-access-controller.ts
  - mingle-app/src/lib/auth-options.ts
  - mingle-app/src/lib/native-device-identity.ts
  - mingle-app/src/i18n/phone-friends-copy.ts
  - mingle-app/rn/src/nativeCapabilities.ts
  - mingle-app/rn/ios/mingle/NativeSTTModule.swift
  - mingle-app/rn/ios/mingle/PrivacyInfo.xcprivacy
  - mingle-app/rn/android/app/src/main/java/com/minglelabs/mingle/rn/NativeRuntimeConfigModule.kt
  - mingle-app/src/lib/user-notification-types.ts
history:
  - 2026-11-16 — One account per person: phone gate, number already in use, sign-in methods, permanent ban screen
---

## Preconditions

- Local server only, started with `PHONE_REQUIRED=on` and without Twilio Verify, so it accepts the development
  code. Use made-up numbers in the `+1 202 555 01xx` range. Never a real person's number.
- Three accounts on the local server (O and F through the signup API, passwords kept in `qa/agent/local/` and
  never printed):
  - **O** (owner): has verified number N1 and has sent at least one message.
  - **E** (empty): made by a sign-in less than 24 hours ago, with no password of its own, no number, no invite
    and no messages, posts, follows or purchases. Only a Google or Apple sign-up makes such an account, so the
    owner signs in with a Google account that never used HashChat (the agent never types those credentials).
    Local stand-in when the owner is away: make E through the signup API, sign in as E on the phone, then clear
    E's `password_hash` on the local database. That is the one write this scenario allows, and the notes must
    say the stand-in was used.
  - **F** (full): no number, but has sent a message or written a post.
- Record the device row before the run: `app.app_devices` for this phone (read-only), and after each step which
  accounts it lists.

## Steps

1. Sign in as F. Screenshot the first screen after sign-in.
2. On the phone gate, start verification and enter N1 (O's number), then the code. Screenshot the result.
3. Enter a new number N2 and the code. Screenshot what follows, up to the first usable screen.
4. Sign out. Sign in as E. On the gate, enter N1 and the code. Screenshot every ~500 ms for 3 s after confirming.
5. Open My Page. Screenshot the account name and handle.
6. Relaunch the app. Screenshot.
7. Enter a wrong code once on any gate before the right one (do it in step 3). Screenshot the error.
8. Device rule: sign out, make another empty account E2 on the same phone, and on the gate enter a number N3
   that nobody uses. Screenshot, then open My Page and its sign-in methods.

## Oracle (pass when)

- A signed-in account without a verified number sees the phone gate before Home, with no way around it and no
  ad on it. The gate arrives complete, not after a flash of Home (T12).
- Step 2 is refused with `이 번호는 다른 계정에서 쓰고 있어요. 그 계정으로 로그인해 주세요.` / "This number is
  used by another account. Please sign in to that account." in the sheet, in the app language. F stays signed
  in as F, without a number, and O is unchanged (T16, T22).
- Step 3 passes: the gate closes, and the gender and birth date question comes next if F has not answered it.
- Step 4 does not refuse. The app says `이미 쓰던 계정이 있어서 그 계정으로 들어갑니다.` (English: "You already have an
  account, so we're signing you in to it.") and the app is then signed in as O. Step 5 shows O's name and
  handle, and O's rooms are in the list.
- Step 6 still opens as O, with no gate.
- A wrong code shows a plain error and lets the user retry without starting over (T5).
- Step 8 also ends signed in as the account this phone already had (O), not as E2, and N3 shows in O's
  sign-in methods as an extra number that can be removed.
- N1 never moves: after the run it still belongs to O only.

## Signals

- Screenshots. Read-only SQL on the local DB after each step: `app.app_users` (`merged_into_user_id`,
  `merged_at`) for E, `app.app_user_phones` for N1 and N2, `app.app_identity_links` for O.
- O's notification panel: a "sign-in method attached" notice after step 8, and after step 4 when E was a
  Google or Apple sign-up.

## Manual follow-up

- Steps 4-6 and 8 with a real Google or Apple sign-up, when the run used the local stand-in.
- A real SMS code through Twilio Verify on a deployed server.
