---
id: compose-threads-form-photos
title: The write form is Threads-style with a readable text box, a swipeable photo row, and an iOS keyboard that keeps the header and caret on screen
priority: P0
environment: device
tags: [compose, keyboard, photo, form, placeholder, preview, ios]
taste: [T1, T8, T12, T13, T16, T20, T21, T24, T26, T27]
paths:
  - mingle-app/src/components/compose/compose-editor.tsx
  - mingle-app/src/components/compose/compose-screen.tsx
  - mingle-app/src/components/compose/compose-chrome.tsx
  - mingle-app/src/components/compose/compose-image.ts
  - mingle-app/src/components/compose/edit-post-screen.tsx
  - mingle-app/src/components/feed/feed-post-preview.tsx
  - mingle-app/src/lib/native-photo-gallery.ts
  - mingle-app/rn/src/photoGallery/PhotoGalleryModal.tsx
  - mingle-app/src/i18n/compose-copy.ts
  - mingle-app/src/i18n/compose-photo-copy.ts
history:
  - No history entry heading; bullet 2026-11-27-compose-gallery-then-category (the history file's newer entries are id bullets)
  - No history entry heading; bullet 2026-11-27-compose-gallery-first
  - No history entry heading; bullet 2026-11-27-compose-photo-first-and-intro-extras
  - No history entry; owner report 2026-11-27 that the caption placeholder was hard to see and the iOS keyboard pushed the caret off screen (session transcript)
---

## Preconditions

- As in `compose-gallery-first`. Run on the iPhone first (the keyboard bug was iOS); repeat steps 2-4 on the
  Galaxy when it is connected and free.
- The QA account has a profile photo (so the author row shows it); note it if it has none.

## Steps

1. Open the write screen, tap `글만 쓰기`, tap `계속`. Screenshot before typing anything (keyboard up).
2. Zoom on the text box: the placeholder (`무슨 생각을 하고 있나요?` / "What's on your mind?"),
   the author photo and name, and the small icons under the box (photo, preview). Screenshot.
3. Type 12 short lines (`line 1` … `line 12`, a return after each). Screenshot after line 6 and after line 12.
4. Scroll the form up and down with the keyboard still up. Screenshot.
5. Tap the photo icon under the text. In the gallery tick three photos, `다음`. Screenshot the photo row
   (`compose-photo-strip`).
6. Swipe the photo row left to its end. Screenshot the `+ 3/10` tile (`compose-photo-add`).
7. Tap ✕ on the second photo. Screenshot. Then tap the `+` tile, tick two more, `다음`. Screenshot.
8. Tap the preview icon. Screenshot the preview. Close it (its back button or an edge swipe). Screenshot.
9. Clear the text, remove every photo. Screenshot the button and the reason line.
10. Post something small (`qa threads form` with one photo), then open that post's `…` → edit on My page.
    Screenshot the edit screen.

## Oracle (pass when)

- Step 1: profile photo + name on the left/top, the text box beside them, and under it small photo and preview
  icons, Threads-style. Not the photo-first layout with a big empty photo tile (the owner found it hard to read
  with no photo). Lots of empty space under the form is fine.
- Step 2: the text box reads as a box and the placeholder is clearly legible at a glance (dark enough, not a
  faint grey). A placeholder the agent has to zoom to read is a T26 finding (S2).
- Step 3: with the keyboard up, the header (`취소`, title, drafts icon) stays on screen and the line being typed
  (the caret) stays visible above the keyboard at every point; the bottom button stays right above the
  keyboard (T21, T24). The icons under the box move down with the text. iOS must not scroll the whole page up so
  the header or caret leave the screen (owner report, 2026-11-27): any frame where the caret is hidden after
  typing settles is S1.
- Step 4: the form scrolls inside its own area; the header and the bottom button do not move (T13).
- Step 5: the photos sit in one row under the text, in pick order, each with a ✕; the keyboard state is
  restored as it was (T1).
- Step 6: the row swipes sideways smoothly; the last tile is dashed with `+` and `3/10`.
- Step 7: ✕ removes exactly that photo with no jump of the rest of the form; `+` opens the app's gallery (not the
  system picker) and the new photos are appended after the others; the tile then reads `4/10`. With 10 photos
  the tile is gone.
- Step 8: the preview is the feed card exactly as viewers will see it (background, photos, author, text) (T27);
  closing it returns to the form with the text and photos as they were.
- Step 9: the button stays where it is and turns off, and the reason line says `사진이나 글을 넣어 주세요`
  in amber (T16, T24).
- Step 10: the edit screen keeps its own layout (not the gallery or the kinds step).

## Signals

- Screenshots. `eval` with the keyboard up: `document.activeElement.id` is `compose-body`;
  `document.querySelector('header')?.getBoundingClientRect().top >= 0`; the textarea's caret line
  (`compose-body` bottom) is ≤ `visualViewport.height`.

## Manual follow-up

- Typing with the Korean keyboard and its suggestion bar (taller keyboard) on the owner's iPhone.
