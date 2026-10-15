# Mingle UX Taste

These are the UX rules the product owner has enforced again and again, taken from the bug reports in
[docs/ui-ux-codex-thread-history.md](../../../docs/ui-ux-codex-thread-history.md). The QA agent judges every
scenario against them. A violation counts as a finding even when nothing is technically broken.

Each source names an entry heading in the history file, so `grep -n "<heading>"` finds it. "P2" means the entry is
in Part 2 (the merged app audit).

When the owner overrules a verdict in a QA report, update the matching rule here (or add one), together with the
date and the run it came from. See "Calibration" in [README.md](README.md).

## Input and live speech

### T1. The keyboard stays where the user left it
Sending a message, opening the `+` menu, picking or cancelling a photo, and toggling keyboard/voice mode must not
close an open keyboard. Entering a tab must not open the keyboard unprompted.
- 2026-08-23 — Keep the keyboard open after text-message submission
- 2026-09-28 - Voice-mode photo tap stopped STT; keyboard-mode photo pick closed the keyboard
- 2026-08-25 — Keep Explore tab entry keyboard-free
- 2026-08-25 - Persist default display language and preserve keyboard mode

### T2. Speech recognition stops only when the user presses Stop
Tapping a neighbouring control, opening a picker, switching tabs, returning to the list or closing Picture in
Picture must leave STT running.
- 2026-09-28 - Voice-mode photo tap stopped STT; keyboard-mode photo pick closed the keyboard
- 2026-09-04 - Preserve iOS STT when closing Picture in Picture
- 2026-09-01 — Keep live STT running on the conversation list
- P2 2026-08-08 Native STT continuity across the My Page tab

### T3. Live speech feels live
Partial text appears while the person is still talking, for the speaker and the counterpart. Translations update in
place when they arrive. The list preview follows ongoing speech. No "waiting for translation" filler text.
- 2026-09-08 - Stream counterpart speech before finalization
- 2026-08-07 - Live STT preview in conversation list
- 2026-09-08 - PR 217 delayed translation preview refresh
- 2026-09-08 - Remove the translation waiting label

### T4. Every spoken word survives, in the right language rows
Early speech is not lost at start. Mixed-language rows do not disappear after finalization. A message never shows
empty or duplicate language rows, and Chinese uses the right script for the room.
- 2026-09-17 — Bound Soniox startup and propagate terminal STT failures
- 2026-09-30 — Same-language row of mixed-language speech disappeared after finalization
- 2026-09-27 — Chinese Simplified/Traditional translation rows and flags
- 2026-08-17 - Generic Chinese Source Display Mapping

### T5. Controls show the true state, without flicker
The mic goes idle → connecting → running → idle exactly once per action. It never bounces back to running after
Stop, and never shows Connecting while text is already arriving.
- 2026-05-25 - Native STT Stop Button Flicker
- P2 Detailed First Thread, atoms 52 and 55 (stuck on `Connecting...` while STT ran; the overlay flickered while text arrived)
- 2026-09-01 — Reconcile Android STT status in the visible room

## Navigation and gestures

### T6. Back goes exactly one level back
iOS edge swipe, Android system back and the in-page back button close only the topmost surface. They never
reopen a room, loop, skip a level or leave a half-closed layer.
- 2026-05-08 - Native STT Manual Back Re-entry Loop
- 2026-08-21 - Keep nested room surfaces on the correct back stack
- 2026-08-21 - Give the topmost surface exclusive gesture ownership
- P2 2026-08-20 Android system back audit across all 2.0.0 surfaces

### T7. Gestures do what the finger meant
Swipe-to-dismiss starts only from the edge. A diagonal edge swipe is not taken over by a scroller. A vertical scroll
never starts a dismissal. Released panels settle fully open or fully closed.
- 2026-09-12 - Keep diagonal edge swipe-back gestures from becoming scrolls
- 2026-08-14 - Restrict profile-surface swipe dismissal to the edge
- 2026-08-13 - Profile Edit Swipe Snap Behavior
- 2026-04-26 - Mobile WebView Swipe-To-Close Removal

### T8. One tap is enough
A target responds on the first tap and covers the whole visual element (avatar + name, not just the text).
Adjacent small targets such as language flags are wide enough to hit reliably.
- 2026-09-12 - Preserve language-selector open intent on iOS
- 2026-08-14 - Expand Explore profile result tap targets
- 2026-08-23 - Widen message-bubble language flag hit areas
- 2026-09-03 - Make iOS Picture in Picture startup reliable after repeated taps

### T9. Navigating never loses state
Each room keeps its own draft. Search results survive a trip to a profile and back. Sliders and preferences never
snap back after the user changes them.
- 2026-08-16 - Isolate text composer drafts by conversation
- 2026-08-14 - Preserve Explore search results after profile back navigation
- 2026-08-26 — Local-first conversation continuity for the 2.0.0 WebView
- 2026-08-17 - Language Onboarding Persistence Before Navigation

## Layout and rendering

### T10. Nothing covers what it does not own
Tooltips, menus, native banners and decorative layers (for example the mic ping animation) must not hide another
control or take its taps. The room is never dimmed by a closed panel's shadow or backdrop.
- P2 2026-09-18 Native bottom banner obscured the attachment tooltip
- 2026-09-28 - Voice-mode photo tap stopped STT; keyboard-mode photo pick closed the keyboard (mic ping took the photo button's taps)
- 2026-08-21 - Remove the conversation menu edge shadow
- P2 2026-04-18 Android 1.1.1 Internal Test Banner Follow-Up (transcript did not reserve banner space)

### T11. Focused screens are ad-free
No AdMob banner on login, the room-creation flow, or a profile opened over another surface.
- 2026-08-14 - Hide native banner ads on login
- 2026-08-15 - Keep authentication banner hiding authoritative
- P2 2026-08-22 conversation creation banner and history stack
- P2 2026-08-17 Shared English US/UK flag in language selectors (banner behind a profile opened from a notification)

### T12. Screens arrive complete
Cached data shows immediately (local-first). No login or loading flash on re-entry, no placeholder values that
later change (handle, counts, avatars), and no white or black flash between screens.
- 2026-08-15 - Render My Page identity and follow counts immediately
- 2026-08-15 - Keep the complete conversation list warm between tab visits
- 2026-08-14 - Keep authenticated navigation free of session-checking flashes
- 2026-05-08 - Native WebView Source Reload On Conversation Navigation

### T13. Content does not jump
Messages keep their spoken order. The visible message stays pinned when older history loads. Expanding a bubble
does not move its neighbours, and the page does not shift after hydration.
- 2026-08-24 — Preserve live utterance order across conversation hydration
- 2026-04-30 - Live Demo Chat Prepend Anchor Preservation
- 2026-08-25 - Compact language header and aligned bubble metadata
- 2026-08-27 — Fit the mobile canvas before hydration and preserve native scrolling

### T14. Long chats scroll smoothly and predictably
A 500-message transcript scrolls without visible jank. New messages auto-follow only when the user is near the
bottom, and otherwise a scroll-to-bottom affordance appears (no dead zone). Headers and tabs stay fixed, and
scrollers are never nested.
- 2026-04-30 - Live Demo Chat Scroll FPS Capture Harness
- 2026-05-04 - Latest-Message Affordance Threshold Drift
- 2026-09-08 — Search tab scroll boundaries and keyboard handling
- 2026-08-14 - Profile edit language list nested scrolling

### T15. Bubbles read like a messenger
KakaoTalk-style alignment: the viewer on the right; others on the left with name and avatar. Same-speaker messages
sit close together. Bubbles use their natural width. Colour marks the speaker, not the language. Original and
translations stack inside one bubble, with compact flags inline.
- 2026-08-25 - Add sender identity and KakaoTalk-style message alignment
- 2026-08-24 - Reduce spacing between consecutive chat messages
- 2026-08-24 — Let message bubbles use their natural available width
- P2 2026-08-23 Speaker-based message bubble color
- 2026-08-24 - Stack original and translated text inside one animated bubble

## Copy, language and consistency

### T16. Labels fit and say exactly what happens
No clipping or ugly wrapping in any locale. Copy matches the real behaviour, names Mingle when it means the app,
and has no filler or exclamation marks. Translated photo labels fit their region in at most two lines.
- P2 2026-08-17 Shared English US/UK flag in language selectors (selector header clipped in narrower locales)
- 2026-09-26 - Align share-toggle copy with the link's real capability and revoke old links
- 2026-09-02 - Clarify new conversation-room creation labels
- 2026-09-30 — English label for a vertical Japanese photo banner

### T17. Every locale is complete and consistent
No English or Korean fallback strings in other UI locales. English is always shown with the split US/UK flag.
- 2026-08-24 - Live Demo Preference i18n Coverage
- 2026-08-14 - App language setting and social-surface localization
- 2026-08-17 - Use the shared English flag treatment in onboarding

### T18. The selected state is obvious, in the key colour
Selection uses Mingle amber, is visible at a glance, and is never heavier than the content around it.
- 2026-08-14 - Strengthen the selected app-language state
- 2026-08-14 - Match app-language selection to the key color
- 2026-08-24 - STT Mode Selection Emphasis

### T19. Same pattern everywhere
Right-side surfaces slide in from the right and dismiss with an edge swipe. Language pickers look the same on every
screen. Voice-mode and keyboard-mode controls line up. Settings reachable from a room are also reachable from My Page.
- 2026-08-07 - Profile share panel transition
- 2026-08-16 - Add edge-swipe dismissal to notifications
- 2026-08-14 - Match profile language selection emphasis to the conversation picker
- 2026-09-09 — Align conversation photo controls and anchor attachment menu
- 2026-08-16 - Mirror feedback and app updates in My Page settings

### T20. No dead or placeholder UI
A control that looks tappable does something. Do not show counts or buttons for features that do not exist, or
playback controls that do nothing.
- 2026-08-14 - My Page Profile Header Counts and Alignment
- 2026-08-07 - Remove My Page Plus Action Placeholder
- 2026-09-03 - Connect iOS PiP playback controls to the STT lifecycle

### T21. Primary actions are big and in thumb reach
Creating a conversation is a full-width bottom action. Full-screen viewers close with a swipe, not only a small
top-corner X.
- 2026-08-14 - Restore the bottom new-conversation action
- 2026-09-26 — Swipe-down-to-dismiss for the full-screen photo viewer

## Trust

### T22. No false alarms and no unrequested prompts
Error toasts appear only when the operation really failed, and empty is shown differently from failed. No
permission prompt without a user action that needs it. No foreground push banner for the room being read.
- 2026-05-04 - Live Chat Conversation List Status Race And Misleading Open/Pause Alerts
- 2026-08-13 - My Page Safety History Empty and Auth States
- 2026-08-24 — Remove unsolicited iOS Bonjour permission prompt
- 2026-08-24 — Suppress iOS foreground message alerts

### T23. Speech output is brisk and clean
TTS should sound quick and natural; the owner judged a 1.4x stretch still too slow. Stopping STT must not cut or
pop the playback in progress.
- 2026-09-30 — Gemini TTS asked to speak fast in every language; new Korean male voice
- 2026-09-30 — Gemini TTS pace matched to Inworld and a male Korean voice
- [mingle-app/docs/tts-stt-regression-checklist.md](../../docs/tts-stt-regression-checklist.md)
