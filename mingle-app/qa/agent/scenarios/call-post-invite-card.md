---
id: call-post-invite-card
title: A voice talk post's card carries the write screen's block above the author row, and that whole block rings the author
priority: P1
environment: assisted
tags: [feed, call, post, card, push, two-accounts]
taste: [T8, T10, T12, T16, T17, T20, T22, T27]
paths:
  - mingle-app/src/components/feed/post-call-invite.tsx
  - mingle-app/src/components/feed/post-call-button.tsx
  - mingle-app/src/components/feed/post-category-strip.tsx
  - mingle-app/src/components/feed/feed-post-card.tsx
  - mingle-app/src/components/feed/feed-post-view.tsx
  - mingle-app/src/components/post-call/post-call-host.tsx
  - mingle-app/src/lib/post-call.ts
  - mingle-app/src/lib/post-category.ts
  - mingle-app/src/server/post-calls.ts
  - mingle-app/src/app/api/post-calls/**
  - mingle-app/src/i18n/post-call-copy.ts
  - mingle-app/src/i18n/post-category-copy.ts
history:
  - No history entry heading; bullet 2026-11-25-post-call-one-to-one-voice-talk (the history file's newer entries are id bullets)
  - No history entry heading; bullet 2026-11-26-post-call-phone-check
  - No history entry heading; bullet 2026-11-27-call-post-title
  - No history entry heading; bullet 2026-11-27-call-post-invite-button
---

## Preconditions

- Two phones on this worktree's devbox (the call is app only): phone A (iPhone) signed in as the QA account,
  phone B (Galaxy, or a second assigned phone) signed in as the peer account (`node scripts/qa-agent-peer.mjs
  account`; the agent signs B in through the local sign-in, never with real credentials). **Needs the second
  account on a second phone.** If only one phone is free, steps 1-3 still run; mark the rest `blocked`.
- A has posted a voice talk post with the title `QA 방제 테스트` (`compose-hour-intro-call-forms` step 14) and a
  second one without a title, both less than an hour ago. B's app language differs from A's (for example B in
  English), to see the default title in B's language.
- Neither account has the women-only `남성의 새 대화 받지 않기` switch on, unless step 9 says so.
- Mute both phones' media volume before the call starts; never raise it.

## Steps

1. On A, open the Feed tab and swipe to A's own call post. Screenshot the whole card.
2. On A, tap the block above the author row. Screenshot about 1 s later.
3. On B, find the same post (Feed tab, or A's profile grid). Screenshot the card; then the untitled one.
4. On B, tap anywhere on the block (the photo, then on another try the title text, then the green circle).
   Screenshot B at once and A within 2 s.
5. On A, screenshot the incoming screen (`incoming-post-call`) once, then wait 30 s without answering.
   Screenshot both.
6. On B, tap the block again within one minute. Screenshot.
7. After the minute, B calls again; A taps `거절`. Screenshot both.
8. B calls again; A taps `받기`. Screenshot both (the call screen is judged in `post-call-menu`); hang up.
9. Optional, needs a female A and a male B: turn on `남성의 새 대화 받지 않기` on A's My page, B taps the block.
   Screenshot B. Turn it off again.
10. With A's app in the background (home screen), B calls. Screenshot A's lock or home screen.

## Oracle (pass when)

- Step 1: above the author row, a white rounded block: A's photo with the nationality flag at its lower left,
  `QA 방제 테스트`, comfortable ⇄ learning languages with levels, and no phone circle (the author does not call
  themself). Under the text, the `1:1 보이스톡 · N분 남음` pill, with no separate green `통화 걸기` pill (T20).
- Step 2: tapping it on A does nothing (no waiting screen, no error).
- Step 3: B sees the same block with a green phone circle at its right; the untitled post shows B's own default
  (`Let’s have a 1:1 voice talk!` for English, not the Korean `1대1 보이스톡해요!`) (T17, T27). It matches what the write
  screen and its preview showed.
- Step 4: every part of the block starts the call on the first tap (T8); the waiting screen appears over the tab B
  is on at once, with no tab change and no room loading. A shows the incoming screen over whatever it shows,
  with B's face, name, country, age, a countdown, `거절` and `받기` (T12).
- Step 5: after 30 s unanswered, both screens end cleanly with a plain message (`통화가 연결되지 않았어요` / "The call did not connect" on
  B); no screen stays stuck (T22).
- Step 6: B is told to try a little later (`잠시 후 다시 걸어 주세요` / "Try again in a moment"), as on-screen text, not a crash or an
  alert loop.
- Step 7: `거절` ends both sides at once.
- Step 8: `받기` opens the call on both phones without a trip through another tab; the call's hidden room never
  appears in either chat list afterwards.
- Step 9: B sees `이분은 지금 새 대화를 받지 않아요.` and A gets no ring.
- Step 10: A gets a push for the incoming call; opening it lands on the incoming screen.

## Signals

- Screenshots of both phones. `POST /api/post-calls` statuses in the server log (busy, cool-down, blocked).
- After step 8, the chat list QA snapshot on both phones: no room with `isDuoCall`.

## Manual follow-up

- Push wording and sound on the owner's phone.
