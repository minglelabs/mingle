---
id: home-tab-people
title: The app opens on Home with people to meet, and the tabs are Home, Chats, Explore, My
priority: P0
environment: device
tags: [home, tabs, people, notices, restore, back]
taste: [T6, T8, T9, T12, T13, T16, T18, T20]
paths:
  - mingle-app/src/components/home/**
  - mingle-app/src/app/*/home/**
  - mingle-app/src/lib/home-routes.ts
  - mingle-app/src/components/bottom-tab-bar.tsx
  - mingle-app/src/components/feed/use-first-run-home.ts
  - mingle-app/src/web/shared/v1.1.0/home-entry.tsx
  - mingle-app/src/server/people-discovery.ts
  - mingle-app/src/server/notices.ts
  - mingle-app/src/app/api/users/discover/**
  - mingle-app/src/app/api/notices/**
  - mingle-app/src/i18n/home-copy.ts
  - mingle-app/src/i18n/people-discovery-copy.ts
  - mingle-app/src/i18n/profile-start-copy.ts
  - mingle-app/src/app/api/*/*/users/discover/**
  - mingle-app/src/app/api/*/*/notices/**
  - mingle-app/src/app/admin/notices/**
history:
  - 2026-11-16 — Home tab: people first, tabs are Home, Chats, Explore, My, and one new chat a day
---

## Preconditions

- Signed in with the QA account. The local DB has at least 8 other accounts with a photo, some of them active in
  the last 5 minutes (sign one in from a browser on the local server just before the run) and some not.
- For the notice steps: one general notice published from `/admin/notices` on the local server. Without admin
  access, report steps 6-7 as `manual`.

## Steps

1. `app terminate`, then `app launch`. Screenshot every ~300 ms until the first screen is stable (4 s at most).
2. Screenshot the bottom tab bar. Tap each tab once, left to right, and screenshot each screen.
3. Back on Home, screenshot the people grid. Note the heading, the badge on each card (`접속 중` / Online,
   `신규` / New, `최근 접속` / Active) and the order of the cards.
4. Scroll down two screens, tap `더 보기` / Show more if it is there, then tap a card (once). Screenshot the profile.
5. Edge-swipe back. Screenshot.
6. If a notice strip is shown at the top (`이번 주 영구 퇴출 N명` / "N permanently banned this week"), tap it.
   Screenshot the notice list, then go back.
7. With the QA account still on the default name or without a photo, screenshot the "Finish your profile" card
   and tap `Later`. Relaunch and check whether it comes back.
8. Sign out. Screenshot Home signed out.

## Oracle (pass when)

- A relaunch opens on Home, not on the feed and not on the conversation list. There is no flash of another tab's
  screen first (T12).
- The tabs read Home, Chats, Explore, My from left to right (`홈`, `대화목록`, `탐색`, `마이`), and exactly one
  is in the key colour, the one whose screen is shown (T18). There is no Feed tab.
- Each tab opens on the first tap (T8).
- Cards of people online now come before the others, and every card shows a photo, a name and a badge that
  matches its state. No empty card, no card for the QA account itself, no blocked account (T20).
- Cards do not move after they appear, apart from new ones added below by "Show more" (T13).
- Back from a profile lands on Home at the same scroll position, with the same cards (T6, T9).
- The notice list shows general notices with title and date, and bans as a masked name with a category, never a
  full name or handle. A week without bans shows no strip.
- Signed out, Home shows the sign-in prompt and button instead of an empty grid, in the app language (T16).

## Signals

- The screenshot bursts. `GET /api/users/discover` and `GET /api/notices?view=list` responses (through `eval`
  `fetch`, signed in as the QA account) to compare with what the grid shows.

## Manual follow-up

- Whether the order of people feels right to the owner (who is first, how many operator accounts).
- Publishing a notice from the admin page, when the agent has no admin access.
