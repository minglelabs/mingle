---
id: explore-browse-posts
title: Explore shows posts before anything is typed, and the feed lives under the Explore tab
priority: P1
environment: device
tags: [explore, feed, grid, tabs, back, keyboard]
taste: [T1, T6, T9, T12, T18]
paths:
  - mingle-app/src/components/search/unified-search.tsx
  - mingle-app/src/components/connect-page.tsx
  - mingle-app/src/components/bottom-tab-bar.tsx
  - mingle-app/src/lib/feed-routes.ts
history:
  - 2026-11-16 — Home tab: people first, tabs are Home, Chats, Explore, My, and one new chat a day
  - 2026-08-25 — Keep Explore tab entry keyboard-free
---

## Preconditions

- Signed in. The local feed has at least 12 posts with a photo (seed on the local database only, see
  `docs/feed-seed-content.md`).

## Steps

1. Tap the Explore tab (third tab). Screenshot about 500 ms later.
2. Scroll the post grid down one screen. Screenshot.
3. Tap a post in the grid. Screenshot the feed once it settles, including the bottom tab bar.
4. Swipe to the next post, then edge-swipe back. Screenshot.
5. Type `a` in the search field. Screenshot, then clear the field. Screenshot.

## Oracle (pass when)

- Entering Explore does not open the keyboard (T1), and the grid is there without typing: no empty screen that
  only says to search (T12).
- Tapping a grid post opens the feed on that post, not on the first post of the feed.
- While the feed is open, the Explore tab is the one in the key colour (T18). No tab is left unselected, and Home
  is not selected.
- Back from the feed is one step and lands on the grid at the same scroll position (T6, T9).
- Typing replaces the grid with search results; clearing the field brings the grid back.

## Signals

- Screenshots. The path after step 3 (`eval 'location.pathname + location.search'`): `/<locale>/feed` with the
  tapped post id.

## Manual follow-up

- None.
