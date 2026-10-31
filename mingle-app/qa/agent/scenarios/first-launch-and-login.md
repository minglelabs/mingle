---
id: first-launch-and-login
title: A fresh install asks for the language first and shows a clean, ad-free login
priority: P0
environment: device
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

- A clean first launch: uninstall the app (`xcrun devicectl device uninstall app --device <id> com.minglelabs.mingle.rn`), then run `qa-agent-device.mjs install`. Uninstalling wipes the app's local data on the owner's phone, so ask the owner first.
- Record the phone's preferred-language order in the run notes; the gate preselects from it.

## Steps

The HashChat 2.3.0 onboarding has four steps: the most comfortable language ("Choose your most comfortable
language"), the interest language ("Who would you like to meet?" with a level picker), the age check
("When were you born?") and the discovery source ("How did you hear about HashChat?"). Steps 1-3 end with
"Continue" / "계속"; step 4 ends with "Get started" / "시작하기". A fresh install opens on the Feed and the
onboarding starts when the Chats tab is opened (owner: intended, 2026-10-31).

1. Install and launch. Screenshot every ~500 ms for the first 4 s.
2. Note every system prompt that appears, and what you did before it.
3. On step 1, choose English. Screenshot every ~200 ms for 1 s after confirming.
4. Step 2: pick Japanese and a level. Check that the done chip shows the step-1 language and that the screen does
   not read like step 1 again. Step 3: pick a date of birth that is 12 or older. Step 4: pick any answer. Screenshot
   each step, then try the back gesture once on step 3 and confirm it returns to step 2.
5. Screenshot the login screen (terms sheet with "Agree and continue"), including the top and bottom safe areas.
6. Open the email sign-in sheet and screenshot it. Do not submit anything.
7. Relaunch the app. The onboarding must not appear again.

## Oracle (pass when)

- The onboarding appears before any login UI. There is no flash of the login screen in the device language first (T12).
- After choosing English, every visible string is English, with no leftover Korean, including the language list
  names (T17).
- Step 2 is clearly a different question from step 1, and back from any step lands on the previous step.
- "Agree and continue" does not look disabled when it is enabled, and it never signs in to an account the user did
  not choose (the 2026-10-15 run saw a silent Keychain sign-in; record whether it still happens).
- No permission prompt appears before the user does something that needs it (T22).
- The login screen has no ad banner (T11) and no wrong-colour safe-area bands.
- Labels fit, and buttons are not clipped or wrapped awkwardly (T16).

## Signals

- The screenshot burst. QA snapshot `uiLocale` and `documentLanguage`, if the bridge is reachable on the login screen.

## Manual follow-up

- The Apple and Google sign-in sheets (the agent signs in only with the local QA account).
