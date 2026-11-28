---
id: phone-gate-in-korea
title: From a Korean IP, "I don't have a Korean number" keeps the phone gate with a notice; outside Korea it lets the person in
priority: P0
environment: assisted
tags: [onboarding, phone, gate, country, ip, access]
taste: [T5, T12, T16, T17, T22]
paths:
  - mingle-app/src/components/onboarding/phone-gate.tsx
  - mingle-app/src/server/app-access.ts
  - mingle-app/src/server/request-country.ts
  - mingle-app/src/server/api/controllers/shared/app-access-controller.ts
  - mingle-app/src/components/conversation-list.tsx
  - mingle-app/src/components/home/home-feed-layer.tsx
  - mingle-app/src/i18n/phone-gate-copy.ts
history:
  - No history entry heading; bullet 2026-11-28-phone-gate-in-korea (the history file's newer entries are id bullets)
  - 2026-11-21 — Phone gate: "한국인이 아니에요" for a mistaken "Korean"
  - No history entry heading; bullet 2026-11-25-nationality-first-no-korean-number
---

## Preconditions

- Local server only, `PHONE_REQUIRED=on`, without Twilio Verify (the development code works), as in
  `phone-gate-one-account`. Record `PHONE_REQUIRED_LOCALES`.
- How the server sees the country: through the Cloudflare tunnel the `cf-ipcountry` header is the phone's real
  country (KR on a Korean network). A request straight to the local port has no header and a private IP, so the
  country "cannot be told" and the old behaviour applies. **Outside Korea needs a person**: a VPN on the phone
  to another country (for example US or JP), turned on by the owner.
- Two fresh accounts from the local signup API with no verified number: K (nationality KR, app language ko) and
  N (a non-Korean nationality, for example JP, app language ko or en). Never type a real person's number; use
  `+1 202 555 01xx` with the development code if a number is entered at all.

## Steps

From Korea (phone on a Korean network, devbox over the tunnel):
1. Sign in as K. Screenshot the phone gate (`phone-gate`).
2. Tap `한국 전화번호가 없어요` (`phone-gate-not-korean`). Screenshot about 500 ms and 2 s later.
3. Relaunch the app. Screenshot.
4. Tap `전화번호 인증하기` (`phone-gate-start`), enter a fake `+1 202 555 01xx` number and the code. Screenshot what
   follows (then this account has a number; use a new K for later runs).
5. Sign out, sign in as N. Screenshot the first screen after sign-in.

Outside Korea (assisted: the owner turns on a VPN to another country, then the agent relaunches the app):
6. Make a new account K2 like K. Sign in, tap `한국 전화번호가 없어요`. Screenshot.
7. Sign out, sign in as N (or a new N2). Screenshot.
8. Turn the VPN off (owner), relaunch the app signed in as K2. Screenshot.

## Oracle (pass when)

- Step 1: the gate arrives complete, with no flash of the tabs first, and offers `전화번호 인증하기` and the
  `한국 전화번호가 없어요` link (T12).
- Step 2: the person stays on the gate. The link is replaced by a white notice (`phone-gate-in-korea`):
  `한국에서는 한국 휴대폰 번호를 인증해야 쓸 수 있어요. 한국 밖에서는 번호 없이도 쓸 수 있어요.` /
  "In Korea, HashChat needs a Korean mobile number. Outside Korea you can use it without one.", in the app
  language, fully visible (T16, T17). No error toast, no spinner left behind, no way past the gate (T22).
- Step 3: after relaunch the gate shows the notice again (the server answers `needs_phone_in_korea`), not the
  link and not the tabs.
- Step 4: verifying a number still works from the notice state and opens the app.
- Step 5: N, from Korea, also gets the gate with the notice straight away (a non-Korean nationality in Korea
  still needs the number), not the link.
- Step 6: outside Korea, the link lets K2 in at once, as before 2026-11-28 (T5).
- Step 7: N outside Korea is not asked for a number.
- Step 8 (record, do not judge as a fail yet): what K2 sees back in Korea; tell the owner, since the rule says
  the number is required in Korea.

## Signals

- `GET /api/account/access` (or the native-versioned path the app calls) as seen in the server log: `reason`
  `needs_phone_in_korea` in steps 2, 3, 5; `allowed: true` in steps 6, 7.
- Direct check without a VPN, on the local port only: the same request with the QA account's session and the
  header `cf-ipcountry: KR` and then `cf-ipcountry: US` gives `needs_phone_in_korea` and `allowed`. Never print
  the session cookie.

## Manual follow-up

- A real trip abroad (roaming SIM rather than a VPN) on a deployed server.
