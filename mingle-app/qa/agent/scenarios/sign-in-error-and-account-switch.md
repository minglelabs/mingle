---
id: sign-in-error-and-account-switch
title: A failed or switched social sign-in comes back to the app sign-in screen, and "Last used" marks the last method
priority: P0
environment: assisted
tags: [auth, native-auth, error, badge, locale]
taste: [T5, T12, T16, T17, T22]
paths:
  - mingle-app/src/app/api/auth/**
  - mingle-app/src/app/api/native-auth/**
  - mingle-app/src/app/[locale]/auth/**
  - mingle-app/src/app/auth/**
  - mingle-app/src/lib/native-auth*.ts
  - mingle-app/src/lib/last-sign-in-method*.ts
  - mingle-app/src/components/sign-in-screen.tsx
  - mingle-app/src/components/last-sign-in-method-recorder.tsx
  - mingle-app/src/components/mingle-home*.ts*
  - mingle-app/src/i18n/sign-in-failed-copy.ts
  - mingle-app/src/i18n/last-sign-in-method-copy.ts
  - mingle-app/rn/ios/mingle/NativeAuthModule.swift
  - mingle-app/rn/src/nativeAuth.ts
history:
  - 2026-11-13 — Sign-in: a failed Google or Apple sign-in comes back to the app sign-in screen
  - 2026-11-13 — Sign-in: the button this device last signed in with says "Last used"
  - 2026-08-17 - iOS Google OAuth First-Attempt Recovery
---

## Preconditions

- Two Google accounts the owner can sign in with on this phone (A and B), each already a HashChat account, and
  B never linked to A. The owner types the passwords; the agent never enters Google credentials.
- Start signed out. Record the app version, the phone, and whether Safari is signed in to the HashChat website
  (`translator.minglelabs.app`) with any account. That website session is what broke the switch on 2026-11-13.
- Reinstalling wipes the app's local data, so ask the owner before step 5.

## Steps

1. Open the sign-in screen. Screenshot it. Note which button, if any, carries a `최근 사용` / `Last used` badge.
2. Sign in with Google as A (owner types). Screenshot the moment the sheet closes and the screen after it.
3. Sign out (My Page → Sign out). Screenshot the sign-in screen: the badge must now be on Google.
4. Sign in with Google as B, without signing out of anything in Safari. Screenshot the sheet and the result.
5. With the owner's OK: sign out, uninstall the app, reinstall (`qa-agent-device.mjs install`), and sign in with
   Google as the account that was NOT used last. This is the 2026-11-13 reproduction.
6. Start a Google sign-in and cancel it in the sheet (Cancel / swipe down). Screenshot the sign-in screen.
7. Make one sign-in fail on purpose: with the owner, deny consent on Google's screen, or turn on airplane mode
   after the sheet opens. Screenshot whatever the sheet shows, then the app screen after the sheet closes.
8. If an Apple ID is available, repeat steps 2-3 with Apple and check the badge moves to Apple.
9. Switch the app to English and look at the sign-in screen and the failure message once more.

## Oracle (pass when)

- The NextAuth built-in page (a plain white page titled "Sign in" with "Sign in with Google", or "Error" /
  "Try signing in with a different account") never appears, in the sheet or anywhere else (T12, T19).
- No sign-in ever finishes inside the sheet as a website. The sheet closes and the app itself is signed in, or it
  returns to the app sign-in screen.
- Steps 4 and 5 sign in as the account the owner chose, B or the other one, not the previous one, and without an
  error. Check the account in My Page.
- When a sign-in really fails (step 7), the sheet closes and the sign-in screen shows the failure message under the
  logo (`로그인하지 못했어요…` / English copy) in the app's language. It is not a system alert, and it never shows an
  empty return with no explanation (T5, T22).
- A cancelled sign-in (step 6) returns quietly: no error message, no alert (T22).
- `Last used` sits on the button of the last successful method only. It does not move after a cancel or a failure,
  and a fresh install shows none. The badge is not clipped by the button above it and fits in every locale (T16, T17).

## Signals

- Screenshots of every sheet and the screen after it closes.
- Railway `mingle-app` logs around each attempt, filtered with `native-auth` and `next-auth`. Record any
  `OAuthAccountNotLinked`, `State cookie was missing` or `authError` lines with their time.
- QA snapshot of `localStorage["mingle:last-sign-in-method:v1"]` before and after steps 2, 6 and 7, if the bridge
  is reachable.

## Manual follow-up

- Typing the Google and Apple credentials (the owner does it).
- The same steps on Android (Chrome Custom Tab instead of the iOS sheet).
