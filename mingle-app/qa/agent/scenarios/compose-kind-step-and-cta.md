---
id: compose-kind-step-and-cta
title: After the gallery the kinds of post fold smoothly into the form, and one bottom button that never moves posts or continues
priority: P0
environment: device
tags: [compose, category, cta, keyboard, animation, header, draft]
taste: [T1, T6, T8, T12, T13, T16, T18, T21, T24, T26]
paths:
  - mingle-app/src/components/compose/compose-screen.tsx
  - mingle-app/src/components/compose/compose-category-picker.tsx
  - mingle-app/src/components/compose/compose-chrome.tsx
  - mingle-app/src/components/compose/compose-overlay.tsx
  - mingle-app/src/components/compose/compose-state.ts
  - mingle-app/src/components/compose/draft-autosave.ts
  - mingle-app/src/components/compose/publish-store.ts
  - mingle-app/src/i18n/compose-category-step-copy.ts
  - mingle-app/src/i18n/post-category-copy.ts
  - mingle-app/src/lib/post-category.ts
history:
  - No history entry heading; bullet 2026-11-27-compose-category-first (the history file's newer entries are id bullets)
  - No history entry heading; bullet 2026-11-27-compose-gallery-then-category
  - No history entry heading; bullet 2026-11-27-compose-one-tap-post
  - No history entry heading; bullet 2026-11-25-post-categories
  - No history entry; owner report 2026-11-27 that 취소 on the write screen did nothing (session transcript)
  - 2026-11-20 — Bottom buttons stay above the keyboard; height is a wheel that starts at 177 cm
---

## Preconditions

- As in `compose-gallery-first` (QA build with the app's gallery, QA account with gender and birth date, local
  devbox only). Posts made here go to the local feed; delete them afterwards from My page.

## Steps

Photos, then one tap:
1. Open the write screen (Feed tab → pen icon), tick two photos in the gallery, tap `다음`. Screenshot.
2. Without touching anything else, read the bottom button (`compose-publish`) and the line above it
   (`compose-publish-reason`). Tap the button once. Screenshot the feed about 1 s and 5 s later.

Text only, `계속`:
3. Open the write screen, tap `글만 쓰기` in the gallery. Screenshot the kinds and the bottom button.
4. Tap the bottom button (`계속`). Screenshot at about 100, 300 and 600 ms (the fold), then once settled.
5. Read where the bottom button is now (the keyboard should be up). Screenshot. Type `qa kind step`.
6. Tap the kept row (`자유 · 바꾸기`). Screenshot the choice opening again.

Tapping a kind:
7. Tap `1시간` (`compose-category-hour`) while the choice is open. Screenshots at about 100, 300 and 600 ms.
8. Tap `바꾸기` again and tap `1:1 보이스톡` (`compose-category-call`), the last row. Screenshots as in step 7.
9. Close the keyboard if open, then open it again by tapping the text box. Screenshot the bottom button both
   times, keeping the same crop.

Cancel and back:
10. Tap `취소` in the header with the keyboard up and text typed. Screenshot about 300 ms later.
11. Open the write screen again with `글만 쓰기`, tap `계속`, type nothing, and edge-swipe back (Android: system
    back). Screenshot. Back again. Screenshot.
12. Open the write screen, pick a photo, `다음`, then tap `취소` on the kinds step. Screenshot.
13. Open the write screen again, tap `글만 쓰기`, then the drafts icon at the right of the header. Screenshot the
    list, then open the `qa kind step` draft. Screenshot.

## Oracle (pass when)

- Step 1: the write screen shows `어떤 글을 올릴까요?` and four big rows, `자유` / `1시간` / `자기소개` /
  `1:1 보이스톡`, each with a one-line hint, `자유` marked ✓ in amber from the start (T18). The two photos sit as
  small thumbnails under the rows (`compose-step-photos`). No keyboard (T26).
- Step 2: the button reads `게시` and is enabled; one tap posts the photos as an ordinary post with no text and
  returns to the feed, where the publish banner shows progress and the post then appears once (T24). No extra
  question in between.
- Step 3: the button reads `계속`, enabled; the reason line is empty or the draft state, not an error.
- Step 4: the `자유` row stays in place as the row everything else folds towards: the question and the other rows
  shrink and fade in one smooth motion (about 300 ms, height and opacity), the form unfolds under it (fade and
  slide up), and nothing jumps or flashes white (T12, T13, T24). The kept row shows `바꾸기`. The caption box is
  focused with the keyboard up (T26).
- Step 5: the bottom button sits directly above the keyboard, full width, reading `게시` (T21, T24). The header
  (`취소`, title, drafts icon) and the caret stay on screen (see `compose-threads-form-photos`).
- Step 6: the choice opens again with the typed text kept.
- Steps 7-8: the tapped row is never re-mounted or flashed; whatever moves, moves once and smoothly; the right
  form unfolds (1 hour: the deletion time beside the icons; voice talk: the call card, no keyboard). A browser
  build lists only three kinds (no `1:1 보이스톡`); the app lists four.
- Step 9: the bottom button is in exactly one of two places: above the keyboard while it is up, at the bottom
  (above the safe area) otherwise. It never hides, never scrolls with the content, never sits mid-screen
  during the keyboard animation for more than a frame (T21, T24).
- Step 10: `취소` closes the write screen on the first tap, every time, with the keyboard up or down (T8). The
  feed is back. (Owner reported on 2026-11-27 that it did nothing; any miss is S1.)
- Step 11: back with nothing written returns to the choice of kind first, then the next back closes the write
  screen (T6). One level per back, never two.
- Step 12: `취소` on the kinds step closes the write screen too.
- Step 13: the text typed before step 10 is in the drafts list; a draft opened from it goes straight to the form,
  not to the choice of kind.

## Signals

- Screenshot sequences for the fold (steps 4, 7, 8). `eval` before and after a tap:
  `document.querySelector('[data-qa=compose-category-step]').dataset.open` goes `1` → `0`.
- `eval 'document.querySelector("[data-qa=compose-publish]").getBoundingClientRect().bottom'` with the keyboard up
  and down, compared with `visualViewport.height`.
- The local feed after step 2 (`GET /api/feed` or the feed itself): one new post with two photos and no text.

## Manual follow-up

- Whether the fold feels smooth on the phone (Appium screenshots are too slow to judge frame drops).
