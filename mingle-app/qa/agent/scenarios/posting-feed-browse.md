---
id: posting-feed-browse
title: The posting feed swipes smoothly, translates on demand and returns to the same post
priority: P1
environment: device
tags: [feed, translation, gesture, restore, comments]
taste: [T3, T16, T17]
paths:
  - mingle-app/src/components/feed/**
  - mingle-app/src/app/*/feed/**
  - mingle-app/src/app/*/posts/**
  - mingle-app/src/components/bottom-tab-bar.tsx
history:
  - 2026-09-26 — Posting feed: unknown post background drawn three different ways
  - 2026-09-26 — Posting feed: comment sheet showed a blank identity for the author's own new comment
  - 2026-09-26 — Posting feed: "See all" people list does not restore its exact scroll position
---

## Preconditions

- Signed in with the QA account. The local feed has at least 10 posts in more than one language (seed them with the
  feed seed script on the local database only, see `docs/feed-seed-content.md`).

## Steps

1. Tap the Feed tab (first tab). Screenshot the first post, including the "For You" / "Following" switch.
2. Swipe up through 5 posts. Screenshot each post once it settles.
3. On a post in another language than the app language, tap "See translation". Screenshot while it loads and once
   the translation is shown, then tap "Show original".
4. On a long post, tap "See more", then "Show less".
5. Open the comments of a post, write `qa comment`, send it, and screenshot the new comment.
6. Close the comments, switch to the Chats tab, and come back to the Feed tab. Screenshot.

## Oracle (pass when)

- Each swipe lands on exactly one post, with no half-visible post or blank card left on screen.
- "Translating..." disappears once the translation has arrived, and the translation scores average ≥ 4.0 on the
  [rubric](../rubric.md#translation-quality-15-per-dimension) (T3).
- Post chrome (buttons, chips, counts) is in the app language, with no clipped labels (T16, T17).
- The new comment shows the QA account's name and avatar, not a blank identity.
- Returning from Chats shows the same post that was on screen before, not the top of the feed.

## Signals

- Screenshots per step. `app_event_logs` since the start for feed exposure and translate events.

## Manual follow-up

- Like burst animation and haptics.
