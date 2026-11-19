---
id: banned-account-gate
title: A permanently banned account sees only the ban screen, its linked accounts go with it, and Home announces it without the name
priority: P1
environment: assisted
tags: [ban, account, admin, notices, auth, trust]
taste: [T12, T16, T17, T20, T22]
paths:
  - mingle-app/src/components/onboarding/banned-gate.tsx
  - mingle-app/src/server/identity/ban.ts
  - mingle-app/src/server/app-access.ts
  - mingle-app/src/app/admin/accounts/**
  - mingle-app/src/components/home/home-notices.tsx
  - mingle-app/src/i18n/banned-gate-copy.ts
  - mingle-app/src/app/admin/reports/page.tsx
  - mingle-app/src/app/admin/more/page.tsx
history:
  - 2026-11-16 — One account per person: phone gate, number already in use, sign-in methods, permanent ban screen
  - 2026-11-16 — Home tab: people first, tabs are Home, Chats, Explore, My, and one new chat a day
---

## Preconditions

- Local server only. A ban also blocks the device it was used on, so this scenario blocks the test phone for
  every account until it is undone. **Always finish with the clean-up below**, and tell the owner before running
  it on their phone.
- Two throwaway accounts made on this phone, T1 and T2 (so they share the device), each with a made-up number,
  and a third account V that has never been on this phone (use a browser on the local server for V).
- Admin access to the local server's `/admin`. The owner signs in to the admin page, or gives the agent a local
  admin login; without it the scenario is `blocked`.

## Steps

1. In `/admin/accounts`, open T1. Screenshot the page: sign-in methods, devices and linked accounts.
2. Start a ban of type `퇴출` and look at the preview before confirming. Screenshot the preview. Pick a notice
   category and confirm.
3. On the phone, with T1 signed in, bring the app to the front. Screenshot. Tap every tab position and try
   edge-swipe back. Screenshot.
4. Tap `로그아웃` / Sign out. On the sign-in screen, try to sign in as T2 (phone number and code). Screenshot.
5. Try to start a new sign-up on this phone with a new made-up number. Screenshot.
6. As V in the browser at phone width, open Home. Screenshot the notice strip, tap it, and screenshot the list.
7. Clean-up: in the admin page, unban T1 and T2 and unblock the device. Relaunch the app on the phone and sign
   in as T1. Screenshot.

## Oracle (pass when)

- The preview in step 2 lists T1, T2 and the phone, and nothing that is not linked to them. V is not in it.
- After the ban, the app shows only the ban screen (`이용이 영구 제한된 계정이에요` / "This account is
  permanently banned") with a Sign out button. No tab bar, no list behind it, no way back into the app (T20).
  It arrives without a flash of Home first (T12).
- T2 cannot sign in, and a new number cannot be verified on this phone: the sheet says `이 번호는 사용할 수
  없어요.` / "This number can't be used." in the app language, not a generic failure (T16, T22).
- V's Home shows `이번 주 영구 퇴출 N명` with N counting the banned accounts, and the list shows each as a
  masked name (first letter and `***`) with the chosen category. No full name, handle or photo.
- After the clean-up, T1 signs in normally and the device is no longer blocked.

## Signals

- Screenshots. Read-only SQL on the local DB: `app.app_users.banned_at` for T1 and T2,
  `app.app_identity_blocks` rows for the phone, `app.app_notices` rows of kind `ban`.

## Manual follow-up

- Signing in to the admin page, when the agent has no admin login.
- A ban that reaches an account through Google or Apple (needs the owner's accounts).
