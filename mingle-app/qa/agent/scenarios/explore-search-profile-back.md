---
id: explore-search-profile-back
title: Search keeps its results across profile visits and never opens the keyboard by itself
priority: P2
environment: device
tags: [search, keyboard, profile, back, scroll]
taste: [T1, T8, T9, T14, T6]
paths:
  - mingle-app/src/components/connect-page.tsx
  - mingle-app/src/components/connect-search-*.ts
  - mingle-app/src/components/public-user-profile-screen.tsx
  - mingle-app/src/app/api/users/**
history:
  - 2026-08-25 — Keep Explore tab entry keyboard-free
  - 2026-08-14 - Preserve Explore search results after profile back navigation
  - 2026-09-09 — Preserve restored Explore search pages
  - 2026-09-08 — Search tab scroll boundaries and keyboard handling
---

## Preconditions

- Signed in. The local DB has at least a few users whose names contain `a`.

## Steps

1. Tap the Search tab. Screenshot about 500 ms later.
2. Tap the field, type `a` and wait for results. Screenshot.
3. Scroll the results down. Screenshot (the header and tab bar must stay put).
4. Tap a result's avatar (not its name). Screenshot the profile.
5. Edge-swipe back. Screenshot.
6. Tap the Search tab again while already on it.

## Oracle (pass when)

- Entering the tab does not open the keyboard (T1).
- Tapping the avatar opens the profile on the first tap (T8).
- After back, the query, the results and the scroll position are as they were (T9).
- The header and bottom tabs stay fixed while results scroll (T14).
- Back from the profile is one level (T6).

## Signals

- Screenshots.

## Manual follow-up

- None.
