---
id: first-launch-and-login
title: A fresh install asks for the language first and shows a clean, ad-free login
priority: P0
environment: sim
tags: [onboarding, auth, locale, banner, safe-area]
taste: [T11, T12, T16, T17, T22]
paths:
  - mingle-app/src/components/mingle-home*.ts*
  - mingle-app/src/components/auth/**
  - mingle-app/src/components/email-auth-sheet-state.ts
  - mingle-app/src/components/LivePhoneDemo/LanguageOnboardingModal.tsx
  - mingle-app/src/components/LivePhoneDemo/language-onboarding*.ts
  - mingle-app/src/components/native-oauth-launcher.tsx
  - mingle-app/src/i18n/**
  - mingle-app/rn/App.tsx
history:
  - 2026-08-17 - First-Launch Language Gate Before Authentication
  - 2026-08-14 - Hide native banner ads on login
  - 2026-08-24 — Remove unsolicited iOS Bonjour permission prompt
  - P2 Detailed First Thread (login screen safe areas showed white bands)
---

## Preconditions

- The app is not installed, or was uninstalled with `xcrun simctl uninstall <udid> com.minglelabs.mingle.rn`.
- The simulator language is Korean (the QA default), unless the run asks for another.

## Steps

1. Install and launch. Screenshot every ~500 ms for the first 4 s.
2. Note every system prompt that appears, and what you did before it.
3. On the language gate, choose English. Screenshot every ~200 ms for 1 s after confirming.
4. Screenshot the login screen, including the top and bottom safe areas.
5. Open the email sign-in sheet and screenshot it. Do not submit anything.
6. Relaunch the app. The language gate must not appear again.

## Oracle (pass when)

- The language gate appears before any login UI. There is no flash of the login screen in the device language first (T12).
- After choosing English, every visible string is English, with no leftover Korean (T17).
- No permission prompt appears before the user does something that needs it (T22).
- The login screen has no ad banner (T11) and no wrong-colour safe-area bands.
- Labels fit, and buttons are not clipped or wrapped awkwardly (T16).

## Signals

- The screenshot burst. QA snapshot `uiLocale` and `documentLanguage`, if the bridge is reachable on the login screen.

## Real-device follow-up

- The Apple and Google sign-in sheets (real accounts are out of scope for the agent).
