---
id: dm-open-coins-attendance
title: A man opening a new chat with a woman pays 500 Hash after a clear sheet (3 a day), and opening the app each day pays attendance Hash
priority: P1
environment: assisted
tags: [coins, hash, message, limit, attendance, toast, sheet, gender]
taste: [T5, T8, T10, T16, T17, T21, T22]
paths:
  - mingle-app/src/components/dm-open-coins-gate.tsx
  - mingle-app/src/lib/dm-open-coins.ts
  - mingle-app/src/server/dm-open-charge.ts
  - mingle-app/src/server/coins/attendance.ts
  - mingle-app/src/server/coins/free-grants.ts
  - mingle-app/src/server/daily-new-chat-limit.ts
  - mingle-app/src/app/api/coins/attendance/**
  - mingle-app/src/components/coins/coin-usage-section.tsx
  - mingle-app/src/server/api/controllers/shared/conversations-controller.ts
  - mingle-app/src/i18n/dm-open-coins-copy.ts
history:
  - No history entry heading; bullet 2026-11-26-dm-open-hash-and-attendance (the history file's newer entries are id bullets)
  - No history entry heading; bullet 2026-11-25-people-safety-filters-visitors
  - No history entry heading; bullet 2026-11-25-block-men-follow-exception
---

## Preconditions

- Devbox with the coin keys from Vault (see `hash-store-purchase`): the QA account's id in
  `COIN_ENFORCE_USER_IDS` (both features run only for accounts billed for real). `DM_OPEN_COINS` and
  `DAILY_NEW_CHAT_LIMIT` unset (500 and 3); record `DM_OPEN_REFUND_HOURS`, `ATTENDANCE_DAILY_COINS`,
  `ATTENDANCE_WEEK_BONUS_COINS`.
- The QA account A is a man with a verified number and a face-verified profile photo, so the first-message sheet
  does not stand in front (**assisted**: the selfie check needs the owner's face; see `selfie-verification`). Its
  balance is at least 1,000 Hash of free Hash (never buy for this test). Attendance pays only Apple or Google
  sign-ins, unless the devbox runs with `COIN_FREE_GRANTS_ALLOW_EMAIL=1`; record which.
- Local accounts A has no room with: women W1, W2, W3, W4 (none follows A), woman W5 who follows A, man M1, and
  the official account. Read-only SQL or the local signup API to set them up; no writes to other people's data.

## Steps

Opening a chat:
1. Read A's balance (`GET /api/coins/wallet`). Open W1's profile, tap Message. Screenshot the sheet
   (`dm-open-coins-gate`).
2. Tap `취소` (`dm-open-coins-cancel`). Screenshot. Read the balance and the chat list.
3. Tap Message again and confirm (`500해씨로 대화 열기`, `dm-open-coins-confirm`). Screenshot the room. Read the
   balance and open My page → Hash history. Screenshot.
4. Go back to W1's profile and tap Message. Screenshot.
5. Open W5's profile (she follows A) and tap Message. Screenshot. Then M1's. Then the official account's.
6. Open W2 and W3 with the sheet as in step 3. Then open W4's profile and tap Message. Screenshot.
7. Low balance: spend or start with a balance under 500 (a separate QA account A2 with 100 Hash), open a woman's
   profile, tap Message. Screenshot. Tap `해씨 충전하기` (`dm-open-coins-buy`). Screenshot, then leave the store
   without buying.

Attendance:
8. On a Korea-time day A has not opened the app yet (check the history for today's `출석체크`), cold-launch the
   app. Screenshot within 3 s. Read the balance and the history.
9. Relaunch the app twice the same day. Screenshot after each.

## Oracle (pass when)

- Step 1: a sheet titled `새 대화 열기` says `새 대화를 열면 500해씨가 들어요. 48시간 안에 상대가 답장하지 않으면
  그대로 돌려드려요.` with `500해씨로 대화 열기` as the big button and `취소` under it, in the app language
  (T16, T17, T21). No room opens behind it (T10).
- Step 2: `취소` closes the sheet; no room, no charge.
- Step 3: the room opens on the first tap (T8); the balance drops by exactly 500 once the room exists; the
  history shows one `새 대화 열기` line.
- Step 4: the existing room opens; no sheet, no second charge.
- Step 5: no sheet and no charge for a woman who follows A, for a man, and for the official account.
- Step 6: W2 and W3 charge 500 each. W4 is the fourth new woman today: the limit sentence (`오늘은 새로운 사람
  3명에게만 먼저 말을 걸 수 있어요…`) shows on the profile, no sheet, no charge, no room (T22).
- Step 7: the sheet says `해씨가 부족해요` and `새 대화를 열려면 500해씨가 필요해요. 지금 100해씨가 있어요.` with
  `해씨 충전하기`, which opens the Hash store (T5). Nothing is charged.
- Step 8: one toast `출석 N일째 · 100해씨를 받았어요` shortly after launch; the balance rises by 100; the history
  shows `출석체크`. On the seventh day in a row a second toast `7일 연속 출석! 300해씨를 더 드려요` and a
  `7일 연속 출석` line.
- Step 9: no second toast and no second payment the same day (T22).

## Signals

- `GET /api/coins/wallet` before and after each step; `GET /api/coins/history` lines and their sources
  (`dm_open`, `attendance`, `attendance_bonus`, `dm_open_refund`).
- `POST /api/coins/attendance` response in the server log: `granted` once, then `already`.

## Manual follow-up

- The 48-hour refund (a room where the woman wrote nothing gives the Hash back, with a toast
  `답장이 없던 대화 500해씨를 돌려드렸어요` and a `답장 없는 대화 환불` line): needs 48 hours, or a devbox run
  with a small `DM_OPEN_REFUND_HOURS` set by a person.
- The 7-day streak and a missed day restarting at 1 (covered by `src/server/coins/attendance.test.ts`).
