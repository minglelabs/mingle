---
id: compose-gallery-first
title: A new post opens on the app's own light gallery, with albums, and Next waits for a ticked photo
priority: P0
environment: device
tags: [compose, gallery, native, photo, album, feed]
taste: [T6, T8, T12, T16, T17, T18, T24, T25]
paths:
  - mingle-app/rn/src/photoGallery/PhotoGalleryModal.tsx
  - mingle-app/rn/src/nativeCapabilities.ts
  - mingle-app/src/lib/native-photo-gallery.ts
  - mingle-app/src/components/compose/compose-screen.tsx
  - mingle-app/src/components/compose/compose-overlay.tsx
  - mingle-app/src/components/compose/compose-editor.tsx
  - mingle-app/src/i18n/compose-photo-copy.ts
  - mingle-app/src/components/feed/feed-shell.tsx
  - mingle-app/src/components/app-top-header.tsx
history:
  - No history entry heading; bullet 2026-11-27-compose-gallery-first (the history file's newer entries are id bullets)
  - No history entry heading; bullet 2026-11-27-compose-text-mode-and-native-gallery
  - No history entry heading; bullet 2026-11-27-compose-gallery-then-category
  - No history entry heading; bullet 2026-11-27-compose-gallery-light-and-kind-forms
  - No history entry heading; bullet 2026-11-28-gallery-albums-and-title-only-call
---

## Preconditions

- A QA build from this worktree (it carries the `photoGallery` capability; an older store build still opens the
  system picker, which is a `blocked` run, not a fail). Check it with
  `eval 'window.__MINGLE_NATIVE_SHELL_CAPABILITIES?.photoGallery'` (true).
- Signed in with the QA account, gender and birth date set (otherwise the basics question comes before the
  first post; answer it and go on).
- Photos permission set to "Full access" for HashChat. The phone's library has at least 12 photos, at least one
  in Favorites and one in another album (Screenshots counts). Never post them anywhere but the local devbox.
- The post written in step 9 is posted to the local feed only; delete it afterwards from My page.

## Steps

1. Open the Feed tab (first tab, `tab-feed`) and tap the pen icon (`글쓰기` / "Write") in its top bar.
   Screenshot about 300 ms and 1 s after the tap.
2. Without ticking anything, screenshot the top bar and try `다음` / "Next".
3. Tick three photos in this order: the 3rd, the 1st, the 5th of the grid. Screenshot.
4. Tap the album title (`최근 항목 ▾`, `photo-gallery-albums`). Screenshot the list.
5. Pick Favorites (iOS) or a photo folder (Android). Screenshot. Tick one photo there.
6. Open the album list again and pick `최근 항목` (`photo-gallery-album-recent`). Screenshot.
7. Untick the 1st photo. Screenshot the numbers.
8. Tap `✕`. Screenshot what is on screen. Then open the write screen again (step 1).
9. Tick two photos and tap `다음`. Screenshot the write screen that follows.
10. Leave (`취소`), open the write screen again, and this time tap the `글만 쓰기` pill (`photo-gallery-skip`)
    without ticking anything. Screenshot.
11. iOS only, optional: in Settings set Photos to "Limited", open the write screen, screenshot; then set
    "None", open it again, screenshot. Restore "Full access" afterwards.

## Oracle (pass when)

- Step 1: the gallery opens by itself on a new post, at once (no write screen first, no white or black flash
  between them) (T12). It is light: white bar with a hairline, dark title and `✕`, orange `다음`, light grey
  preview, dark status-bar text, `글만 쓰기` as a pale orange pill at the right of the `최근 항목` row. Anything
  black or dark grey as the page colour is a T25 finding (S2).
- Step 2: `다음` reads as off and does nothing while no photo is ticked; the photo on show does not count.
- Step 3: each tick shows an orange numbered badge (1, 2, 3 in the order tapped), the title shows `· 3/10`, and
  the big preview follows the last photo touched (T18).
- Step 4: a white list of albums with counts; iOS: smart albums (Favorites, Screenshots…) first, then the
  person's albums by size. `최근 항목` is on top.
- Step 5: the title shows the album's name and its photos only. The new tick is number 4.
- Step 6: back on recent photos, the three earlier ticks are still there with the same numbers; the count is
  `4/10`. Picks are never lost when switching albums.
- Step 7: the remaining picks renumber 1, 2, 3 in pick order, with no gap.
- Step 8: `✕` leaves the post entirely: the feed is back, not an empty write screen (T6).
- Step 9: the write screen shows the kinds of post with the two photos as small thumbnails
  (`compose-step-photos`), `자유` marked ✓, and the bottom button reads `게시` (see `compose-kind-step-and-cta`).
  The picked photos arrive in pick order, none broken or rotated.
- Step 10: `글만 쓰기` goes on without a photo to the write screen; the bottom button reads `계속`.
- Step 11: "Limited" shows `사진 더 보기 허용` and only the allowed photos; "None" shows the access notice with
  `설정 열기` and the `글만 쓰기` pill under it, so the post can still go on without a photo. After a refusal
  the page uses the system picker for the rest of the session (by design); relaunch the app before other steps.
- Every label (title, `다음`, `글만 쓰기`, album names that are app copy, the notice) is in the app language,
  none clipped (T16, T17). Each control answers the first tap (T8).

## Signals

- Screenshots per step. `snapshot` (Appium source) for `photo-gallery-albums`, `photo-gallery-skip`,
  `photo-gallery-album-recent`.
- `eval` after step 9: `document.querySelectorAll('[data-qa=compose-step-photos] img').length` is 2.

## Manual follow-up

- iCloud-only and HEIC photos arrive (the owner's own library).
- Android 14 "selected photos" permission path on the Galaxy.
