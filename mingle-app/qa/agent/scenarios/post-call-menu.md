---
id: post-call-menu
title: The 1:1 voice talk screen has a language button and a menu like a chat room, folds into a bubble on back, and keeps its bar tidy
priority: P1
environment: assisted
tags: [call, voice, language, menu, back, bubble, keyboard, translation, two-accounts]
taste: [T1, T2, T3, T5, T6, T8, T10, T16, T17, T18, T19, T20]
paths:
  - mingle-app/src/components/post-call/**
  - mingle-app/src/lib/post-call-session.ts
  - mingle-app/src/lib/post-call.ts
  - mingle-app/src/server/post-calls.ts
  - mingle-app/src/server/post-call-lines.ts
  - mingle-app/src/app/api/post-calls/**
  - mingle-app/src/components/LivePhoneDemo/DuoCallStage.tsx
  - mingle-app/src/components/LivePhoneDemo/use-post-call-room.ts
  - mingle-app/src/i18n/post-call-copy.ts
  - mingle-app/src/i18n/post-call-menu-copy.ts
history:
  - No history entry heading; bullet 2026-11-26-post-call-language-and-menu (the history file's newer entries are id bullets)
  - No history entry heading; bullet 2026-11-26-post-call-own-screen-over-tabs
  - No history entry heading; bullet 2026-11-26-post-call-phone-check
  - No history entry heading; bullet 2026-11-25-post-call-one-to-one-voice-talk
---

## Preconditions

- A call between phone A (QA account) and phone B (peer account) answered as in `call-post-invite-card`
  step 8. **Needs the second account on a second phone.** A and B speak different first comfortable languages
  (for example A ko, B en), so translation starts on by itself.
- Captions need speech. Without a person speaking, the line checks are done with typed lines; mark the spoken
  ones `manual`. Keep media volume muted; never raise it.
- Hash: the QA account has some Hash (translation never starts by itself with none).

## Steps

1. On A, screenshot the call screen once connected: the top bar, the face, the four round buttons, the bottom bar.
2. Tap the language button at the top right (`post-call-language`). Screenshot the page. Type `ja` in the search.
   Screenshot. Pick Japanese. Screenshot the call screen.
3. Tap the menu button (`post-call-menu`). Screenshot the page (`post-call-menu-panel`).
4. In the menu, tap each text size (`post-call-text-size-small|medium|large`); after each, close the menu and
   screenshot the lines area. Leave it on medium.
5. In the menu, tap view profile. Screenshot. Go back from the profile. Screenshot.
6. On B, type `hello from B` in the text box (`post-call-text`) and send (`post-call-send`). On A screenshot the
   line (`post-call-line`).
7. On A, tap the text box. Screenshot the bar with the keyboard up. Type `안녕` and send. Screenshot both phones.
8. On A, edge-swipe back (Android: system back). Screenshot the tab with the bubble (`post-call-bubble`). Switch
   to another tab. Screenshot. Tap the bubble (`post-call-bubble-open`). Screenshot.
9. Tap the chevron at the top left (`post-call-minimize`). Screenshot. Reopen.
10. Open the menu and tap hang up (`post-call-menu-hangup`). Screenshot both phones.
11. Assisted: in a new call, both people speak a sentence in their language. Screenshot the captions.

## Oracle (pass when)

- Step 1: full-screen blurred, dimmed photo of the other person, their round face about 35 % down with name, flag,
  country and age under it; four round buttons `번역`, `읽어주기`, `마이크`, `끊기`; at the top right a language
  button (flag and code) and a menu button, like a chat room (T19). Translation and read-aloud are on (different
  languages). The bottom is one dark glass bar: A's own face, a photo button, the text box and send. No `invited`
  or date line, no white box behind the back button (T20).
- Step 2: the language page lists A's comfortable languages first (the first marked `기본`), then the most
  spoken, then the rest by name; search works; the pick shows on the button at once (T5, T18). Picking a
  language the other person does not speak turns translation on if it was off. Labels in the app language (T17).
- Step 3: the menu is a page like the chat room's: the language, text size (small, medium, large), view profile,
  report, block and hang up, hang up. It sits above the call screen; nothing of the call shows through or takes
  its taps (T10).
- Step 4: each size changes the lines' text size at once; the chosen size is marked.
- Step 5: view profile first folds the call into its bubble, then opens the profile; the call keeps running
  (the bubble shows, the mic state is unchanged) (T2). Back returns from the profile in one step (T6).
- Step 6: B's line shows on A on the left in white with its translation into A's listening language (Japanese
  after step 2) under it.
- Step 7: with the keyboard up, A's face and the photo button fold away and the text box takes the bar; send is
  orange once there is text. After sending, the keyboard stays up (T1) and A's line shows on the right in amber.
- Step 8: back folds the screen into a bubble (the other person's face, their name, `끊기`) and the call goes on
  (it does not hang up); the bubble stays over other tabs; tapping it opens the call screen again as it was.
  The generic room bubble does not appear for this call.
- Step 9: the chevron does the same as back.
- Step 10: hang up ends the call on both phones and leaves no bubble behind; neither chat list shows the call's
  room (T20).
- Step 11 (manual): partial captions appear while the person speaks and the translation follows in place (T3).

## Signals

- Screenshots of both phones. `GET /api/post-calls/<callId>/lines?lang=ja` after step 6 (B's line carries a
  Japanese translation).
- QA snapshot `micVisualState` before and after steps 5 and 8 (stays `running` when the mic was on).

## Manual follow-up

- Spoken captions and read-aloud voice quality.
- Report from the menu (the agent does not file real reports).
