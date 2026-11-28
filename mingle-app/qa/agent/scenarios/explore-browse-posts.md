---
id: explore-browse-posts
title: Explore's search opens on posts before anything is typed, and a grid post opens the feed on that post
priority: P1
environment: device
tags: [explore, feed, grid, tabs, back, keyboard]
taste: [T1, T6, T9, T12, T18]
paths:
  - mingle-app/src/components/search/unified-search.tsx
  - mingle-app/src/components/explore/explore-people-page.tsx
  - mingle-app/src/components/connect-page.tsx
  - mingle-app/src/components/bottom-tab-bar.tsx
  - mingle-app/src/lib/feed-routes.ts
history:
  - 2026-11-16 — Home tab: people first, tabs are Home, Chats, Explore, My, and one new chat a day
  - No history entry heading; bullet 2026-11-25-explore-search-row-posts-first (Explore is people cards; its search opens on posts)
  - No history entry heading; bullet 2026-11-25-bubble-one-line-lounge-host-tab-order
  - 2026-08-25 — Keep Explore tab entry keyboard-free
---

## Preconditions

- Signed in. The local feed has at least 12 posts with a photo (seed on the local database only, see
  `docs/feed-seed-content.md`).

## Steps

1. Tap the Explore tab (third tab; the app also lands there). Screenshot about 500 ms later: people cards under
   a search field and a filter button.
1a. Tap the search field (`explore-open-search`). Screenshot about 500 ms later.
2. Scroll the post grid down one screen. Screenshot.
3. Tap a post in the grid. Screenshot the feed once it settles, including the bottom tab bar.
4. Swipe to the next post, then edge-swipe back. Screenshot.
5. Type `a` in the search field. Screenshot, then clear the field. Screenshot.

## Oracle (pass when)

- Entering Explore does not open the keyboard (T1). The search screen opens on `게시물` / Posts (tabs in the order
  `게시물`, `오픈챗`) with the post grid there without typing: no empty screen that only says to search (T12).
- Tapping a grid post opens the feed on that post, not on the first post of the feed.
- While the feed is open, exactly one tab is selected (record whether Feed or Explore) (T18). Over the feed the
  bar is translucent and drawn in one ink, so the selected tab must still stand out from the other four at a
  glance (on 2026-11-17 it did not on an iPhone 11 Pro).
- Each tab of the bar over the feed answers the first tap (one miss in two on 2026-11-17).
- Back from the feed is one step and lands on the grid at the same scroll position (T6, T9).
- Typing replaces the grid with search results; clearing the field brings the grid back.
- Back from the search screen returns to the people cards in one step (T6).

## Signals

- Screenshots. The path after step 3 (`eval 'location.pathname + location.search'`): `/<locale>/feed` with the
  tapped post id.

## Manual follow-up

- None.
