# UI/UX Codex Thread History

## 2026-08-25 - Persist default display language and preserve keyboard mode

- **Surface:** Conversation hamburger menu, default display-language selection, text-size defaults, and the live conversation composer controls.
- **Issue:** Default display language was only stored on the current channel or membership, so a choice could disappear when the user created another room. The hamburger menu also buried the selector inside conversation management. The server fallback still returned Level 2 when no text-size preference had been saved. Tapping the keyboard-mode microphone switched the composer to voice mode, and the voice-mode keyboard button had a small touch target.
- **Resolution:** Move the localized default display-language selector to the top of the room hamburger menu, directly above text size. Persist the user's choice in `app_users.default_display_language` while retaining the current room/member value, and use that user default when initializing subsequent rooms or resolving an older membership without an explicit room value. Raise the server-side no-preference text-size default to Level 3.
- **Interaction:** Starting STT from keyboard mode no longer closes the keyboard composer or changes the persisted input mode. Increase only the voice-mode keyboard-toggle hit area from 34px to 44px; the keyboard-mode control remains unchanged.
- **Data change:** Add the nullable `app_users.default_display_language` column and migration. No API namespace or native version change.
- **Testing notes:** Verify the selector opens from the hamburger root, a selected language survives room changes and a fresh session, older rooms fall back to the user's stored value, text-size defaults to Level 3 only when no explicit preference exists, keyboard-mode microphone start keeps the textarea/keyboard layout, and the enlarged voice-mode keyboard button does not alter the keyboard-mode layout.

## 2026-08-25 - Compact language header and aligned bubble metadata

- **Surface:** Collapsed/expanded shared-room message bubbles, sender header, language selectors, and timestamp metadata.
- **Issue:** The counterpart header's circular flags made it taller than the sender name, so expanding a bubble could shift its vertical position. The collapsed bubble also used the same circular flags, expanded rows had no text offset after their icon, and localized absolute timestamps could occupy three lines when the locale exposed a separate day period.
- **Resolution:** Use a fixed 20px sender header in both collapsed and expanded states. Increase the sender name to `text-sm`, render collapsed flags as compact icons with the original-language quote badge, and show the selected language with only an amber key-color underline. Add a small icon-to-text gap in expanded rows, a small vertical inset between rows, and reduce collapsed bubble vertical padding/line-height pressure.
- **Metadata:** Keep `Expand`/`Collapse` close but visibly separated from the bubble, match its typography to the timestamp, and place the viewer's time above the toggle in a compact vertical metadata column. Timestamp formatting now combines localized time and day-period text into one line, keeping absolute timestamps to at most two lines (`date` + `time`).
- **Data change:** None.
- **Testing notes:** Verify collapsed/expanded toggles do not move the counterpart bubble vertically, selected underlines, original quote badges, long localized names, 2024 date timestamps, and narrow iOS/Android layouts.

## 2026-08-25 - Widen language hit areas and sender header

- **Surface:** Collapsed language icons, counterpart sender header, and bubble-to-toggle spacing.
- **Issue:** Compact language buttons had little horizontal breathing room and were difficult to tap in a row. The sender name was slightly smaller than the message text, while a short bubble could make the name-and-language header look unnecessarily constrained. The toggle also became visually too close after the previous gap reduction.
- **Resolution:** Increase icon button width from 24px to 28px while keeping the visual flag at 18px, enlarge the sender name to `text-base` inside the same fixed 20px line, let the header use its natural width up to the available screen width, and restore a 4px bubble-to-toggle gap.
- **Data change:** None.
- **Testing notes:** Verify five adjacent flags remain individually tappable, the header can be wider than a short bubble, and the fixed header height remains identical when toggling expansion.

## 2026-08-25 - Add sender identity and KakaoTalk-style message alignment

- **Surface:** Shared-room message bubbles for counterpart and viewer messages.
- **Issue:** Counterpart bubbles had no real profile name, collapsed language flags consumed the first line inside the bubble, and viewer bubbles still reserved an avatar column. Incoming and outgoing messages therefore did not read like a conventional messenger thread.
- **Resolution:** Shared-room hydration now attaches the sender's profile `name` (never the handle) to each persisted utterance. Counterpart messages show that name above the bubble; in collapsed mode, up to five compact language icons move beside the name and remain interactive. The original-language quote marker is preserved.
- **Alignment:** Counterpart bubbles retain the avatar and use a sharp top-left corner. Viewer bubbles omit both avatar and name, align their bubble to the right edge of the message area, and place controls in the order `Expand/Collapse → time → bubble`.
- **Data change:** No migration. The hydration payload gains the read-only `speakerName` presentation field sourced from existing membership profile data.
- **Testing notes:** Verify 1:1 and group rooms, long names, five-or-more room languages, collapsed/expanded toggling, profile-avatar taps on counterpart messages, and the viewer's right-edge layout on narrow iOS and Android screens.

## 2026-08-25 - Tighten bubble text leading and expanded language markers

- **Surface:** Collapsed and expanded translated message bubbles.
- **Issue:** Wrapped lines in collapsed bubbles kept more vertical leading than the message content needed. Expanded rows also used circular language controls, which made each row taller and consumed extra horizontal space.
- **Resolution:** Reduce the shared bubble text line-height from 1.25 to 1.15, keep the first wrapped line's larger height only where the collapsed inline flag requires it, and render expanded language selectors as compact flag icons without circular backgrounds. Reduce expanded row dividers to a 2px vertical inset and the outer bubble padding to 8px horizontally and 4px vertically.
- **Interaction:** Expanded language icons remain selectable and retain the original-language quote marker; collapsed bubbles keep their circular flags and existing touch target.
- **Data change:** None.

## 2026-08-24 - Attach Expand and Collapse to the bubble bottom edge

- **Surface:** Collapsed and expanded message bubbles for both the viewer and other speakers.
- **Issue:** The bubble content wrapper filled all remaining row width, pushing `Expand` to the far right for incoming messages and `Collapse` to the far left for the viewer's messages. The previous 2px same-speaker message gap was also slightly too tight.
- **Resolution:** Let the bubble content use its natural width and shrink only when the row is crowded, so the localized toggle remains directly beside the bubble. Bottom-align the toggle with the bubble, place it on the right of incoming bubbles and the left of the viewer's bubbles, and use a 4px bubble-to-toggle gap. Increase same-speaker message spacing from 2px to 4px while retaining the 6px gap when the speaker changes.
- **Data change:** None.

## 2026-08-24 - Keep the empty-room prompt visible after Start

- **Surface:** Empty conversation-room background prompt in the current and legacy live demo screens.
- **Issue:** The prompt disappeared immediately when the user pressed Start because the empty-state condition treated an active STT session as content.
- **Resolution:** Keep the localized prompt visible while the room has no persisted message, live utterance, partial transcript, demo typing state, draft, error, or usage-limit state. Starting STT alone no longer hides it; the first actual speech/message content still replaces it.
- **Data change:** None.

## 2026-08-24 - Reduce spacing between consecutive chat messages

- **Surface:** Modern and legacy conversation message lists.
- **Issue:** Every message used a uniform 12px vertical gap, which made consecutive messages from the same speaker look unnecessarily separated.
- **Resolution:** Consecutive messages from the same identified speaker now use a 2px gap. Messages from different speakers use a reduced 6px gap. Speaker identity uses the real user ID when available and falls back to solo-session speaker labels or avatar identity.
- **Scope:** Applies to both current and legacy conversation renderers. Unknown speaker identities remain on the safer 6px gap rather than being incorrectly grouped.
- **Data change:** None.

## 2026-08-24 - Widen message bubbles and flow flags inline with text

- Surface: Collapsed and expanded conversation-room message bubbles for both the viewer and other speakers.
- Issue: The bubble stack reserved 10% of its available width, the expanded layout gave every flag a dedicated flex column, and the outer bubble used relatively generous horizontal and vertical padding. The viewer's expanded rows also reversed that flag column to the right side. The collapsed flag group retained a 6px flex gap on top of each button's existing 42px touch area.
- User impact: Long messages wrapped earlier than necessary, both sides appeared to leave excess trailing space, the flag column consumed text width, the viewer's flag placement differed from other messages, and multi-language flags looked visually disconnected.
- Resolution:
  - Reduce the reserved width from 10% to 1% by increasing the message stack maximum width from 90% to 99%.
  - Move each expanded row's circular flag into the same inline text flow as its message. Flags now remain before the text for both speaker directions and no longer reserve a full-height column.
  - Reduce outer bubble padding from 14px horizontal and 8-10px vertical to 10px horizontal and 6px vertical. Tighten divider spacing from 6px to 4px per side.
  - Preserve each flag's 42px touch area and 30px visual circle while removing the extra 6px flex gap between adjacent collapsed-mode flags. Reduce the final flag-to-text gap from 8px to 4px.
- Data change: None. Message contents, speaker alignment, copy/playback behavior, display preferences, API namespaces, and native code are unchanged.
- Testing notes: Verify long single-line and wrapped text on narrow devices, both own/other expanded rows, three-or-more collapsed flags, original quote badges, and rapid flag taps after the visual spacing reduction.

## 2026-08-24 - Stack original and translated text inside one animated bubble

- Surface: The conversation-room message bubble when the user's bubble display preference is set to the expanded mode.
- Issue: Expanded mode rendered the original utterance and each translation as separate bordered bubbles. The rows consumed too much vertical space, showed language codes beside the flags, and switched instantly when the user opened or closed the message.
- User impact: One utterance could look like several unrelated messages, and the expanded state did not preserve the compact circular language-control treatment used by the collapsed state.
- Resolution:
  - Keep one outer speaker-colored bubble for the entire utterance and stack the original plus translations inside it.
  - Separate adjacent language rows with a one-pixel, low-contrast horizontal divider and a small vertical gap.
  - Reuse the same 30px circular language badges and 42px touch areas in both modes. The original-language badge keeps the quote mark; visible language-code text is removed.
  - Animate the expanded/collapsed content switch and the outer bubble's layout height with a short ease-out transition.
  - Replace the chevron-only control with localized `Expand`/`Collapse` labels, including Korean `펼치기`/`접기`, for all 15 primary UI locales.
- Data change: None. This is a presentation-only change; the persisted `demo_bubble_display_mode` preference and message/copy/playback behavior remain unchanged.
- Testing notes: ChatBubble rendering tests cover the single outer container, circular badges, quote badge, divider count, absence of visible language codes, and localized control labels. Verify long original/translation text, interim translations, three-or-more languages, and rapid expand/collapse taps on narrow iOS and Android layouts.

## 2026-08-24 - Stabilize new shared-room navigation and first-message delivery

- Surface: Native conversation-list → invite-friends → shared conversation navigation, the conversation-room overlay route, and first-message realtime/push delivery.
- Issue: The new-group action used a raw route without carrying the native API namespace and layout parameters. A namespace-less conversation route could therefore fall through to the legacy entry. At the same time, the room URL could arrive before the list snapshot contained the newly-created room, while the first message materialization and member fan-out used separate state reads.
- User impact: A newly-created shared room could show a mixture of legacy and current UI, fail to open until a later refresh, or show the creator's first message without immediately delivering it to the other members. The canonical message could still be stored, making the issue look like a disappearing message after an app restart.
- Resolution:
  - Preserve the current native search parameters when opening the new-group route and when using the invite screen's history fallback.
  - Infer a native release variant from preserved platform/version parameters when `apiNamespace` is temporarily absent, so a native route does not silently select the legacy entry.
  - Keep a room URL while the conversation list hydrates. If the list still lacks that room, hydrate the single conversation by ID and open the returned room summary instead of deleting the route.
  - Materialize pending invitees and read the committed member IDs inside one interactive Prisma transaction. Use that committed set for the first-message realtime and push fan-out.
  - Await the messaging publish request and push attempt while keeping both failures non-fatal to message persistence. Add bounded server logs for membership readiness, publish failures, and push failures without logging session-key contents.
- Data contract: No Prisma schema or migration change. Existing conversation, membership, realtime, and push contracts are reused.
- Testing notes: Physical-device testing is intentionally left to the requester. Verify native iOS and Android new-group creation, immediate first-message delivery to every invitee, force-close/reopen persistence, and the absence of legacy UI. Also verify that a realtime/push transport failure still leaves the message persisted and recoverable by polling.

## 2026-08-23 - Restore per-member language ownership in shared rooms

- Surface: Conversation-room language picker, language attribution avatars, room-list language preview, and translation targets.
- Issue: Shared rooms were intended to show the union of each member's own language choices, with the viewer's choices in the key color and languages chosen only by another member in blue. New or deferred invitee membership rows could be empty, and legacy empty rows were treated as contributing nothing, so the counterpart's choices and attribution disappeared. The client also reused the per-user five-language sanitizer for the room union.
- User impact: A member could appear to be using the viewer's language selection, the counterpart's language could vanish from the picker, and languages beyond the first five could be omitted from the visible/translated room state.
- Resolution:
  - Initialize a new room from each participant's `User.defaultConversationLanguages`. The creator's defaults are persisted on their membership row; pending invitees contribute their profile defaults until first-message materialization, which now writes those defaults to their membership rows.
  - Treat an existing empty membership selection as that user's persisted conversation defaults at read time, preserving the intended per-member ownership without a destructive data rewrite.
  - Return pending invitee profile images and language selections through the room member data used by language attribution avatars.
  - Keep the five-language limit per member, but normalize the room union without that limit so every distinct member-selected language remains a translation target. The compact room-list flag preview may show the first five while the room picker and translation pipeline retain the full union.
- Data contract: No Prisma schema or migration change. Existing `User.defaultConversationLanguages`, `AppConversationChannelMember.selectedLanguages`, and pending invitee fields are reused.
- Testing notes: Added coverage for persisted defaults on new shared rooms, empty legacy member rows, pending invitee materialization, and the distinction between the per-user five-language limit and an uncapped room union. Physical-device verification should use two accounts with different defaults, change each side independently, confirm amber/blue attribution and avatars, then send a message and verify every union language receives translation.

## 2026-08-23 - Separate unread conversation messages from the notification panel

- Surface: Conversation list rows, the conversations bottom-tab icon, the existing in-app notification panel, and native message delivery.
- Issue: A message from another member needed to remain visible as unread in the room list and as a tab-level aggregate without flooding the notification panel with one notification per message. The notification panel is currently used for non-message events such as follows, while APNs/FCM are expected to alert users about incoming messages.
- User impact: Without a per-user room read cursor, users could not tell which rooms had new messages or how many were waiting. Reusing `UserNotification` for messages would also make the follow-oriented notification panel noisy and mix two different concepts of notification.
- Resolution:
  - Store `app_conversation_channel_members.last_read_at` as a per-user, per-room read cursor.
  - Count only visible messages sent by another member after that cursor. Existing membership rows are backfilled to the migration time so historical transcripts do not appear unread on first rollout; newly materialized invitees retain a null cursor and see the first counterpart message as unread.
  - Render a capped `99+` room-row badge and the sum of all room unread counts on the conversations tab icon. Opening a room marks that member's cursor read, and an active room also clears the cursor when a finalized message arrives.
  - Keep `UserNotification` and its existing follow-only API filter unchanged. Message persistence now separately fans out a localized `conversation_message` push through APNs or FCM to every other real room member, without creating an in-app notification row.
- Data change: Added `app.app_conversation_channel_members.last_read_at` through `20260823104805_add_conversation_member_read_cursor`. The migration uses explicit `app` schema names and backfills existing membership rows.
- Testing notes: Focused conversation-list, mark-read route, and finalized-message handler tests pass. TypeScript and ESLint pass. Physical-device verification should confirm unread counts update after a counterpart message, clear after opening the room, and do not add entries to the notification panel while iOS/Android push delivery remains enabled.

## 2026-08-23 - Widen message-bubble language flag hit areas

- Surface: The language flag selector rendered inline inside a message bubble.
- Issue: Each flag button was only 30px wide, and the 6px gap between adjacent buttons left little horizontal tolerance when three or more languages were present. Rapidly switching between flags made the middle button especially easy to miss. The final flag also sat too close to the message text.
- User impact: On narrow mobile screens, users could tap the wrong language or fail to switch languages when tapping the center of a three-or-more-flag group. The flag group and message text also read as visually crowded.
- Resolution:
  - Keep each visible flag at its existing 30px circular size so the visual hierarchy and vertical footprint do not grow.
  - Give every flag button a 42px-wide, 30px-high horizontal hit area with the visual flag centered inside it; this expands the left and right touch tolerance without increasing the vertical target.
  - Preserve a visible gap between the flags and add extra trailing space before the message text.
  - Keep selection, original-language quote marking, and event propagation behavior on the outer button.
- Data contract: None. No Prisma migration, API namespace, server, or native bridge change is required.
- Testing notes: The focused `ChatBubble` unit test covers a three-language bubble and verifies three expanded hit areas. Physical-device verification should confirm rapid center-flag switching on narrow iOS and Android layouts.

## 2026-08-21 - Consume the profile surface before starting a direct conversation

- Surface: Public profile details opened from a conversation room, conversation participants or notifications, Connect search, My Page follow lists, or the native profile-link overlay; the message action inside those profiles; and the text composer after a programmatic room transition.
- Issue: The profile message action called `router.push` directly while the profile and its parent menu/follow/search surface were represented by separate same-document history entries. The new conversation route was therefore pushed on top of an unconsumed profile entry. On iOS, edge-swipe back could restore the profile and participants surface in the wrong order, and a delayed history replay could reopen a stale profile. When text mode had been persisted, the newly mounted room also focused its composer and opened the keyboard without a user tap.
- User impact: The expected `room B -> participants -> hamburger -> room A` back sequence was replaced by duplicate profile/participant screens. The same direct-message action from Connect or My Page could lose its parent surface. Android/WebView users could also see the keyboard appear during room restoration.
- Resolution:
  - Return the complete direct-conversation summary from `PublicUserProfileScreen` to a parent callback for internal surfaces. Standalone/deep-link profile routes keep their direct route navigation fallback.
  - Consume only the top profile surface with a history back and wait for the popstate plus two animation frames before pushing the next conversation. Preserve the participant/menu or follow/search entries underneath it.
  - Keep a short pending-navigation guard that filters a stale profile replay while iOS history settles.
  - Reuse the currently active conversation without pushing a duplicate route when the direct-conversation API returns the room that is already open.
  - Make composer focus explicit-user-action-only. Restored input mode and programmatic room transitions can keep the text composer visible without focusing its textarea or opening the keyboard.
- Data contract: None. No Prisma migration, API namespace, or native bridge change is required.
- Testing notes: Verify `room B -> participants -> hamburger -> room A` with iOS edge-swipe, repeat the flow from Connect and My Page, verify an already-open direct room does not get a duplicate route, and verify restored text mode does not open the keyboard until the composer toggle is tapped.

## 2026-08-21 - Give the room default-display-language page its own surface

- Surface: Conversation room hamburger menu, conversation management, and default display language.
- Issue: The default display language page was still rendered as a motion section inside the management child surface. At the third history depth, its edge gesture and native back path therefore shared ownership with the management/menu stack instead of closing only the top page.
- User impact: An iOS edge-swipe from the default display language page could close or replay more than one room-menu level, leaving the hamburger menu transition visibly out of sync.
- Resolution:
  - Keep the conversation-management page mounted beneath the default-display-language page while the third-level history entry is active.
  - Render default display language as its own nested `SlideSurface` with a higher native-back priority and the same edge-only gesture ownership as other full-screen surfaces.
  - Let the shared menu depth remain the history source of truth so one swipe/back action consumes exactly one entry.
- Data contract: None. No Prisma migration, API namespace, or server change is required.
- Testing notes: Verify management → default display language → iOS edge-swipe returns to management only, Android back returns to management only, and a second back/swipe closes the hamburger menu without closing the room.

## 2026-08-17 - Open the Current User's Profile From Participants

- Surface: Conversation room hamburger menu, participants page, and profile detail panel.
- Issue: Participant rows forwarded the user ID correctly, but the public user route rejected the current user's own ID with `use_profile_endpoint`. As a result, the only participant in a solo room appeared tappable but the profile detail panel showed a load failure.
- User impact: Users could not inspect their own participant record from a room, even though the same right-to-left profile surface was available for other users.
- Resolution:
  - When the selected participant is the signed-in user, load the existing private `/profile` response into the same public-style detail panel.
  - Keep the right-to-left slide-in and back behavior unchanged.
  - Hide follow, block, and report actions for the current user while keeping profile sharing available.
- Data change: None. The existing public user route continues to reject direct self-profile requests; only the client-side profile surface selects `/profile` for the current user.
- Status: Implemented in-thread on 2026-08-17. Physical-device verification is pending.

## 2026-08-17 - Collect Primary Languages and Birth Date During Signup

- Surface: Email/password signup sheet.
- Issue: Signup created an account after collecting only credentials, so the app had no reliable primary-language choice or exact age information at account creation.
- User impact: New users could not be guided through the language preference needed for Mingle personalization, and an age policy could not distinguish a birthday that had already occurred from one that had not.
- Resolution:
  - Split signup into three compact steps: account details, primary languages, and age check.
  - Reuse the full language preference picker and allow one to five primary languages.
  - Collect year, month, and day together in a custom wheel-style selector rather than native select controls.
  - Keep the birth date private and explain that it is used only for age verification.
- Age policy: The server enforces a minimum age of 12 using the exact birth date. On 2026-08-17, the newest generally eligible year is 2014; 2014 dates after August 17 remain unavailable until their twelfth birthday. This keeps the policy accurate rather than allowing all 2015-born users before they turn 12.
- Data change: Added nullable `app_users.birth_date` as a date-only field. Existing OAuth accounts remain compatible and can complete any future profile-age collection flow separately.
- Status: Implemented in-thread on 2026-08-17. Physical-device verification is pending.

## 2026-08-17 - Open Participant Profiles From Conversation Rooms

- Surface: Conversation room hamburger menu, participants page, and participant profile row.
- Issue: The participants page showed the current user as a static record, so tapping the participant did not open the existing public profile surface. The row also repeated the first primary-language value as text below an avatar that already displayed the same language as a flag badge.
- User impact: Users could not inspect a participant's public profile from the room, and the duplicated language indicator made the participant record look visually inconsistent.
- Resolution:
  - Make the participant record open the existing right-to-left public profile panel for that participant.
  - Preserve the room underneath the profile panel and close the profile with the existing back gesture or close transition.
  - Remove the duplicated text language row; the avatar's ordered primary-language flag stack remains the single language indicator.
- Data change: None. The profile uses the existing `/users/{userId}` endpoint and existing primary-language fields.
- Status: Implemented in-thread on 2026-08-17. Physical-device verification is pending.

## 2026-08-17 - Localize shared profile link actions with an English fallback

- Surface: The browser fallback screen shown when a user opens a shared Mingle profile link.
- Issue: The primary action was labeled `앱에서 열기` in Korean and `Open in app` in English, which did not identify Mingle as the destination. The screen also detected Korean only in the client and was not connected to the locale routing system.
- User impact: Users could not immediately tell which app the primary action would open, and the first-render language behavior was implicit rather than having a clear default.
- Resolution:
  - Rename the primary action to `밍글 앱에서 열기` in Korean and `Open in Mingle` in English.
  - Read the browser `Accept-Language` header on the `/p/{userId}` server route rather than redirecting the shared link into a locale-prefixed path.
  - Keep Korean only when Korean is the highest-priority supported browser language; use English for English, unsupported languages, missing headers, and crawlers.
- Data contract: None. The stable `/p/{userId}` URL, app deep link, and store links are unchanged.
- Testing notes: Verify the action text and first-render language on Korean, English, unsupported-language, and missing-language browser requests, then verify the custom-scheme launch and store links remain unchanged.

## 2026-08-17 - Remove App Language From Conversation Menu

- Surface: Conversation room's top-right hamburger menu.
- Issue: The menu included a top-level Language action that opened the app-wide language onboarding flow, even though the menu is intended for settings belonging to the current conversation.
- User impact: Users could interpret the app display-language control as a room language setting and change global UI behavior from inside one conversation.
- Resolution: Removed the app-language action, its room-level onboarding modal trigger, and the unused callback path from the conversation room. Room language controls remain available through the existing speech/translation selector, while app language stays in the app-wide settings flow.
- Data change: No schema or migration change.
- Status: Implemented in-thread on 2026-08-17. Physical-device verification is pending.

## 2026-08-17 - First-Launch Language Gate Before Authentication

- Surface: First app launch, language onboarding, locale transition, and the unauthenticated login screen.
- Issue: The login surface mounted as soon as the session became unauthenticated, while the language picker opened later from a client effect and only covered it with a higher z-index. After confirmation, closing the picker before changing the locale briefly exposed the previous locale's login copy.
- User impact: New users saw a login screen flash before language selection and then saw the login copy change from the device locale to the selected language, making the first-launch flow feel unstable.
- Resolution: Added an explicit language bootstrap phase. The app now renders a neutral preparation shell while local onboarding state and session state settle, mounts no authentication surface during required first-launch language selection, keeps the shell visible while changing locale, and only renders login after the selected locale is ready. The first-launch picker is non-dismissible so the user must choose a language before authentication.
- Data ownership: Pre-auth language choices remain in local storage. A pending default-language marker is claimed after authentication; an existing account default wins, and only an account with no saved default receives the anonymous selection through the existing profile endpoint. No primary-language or nationality fields are changed.
- Data change: No schema or migration change; existing profile language fields and local storage are reused.
- Status: Implemented in-thread on 2026-08-17. Physical-device verification is pending.

## 2026-08-17 - Language Onboarding Persistence Before Navigation

- Surface: First-entry language onboarding and the room menu's language picker.
- Issue: Selecting a language updated room state and storage through passive effects, while changing the UI locale navigated immediately. The component could unmount before the selected languages or translation-link state reached the API. The global onboarding picker also did not update the in-memory defaults or the authenticated profile used by new conversations.
- User impact: A user could choose a language, see the app move to the new locale, and then reopen the room with the previous language settings. New rooms could likewise continue using stale default languages.
- Resolution: Onboarding choices now write local preferences synchronously, await one room PATCH containing both selected languages and the translation-link flag before locale navigation, and roll back the optimistic room state when that request fails. The global picker now synchronizes the active default-language state and event, persists authenticated users through the profile endpoint, and only navigates after that save succeeds.
- Data change: No schema or migration change; existing conversation and profile language fields are reused.
- Status: Implemented in-thread on 2026-08-17. Physical-device verification is pending.

## 2026-08-17 - iOS Google OAuth First-Attempt Recovery

- Surface: Native iOS Google sign-in after signing out from an Apple-authenticated session.
- Issue: The OAuth transient cookies used `SameSite=None` for every provider because Apple returns through a cross-site `form_post`. In iOS `ASWebAuthenticationSession`, the first Google callback could therefore arrive without the NextAuth state cookie even though the next attempt succeeded.
- User impact: The first Google sign-in attempt showed an OAuth error, while retrying immediately appeared to fix the problem.
- Resolution: Google and other top-level GET OAuth callbacks now use `SameSite=Lax`; Apple keeps `SameSite=None` for its `form_post` callback. The auth route also records callback cookie presence without logging cookie values, making device verification safer.
- Status: Implemented in the 2.0.0 worktree on 2026-08-17. Physical-device verification after deployment is pending.

## 2026-08-17 - Follow List Relationship Actions

- Surface: My Page follower and following lists.
- Issue: Follow-list rows showed only profile information, so users could not tell whether a listed person followed them back or follow a follower without opening that person's profile.
- User impact: Returning a follow was unnecessarily slow, and mutual-follow relationships were not visible from either list.
- Resolution: The followers list now shows a Follow button for people the user has not followed yet and changes to a check-marked mutual-follow label after success. The following list stays quiet for one-way follows and shows the same non-interactive mutual marker only when the other person follows back. Relationship flags are returned with each list response, and the existing follow endpoint is reused.
- Localization: Added the mutual-follow label to all 15 primary UI locales.
- Data change: No schema or migration change.

## 2026-08-17 - Generic Chinese Source Display Mapping

- Surface: Unified conversation message bubbles and their language buttons.
- Issue: Soniox can report a Chinese source as the generic zh code while the translation provider returns a script-specific zh-CN or zh-TW code. The bubble treated those codes as unrelated languages, so one Chinese utterance could render two Chinese buttons and attach the original-language quote badge to the wrong button.
- User impact: Users saw duplicate Chinese choices and could not tell which button represented the spoken source.
- Resolution: The bubble now resolves a generic zh source to one display language. It prefers zh-CN when that code is in the current conversation language order, otherwise zh-TW when that is present, and otherwise uses zh-CN. The generic source and the chosen script-specific alias are removed from the translation target list so only one source button is rendered. If both script variants are configured, zh-CN carries the original-language badge while zh-TW remains available as a separate user-selected translation target. Legacy generic zh entries in the room order are normalized to the same display button.
- Data/provider boundary: Soniox and translation payloads remain unchanged; this is a display-layer compatibility mapping and does not alter stored language codes or API requests.
- Status: Implemented in-thread on 2026-08-17. Physical-device verification is pending.

## 2026-08-17 - Primary Language Settings Parity

- Surface: My Page hamburger menu, primary-language settings page, and Profile Edit.
- Issue: Primary languages were editable only as part of the broader profile form, so users who wanted to update the languages shown on their profile had to open the full editor. The profile editor and settings surface also needed to stay visually and behaviorally identical for multi-language users.
- User impact: Changing the language badges shown on a profile was harder to discover, and users could not confirm the saved order from a focused language-only page.
- Resolution: Added a dedicated Primary languages page to the My Page hamburger menu. It reuses the shared language preference picker already used by Profile Edit, including the selected-language flag strip, order-preserving selection, five-language limit, featured-language section, search, and locale/alphabetical sorting. Each change saves through the existing profile endpoint, updates the profile's first language field for backward compatibility, and immediately feeds the same ordered list back into My Page and Profile Edit. Profile Edit now uses the same explicit primary-language label and selection limits.
- Data change: No schema or migration change; the existing primary_languages profile field is reused.
- Status: Implemented in-thread on 2026-08-17. Physical-device verification is pending.

## 2026-08-17 - Per-Conversation Default Display Language

- Surface: Conversation room hamburger menu, default display language panel, and unified message bubbles.
- Issue: A bubble's initially visible language depended on the detected source language or an incomplete single-language preference, and there was no room-level control for changing that default.
- User impact: The same conversation could open in an unexpected language for different messages, while multilingual users had no way to choose a stable display preference without changing the room's language list.
- Resolution: Added a per-conversation nullable display-language preference. `Automatic` now checks the user's primary languages in saved order, first matching the message's original language or then the room's configured language list; when none match, it falls back to the first room language. An explicit room selection overrides automatic resolution when that language is available. The hamburger menu exposes the setting and keeps the existing room-language order in the picker, while the original-language quote badge remains attached to the matching language button.
- Data change: Added the nullable `default_display_language` column to `app_conversation_channels`; the migration SQL is intentionally separate so the production database can be updated manually.

## 2026-08-17 - Room Language Order With Per-Message Original Badge

- Surface: Language buttons inside each conversation message bubble.
- Issue: The detected utterance language was always inserted before the conversation's configured language order.
- User impact: Every message could present a different button order, and the quote badge appeared fixed to the first position instead of identifying the original-language button.
- Resolution: Pass the conversation language order into each bubble, render available language buttons in that order, and keep the quote badge attached to the button whose language matches that message's detected original language.

## 2026-08-17 - Ordered Primary Language Flags on Profile Avatars

- Surface: My Page and public profile avatar badges.
- Issue: A profile could store multiple primary languages, but the avatar showed only one language flag.
- User impact: Multilingual users could not communicate their selected language order from the profile summary, and public profiles did not match My Page.
- Resolution: Added a shared lower-left flag stack that preserves the saved language order, overlaps each flag slightly from left to right, and supports up to the existing five-language selection limit. Public profile responses now include the same normalized primary-language list.

## 2026-08-17 - Usage Panel Namespace Route Recovery

- Surface: My Page usage panel in native v2.0.0 builds.
- Issue: The usage panel requested `/api/ios/v2.0.0/profile/usage` or `/api/android/v2.0.0/profile/usage`, but only the unversioned profile usage route existed.
- User impact: Native users saw the generic usage-load error even though the underlying usage query and database schema were available.
- Resolution: Added iOS and Android v2.0.0 namespace route adapters that delegate to the shared profile usage handler.

## 2026-08-17 - Enlarged Selected Language Flags in Profile Settings

- Surface: My Page primary-language and default-conversation-language pickers.
- Issue: The selected-language flags were smaller than the selected-language strip in the in-room language selector, making the active order harder to scan.
- User impact: Users could not recognize their selected language order at a glance when editing profile or conversation defaults.
- Resolution: Matched the selected flag buttons to the room selector's 56px circular flags, including the larger emoji treatment and selected amber outline.

## 2026-08-17 - My Page Usage Summary

- Surface: My Page hamburger menu and usage detail panel.
- Issue: Users had no in-app view of their accumulated speech activity, message volume, or conversation count.
- User impact: Personal usage history was difficult to understand, and there was no way to compare speech recognition activity with translation language usage.
- Resolution: Added a Usage menu item and a slide-in usage panel with total time, total messages, total conversation rooms, speech-language time/message breakdowns, and translation-language message counts. The panel keeps the existing edge-swipe back interaction and loads private usage data only when opened.
## 2026-08-24 - Live Demo Preference i18n Coverage

- Surface: `mingle-app/src/i18n/dictionaries/*.ts`, `mingle-app/src/i18n/dictionaries/generated.ts`, `mingle-app/src/components/LivePhoneDemo/LivePhoneDemo.tsx`, `mingle-app/src/components/LivePhoneDemo/LivePhoneDemoLegacy.tsx`
- Issue: The newly added live-demo preference labels for segmentation mode, silence duration, endpoint tuning, and ad position were fully localized only in the Korean and English dictionaries. Other primary UI locales inherited the default dictionary for part of the controls.
- User impact: Users who selected one of the other primary UI languages could see English or fallback-language labels for the speech-splitting controls, making the new settings inconsistent with the rest of the interface.
- Resolution: Added localized labels for all live-demo preference controls to the seven generated primary dictionaries and the six dedicated locale dictionaries, preserving the existing dictionary merge architecture. Added a source-level coverage test for all 15 primary UI locales so future preference controls cannot silently fall back.
- Verification: Run the i18n dictionary tests and the existing live-demo preference tests; verify the mode selector, silence-duration control, endpoint tuning control, and ad-position selector in each primary UI locale.

## 2026-08-24 - STT Mode Selection Emphasis

- Surface: `mingle-app/src/components/LivePhoneDemo/LivePhoneDemo.tsx`, `mingle-app/src/components/LivePhoneDemo/LivePhoneDemoLegacy.tsx`
- Issue: The active STT segmentation mode used a white selected button on a gray segmented control, so it had less visual emphasis than the existing ad-position selector.
- User impact: Users could see the current mode label but had to inspect the control more closely to distinguish the active mode.
- Resolution: Reused the amber key-color selected state from the ad-position selector for both current and legacy STT mode controls, while preserving the existing pressed and disabled behavior.
- Verification: Run the live-demo preference tests and verify the selected End/Fin option remains visibly highlighted on the mobile builds.

## 2026-08-24 - Mode-specific STT Segmentation Controls

- Surface: `mingle-app/src/components/LivePhoneDemo/LivePhoneDemo.tsx`, `mingle-app/src/components/LivePhoneDemo/LivePhoneDemoLegacy.tsx`, `mingle-app/src/components/LivePhoneDemo/live-phone-demo.preferences.ts`
- Issue: The silence-based speech split mode had its silence-duration control hidden while the endpoint-mode five-step speech-length control remained visible. Users could therefore see a misleading “speech length per utterance” setting when they had selected silence-based splitting.
- User impact: Silence-based splitting did not expose the original silence-duration control, and the visible control described a different segmentation behavior.
- Resolution: Show the 500–5000ms silence-duration slider only for silence-based splitting, with a 1000ms default, and show the existing five-step endpoint tuning slider only for automatic endpoint detection. The endpoint safety cap remains 500–3000ms, so extending the Fin silence window does not change End behavior.
- Verification: Update the preference UI contract test and verify both current and legacy live-demo menus switch controls when the segmentation mode changes.

## 2026-08-24 - Per-user STT Speech Split Mode Selector

- Surface: `mingle-app/src/components/LivePhoneDemo/LivePhoneDemo.tsx`, `mingle-app/src/components/LivePhoneDemo/LivePhoneDemoLegacy.tsx`, `mingle-app/src/i18n/dictionaries/en.ts`, `mingle-app/src/i18n/dictionaries/ko.ts`
- Issue: Soniox speech segmentation was controlled only by the server-wide `SONIOX_SEGMENTATION_STRATEGY`, so a user who needed conservative silence-based `fin` splitting could not choose it without affecting every active session. The account-preference hydration contract also had no visible control for the newly stored per-user value.
- User impact: Users could not control whether a live transcript used automatic provider endpoint detection (`end`) or silence-based manual finalization (`fin`). Changing the mode during an active STT session could also make the next session's behavior ambiguous if the control remained interactive.
- Resolution: Added a two-option segmented control in both current and legacy live-demo menus. Existing `null` preferences remain the server fallback but render as the default `Automatic detection` option. The user-facing labels do not expose provider strategy names. The main branch's five-step speech-length control is restored for endpoint mode and remains available alongside the mode selector. Both controls are disabled while STT is connecting or active, and changes are persisted through the existing account-preference sync path. Added Korean and English copy while other locales inherit the English fallback through the dictionary merge.
- Accessibility: The control uses a labeled `role="group"`, `aria-pressed` state per option, visible focus rings, and disabled-state feedback during an active recording.
- Verification: Targeted account-preference tests pass; manual device verification should confirm that changing the selector, starting a new recording, and switching between web and native STT produces the selected mode in the session handshake.

## 2026-08-16 - Admin Dashboard Daily Metric Loading Delay

- Surface: `mingle-app/src/app/admin/dashboard/page.tsx`, `mingle-app/src/lib/admin-dashboard-query.ts`, `mingle-app/prisma/schema.prisma`
- Issue: Every dashboard request recomputed signup count, DAU, message count, usage seconds, and four latency series with six aggregate queries over the production tables. Switching between the 7-day, 30-day, and 90-day ranges repeated the same historical work and left the administrator waiting on the loading state.
- User impact: The service dashboard felt slow and made repeated date-range inspection impractical, even though the historical daily values did not change during normal use.
- Resolution: Added the `admin_dashboard_daily_metrics` daily snapshot table, persisted all calculated values for historical dates on first request, and served subsequent range changes from a primary-key date lookup. The current UTC day is refreshed on each request so live admin numbers remain current; completed dates remain stable snapshots. The existing chart, cumulative view, table layout, and loading copy were preserved.
- Tests: Added cache-hit, missing-history population, and current-day refresh coverage in `admin-dashboard-query.test.ts`; the targeted dashboard metric test suite passes.

## 2026-08-13 - My Page Safety History Empty and Auth States

- Surface: My Page hamburger menu safety management panel.
- Issue: The panel requested block and report history with `Promise.all`, so an unauthenticated 401 response from either endpoint replaced both sections with the generic `관리 내역을 불러오지 못했습니다.` message. This was especially confusing because My Page remains visible while the translator auth gate is disabled.
- User impact: Users could not distinguish an empty history from a request failure, and one failed collection prevented the other collection from being displayed.
- Resolution: Load block and report history independently. The panel now always renders both management sections, shows an explicit sign-in state when the account session is unavailable, keeps an empty state for authenticated users with no records, and limits the generic error state to the collection that actually failed.

## 2026-08-14 - Profile Primary Speech Language

- Surface: My Page profile edit panel.
- Issue: The profile form asked for a country even though Mingle uses the value to represent the user's speech-input language for STT.
- User impact: The field's meaning did not match the product behavior, and users could select only the small primary-UI locale subset rather than the full speech-language catalog.
- Resolution: Renamed the visible field to primary language, reused the shared STT language catalog and flags, localized the language names for the active UI locale, and updated profile validation to accept every selectable STT language. Chinese Simplified and Chinese Traditional remain separate selectable speech variants, matching the existing STT selector.

## 2026-08-14 - My Page Profile Header Counts and Alignment

- Surface: My Page profile summary header.
- Issue: The header displayed a placeholder posts count even though post creation is not available, while the follower/following counts and profile identity block felt horizontally unbalanced.
- User impact: The placeholder suggested an unavailable feature, and the profile photo, name, and bio appeared too far left relative to the intended composition.
- Resolution: Removed the posts count, changed the stats row to follower/following only with a slight left adjustment, and added a small right inset to the profile photo, name, and bio.

## 2026-08-13 - Profile Edit Swipe Snap Behavior

- Surface: `mingle-app/src/components/my-page.tsx` profile edit panel.
- Issue: A short rightward swipe could leave the profile edit panel resting at an intermediate horizontal offset instead of returning to its fully open position or closing completely.
- User impact: The panel looked partially dismissed and required an extra gesture, making the back interaction feel unreliable.
- Resolution: Added explicit drag-settle behavior. Swipes below the distance and velocity thresholds animate back to `x: 0`, while qualifying swipes run the full exit animation before closing. The animation controls are guarded by the panel lifecycle to avoid starting animations after unmount.

## 2026-08-07 - Messenger Bottom Tabs and My Page Draft Surface

- Surface: `mingle-app/src/components/conversation-list.tsx`, `mingle-app/src/components/bottom-tab-bar.tsx`, `mingle-app/src/components/my-page.tsx`
- Issue: The conversation list used a full-width start-conversation footer and did not provide persistent navigation to a personal page.
- User impact: Users could not switch between the conversation list and a personal page without leaving the main flow, and the primary new-conversation action occupied the entire bottom edge.
- Resolution: Replaced the footer with a two-tab bottom bar, moved search slightly left, added a chat-plus new-conversation action in the header, and added an Instagram-style personal-page header with a disabled lower placeholder. Profile editing, sharing, settings, and post uploads remain out of scope for this draft.

## 2026-08-07 - Remove My Page Plus Action Placeholder

- Surface: `mingle-app/src/components/my-page.tsx`
- Issue: The My Page header still displayed an inactive Instagram-style plus button even though Mingle has no post-creation feature in this scope.
- User impact: The disabled control suggested an unavailable posting action and occupied an unnecessary interactive-looking area.
- Resolution: Removed the plus button while retaining a non-interactive 40px layout spacer so the profile title stays centered and the menu action remains aligned.

## 2026-04-30 - Live Demo Chat Scroll Surface Paint Boundary

- Surface: `mingle-app/src/components/LivePhoneDemo/LivePhoneDemo.tsx`
- Issue: The chat transcript scroller sits inside the same phone screen tree as static background chrome, scroll overlays, and bottom controls. During 500-utterance iOS WebView touch scrolling, repaint invalidation from the moving transcript should stay bounded to the chat surface instead of leaking into surrounding decorative phone UI.
- User impact: Long transcript scrolling could feel less stable on iPhone-class WebViews while preserving the same visible phone frame, chat background, date label, scrollbar, and scroll-to-bottom affordance.
- Resolution: Added a shared chat surface style with `contain: layout paint style` and `isolation: isolate` on the non-scrolling chat area wrapper outside the inner DOM scroller. The inner WebView-owned scroll container, native WebView scroll-disabled contract, padding, overlays, and message visuals remain unchanged.

## 2026-04-30 - Live Demo Chat Message Paint Isolation

- Surface: `mingle-app/src/components/LivePhoneDemo/LivePhoneDemo.tsx`
- Issue: Each rendered chat message row contains bubble surfaces with borders, subtle shadows, badges, image avatars, and occasional inline playback animations. In a 500-utterance iOS WebView scroll, invalidation from those descendants can be more expensive if every row participates in the same unconstrained layout/style scope.
- User impact: Long transcript scrolling could feel less stable on iPhone-class WebViews even though the chat list remains visually unchanged.
- Resolution: Added a shared repeated-row style that isolates each message row with `contain: layout style` and `isolation: isolate`, avoiding paint clipping, per-row layer promotion, color changes, or bubble class changes so the existing chat appearance and interaction affordances remain intact.

## 2026-04-30 - Live Demo Chat iOS Scroll Viewport Styles

- Surface: `mingle-app/src/components/LivePhoneDemo/LivePhoneDemo.tsx`
- Issue: The live demo chat scroll container did not explicitly opt into iOS WebView momentum scrolling or vertical pan gesture handling at the inner DOM viewport that owns transcript scrolling.
- User impact: On iPhone-class WebViews with roughly 500 utterances, the transcript could leave more scroll gesture work to WebKit defaults, increasing the risk of uneven touch scrolling even though the visible layout was unchanged.
- Resolution: Kept the native WebView scroll disabled contract and the existing chat padding/layout intact, but applied iOS-friendly scroll viewport styles (`-webkit-overflow-scrolling: touch`, vertical overscroll containment, vertical touch-action, and a scroll-position will-change hint) to the inner chat scroller.

## 2026-04-30 - Live Demo Chat Scroll FPS Capture Harness

- Surface: `mingle-app/src/components/LivePhoneDemo/LivePhoneDemo.tsx`, `mingle-app/scripts/ios-live-demo-scroll-fps-capture.mjs`, `mingle-app/qa/mobile-ui/IOS_SCROLL_FPS_CAPTURE.md`
- Issue: The 500-utterance iOS WebView chat scroll work needed a repeatable physical-device touch-scroll FPS and jank capture path that did not rely on the app's dev-only scroll-handler counter.
- User impact: Without a repeatable capture harness, final smoothness checks on iPhone 12-class devices could vary by operator gesture and accidentally run with instrumentation enabled.
- Resolution: Added a devbox/Appium iOS scroll FPS harness that seeds the deterministic 500-utterance history, clears and verifies the app scroll instrumentation is off, drives native touch gestures against the inner chat DOM scroll container, and records per-run FPS, frame interval, jank, long-frame, dropped-frame, and repeatability summaries.

## 2026-04-30 - Live Demo Chat Scroll Handler Median Verification

- Surface: `mingle-app/src/components/LivePhoneDemo/LivePhoneDemo.tsx`, `mingle-app/src/components/LivePhoneDemo/live-phone-demo.scroll.logic.ts`, `mingle-app/src/components/LivePhoneDemo/live-phone-demo.scroll.logic.test.ts`
- Issue: The optimized chat scroll handler needed an explicit verification record for the 2ms median-cost budget before considering heavier windowing work.
- User impact: On iPhone 12-class WebViews with roughly 500 utterances, a handler that exceeds the per-scroll median budget can make transcript touch scrolling feel uneven even when the visible UI is unchanged.
- Resolution: Locked the representative `chat-scroll-handler` median budget to `<= 2ms` in the scroll logic tests and verified the optimized 500-utterance logical handler path with 240 samples at median `0.000ms` and max `0.007ms`; final pass/fail device FPS measurement should still run separately with instrumentation OFF.

## 2026-04-30 - Live Demo Chat Scroll Height Read Guard

- Surface: `mingle-app/src/components/LivePhoneDemo/LivePhoneDemo.tsx`, `mingle-app/src/components/LivePhoneDemo/live-phone-demo.scroll.logic.ts`
- Issue: The optimized chat scroll handler still evaluated `node.scrollHeight` on every native scroll event while deciding whether a pending older-message prepend needed a `scrollTop` snapshot.
- User impact: On iPhone-class WebViews with roughly 500 utterances, that unnecessary layout-height read could add work to touch scrolling even when no prepend was in progress.
- Resolution: Reused the cached `scrollTop` read for the synchronous anchor snapshot and moved the `scrollHeight` read behind a finite pending-prepend guard, preserving the existing prepend anchor behavior while keeping the normal scroll path lighter.

## 2026-04-30 - Live Demo Chat Late Height Measurement

- Surface: `mingle-app/src/components/LivePhoneDemo/LivePhoneDemo.tsx`, `mingle-app/src/components/LivePhoneDemo/live-phone-demo.scroll.logic.ts`
- Issue: Late per-message height changes can shift content above the current viewport anchor after cached chat offsets have already been used for scroll-derived state.
- User impact: In long iOS WebView demo chats, delayed translation or bubble layout changes above the visible anchor could otherwise create subtle transcript drift during review.
- Resolution: During measured anchor refresh, compared previous and next per-message heights, detected changed messages above the viewport anchor, and compensated the chat `scrollTop` from the saved anchor top offset so delayed layout changes preserve the visible message position without adding DOM scans to the scroll event path.

## 2026-04-30 - Live Demo Chat Viewport Anchor Snapshot

- Surface: `mingle-app/src/components/LivePhoneDemo/LivePhoneDemo.tsx`, `mingle-app/src/components/LivePhoneDemo/live-phone-demo.scroll.logic.ts`
- Issue: Late chat layout changes need a stable reference to the message currently anchoring the viewport before cached offsets are refreshed. Without an explicit message-id/top-offset snapshot, later scroll correction work would have to infer the anchor after content already changed.
- User impact: In long iOS WebView demo chats, delayed message height changes could otherwise make the visible transcript drift during review.
- Resolution: Added a ref-backed viewport anchor snapshot that records the current top-visible utterance id and its viewport-relative top offset from cached scroll anchors, including before older-message loading and DOM-change refresh scheduling.

## 2026-04-30 - Live Demo Chat Scroll DOM Scan Contract

- Surface: `mingle-app/src/components/LivePhoneDemo/LivePhoneDemo.tsx`, `mingle-app/src/components/LivePhoneDemo/live-phone-demo.scroll.logic.test.ts`
- Issue: Long iOS WebView chat sessions need the touch-scroll event path to stay free of full DOM scans. The date-label anchor cache can still be refreshed after content/layout changes, but scroll events must not reintroduce `querySelector*`, child traversal, or the anchor refresh scan.
- User impact: With roughly 500 utterances loaded, any per-scroll full DOM scan could compete with WebView touch scrolling and make the transcript feel sticky or uneven.
- Resolution: Added a focused source contract test that locks `handleScroll` and the rAF-throttled scroll-derived state path to cached anchors only, with no full-DOM scan calls per scroll event.

## 2026-04-30 - Live Demo Prepend Snapshot rAF Integration

- Surface: `mingle-app/src/components/LivePhoneDemo/LivePhoneDemo.tsx`, `mingle-app/src/components/LivePhoneDemo/live-phone-demo.scroll.logic.ts`
- Issue: Scroll-derived React state was rAF-throttled, but older-message prepend retention still depended on the latest `scrollTop` snapshot. If the user scrolled after triggering older-message loading and before the rAF callback ran, the prepend correction could use a stale snapshot.
- User impact: A long iOS WebView transcript could jump slightly when older history finished loading during active touch scrolling, even though the retention logic was intended to keep the currently visible message pinned.
- Resolution: Kept rAF throttling for expensive derived state updates, but captured the pending prepend `scrollTop` ref synchronously during pagination while the DOM height still matches the pre-prepend height.

## 2026-04-30 - Live Demo New Message Auto-Follow Threshold

- Surface: `mingle-app/src/components/LivePhoneDemo/LivePhoneDemo.tsx`, `mingle-app/src/components/LivePhoneDemo/live-phone-demo.scroll.logic.ts`
- Issue: New-message auto-follow used the same 400px distance threshold as the floating scroll-to-bottom affordance, which could pull users farther from the bottom than the intended near-bottom chat-follow behavior.
- User impact: In long iOS WebView demo chats, a user reviewing messages within that wider range could be moved to the latest message unexpectedly, while a user exactly near the bottom still needed reliable follow behavior when a new message changed content height.
- Resolution: Changed the new-message auto-follow threshold to 100px, preserved the existing 400px scroll-to-bottom button visibility threshold, and based append follow eligibility on the pre-append distance so users within 100px continue to land at the bottom after the new message renders.

## 2026-04-30 - Live Demo Chat Scroll Date Label Performance

- Surface: `mingle-app/src/components/LivePhoneDemo/LivePhoneDemo.tsx`, `mingle-app/src/components/LivePhoneDemo/live-phone-demo.scroll.logic.ts`
- Issue: The live demo chat scroll overlay recalculated the visible date label during scroll by querying every message node and reading each bounding rect, which could add avoidable main-thread work in long iOS WebView conversations.
- User impact: Users scrolling a long transcript could feel less smooth movement because the scroll handler performed layout reads across the whole message list.
- Resolution: Moved date-label anchor measurement to render/DOM-change moments, cached message offsets, and made scroll-time date selection use only `scrollTop` plus cached offsets while preserving the existing top-visible-message rule and date formatting.

## 2026-04-30 - Live Demo Chat Prepend Anchor Preservation

- Surface: `mingle-app/src/components/LivePhoneDemo/LivePhoneDemo.tsx`, `mingle-app/src/components/LivePhoneDemo/live-phone-demo.scroll.logic.ts`
- Issue: Loading older utterances at the top of a long live demo chat depended on applying the raw `scrollHeight` delta to the current `scrollTop`. If the WebView or a pending user scroll changed `scrollTop` before React's layout effect ran, the first visible message could drift instead of staying visually pinned.
- User impact: On iPhone-class WebViews, paging into older chat history could feel like the conversation jumped by a small amount, making long-history review harder.
- Resolution: Kept the existing `prevScrollHeightRef` delta correction, added a pending `scrollTop` snapshot for the same prepend operation, and centralized the corrected scroll-top calculation with tests that assert the visible message remains within the 1px tolerance.

## 2026-04-27 - Feedback History Clickable Links

- Surface: `mingle-app/src/components/LivePhoneDemo/LivePhoneDemo.tsx`, `mingle-app/src/components/LivePhoneDemo/LivePhoneDemoLegacy.tsx`, `mingle-app/src/components/LivePhoneDemo/live-phone-demo.feedback-links.tsx`
- Issue: Feedback history messages rendered user questions and team replies as plain text, so URLs pasted into either side of the conversation were not tappable in the mobile app.
- User impact: Users had to manually copy links from support replies or their own feedback records, which made follow-up instructions and external support references harder to use on mobile.
- Resolution: Added safe URL linkification for `https://`, `http://`, and `www.` links in feedback history message text, preserving normal text escaping and leaving sentence punctuation outside the clickable target.

## 2026-04-27 - Feedback Page Instagram Contact Button

- Surface: `mingle-app/src/components/LivePhoneDemo/LivePhoneDemo.tsx`, `mingle-app/src/components/LivePhoneDemo/LivePhoneDemoLegacy.tsx`, `mingle-app/src/components/LivePhoneDemo/live-phone-demo.feedback-copy.ts`
- Issue: The in-app feedback page only exposed the compose/history tabs, so users who found the feedback form inconvenient or needed a clearer support path had no obvious alternate contact route.
- User impact: Users could leave terse or repeated feedback because the current UI did not make the team's Instagram support channel discoverable at the point where they were already trying to contact Mingle.
- Resolution: Added a localized full-width Instagram contact button above the feedback send/history tabs in both current and legacy live demo feedback panels, linking to `https://www.instagram.com/mingle.labs/`, and added Thai copy coverage for the new label.

## 2026-04-26 - Mobile WebView Swipe-To-Close Removal

- Surface: `mingle-app/src/components/LivePhoneDemo/LivePhoneDemo.tsx`, `mingle-app/src/components/LivePhoneDemo/LivePhoneDemoLegacy.tsx`
- Issue: The conversation root and right-side menu panel had custom left-to-right swipe-to-close handlers inside the mobile WebView, which overlapped with iOS edge-swipe back behavior and could make horizontal touches inside a conversation feel like accidental navigation.
- User impact: Mobile users could unintentionally leave a conversation or close the menu while performing horizontal touch interactions, especially on iOS where the OS already provides an edge back gesture.
- Resolution: Removed the app-level swipe-to-close pointer sessions, drag thresholds, drag state, and swipe-only touch-action overrides while keeping explicit back/close buttons, backdrop tap close behavior, browser/native history handling, and OS back gestures.

## 2026-04-20 - Blog Felo And Transync Turn Criteria Corrections

- Surface: `mingle-app/public/legal/blogs/ai-translators-comparison.html`
- Issue: Felo's messenger-like sentence turns were understated as `Partial`, while Transync's sentence-turn and speaker-diarization cells were overstated as `Partial`.
- User impact: Readers could misread Felo's sentence-level transcript behavior and Transync's live transcript behavior against the table's stricter messenger-turn and diarization criteria.
- Resolution: Updated Felo `Messenger-like sentence turns` to `Yes`, and updated Transync `Messenger-like sentence turns` plus `Realtime speaker diarization` to `No`.

## 2026-04-20 - Blog Transync External Audio Correction

- Surface: `mingle-app/public/legal/blogs/ai-translators-comparison.html`
- Issue: Transync was marked as `Partial` for `External app audio capture`, implying some external-app audio capture support.
- User impact: Readers could incorrectly interpret Transync as supporting external app audio capture in the same comparison category.
- Resolution: Updated the Transync `External app audio capture` cell to `No` and clarified that meeting integrations do not make it an external app audio capture layer.

## 2026-04-26 - Mingle App Composer Jitter During STT/TTS Playback

- Surface: `mingle-app/src/components/LivePhoneDemo/LivePhoneDemo.tsx`
- Issue: In long conversations, switching to keyboard mode while STT/TTS was active could make the composer subtly flicker and move the caret away from the expected typing position. The risky paths were controlled textarea draft updates re-rendering the full live demo on every keystroke, animated textarea/container height changes, Framer layout measurement on the active bottom bar, and 1px-level `visualViewport` inset jitter feeding bottom padding.
- User impact: Text entry felt unreliable because the input area and caret could visually shift while the user was typing, especially with a large transcript and concurrent playback/recognition updates.
- Resolution: Moved the composer text draft to a ref-backed uncontrolled textarea, kept React state only for send-button availability and actual height changes, removed height transitions from the composer shell/textarea, disabled bottom-bar layout animation while text mode is open, and added a small stability threshold for keyboard viewport inset updates.

## 2026-04-20 - Blog Felo Price Copy

- Surface: `mingle-app/public/legal/blogs/ai-translators-comparison.html`
- Issue: The Felo Translator price cell mixed KRW and USD conversion details, making the table less clean for English readers.
- User impact: Readers saw an unnecessary currency conversion instead of a direct dollar-only price comparison.
- Resolution: Updated the Felo Translator price to a dollar-only public pricing summary, `About $2/hour; public web pricing lists 120 minutes at $3.90.`, and removed the KRW exchange reference from the source notes.

## 2026-04-20 - Blog Comparison Table Row Order

- Surface: `mingle-app/public/legal/blogs/ai-translators-comparison.html`
- Issue: Felo Translator and Transync appeared immediately after Mingle, ahead of the broader consumer translator set.
- User impact: The table ordering made newer comparison additions feel over-prioritized instead of supplemental to the core translator set.
- Resolution: Kept Mingle first, moved Google Translate, Apple Translate, Microsoft Translator, Papago, and DeepL directly after it, and placed Felo Translator and Transync as the final two rows.

## 2026-04-20 - Blog Comparison Table AI Performance Column

- Surface: `mingle-app/public/legal/blogs/ai-translators-comparison.html`
- Issue: The translator comparison table listed language counts and workflow features but did not summarize perceived AI performance as a scannable criterion.
- User impact: Readers had to infer model quality from adjacent feature descriptions instead of comparing a direct `Good` or `Standard` performance signal.
- Resolution: Added an `AI performance` column immediately after `Supported languages`, marked Mingle, Google Translate, Transync, and DeepL as `Good`, marked Felo Translator, Apple Translate, Microsoft Translator, and Papago as `Standard`, and widened the table to preserve cell spacing.

## 2026-04-20 - Blog Landing Page Reference Button

- Surface: `mingle-app/public/legal/blogs/ai-translators-comparison.html`
- Issue: The comparison article ended at source references without a clear path back to the Mingle product landing page.
- User impact: Readers who reached the bottom of the article had to use navigation or manually change URLs to inspect the referenced product page.
- Resolution: Added a centered bottom reference button linking to `https://translator.minglelabs.xyz/landing/`, styled to match the article's restrained button language.

## 2026-04-20 - Blog Comparison Table Felo And Transync Rows

- Surface: `mingle-app/public/legal/blogs/ai-translators-comparison.html`
- Issue: The live AI translator comparison table did not include Felo Translator or Transync, two relevant real-time voice translation products.
- User impact: Readers could not compare Mingle against adjacent live translation products with hourly or meeting-oriented pricing.
- Resolution: Added Felo Translator and Transync rows directly after Mingle, including their logos, platform coverage, pricing, language support, live caption behavior, detection behavior, and other existing comparison criteria.

## 2026-04-20 - Blog Translator Comparison Table Logo

- Surface: `mingle-app/public/legal/blogs/ai-translators-comparison.html`
- Issue: The Mingle row in the translator comparison table used `/assets/logo-mingle.png`, which rendered as a text-like white tile and did not match the branded icon in the blog navigation.
- User impact: The first row of the comparison table looked visually inconsistent with the navbar brand and weaker than the other translator logo cells.
- Resolution: Updated the Mingle table row to use the same navbar asset, `/assets/mingle-icon.png`, while leaving the surrounding table layout and other translator rows unchanged.

## 2026-04-20 - Blog Translator Comparison Platform Coverage

- Surface: `mingle-app/public/legal/blogs/ai-translators-comparison.html`
- Issue: The comparison table listed price and feature coverage but did not show platform availability, making it harder to compare whether each translator supports iOS, Android, Web, or desktop surfaces.
- User impact: Readers could not quickly distinguish mobile-only translators from products that also work on the web or desktop.
- Resolution: Added a `Platforms` column, updated the Mingle pricing copy to `Free consumer app.`, and expanded the source notes to include platform references.

## 2026-04-20 - Blog Hero App Screenshot Framing

- Surface: `mingle-app/public/legal/blogs/ai-translators-comparison.html`
- Issue: The Mingle app screenshot in the article hero was too zoomed in, and the hero section felt too short for the article framing.
- User impact: The app screen was harder to recognize as a full Mingle interface, and the top of the article did not give enough visual weight to the comparison.
- Resolution: Reduced the hero screenshot background size, centered it more calmly, increased hero vertical spacing, and added a second hero paragraph summarizing that Mingle ranks best overall among mobile apps across the 10 comparison criteria.

## 2026-04-20 - Blog Comparison Table Width And Live Chat Criteria

- Surface: `mingle-app/public/legal/blogs/ai-translators-comparison.html`
- Issue: The comparison table cells felt too narrow after multiple feature columns were added, and the table did not yet compare real-time speaker diarization or whether each product can function as its own messenger and voice chat app.
- User impact: Readers had to parse cramped cells and could miss two core differentiators for Mingle as a live social translation product.
- Resolution: Increased the table minimum width, widened table padding and the translator column, added `Realtime speaker diarization` and `Messenger + voice chat app` columns, and updated the hero summary from 10 to 12 criteria.

## 2026-04-20 - Blog Comparison Table Column Balance

- Surface: `mingle-app/public/legal/blogs/ai-translators-comparison.html`
- Issue: The `Translator`, `Price`, and `Platforms` columns consumed more horizontal space than needed while feature columns still felt compressed.
- User impact: The most important feature comparison cells were harder to scan, especially after the table gained additional criteria.
- Resolution: Switched the table to fixed layout, narrowed the first three columns, increased the overall table width, and widened the remaining feature columns with larger default cell widths.

## 2026-04-20 - Blog Comparison Table Feature Order

- Surface: `mingle-app/public/legal/blogs/ai-translators-comparison.html`
- Issue: `Continuous note-style translation` and `Live captions + transcript` were placed later in the table, after detection and multilingual routing features.
- User impact: Two core live-output criteria were harder to compare immediately after basic language support.
- Resolution: Moved both columns to immediately follow `Supported languages` across the header and all translator rows, without changing the feature values.

## 2026-05-04 - Live Chat Conversation List Status Race And Misleading Open/Pause Alerts

- Surface: `mingle-app/src/components/conversation-list.tsx`
- Issue: On the chat-scroll-performance branch devbox build, opening/stopping a conversation room produced false `대화방을 열지 못했습니다` (Failed to open) and `대화방을 정지하지 못했습니다` (Failed to pause) toasts that did not appear on App Store 1.1.3. Two underlying problems:
  1. The conversation status PATCH (active/paused) was fire-and-forget without a per-conversation mutation version guard. On devbox the PATCH takes ~4s, so an in-flight `active` response could land after a newer `paused` response and overwrite local state, retriggering room re-entry.
  2. The same generic `openErrorMessage` toast was reused for unrelated `selectedLanguages`/`speechLanguages`/`translationLanguagesLinked` PATCH failures, so a single language-sync glitch produced up to three misleading `Failed to open` toasts even when the room was already open.
- User impact: Users on slow networks or devbox saw repeated fake `Failed to open` toasts while the room actually opened, plus a fake `Failed to pause` after stopping STT, with the app sometimes appearing to "reopen" the room because stale status responses overrode local pause state.
- Resolution:
  - Added a per-conversation monotonically increasing status mutation tracker plus AbortController in `conversation-list.tsx`. The status `then`/`catch` now ignores stale and aborted responses; only the most recent mutation can update local state, roll back, or alert.
  - Removed the misleading `window.alert(openErrorMessage)` from the three language-setting PATCH catches. Optimistic rollback remains the visible signal; the error is still recorded via the new diagnostics logger.
  - Added a devbox-only diagnostics logger (`conversation-list.diagnostics.ts`) gated on `NODE_ENV !== "production"` that captures call-site label, method, path, response status/body, error name/message, and stale/aborted flags for every mutation failure path.
  - Route-open and popstate-open catches now suppress their alert when the underlying error is an `AbortError` and always log diagnostics for further debugging.
- Tests: Race scenarios (`active`/`paused` overlap, stale failure suppression, latest failure alerts once, isolation across conversations) live in `conversation-list.logic.test.ts`. Diagnostics behavior is covered in `conversation-list.diagnostics.test.ts`.

## 2026-05-04 - Latest-Message Affordance Threshold Drift

- Surface: `mingle-app/src/components/LivePhoneDemo/LivePhoneDemo.tsx`, `mingle-app/src/components/LivePhoneDemo/live-phone-demo.scroll.logic.ts`
- Issue: New-message auto-follow stopped past 100px from the bottom (`AUTO_SCROLL_BOTTOM_THRESHOLD_PX`), but the scroll-to-bottom button only became visible past 400px (`SCROLL_TO_BOTTOM_BUTTON_THRESHOLD_PX = 400`). This created a 101–400px UX dead zone where new content sat below the viewport with no auto-follow and no recovery affordance, breaking the legacy alignment pattern from `LivePhoneDemoLegacy.tsx` where both thresholds shared the same constant.
- User impact: When a user was scrolled 101–400px above the bottom, incoming messages were neither followed automatically nor advertised by a tappable indicator, so they could miss messages without realizing it.
- Resolution: Moved `SCROLL_TO_BOTTOM_BUTTON_THRESHOLD_PX` into `live-phone-demo.scroll.logic.ts` aliased to `AUTO_SCROLL_BOTTOM_THRESHOLD_PX`, removed the duplicated literal in `LivePhoneDemo.tsx`, and added a regression test in `live-phone-demo.scroll.logic.test.ts` that asserts the parity and that the button is visible across the entire user-scrolled-away band.

## 2026-05-07 - Conversation List URL Store Desync And Auto-Reentry Loop

- Surface: `mingle-app/src/components/conversation-list.tsx`
- Issue: On the chat-scroll-performance branch devbox build, exiting a running room produced a `대화방을 열지 못했습니다` toast, the OK dismiss briefly returned to the list, then the room re-mounted with STT auto-restarting. Pressing back again repeated the loop. New conversations also showed a `대화방을 열지 못했습니다` toast on first STT activation even though the room opened correctly. Root cause: `subscribeToLocationSearch` (the `useSyncExternalStore` source backing `routeConversationId`) only listened to `popstate` and `hashchange`. Programmatic history mutations via `replaceConversationOverlayUrl` (close path) and the `setActiveConversation` → `pushState` effect (open path) silently changed the URL without notifying subscribers. After a close, `activeConversation` flipped to `null` while `routeConversationId` stayed at the old value for a render or two, so the route-sync `useEffect` re-opened the same room and re-armed STT. The same desync caused the create-flow status PATCH to land on a still-propagating record and surface the generic "open failed" toast.
- User impact: Users could not reliably exit a running conversation; pressing back or the in-room close button bounced them back into the room with STT re-running. New conversation creation showed misleading open-failure toasts even though the operation succeeded.
- Resolution:
  - Added a `mingle:conversation-location-sync` custom event. `replaceConversationOverlayUrl` and the `activeConversation` `pushState` effect now dispatch it, and `subscribeToLocationSearch` listens to it alongside `popstate`/`hashchange`. `routeConversationId` now converges to the URL on the same render as the close/open call site, so the route-sync effect no longer re-enters a just-closed room.
  - `updateConversationStatus` now retries transient failures (HTTP 404 or 5xx) once after a 500ms backoff before surfacing the failure to the catch path. This absorbs the read-after-write window where a brand-new conversation’s first status PATCH would otherwise alert the user even though the conversation exists. The retry honors the existing AbortController and preserves the 404+deleting short-circuit.
- Tests: existing `conversation-list.logic.test.ts` race-scenario tests still cover the version-tracker semantics. The location-sync event is exercised end-to-end on iOS devbox; an automated regression test for the `useSyncExternalStore` event subscription is deferred (would require a JSDOM popstate harness) and is captured in the manual QA checklist.

## 2026-05-08 - Conversation List Message Count Source Drift

- Surface: `mingle-app/src/components/conversation-list.tsx`, `mingle-app/src/lib/app-conversations.ts`
- Issue: Conversation rows displayed message counts from the WebView local warm cache instead of the server-side conversation transcript. Long rooms could show `100` messages in the list after app relaunch because `LivePhoneDemo` intentionally caps local utterance cache persistence to the latest 100 items, while the room hydration endpoint correctly knew the full server count, such as `648`.
- User impact: Users saw inconsistent counts between the conversation list and the room. Opening the room and paginating older messages could temporarily raise the row count to the correct total, but relaunching the app could drop it back to the local cache limit.
- Resolution:
  - Added `messageCount` to `ConversationChannelSummary` as an optional server-provided field.
  - `listConversationChannelsForUser` now batches visible `AppMessage` counts by `sessionKey` with `groupBy`, so `GET /conversations` can return authoritative server totals without adding a denormalized column or Prisma migration.
  - The list row display now uses `max(serverMessageCount, localMessageCount)` so server totals win after relaunch while still preserving optimistic local increments for live STT turns that have not reached the server yet.
- Tests: `app-conversations.test.ts` covers the `groupBy` count payload and `conversation-list.logic.test.ts` covers the server-vs-local display count fallback.

## 2026-05-08 - Native STT Manual Back Re-entry Loop

- Surface: `mingle-app/src/components/conversation-list.tsx`
- Issue: In the native iOS WebView, pressing back or using edge-swipe while STT was running could show a misleading `Failed to open` alert, return to the list briefly, then re-open the same conversation and restart STT. Root cause: a status PATCH failure was treated as authoritative and rolled back live UI state even though native STT was still running, while route-sync, popstate-open, and native STT restore paths could still re-open a conversation the user had just manually closed. The effect-based `pushState` also stacked duplicate `?conversation=` entries whenever `activeConversation` changed through non-user restore paths.
- User impact: Users could not reliably leave a running conversation; repeated back actions could loop through room re-entry, STT restart, and occasional blank transition states.
- Resolution:
  - Native runtime status PATCH failures now log diagnostics without rolling back local live state or showing a blocking alert; the native STT runtime is treated as the source of truth for whether recording is actually running.
  - Added a conversation-id-scoped manual-close suppression ref and applied it to native STT restore, route-sync open, and popstate-open paths so a just-closed room is not reopened automatically.
  - Moved conversation URL history synchronization into `openConversationSummary` with explicit `push`, `replace`, and `none` modes. User list taps push history and clear suppression, while route/popstate/QA restore paths avoid duplicate history pushes.
  - Follow-up: close now updates the active conversation ref synchronously before waiting for `history.back()`, and the in-room back button closes the overlay immediately before moving browser history. This prevents a later handler in the same `popstate` tick from seeing stale active state and re-opening the room.
- Tests: `pnpm test:scripts` passed. Full TypeScript verification is still blocked by pre-existing unrelated test type errors in `language-selector.logic.test.ts` and `get-dictionary.test.ts`.

## 2026-05-08 - Native WebView Source Reload On Conversation Navigation

- Surface: `mingle-app/rn/App.tsx`
- Issue: RN persisted the current conversation URL for cold-start restore, but the same live restore state was also fed back into `webViewSource.uri`. Normal in-page navigation between the conversation list and `?conversation=...` updated `conversationRestoreUrlHint`, which could change the WebView `source` prop and trigger a full reload instead of staying inside the SPA.
- User impact: Opening or leaving a room could flash white/black during a WebView reload. While STT was running, the reload could combine with native restore state and make the same room re-enter with STT restarting after the user backed out to the list.
- Resolution: Latched the initial native conversation restore URL in a ref at mount time and removed live `conversationRestoreUrlHint` from `webUrl`/`webViewSource` calculation. Post-mount room/list navigation still updates native restore storage for future cold starts, but no longer changes the current WebView source URI.
- Tests: `pnpm --dir mingle-app/rn test -- __tests__/webViewRestore.test.ts __tests__/webViewLayout.test.ts --runInBand` and `pnpm --dir mingle-app test:scripts` passed.

## 2026-05-25 - Native Conversation List Cold-Start Delay

- Surface: `mingle-app/src/web/shared/v1.1.0/conversations-entry.tsx`, `mingle-app/src/lib/app-conversations.ts`, `mingle-app/src/components/conversation-list.tsx`, `mingle-app/src/components/LivePhoneDemo/use-realtime-stt.ts`
- Issue: Native WebView startup could show the splash screen and then a white page while `/conversations?nativeUi=1` waited on server-side conversation hydration. The initial page request loaded every conversation with latest-message previews and full visible-message counts, then the client immediately fetched the conversation list again after hydration. The list bundle also pulled in the full room/STT implementation even when the user had not opened a room yet.
- User impact: As conversation and transcript history grew, users could wait longer before seeing the conversation list after launch. On cold server starts or slower mobile networks, the forced splash timeout could expose a blank white WebView before the list finished painting.
- Resolution:
  - Added an `includeMessageSummaries` option to `listConversationChannelsForUser`. Native list SSR now sends lightweight conversation shells first and skips the AppMessage latest-preview/count scans on the blocking request.
  - Marked native shell lists as requiring a background refresh, so the row shell can paint first and then fetch authoritative latest-message/count data after a short delay.
  - Kept non-native web behavior unchanged: SSR still includes summaries when `nativeUi=1` is absent.
  - Moved lightweight realtime storage helpers into `realtime-storage.ts` and lazy-loaded `MingleHome`, so the initial conversation list no longer eagerly imports room/STT code.
- Tests: `scripts/devbox test --target app -- src/lib/app-conversations.test.ts src/components/conversation-list.logic.test.ts src/components/LivePhoneDemo/use-realtime-stt.logic.test.ts` passed. `pnpm -C mingle-app build:release:ios:v1_1_4` passed. Full `tsc --noEmit` remains blocked by pre-existing unrelated test type errors in `language-selector.logic.test.ts` and `get-dictionary.test.ts`.

## 2026-05-25 - Native Conversation List Preview Refresh Identity Drift

- Surface: `mingle-app/src/web/shared/v1.1.0/conversations-entry.tsx`, `mingle-app/src/components/conversation-list.tsx`
- Issue: After the cold-start optimization skipped latest-message summaries during native SSR, some native WebView starts showed conversation rows without the latest message preview until the user opened and closed a room. The background `/api/conversations` refresh used the client localStorage tracking ID, while the SSR list could have been resolved from the `mingle_uid`/`mingle_sid` cookie identity. When those identities diverged, the refresh queried a different anonymous user and did not fill the lightweight rows.
- User impact: The optimized list appeared quickly, but rows could look incomplete on first launch. Opening a room later updated preview state through the room path, making the message appear only after extra navigation.
- Resolution: Pass the SSR tracking identity into `ConversationList` and reuse it for client conversation refresh/mutation headers, falling back to localStorage only when SSR provided no identity. This keeps the fast initial shell while making the post-hydration summary refresh target the same user.
- Tests: `conversation-list.logic.test.ts` covers header construction preferring the SSR identity over the local fallback.

## 2026-05-25 - Native STT Stop Button Flicker

- Surface: `mingle-app/src/components/LivePhoneDemo/use-realtime-stt.ts`
- Issue: During native STT stop, the web hook optimistically moved the session to `idle` immediately after sending `native_stt_stop`, while the iOS native module stayed in a graceful stop window until `stop_recording_ack` or a timeout. Late native `running` status or transcript message events could then promote the web UI back to `connecting`/`ready` before the final native close event moved it back to `idle`.
- User impact: Pressing Stop could briefly show the mic as stopped, then running/connecting again, then stopped. Recording ultimately stopped, but the control visually flickered and made the action feel unreliable.
- Resolution: Added a stop-pending guard for native bridge status/activity handling. While `isStopping` or `nativeStopRequested` is true, the web layer now ignores native statuses and ready server messages that would re-enter a live UI state and suppresses transcript-activity promotion, while still allowing terminal idle/close/error and `stop_recording_ack` handling to complete.
- Tests: `scripts/devbox test --target app -- src/components/LivePhoneDemo/use-realtime-stt.logic.test.ts` covers the stop-pending status and activity-promotion guard.
## 2026-08-07 - Live STT navigation from My Page to conversation list

- Surface: Native app bottom-tab navigation between My Page and the conversation list.
- Issue: When STT was running, selecting the conversation-list tab after visiting My Page reopened the active chat room instead of showing the list.
- User impact: Users could not continue using the app outside the running STT room.
- Resolution: Mark the My Page-to-list tab transition as an intentional list request, consume the marker on the list screen, and suppress only the automatic live-room/remount restoration for that transition.
- Scope: App-start recovery and other native remount restoration paths remain unchanged.

## 2026-08-07 - Conversation header action spacing

- Surface: Search and new-conversation actions in the conversation-list header.
- Issue: The search and new-conversation icons were visually too close together, while their tap targets were limited to the existing fixed button size.
- User impact: The adjacent actions were harder to distinguish and tap comfortably.
- Resolution: Replaced the fixed 40px button boxes with padding-based 44px minimum tap targets. Icon sizes remain unchanged, and no margin was added.

## 2026-08-07 - Profile share screen

- Surface: My Page profile actions and the new profile-share route.
- Issue: The profile-share action was only a visual placeholder, so users could not share their profile or copy its link.
- User impact: The Instagram-style profile surface had no usable profile-sharing flow.
- Resolution: Added a dedicated profile-share screen with a gradient layout, back navigation, left-edge swipe-back support, native navigation state reporting, Web Share API fallback, and clipboard link copying. QR scanning, QR rendering, and download remain explicit coming-soon actions for this iteration.

## 2026-08-07 - Profile share panel transition

- Surface: `mingle-app/src/components/profile-share-screen.tsx`
- Issue: Opening the profile-share route replaced the My Page view immediately, unlike the existing conversation and hamburger-menu panels that enter from the right. The existing swipe-back handler only detected the completed gesture, so the panel did not visually follow the user's finger while closing.
- User impact: Profile sharing felt like a sudden page change rather than a consistent in-app panel transition, and swipe-back dismissal could feel abrupt.
- Resolution: Added the shared right-to-left entrance/exit timing, made the profile-share view a right-side motion panel, and enabled horizontal drag dismissal. A sufficiently long or fast right swipe now follows the gesture, completes the slide-out, and then returns to My Page; shorter swipes spring back into place.

## 2026-08-07 - Live STT preview in conversation list

- Surface: `mingle-app/src/components/LivePhoneDemo/LivePhoneDemo.tsx`, `mingle-app/src/components/conversation-list.tsx`
- Issue: While STT was running, the conversation list continued to show the previous finalized utterance until the current speech segment was committed. Users who left the room could not tell that speech recognition was actively progressing.
- User impact: The list felt stale during an active conversation, especially when users navigated away from the room while continuing to speak.
- Resolution:
  - Added a separate live-preview callback sourced from the room's `liveUtterances` state.
  - Debounced interim updates to 250ms so rapid STT revisions do not cause excessive list renders.
  - Rendered the interim text only in the list/search row, with muted italic styling and a trailing ellipsis.
  - Kept interim text out of `ConversationChannelSummary`, persistence, message counts, and recency sorting. The existing finalized-utterance callback remains the only path that updates the stored summary and reorders the list.
  - Cleared the preview when the utterance is finalized, discarded, or the live STT buffer is emptied.

## 2026-08-07 - Profile share swipe animation lifecycle guard

- Surface: `mingle-app/src/components/profile-share-screen.tsx`
- Issue: A horizontal swipe ending while the profile-share panel was being removed could call Framer Motion's `controls.start()` after the component had unmounted.
- User impact: The browser console showed a lifecycle warning during swipe navigation, and the return animation could race with route teardown.
- Resolution: Track the panel mount lifecycle and guard both drag-snapback and back-navigation animation calls. Navigation now runs only if the panel remains mounted after the exit animation completes.

## 2026-08-14 - App-start authentication gate and My Page sign-out

- Surface: App startup conversation list and the My Page menu/settings panel.
- Issue: The existing authentication UI was mounted only inside a conversation room, so an unauthenticated user could see the conversation list and did not encounter sign-in until creating or opening a room. The My Page menu also had no sign-out action.
- User impact: Authentication felt delayed and inconsistent with the account-required translator flow, and users had no clear way to end the current session from My Page.
- Resolution:
  - Reused the existing authentication surface as an app-start gate over the conversation list while the session is loading or unauthenticated. Authenticated users pass through automatically without an extra login step.
  - After authentication becomes available, the conversation list performs a fresh session-backed refresh so a guest/empty initial list does not remain visible after sign-in.
  - Added a sign-out action to the My Page menu/settings panel. Sign-out returns to the native-aware conversation-list tab root and suppresses stale room restoration.

## 2026-08-14 - Public username (handle) separate from internal user ID

- Surface: Profile editing, My Page, Explore search, public user profiles, and profile sharing.
- Decision: Store the public identifier as `username` and call it `아이디` in the Korean UI. Render it as `@username`. Keep `User.id` as the private, immutable database identifier and do not use `id` as the public field name.
- Naming: The editable visible name remains `displayName` and is labeled `이름` in the UI. The existing `name` field is retained as the authentication-provider/legacy source name and fallback; it is not the public handle.
- Rules: Usernames are normalized to lowercase and may contain only ASCII letters, numbers, `_`, and `.`; the stored value is limited to 30 characters and is now required after the follow-up backfill migration below.
- Resolution: Added unique username persistence, profile editing, username/name search, `@username` display on user surfaces, and profile routes that accept either the existing internal ID or the new username for backward compatibility.

## 2026-08-14 - Explore search top spacing

- Surface: Explore tab search field.
- Issue: The search field started immediately below the safe-area inset, so it felt attached to the status bar and visually tighter than the Instagram-like reference.
- Resolution: Added a 12px top inset after the safe-area padding while keeping the existing field size, horizontal padding, focus state, and bottom spacing unchanged.

## 2026-08-14 - My Page safety management subpages

- Surface: My Page hamburger menu, blocked-user management, and report history.
- Issue: The hamburger panel rendered both potentially long management lists inline, making the menu act like a history page instead of a compact navigation surface.
- Resolution: Replaced the inline lists with two menu rows that open dedicated right-to-left subpages. The blocked-user row uses the `UserRoundX` icon, the report-history row uses the `Siren` icon, and each subpage supports the existing back button and horizontal swipe-to-dismiss behavior. Unblocking and report-reply viewing remain available inside their respective subpages.

## 2026-08-14 - My Page hamburger swipe dismissal

- Surface: My Page hamburger menu and its management subpages.
- Issue: A short rightward swipe could leave the panel partially displaced instead of settling to a stable open or closed state.
- Resolution: Added the same snap-back/snap-dismiss behavior used by the profile edit panel. Swipes below the dismissal threshold animate back to the left edge, while qualifying swipes animate fully off-screen before closing the panel.

## 2026-08-14 - App language setting and social-surface localization

- Surface: My Page hamburger menu, app-language subpage, profile editing, profile sharing, Explore search, public user profiles, and block/report management.
- Product distinction: The app language is separate from the profile's primary speech language. The profile setting continues to control the user's STT language identity; the new app-language setting controls the Mingle interface only.
- Issue: The app had a primary UI locale catalog, but there was no user-facing way to change it from My Page. Several recently added profile and social screens also used Korean/English inline fallbacks, so switching the route locale could leave parts of the new UI untranslated.
- User impact: Users could not choose their preferred Mingle interface language, and the profile/social surfaces could show mixed-language labels, errors, and accessibility text.
- Resolution:
  - Added an `App language` row to the hamburger menu. It opens a right-to-left subpage with exactly the 15 `PRIMARY_UI_LOCALES` options, preserving the existing panel back button and swipe-dismiss interaction.
  - Selecting a language stores the preference locally and replaces the current `/{locale}/...` route with the selected locale so the server dictionary and UI re-render immediately. The root sync also restores the stored app locale on the next app launch and updates the document language tag.
  - Added supplemental locale copy for the app-language screen and the recently added profile edit, profile share, Explore search, public profile, blocked-user, and report-history surfaces across all 15 primary UI locales.
  - Kept the profile editor's `Primary language`/STT language selector backed by `STT_LANGUAGE_OPTIONS`; it is intentionally not reused for the app-language list.
- Tests: Added coverage that the 15 app-language options and the new social/profile copy resolve for every primary UI locale. Existing i18n and lint checks pass; the repository's full `tsc --noEmit` still reports the two previously known unrelated test typing issues in `language-selector.logic.test.ts` and `get-dictionary.test.ts`.

## 2026-08-14 - Profile primary-language picker and default public handle

- Surface: Profile editing's `Primary language` field, My Page profile summary, and account creation/sign-in persistence.
- Issue: The profile editor used a compact three-column language grid that did not match the conversation-room language picker and was difficult to scan across the full STT language catalog. Empty bios also showed a sample sentence, making an unset profile look populated. Public `@username` values were optional, so newly created or legacy users could be missing the identifier used by Explore and public profiles.
- Resolution:
  - Reused the conversation-room language selector's localized language names, flags, card layout, search normalization, locale-aware sorting, and English A-Z sorting for the profile's single primary STT language choice.
  - Removed the bio textarea placeholder and stopped rendering the sample bio on My Page when the user has not written one.
  - Added deterministic default public usernames for email signup, OAuth/native sign-in, and anonymous tracking-user creation. Existing null usernames are backfilled from the account name/email with collision suffixes, then the database field is made `NOT NULL`; users can still change the value later within the existing character rules.
- Data contract: `User.id` remains the private database identifier; `User.username` is the required public handle, and `User.displayName` remains the editable visible name.

## 2026-08-14 - Profile language selector horizontal overflow

- Surface: Profile edit screen's primary speech-language selector.
- Issue: The selector was copied visually from the conversation-room picker, but it was nested inside a native `fieldset`. The fieldset's browser default minimum-content width prevented the search/sort flex row from shrinking to the profile panel's content width, so the edit screen could scroll horizontally on narrow devices.
- Resolution: Reset the fieldset and selector wrappers to `min-width: 0`/`max-width: 100%`, constrain the search/sort row and language list, truncate sort labels when needed, and explicitly disable horizontal overflow on the profile panel's vertical scroller. The conversation-room selector remains unchanged.

## 2026-08-14 - Profile edit language list nested scrolling

- Surface: Profile edit screen's primary speech-language selector.
- Issue: The profile screen's main vertical scroller contained a second vertical scroller inside the language selector. This made browsing the full language list awkward and required the user to switch between two scroll areas. The selector also carried the conversation-room picker's cream-colored surface styling into the otherwise white profile edit screen.
- Resolution: Removed the selector's fixed height and inner vertical overflow so the profile edit screen's single main scroller covers the entire form. Kept the conversation-room selector's visual language—rounded cards, search field, sort controls, language rows, and selection indicator—while using a white and neutral-gray palette for the profile edit context.

## 2026-08-14 - My Page settings subpage dismissal and profile share loading

- Surface: My Page hamburger settings, blocked-user/report/app-language subpages, profile sharing, and the empty post area.
- Issue: Opening a settings subpage removed the hamburger panel from the DOM. A right-swipe dismissal then made the subpage exit and the parent panel re-enter at the same time, which could leave a stale fixed layer over the My Page header; the hamburger button stopped responding until a tab transition reset the stack. Profile sharing also waited for a cold client navigation to the share route before showing its panel.
- Resolution:
  - Keep the hamburger settings panel mounted beneath the active subpage and animate only the subpage out on a right swipe, so the swipe returns to a usable menu instead of closing both layers.
  - Prefetch the profile-share route while My Page is mounted so tapping `Share profile` can enter the already-prepared panel without the full route delay.
  - Changed QR-only coming-soon feedback to `QR features are not available yet` (localized), and removed the unused coming-soon message from the empty post area.

## 2026-08-14 - Login agreement checkbox consistency

- Surface: 2.0.0 native login agreement panel.
- Issue: The all-required-agreements control used a rose circular background and a literal check character, while the privacy and terms controls used browser-native checkbox rendering. The three controls therefore had different shapes, check marks, and colors on iPhone.
- User impact: The all-agreements state looked visually unrelated to the two required agreement rows, and the inconsistent check treatment made the selected state harder to scan.
- Resolution: Replaced the mixed checkbox visuals with one shared rounded-square checkbox treatment. The all-agreements control now uses the same check icon as the two required rows, with a Mingle amber selected state and a neutral transparent unselected state. Native checkbox inputs remain keyboard- and screen-reader-accessible but are visually hidden.

## 2026-08-14 - Profile identity naming simplification

- Surface: OAuth/native account creation, profile editing, My Page, Explore search, public profiles, profile sharing, and legacy-compatible user persistence.
- Issue: The product exposed three overlapping concepts—internal `User.id`, public `username`, and both `name`/`displayName` for the visible profile name. This made it unclear which value users should share, search, or edit, and made the OAuth-provided name appear separate from the editable name.
- Product decision: `User.id` remains the internal database key. The public, unique user ID is stored as `handle` and displayed as `아이디`/`@handle` in the Korean UI. The existing `name` column is the single visible name: OAuth's initial name is saved there, profile editing updates that same value, and later logins do not overwrite the user's edit. The duplicate `display_name` concept is removed from the 2.0.0 UI and schema.
- Resolution: Renamed the 2.0.0 Prisma/API/client contract from `username` to `handle`, removed `displayName` usage, routed profile/search/social surfaces through `name` plus `handle`, and kept admin-login `username` terminology isolated because it is unrelated to user profiles.
- Compatibility: The migration installs an `app.app_users` insert trigger that derives a unique handle when the shared 1.1.4 server inserts a user without knowing the new column. Existing `name` data is preserved, and any earlier `display_name` data is used only when `name` is empty before the duplicate column is removed.

## 2026-08-14 - Hide native banner ads on login

- Surface: Native iOS/Android login and authentication routes.
- Issue: The native AdMob banner could remain visible while the WebView was transitioning from the conversation list into the login screen. The ad made the authentication surface feel like an accidental continuation of the signed-in conversation layout.
- User impact: Login looked visually cluttered and the banner occupied space on a screen that should focus on account entry and agreement actions.
- Resolution: Treat localized and non-localized authentication paths as an explicit native-banner hidden state. The native banner is now hidden immediately from the current WebView pathname, and the WebView receives zero banner inset while authentication is active. Conversation-list and conversation-room ad behavior remains unchanged.

## 2026-08-14 - Hide the banner behind the conversation-list authentication gate

- Surface: The native conversation-list authentication gate shown before Apple/Google sign-in.
- Issue: The login UI is an `authOnly` overlay rendered over `/ko/conversations`, not a separate `/ko/auth` pathname. The native banner pathname guard therefore continued to classify the screen as the conversation list and left the AdMob banner visible behind the login surface.
- User impact: The login screen still showed the banner after the earlier route-based hide fix, making the authentication layout look unfinished and reducing its usable space.
- Resolution: The conversation list now posts the native banner zone as `hidden` whenever the session is loading or unauthenticated, and returns it to `list` only after authentication succeeds. Search and conversation overlays retain the existing hidden behavior.

## 2026-08-15 - Keep authentication banner hiding authoritative

- Surface: The 2.0.0 native login gate rendered over the conversation-list route.
- Issue: TestFlight build 67 still showed a production AdMob banner above the login controls. The web authentication gate correctly posted the `hidden` banner zone, but the native URL observer still saw `/ko/conversations` and restored its last stable `list` zone. The native banner also initialized as `list`, allowing an advertisement to appear before the web session state had hydrated.
- User impact: Signed-out users saw a third-party advertisement on the account-entry screen even though login was intended to be an ad-free surface. This made the login layout look broken and could distract users from required agreement and authentication actions.
- Resolution:
  - Initialize the native banner zone as `hidden`; authenticated web state must explicitly enable the list or conversation banner.
  - Restore a stable banner after URL navigation only when native navigation itself created a pending transition. A web-requested hidden state for authentication or search is no longer overwritten by a same-route navigation callback.
  - Update native banner refs synchronously with bridge commands so closely spaced WebView navigation events cannot observe stale visibility state.
  - For TestFlight builds before 68, reassert the unauthenticated `hidden` zone from the deployed web client while the login gate remains active. This provides a Railway-delivered compatibility fix without waiting for users to install the new native build.
- Data contract: No API or database changes. The existing `native_set_banner_zone` bridge message remains backward-compatible.
- Testing notes: On build 67 after the Railway deployment, restart the app while signed out and confirm the login screen remains ad-free. On build 68, verify no banner flash occurs during startup, the conversation-list banner appears only after authentication, and search/conversation overlay behavior remains unchanged.

## 2026-08-15 - Render My Page identity and follow counts immediately

- Surface: The 2.0.0 My Page profile header reached from the bottom tab bar.
- Issue: The visible name could render from the server-hydrated session, but the public handle and follower/following counts initialized as missing/zero and appeared only after a client-side `/api/profile` request completed.
- User impact: Entering My Page showed an incomplete identity block and counts that visibly changed after the screen was already present, making the profile feel slow and unstable.
- Resolution:
  - Load the authenticated user's profile and relationship counts on the My Page server route and pass them into the client component as its initial state.
  - Prefetch the My Page route from the bottom tab bar so the server-rendered profile payload is normally ready before the user taps the tab.
  - Keep the existing client profile request as a background refresh, preserving current values on the first frame while still reconciling recently changed profile or relationship data.
- Data contract: No API or database changes. The page and `/api/profile` now share the same profile selection and serialization helper.
- Testing notes: Enter My Page from both Conversations and Explore and confirm the name, handle, follower count, and following count all appear together without zero/empty placeholders. Follow or unfollow an account, return to My Page, and confirm the background refresh reconciles the count.

## 2026-08-15 - Keep the complete conversation list warm between tab visits

- Surface: The 2.0.0 Conversations tab list reached from Explore or My Page.
- Issue: A short-lived session cache already existed, but the component initialized with an empty list and read that cache only after mounting. This still exposed the blocking loading spinner on every tab re-entry. Local STT usage and message counts, plus client-formatted recent-message times, were also initialized separately and appeared after the rows.
- User impact: Returning to Conversations felt like opening the list for the first time, while avatars, titles, languages, message previews/times, STT usage, and message counts visibly assembled instead of appearing as one stable list snapshot.
- Resolution:
  - Keep an account- and API-namespace-scoped in-memory snapshot so a remounted Conversations tab can use the previous complete list as its initial React state rather than waiting for an effect.
  - Persist the same snapshot in session storage for remount recovery. It includes conversation summary metadata used for the avatar, title, language flags, latest message and time, server message count, and per-room local STT usage/message counts.
  - Treat the snapshot as stale-while-revalidate for up to seven days within the browser session: show it immediately, then run the existing no-cache server request in the background and replace the snapshot with fresh values.
  - Preserve account and iOS/Android API namespace isolation so one user's or release namespace's rows cannot warm another list.
- Data contract: No API or database changes. The existing conversation-list response and local per-room STT statistics are cached together on the client.
- Testing notes: Load Conversations once, visit Explore or My Page, and return. Confirm the complete rows are visible on the first frame with no blocking spinner, then verify a newly finalized message or changed room language is reconciled by the background refresh. Also confirm switching accounts never exposes the previous account's cached rows.

## 2026-08-14 - Group the profile primary-language selector into three sections

- Surface: The primary-language selector inside the My Page profile-edit panel.
- Issue: The selector previously presented one long searchable list, so the current language was not persistently visible and commonly used languages were mixed into the full catalog.
- User impact: Users had to search or scroll to confirm the active language, and the most useful language choices were not easy to reach.
- Resolution: Search and sort controls remain at the top. The list now shows the current language first, a fixed seven-language group in the order English, Spanish, Korean, Japanese, Chinese, French, Portuguese, and then the complete locale/alphabetically sorted catalog. The current language remains checked in its original position in the complete catalog as well as in the first section. Search filters the featured and complete sections without hiding the current-language summary.

## 2026-08-14 - Match profile language selection emphasis to the conversation picker

- Surface: The primary-language selector inside the My Page profile-edit panel.
- Issue: The current-language summary and selected rows used a dark, thick border and dark check control that visually overpowered the rest of the selector and differed from the conversation-room language picker.
- User impact: The selected language felt over-emphasized, and the profile editor did not carry the Mingle amber selection language used elsewhere in the app.
- Resolution: Reused the conversation picker’s amber border, soft amber background, restrained shadow, amber check circle, and neutral unselected card treatment for both the current-language summary and its duplicate rows in the featured and complete lists.

## 2026-08-14 - Increase My Page follower labels

- Surface: The follower and following stats in the My Page profile header.
- Issue: The stat labels were smaller than the nearby profile-action labels, so they looked visually weak beneath the similarly sized counts.
- Resolution: Increased both labels from 12px to 13px to match the profile-action text scale while preserving the existing count size, color, spacing, and layout.

## 2026-08-14 - Expand Explore profile result tap targets

- Surface: Explore search results and public user profile navigation.
- Issue: Only the small display-name text was a navigation button. Tapping the result avatar, handle, or surrounding identity area did nothing, which made the first tap feel unreliable on a phone.
- User impact: Users had to aim at a narrow text target or tap repeatedly before opening a searched user’s profile.
- Resolution: Made the complete identity area—avatar, display name, and handle—a prefetched Next link with a full-row tap target and visible keyboard focus state. The follow action remains a separate button.

## 2026-08-14 - Preserve Explore search results after profile back navigation

- Surface: Explore search results when returning from a public user profile with the iOS back swipe.
- Issue: The search query and result list lived only in the Explore component's local state. Opening a public profile unmounted that component, so returning to Explore showed an empty search screen even though the user had just searched.
- User impact: Users had to repeat the same search after inspecting every profile, which made comparing multiple profiles unnecessarily slow.
- Resolution: Store the active search query and result snapshot on the current browser history entry. Restore it immediately when the Explore route mounts, keep the list visible while the latest search request refreshes follow status, and remove the snapshot when the search is cleared or changed.

## 2026-08-14 - Add follower and following list navigation

- Surface: My Page follower/following statistics, the follower/following list, and nested public user profiles.
- Issue: The follower and following counts were static labels with no way to inspect the corresponding users. There was also no list-level search or navigation path for opening a user's public profile from a relationship list.
- User impact: Users could not verify who followed them or whom they followed, and could not move from a relationship list into a profile and back without losing the intended navigation depth.
- Resolution: Made both statistics interactive and added a dedicated right-entering `/mypage/follows` screen. The screen has follower/following tabs, name/handle search, full-row user links, edge-only back dismissal, and a route history sequence of My Page → relationship list → public profile. Returning from a public profile therefore lands on the relationship list first; a second back returns to My Page.

## 2026-08-14 - Remove the profile-share handle hydration flash

- Surface: Profile share screen opened from My Page.
- Issue: The share route started with an empty handle and fetched the same profile a second time after mounting. The QR/share card therefore showed a fallback handle briefly before switching to the saved public handle.
- User impact: The profile identifier visibly changed after the screen appeared, making the share card look unstable and suggesting that the profile data had not been saved.
- Resolution: My Page now carries the already-hydrated public handle into the prefetched share route. The share screen uses it on its first render and still performs the existing server refresh for direct-entry or stale cases.

## 2026-08-14 - Strengthen the selected app-language state

- Surface: The app-language selector inside the My Page menu and settings panel.
- Issue: The selected state was represented by a small amber text check mark, which was difficult to see and did not sufficiently distinguish the selected row from the other languages.
- User impact: Users could miss which interface language was active, especially on a small phone screen.
- Resolution: The selected row now uses a dark high-contrast background, bold white label, and a larger circular check indicator with a standard icon. Unselected rows keep a light outlined indicator, while keyboard focus receives an inset focus ring.

## 2026-08-14 - Match app-language selection to the key color

- Surface: The app-language selector inside the My Page hamburger menu.
- Issue: The selected language's dark filled row and white controls were visually heavier than the profile-edit language selector and did not use the Mingle key color.
- User impact: The active language looked like a separate dark action state instead of a consistent, easy-to-scan selection focus.
- Resolution: Replaced the dark treatment with a soft amber background, restrained amber inset outline, neutral selected text, amber flag-card accent, and the same amber check treatment used by the profile-edit selector. The keyboard focus ring now uses the same key color as well.

## 2026-08-14 - Restrict profile-surface swipe dismissal to the edge

- Surface: Profile editing, the My Page hamburger menu and its blocked-user/report/app-language subpages, and profile sharing.
- Issue: The full surface listened for horizontal drag gestures, so a vertical scroll with a small horizontal deviation could begin dismissing the page. Profile sharing also animated itself off-screen before routing back, briefly exposing a blank white page background.
- Resolution:
  - Start the horizontal drag only when the pointer begins within the first 32px of the panel's local left edge, matching the expected iOS back-swipe origin.
  - Lock the gesture direction and keep `touchAction: pan-y` so vertical content scrolling remains the native interaction everywhere else.
  - Prefetch My Page on mount so the return route is ready when profile sharing closes.

## 2026-08-14 - Animate profile-share route exit before returning to My Page

- Surface: The profile-share route opened from My Page.
- Issue: Profile sharing called `router.back()` immediately, so the route disappeared before its visual surface could leave the screen. The route's gradient was also the moving element itself, allowing the white or gray canvas background to appear at the left edge.
- User impact: Swiping back closed this page abruptly and exposed a brief white strip, unlike the profile-edit and settings panels.
- Resolution: Profile sharing now finishes the same rightward exit transition used by the public profile screen before navigating back. A stationary outer gradient backdrop remains behind the moving surface, so the route canvas cannot flash white during the transition.

## 2026-08-14 - Keep native history gestures out of profile panels

- Surface: iOS WebView navigation on My Page and profile sharing.
- Issue: The native WKWebView back/forward gesture remained enabled on profile routes while the web UI also owned an edge-swipe dismissal. Both navigation layers could react to one gesture, and the native history transition briefly exposed the WebView's white background.
- Resolution: Disable native WebView back/forward gestures for the `/mypage` route family. Profile editing, hamburger subpages, and profile sharing now use the web panel's edge-only gesture exclusively, while native history gestures remain available for conversation navigation.

## 2026-08-14 - Keep authenticated navigation free of session-checking flashes

- Surface: The top-level tab transition from My Page to the conversation list and any room that uses the shared authentication gate.
- Issue: The client session provider started without the server-known session, so a route transition could briefly expose the `loading` state. The conversation list treated that transient state as unauthenticated and displayed the login surface with the Korean copy “로그인 상태 확인 중...”.
- User impact: A logged-in user saw an unnecessary login-checking screen while moving between tabs. Repeating the same tap often hid the flash, which made the navigation feel unreliable.
- Resolution: Hydrate the shared session provider with the server session on the first render, stop refetching on window focus, show the auth gate only after a definitive `unauthenticated` result, and extend the JWT lifetime so the session remains valid until explicit sign-out.

## 2026-08-14 - Restore the bottom new-conversation action

- Surface: The 2.0.0 conversation-list screen above the native-aware bottom tab bar.
- Issue: The new-conversation action was moved into the upper-right header beside search. On a phone, this made the primary action harder to discover and less comfortable to reach than the full-width action used before the messenger tabs were introduced in 1.1.4.
- User impact: Starting a conversation required aiming at a small header icon instead of using the familiar, easy-to-reach action at the bottom of the conversation list.
- Resolution:
  - Removed the new-conversation icon from the conversation-list header, leaving search as the only header action.
  - Restored the 1.1.4 full-width amber-to-orange `Start Conversation` button with its existing label, arrow, loading state, and create-flow handler.
  - Rendered the button outside the scroll container as an absolute upper layer positioned directly above the bottom tab bar, so long lists can continue scrolling behind the button and the button remains visually fixed.
  - Added scroll-bottom padding equal to the button height plus the existing breathing space, so the final conversation row can still be scrolled above the overlay when the list reaches its end.
- Data contract: None. The existing conversation creation endpoint, create lock, accessibility label, and auto-start behavior are unchanged.
- Testing notes: Verify on a real iPhone that the button remains fixed above the bottom tabs, long lists pass underneath it while scrolling, the last row is not permanently hidden at the scroll limit, and the loading state still prevents duplicate creation.

## 2026-08-14 - Autofocus the explore search field

- Surface: The 2.0.0 Explore tab user search field.
- Issue: Entering the Explore tab focused the search input only during the first mount attempt. Route-transition and WebView timing could leave the field visually available but require a second tap before typing.
- User impact: Users had to tap the search field again after opening Explore, adding friction to the primary action of the tab and delaying the keyboard.
- Resolution:
  - Added the native `autoFocus` hint to the search input.
  - Added focus attempts on mount, the next animation frame, and two short post-navigation delays so the input remains focused after the route and WebView finish settling.
  - Updated the iOS WebView shell to allow programmatic keyboard presentation, which is required for the focused input to open the keyboard without a second tap.
  - Kept the focus helper shared with the clear-search action so clearing the query returns directly to typing.
- Data contract: None. Search requests, history snapshots, and follow actions are unchanged.
- Testing notes: Verify on iPhone TestFlight build 68 after the Railway deployment that entering Explore focuses the field and opens the keyboard without a second tap.

## 2026-08-15 - Add an editable profile-image crop surface

- Surface: My Page profile editing and profile avatars shown in search and public profiles.
- Issue: Profile images had no upload flow, and a saved image could not preserve the user's circular crop when the profile was edited again.
- User impact: Users could not set a profile photo or control which part of a source image appeared in the avatar. Reopening profile editing would also lose the intended framing.
- Resolution:
  - Added a circular crop viewport that keeps the source image intact, supports photo dragging, and uses two-pointer pinch gestures for zooming.
  - Store a normalized zoom scale and x/y crop coordinates alongside the original R2 object key. Reopening the editor uses the original source URL and restores the same crop state.
  - Apply the stored crop to search-result and public-profile avatars so the framing is consistent throughout the app.
  - Keep the crop surface outside the text form flow so changing an image does not interfere with handle, name, bio, or language editing.
- Data contract: Added profile image object-key and crop metadata fields, a multipart profile-image upload endpoint, and iOS/Android v2.0.0 route wrappers. The object key remains server-only; the public image URL and crop values are returned to clients.
- Testing notes: Verify JPG/PNG/WEBP selection, drag and pinch behavior on a real phone, replacing an existing image, and reopening the editor to confirm the original source and crop coordinates are restored.

## 2026-08-16 - Add edge-swipe dismissal to notifications

- Surface: The notifications panel opened from the conversation-list header.
- Issue: Notifications could be closed with the header arrow or backdrop, but did not follow the edge-swipe dismissal pattern used by the other full-screen app surfaces.
- User impact: Returning from notifications required a deliberate tap and felt inconsistent with profile, follow-list, and settings navigation.
- Resolution: Added a left-edge-only horizontal drag that dismisses the notification panel to the right after the same distance or velocity threshold used by the surrounding screens. Vertical scrolling remains available because the panel keeps `touchAction: pan-y`, and taps outside the panel or on the header arrow retain their existing behavior.
- Data contract: None.
- Testing notes: Verify that a rightward gesture beginning within the first 32px closes the panel, a vertical list scroll does not close it, and gestures beginning away from the left edge do not take over the interaction.

## 2026-08-16 - Separate app display language from profile primary language

- Surface: My Page app-language settings and the profile-edit primary-language selector.
- Issue: When a profile did not yet have a saved primary language, My Page used the current UI locale as a fallback. This made the app display language and the profile's primary language appear to be one setting, even though they represent different user choices.
- User impact: Changing or viewing the Mingle interface language could silently change the language shown on the user's profile, and a profile without a choice could incorrectly display the UI language's flag and name.
- Resolution:
  - Keep the app display language in the route/local-storage preference used to render the Mingle UI.
  - Keep the profile primary language in the existing profile field and preserve its nullable state; never derive it from the UI locale.
  - Hide the profile language badge and preview label when the user has not selected a profile primary language yet.
  - Rename the Korean settings copy to `앱 이용 언어` and clarify that it controls the Mingle UI/UX.
- Data contract: None. Existing saved profile language values remain unchanged, and the existing nullable profile field continues to accept `null`.
- Testing notes: Verify that selecting English as the app display language does not select English in profile editing, that a saved profile language remains unchanged after a UI-language change, and that an unset profile language shows no flag or language label.

## 2026-08-16 - Mirror feedback and app updates in My Page settings

- Surface: The My Page hamburger menu and its nested management panel.
- Issue: Feedback and app-update controls were available from a conversation room, but not from the My Page settings menu. Users had to open a room before they could contact the team or check the installed app version.
- User impact: Support and update actions were inconsistent across the two primary navigation surfaces.
- Resolution:
  - Added the same localized feedback entry to the My Page hamburger menu and opened the same compose/history workflow from a nested full-screen panel.
  - Reused the existing feedback API, draft persistence key, category copy, Instagram contact link, and history presentation so messages behave consistently from either surface.
  - Mirrored the native-only app-update card in My Page, including installed/latest version status and the native store-opening action.
  - Kept the conversation-room menu unchanged.
- Data contract: None. Feedback continues to use the existing `/feedback` endpoint, and app updates continue to use the existing native bridge command.
- Testing notes: Verify feedback compose/history navigation from My Page, draft restoration, successful submission, and that the app-update card appears only in native runtime and opens the correct store when an update is available.

## 2026-08-16 - Isolate text composer drafts by conversation

- Surface: The text-input mode composer inside conversation rooms.
- Issue: Every room read and wrote the same local-storage draft key, so text typed as a pending message in one room appeared in other rooms.
- User impact: Users could accidentally send text intended for another conversation and could not keep separate unfinished messages per room.
- Resolution:
  - Scope the composer draft key by the conversation ID, falling back to the existing storage namespace only for non-room surfaces.
  - Reload the textarea from the newly selected room's draft when the active room changes without remounting the composer.
  - Keep the existing unscoped key for the standalone/live surface, while room drafts no longer read from or write to that shared value.
- Data contract: None. This is local-storage namespacing only; message submission and conversation APIs are unchanged.
- Testing notes: Verify that drafts in two rooms remain independent, returning to each room restores its own text, submitting one draft clears only that room's draft, and the standalone live surface remains usable.

## 2026-08-16 - Simplify the profile-link install screen

- Surface: The browser fallback screen shown when opening a shared Mingle profile link.
- Issue: The screen repeated the same information across a verification label, title description, button hint, installation divider, store description, and fallback notice.
- User impact: The primary actions were buried in a tall card, making it harder to immediately open the profile or install Mingle.
- Resolution:
  - Keep only the Mingle mark, a short profile-opening title, the `Open in app` action, and the relevant store buttons.
  - Remove redundant verification, explanatory, divider, and post-click guidance text from the valid-link state.
  - Preserve the invalid-link message and platform-specific store filtering.
- Data contract: None. Deep-link validation, app URL handling, and store URLs are unchanged.
- Testing notes: Verify the valid profile-link screen on iOS, Android, and desktop, confirm the app and store actions remain visible, and confirm invalid links still show their error state.

## 2026-08-16 - Save profile QR codes to the device gallery

- Surface: The QR download action on the profile-sharing screen in the native app.
- Issue: The web implementation created an anchor for a data URL. That works as a browser download, but the React Native WebView did not handle the download, so tapping the button could show a success message without creating a device image.
- User impact: Users could not find the downloaded QR code in the iPhone Photos app or Android gallery.
- Resolution:
  - Send the generated PNG data URL through the WebView-to-native bridge when the screen is running in the app.
  - Save the image to the iOS Photos library through `PHPhotoLibrary` and to the Android Pictures/Mingle media collection through `MediaStore`.
  - Request iOS add-only photo access and support legacy Android storage permission handling while keeping modern Android storage permission-free.
  - Return a native success or failure event to the web screen so the status message reflects the actual save result.
- Data contract: Added only a native WebView command/event pair; no server or database changes.
- Testing notes: On iOS, tap QR download and confirm the image appears in Photos after granting permission. On Android, confirm it appears in Pictures/Mingle or the device gallery, and verify denied permission shows a failure message.

## 2026-08-17 - Request native permission for account notifications

- Surface: The authenticated native app session, before the existing conversation-list notification panel is used.
- Issue: The app stored follow notifications on the server and rendered them only when the user opened the in-app panel. There was no operating-system notification when the app was backgrounded or closed.
- User impact: Users could miss a new follower unless they manually opened Mingle and checked the notification panel.
- Resolution:
  - Request iOS notification permission and Android 13+ `POST_NOTIFICATIONS` permission only after the WebView session is authenticated.
  - Register one APNs or FCM token per native installation and associate it with the signed-in Mingle account.
  - Keep the existing in-app notification panel and mark-read behavior unchanged; native push is an additional delivery surface.
  - Remove the current installation token during logout so a previous account does not continue receiving notifications on a shared device.
- Data contract: Added the authenticated `/push-tokens` endpoint and the `app_user_push_tokens` table. The iOS and Android v2.0.0 API wrappers use the same version namespace as the native builds.
- Testing notes: On a real iPhone and Android device, verify the permission prompt appears after authentication, a follow produces an OS notification while Mingle is backgrounded, the existing in-app notification remains available, and logout removes delivery for the previous account.

## 2026-08-17 - Use the shared English flag treatment in onboarding

- Surface: The first-launch language onboarding picker shown above the messenger tabs.
- Issue: English used the single US flag in the onboarding rows, while the rest of the app represented English with the established split US/UK flag treatment.
- User impact: The same English choice looked inconsistent depending on whether it was selected during first launch or from another language picker.
- Resolution: Reuse the shared `LanguageFlag` component for onboarding rows so English renders as the US/UK split flag and all other languages retain their existing flags.
- Data contract: None.
- Testing notes: Not run in this task by request. Verify the English row on the first-launch picker shows the US/UK split flag and that other language rows remain unchanged.

## 2026-08-17 - Derive conversation display language from room settings

- Surface: Conversation management → default display language picker and the language used to initialize message bubbles.
- Issue: The picker exposed an `Automatic` option that could resolve against languages present in existing message translations. A room that originally had only Korean messages could therefore show only Korean even after English was added to the room's selected languages.
- User impact: Users could not choose every language configured for the room, and the displayed default language could change based on historical transcript data rather than the room configuration.
- Resolution:
  - Removed the `Automatic` picker option and its localized copy.
  - Build picker candidates from the room-selected language settings, preserving the configured order and retaining newly added languages even when older messages do not contain those translations.
  - Preserve an explicitly saved valid room default. For legacy or invalid values, resolve the concrete default by the first matching profile primary language, then the first room-selected language; message rendering still falls back to the utterance language when that message has no translation for the room default.
  - Keep the stored nullable field for backward compatibility; no database or API contract changes are required.
- Data contract: None. Existing conversation language and default-display-language fields remain compatible.
- Testing notes: Not run in this task by request. Verify a Korean+English room exposes both choices after Korean-only messages, profile primary-language order selects the first matching room language, and an unavailable message translation falls back to the utterance language.

## 2026-08-17 - Seed profile languages from first-launch language choice

- Surface: The first-launch language onboarding flow and the first authenticated profile hydration after signup.
- Issue: The onboarding choice was saved locally and could seed `defaultConversationLanguages`, but it did not populate the new user's `primaryLanguages`. This left the profile language priority empty even though the user had already made an explicit language choice.
- User impact: A newly signed-up user could see the selected language used for conversation defaults while profile-based language priority and later display-language resolution still had no first preference.
- Resolution:
  - Keep the app UI language as a local-storage preference and queue the onboarding choice locally until authentication is available.
  - After signup or the first authenticated session, use the selected onboarding language as the first `primaryLanguages` value when that profile field is empty.
  - Use the selected language as the first `defaultConversationLanguages` value, followed by the existing default candidates, when that profile field is empty.
  - Preserve any non-empty server values so reopening onboarding on an existing account cannot overwrite explicit profile settings.
- Data contract: No schema or migration changes. The existing `primary_languages` and `default_conversation_languages` fields are updated through the existing `/profile` endpoint; the app UI locale remains local-only.
- Testing notes: Not run in this task by request. Verify a new signup stores the selected language first in both profile arrays, existing non-empty arrays remain unchanged, and a legacy pending onboarding marker still claims the selected language correctly.

## 2026-08-17 - Simplify room language selection and empty-room guidance

- Surface: The conversation-room language picker and the empty message area shown when a new room has no messages.
- Issue: The picker separated speech input languages from translation output languages and exposed Soniox language hints, while the empty room only showed a play-button prompt and arrow. The empty state also did not explain that Mingle can recognize any spoken language.
- User impact: Users had to reason about two language concepts that are no longer part of the room experience, and a new room did not clearly communicate its language recognition coverage.
- Resolution:
  - Make the room picker a single translation-language list and remove the input/output tabs, linked-language control, and speech restart control.
  - Use the selected room language list as the translation and default-display-language candidate source; keep legacy speech fields only for compatibility.
  - Stop sending Soniox language hints from web and native STT start flows, and make the STT server always use provider language identification without hint restrictions.
  - Replace the empty play prompt and arrow with a white centered onboarding block using the copy “아무 언어로 말해보세요!” and “언어를 선택하지 않아도 밍글이 알아듣고 번역해드려요”.
  - Add a horizontally scrollable carousel of 60 supported language flags without pagination indicators. Hide the block when a draft, voice transcript, or text message is present.
- Data contract: No Prisma migration. Existing speech-language and linked-language fields remain readable for backward compatibility, but the selected-language field is authoritative for room translation behavior.
- Testing notes: Not run in this task by request. Verify the single language list, the 60-flag horizontal carousel, English US/UK flag treatment, and empty-state dismissal after text or voice input.

## 2026-08-17 - Open shared profiles as an in-app overlay

- A shared profile link launched from the browser must open the requested public profile on top of the currently visible Mingle page, regardless of the active tab or current conversation.
- The native iOS/Android shell now sends the profile target into the existing WebView as an event instead of replacing the WebView URL with a standalone profile route.
- The root client layout listens for that event and renders the existing public profile surface as a right-to-left overlay, preserving the underlying page and supporting the existing back gesture/history behavior.
- The overlay hides the native ad banner while open and restores the current page's banner zone after closing.

## 2026-08-17 - Add a conversation participant list

- Surface: The hamburger menu in a conversation room.
- Issue: The room had no participant list entry, even though the room experience is beginning to expose participant-oriented actions.
- User impact: Users had no dedicated place to confirm who is currently in the room.
- Resolution:
  - Add a `Participants` menu item alongside the existing conversation-management and feedback entries.
  - Open a dedicated full-screen menu page with the same slide transition and history-backed back navigation as the other menu pages.
  - Show the authenticated user's profile as the single participant record for the current one-person room, including avatar, display name, handle, language flag, and a self label.
  - Use the existing profile endpoint with a session fallback, so the row remains useful when the profile request is temporarily unavailable.
- Data contract: None. No schema or migration changes are required; the existing profile endpoint supplies the record.
- Testing notes: Verify the hamburger menu opens the participant page, the current user is listed once, and the back button returns to the menu.

## 2026-08-17 - Personalize the shared profile install screen

- Surface: The browser page opened from a shared Mingle profile link.
- Issue: The page showed a generic Mingle mark above the profile-opening title, and the primary app-opening action used a generic arrow icon and dark button styling.
- User impact: The recipient could not immediately identify whose profile the link represented, and the main action did not visually match Mingle's brand.
- Resolution:
  - Load the linked profile preview on the server and show its photo, display name, and handle in an Instagram-style header above the title.
  - Replace the generic action icon with the Mingle icon and use the Mingle key color `#F3C35A` for the app-opening button.
  - Keep a Mingle icon fallback when the linked profile preview is unavailable, so the install action remains usable.
- Data contract: No schema or API changes. The existing profile data is read server-side for the public shared-link preview.
- Testing notes: Verify a shared link shows the correct profile photo, name, and handle, the button uses the Mingle icon and key color, and a missing preview still leaves the app-opening action available.

## 2026-08-21 - Profile detail must open from both room participant avatars

- Surface: Conversation room chat-bubble avatars and the conversation participants page.
- Issue: The shared-room chat bubble intentionally rendered the viewer's own avatar as a non-button, while only another member's avatar could call the profile overlay. The guard was added when the public profile route rejected self IDs, but the profile surface now supports the signed-in user through `/profile`. This left the interaction inconsistent: the same participant profile card could open from the participants page, but the viewer's chat avatar could not open the detail panel.
- User impact: Tapping a profile photo in a conversation appears to do nothing for the current user, and any bubble without a hydrated `speakerUserId` also remains non-interactive. This is especially confusing in rooms that have real member identities but still show locally cached or pre-hydration bubbles.
- Evidence: The current shared-room hydration response includes `isMultiMember: true` and `speakerUserId` for both senders. The existing chat-bubble test explicitly asserts that the viewer's own avatar must not render a button, so this is an encoded UI rule rather than a missing database member.
- Resolution: Reuse the existing `onOpenProfile` callback for both own and other identified member avatars. The profile screen selects `/profile` for the signed-in user and `/users/{id}` for another member; solo-room bubbles without a real account ID remain non-navigable generated speaker avatars.
- Data contract: None. The existing member IDs and profile endpoints are sufficient.
- Status: Implemented in-thread on 2026-08-21. Unit verification passed; Release and QA-bridge Debug builds both installed and launched on the connected iPhone. Appium still exposed only `NATIVE_APP`, so direct WebView interaction for this surface remains blocked by the local device automation environment.

## 2026-08-21 - Keep the conversation room behind a profile route

- Surface: The profile detail opened by tapping a participant avatar inside a conversation room.
- Issue: A room restored by native STT could be visible while the browser history still pointed at the conversation list. Opening the profile route from that state left the list as the back target, so an iOS swipe-back dismissed the room instead of returning to it.
- Resolution:
  - Ensure the active conversation has a marked `conversation` history entry before pushing the profile route.
  - Preserve the active conversation query on the nested profile URL so the return context is not discarded by the native-query path builder.
  - Keep top-level tab navigation behavior unchanged; only nested profile navigation opts into conversation preservation.
- Data contract: None. No database or API changes.
- Testing notes: Verify the profile opens from a restored room and that the header back action and iOS edge-swipe both return to the same conversation room.

## 2026-08-21 - Restrict profile dismissal to the intended back gestures

- Surface: The route-backed public profile opened from a conversation avatar on iOS and Android.
- Issue: The profile motion root accepted a horizontal drag from any screen position, so a normal center swipe could dismiss the profile and let the same gesture continue into the underlying conversation history. Android hardware back also had no profile-specific native handler and could fall through to the browser history path.
- Resolution:
  - Restrict the profile's controlled drag-to-dismiss behavior to pointer starts inside the 32px left edge zone.
  - Disable competing WebView history gestures while the profile owns the controlled edge swipe, so the same gesture cannot reload or traverse the underlying room.
  - Register the profile screen as the highest-priority native back handler so Android hardware back closes only the profile route.
- Data contract: None. No database or API changes.
- Testing notes: Verify center swipes do not dismiss a route profile, iOS edge-swipe returns directly to the room, and Android hardware back leaves the room open behind the profile.

## 2026-08-21 - Keep every right-side surface above its parent page

- Surface: Notifications and conversation rooms from the conversation list; the conversation menu, public profiles, feedback, participants, and conversation management from a room; and profile edit, profile share, followers/following, profile settings, and settings subpages from My Page.
- Issue: Some screens were route pages and others were parent-owned state overlays. Route navigation unmounted the conversation room or My Page, while state-owned screens used separate animation and native-back implementations. On iOS, a center swipe could dismiss a profile and continue into the underlying history. On Android, hardware back could close the room before the profile transition finished. The same structure also made nested settings surfaces behave differently from the top-level screens.
- User impact: Returning from a profile or notification could show a loading or refresh state, leave the conversation room, or land on the conversation list. Similar right-side screens could also disagree about edge-swipe ownership, native back priority, and whether the parent page stayed mounted.
- Resolution:
  - Add a shared `SlideSurface` primitive for right-side surfaces. It owns the entrance/exit motion, left-edge-only drag dismissal, native back registration, and native edge-swipe suppression.
  - Add a shared same-document history stack so opening a surface preserves the current route and parent React tree. Closing a nested surface consumes only its own history entry, allowing notifications to open a profile and return to notifications, or a follow list to open a profile and return to the list.
  - Keep the conversation room mounted while it is hidden behind the conversation list, and render notifications and conversation profiles as sibling surfaces instead of route replacements for internal entry points.
  - Convert My Page's profile edit, settings, follow list, public profile, and profile share entry points to parent-preserving surfaces. Convert settings subpages to history-backed nested surfaces.
  - Apply the shared surface behavior to the conversation hamburger menu while preserving its existing nested menu history. QR-based profile sharing remains the explicit route exception because it coordinates native scanner and QR-save actions.
- Data contract: None. No Prisma migration or API namespace change is required.
- Testing notes: TypeScript, targeted ESLint, the shared slide-surface history tests, and the unit test suite pass. Live integration tests require the configured local server. Device verification remains pending for iOS edge-swipe, iOS center-swipe rejection, Android hardware back, and nested surface return paths.

## 2026-08-21 - Keep nested room surfaces on the correct back stack

- Surface: Conversation-room backdrop, hamburger-menu child pages, and the room language selector.
- Issue: The shared `SlideSurface` kept a semi-transparent hamburger backdrop painted while closed, which darkened the conversation room. A back gesture from a hamburger child page was also allowed to dismiss the parent menu surface because the close dispatcher did not consume the current menu history depth first. The language selector is rendered through a React portal, so its pointer gesture could bubble through the React tree to the room surface and dismiss the room instead of the selector.
- User impact: The room appeared dimmed, nested menu pages returned directly to the room, the next menu opening could require a second tap, and language-selector edge gestures could leave the room/list history out of sync and cause rooms to reopen unexpectedly.
- Resolution:
  - Hide the shared backdrop visually whenever its surface is closed while preserving the mounted parent tree and exit animation.
  - Treat the hamburger history depth as the source of truth and consume one menu entry before allowing the parent room surface to close. Keep a stale-state fallback that closes a visibly open menu without traversing an additional history entry.
  - Stop pointer and touch capture at the portaled language-selector root so room edge-swipe handling cannot receive selector gestures.
  - Expose a topmost-overlay close request through the room refs and let the conversation surface delegate to it before closing. This keeps language selection, dialogs, and nested menu pages ahead of the room/list history transition even when a native or pointer path bypasses the child surface.
- Data contract: None. No Prisma migration, API namespace, or server change is required.
- Testing notes: Verify the room is undimmed when the hamburger menu is closed; edge-swipe and Android back return one level through hamburger pages; language-selector edge-swipe closes only the selector; and repeated A/B room navigation does not reopen a stale room.

## 2026-08-21 - Give the topmost surface exclusive gesture ownership

- Surface: Conversation hamburger child pages, the room language selector, conversation-list search, and full-screen My Page surfaces.
- Issue: Hamburger child pages shared the parent menu's motion root, so an iOS edge gesture could move the child and the hamburger together before history settled. The language selector's portal-level event capture blocked the room gesture but did not provide a selector gesture of its own. Search used a custom horizontal touch detector that dismissed from the center of the screen. Full-screen My Page surfaces also applied a panel shadow across the viewport, producing a dark strip at the edge.
- User impact: Returning from feedback, conversation management, participants, or display-language could briefly close and re-enter the hamburger menu; room language selection could not be dismissed with an iOS edge swipe; a center swipe could unexpectedly close search; and My Page could appear darkened along the right edge.
- Resolution:
  - Keep the hamburger root surface stationary and render its child pages inside a separate topmost `SlideSurface`. The child surface consumes one menu history step while the root remains mounted underneath.
  - Convert the portaled room language selector into a `SlideSurface` with its own edge-only drag and native-back priority. Keep portal event isolation at the surface boundary without suppressing the selector's own gesture.
  - Convert conversation search from a generic touch-distance detector to `SlideSurface`, preserving its existing history marker and instant/animated transition modes. The shared edge guard now ignores center swipes, while Android hardware back still closes only search.
  - Remove `shadow-2xl` from full-viewport My Page surfaces so a full-screen surface does not paint a false edge gradient. Shadows remain appropriate for constrained inner cards.
- Data contract: None. No Prisma migration, API namespace, or server change is required.
- Testing notes: Verify iOS edge-swipe from each hamburger child returns exactly one level, the room language selector closes without dismissing the room, center swipes do not close search, Android back closes only search or the topmost child surface, and My Page has no right-edge dark strip.

## 2026-08-21 - Keep the conversation hamburger transition visible without dimming the room

- Surface: The hamburger menu opened from a conversation room.
- Issue: The menu was the only right-side surface wrapped in a backdrop container. That container changed to `opacity: 0` as soon as history closed the menu, hiding the panel before its exit transform could finish. Its black backdrop also darkened the room even though the hamburger is a navigation surface rather than a modal confirmation dialog.
- User impact: Opening or closing the hamburger could flash instead of sliding smoothly, and the conversation room appeared unnecessarily dimmed behind it.
- Resolution:
  - Keep the transparent layout wrapper mounted while the menu's `SlideSurface` performs its entrance or exit transform.
  - Disable the wrapper's fade-out behavior for this surface so history-driven close transitions remain visible.
  - Remove the black backdrop color while retaining outside-panel click handling for menu dismissal.
- Data contract: None. No Prisma migration, API namespace, or server change is required.
- Testing notes: Verify the hamburger enters and exits with one continuous horizontal motion, the room remains at normal brightness, and tapping outside the menu still closes it.

## 2026-08-21 - Remove the conversation menu edge shadow

- Surface: The conversation room and its hamburger menu, including the legacy conversation renderer.
- Issue: The hamburger panel kept a directional `box-shadow` while its slide surface remained mounted off-screen for transition and history handling. The shadow extended leftward from the hidden panel and appeared as a black gradient along the room's right edge, even before the menu was opened.
- User impact: The conversation room looked dimmed or visually covered at the right edge both before and during hamburger-menu use, despite the room itself not being modal.
- Resolution: Remove the panel shadow from the current outer and nested menu surfaces and from the legacy menu renderer. Make the legacy wrapper transparent as well, so both renderers keep the menu's panel border and slide transition without painting a shadow or dimming layer over the room.
- Data contract: None. No Prisma migration, API namespace, or server change is required.
- Testing notes: Verify the room has uniform brightness before opening the menu, remains uniform while the menu is open, and keeps a smooth menu transition.

## 2026-08-21 - Keep public profiles and profile sharing above their parent surface

- Surface: Public profile details opened from conversation avatars, conversation participants, notifications, follow lists, and Connect search; the profile image preview; and profile sharing from a public profile.
- Issue: Connect search still navigated to a standalone profile route, the public profile share action navigated to the My Page share route, and the image preview did not register as the topmost Android back target. These paths could unmount the parent page or let Android back close the profile/page instead of only the visible child.
- User impact: Returning from a profile could lose the search or conversation context, profile sharing could replace the profile instead of layering above it, and pressing Android back while viewing a profile photo could close the entire profile or exit the app.
- Resolution:
  - Open Connect search profiles through a scope-owned history-backed `SlideSurface`, preserving the search page and its result snapshot underneath.
  - Make profile sharing a nested history-backed `SlideSurface` above every public profile entry point, so iOS edge-swipe and Android back close only the share surface and reveal the profile again.
  - Register the full-screen profile image preview as the highest-priority native back handler and stop its pointer/touch events from reaching the underlying profile surface.
  - Keep the standalone profile route available for direct/deep-link entry, while internal profile entry points remain parent-preserving overlays.
- Data contract: None. No Prisma migration, API namespace, or server change is required.
- Testing notes: Verify profile entry from each listed surface, profile-share open/close and iOS edge-swipe, Connect search restoration, and Android back from both public-profile and My Page photo previews.

## 2026-08-21 - Preserve multi-member language state inside the shared slide surface

- Surface: The conversation-room language selector after integrating room-wide language attribution and deferred invitee membership.
- Issue: The remote language feature distinguishes the room union from the viewer's own picks, while the local navigation work replaces the selector root with `SlideSurface`. A raw merge could either drop the attributed language UI or restore the old non-gesture overlay. Review also found that an explicitly empty viewer selection was being replaced with the room union, and min/max disabling was calculated from the union instead of the viewer's picks.
- User impact: A newly materialized invitee could appear to own every language selected by someone else, be unable to add an attributed language, or see the selector lose its one-level iOS/Android back behavior after integration.
- Resolution:
  - Keep the remote attribution, member-avatar, pending-invitee, and room-union data flow as the source of truth.
  - Reapply only the local `SlideSurface` container and its topmost gesture/native-back ownership around the remote selector body.
  - Preserve an explicitly empty viewer selection and apply add/remove limits to that viewer's own picks rather than the room union.
  - Keep pending-invitee rooms on per-member status semantics and validate display-language choices against the effective member-language union.
  - Keep deleted conversations excluded when locating an existing direct-message room.
- Data contract: Uses the remote `selected_languages` membership column and `pending_invitee_user_ids` channel column without changing their schema or migration order.
- Testing notes: Verify attributed rows for owner-only, other-only, and shared selections; an invitee with no picks can add a language; selector edge-swipe closes only the selector; pending rooms preserve per-member active state; and deleted direct-message rooms are not reused.

## 2026-08-21 - Keep profile-share URL rendering hydration-safe

- Surface: The profile-share surface opened from My Page and public profile details.
- Issue: `profile-share-screen.tsx` read `window.location.origin` while computing `profileUrl` during render. The server therefore rendered no profile URL `<span>`, while the browser added that conditional span during its first render, producing a Next.js hydration mismatch.
- User impact: The profile-share screen could show the Next.js hydration error overlay in the devbox WebView before the share UI stabilized.
- Resolution: Resolve the browser origin in a client-only effect and keep `profileUrl` empty during the server render and the matching initial client render. Generate the URL, QR code, and link text only after the client origin has been committed.
- Data contract: None. No Prisma migration, API namespace, or server change is required.
- Testing notes: Verify the profile-share surface opens without a hydration overlay, then renders the profile URL and QR code after mount; verify direct route and parent-preserving overlay entry points.

## 2026-08-22 - Ask before reusing an existing direct-message room

- Surface: The Message action on public profile details and the existing-room choice used when starting a conversation.
- Issue: Multiple 1:1 rooms could exist for the same two users, but direct-room lookup used an unspecified first row. The group reuse path also used channel.updatedAt rather than the timestamp of the latest persisted message.
- User impact: Message this person could open an arbitrary older room, and the direct flow did not let the user choose between continuing the latest room and creating a separate room.
- Resolution:
  - Select the reuse candidate by the latest visible app_messages.created_at for both exact-member group rooms and exact 1:1 rooms. Rooms without messages fall back to createdAt for deterministic pending-room behavior.
  - Show the existing-conversation choice surface for 1:1 profiles as well as group starts, using the same shared modal component and translations.
  - Continue opens the latest existing room; Create new sends force=true and creates a fresh room without consulting existing-room candidates.
  - Keep the latest-message lookup as one sessionKey IN query with DISTINCT sessionKey, avoiding an N+1 query per candidate room.
- Data contract: Adds the direct endpoint's optional force request field and reused response field. No schema change or Prisma migration is required; the existing app_messages sessionKey/createdAt indexes support the recency lookup.
- Testing notes: Targeted conversation and direct-route tests pass, including latest-message selection and forced 1:1 creation. TypeScript and targeted ESLint pass. Verify both modal choices from a profile with multiple existing 1:1 rooms on iOS and Android.

## 2026-08-22 - Reset the conversation stack when starting a message from a profile

- Surface: The Message action from public profiles opened through Connect search, conversation avatars, participant lists, notifications, and My Page follow lists.
- Issue: Starting a direct conversation used a route push on top of profile, participant, hamburger-menu, and existing-room history entries. Returning from the new room could therefore replay those old surfaces in the wrong order, especially after an iOS edge-swipe. A composer focus could also be restored while the room was being replaced.
- User impact: The room could require several unexpected back gestures to reach the list, and a profile or participant surface could reappear after it had already been dismissed. The original active room could also remain recording while the user was moved to another room.
- Resolution:
  - Consume every profile-owned surface entry and reset the conversation menu depth to zero before handling the Message action.
  - If the selected room is the currently visible room, keep the room route and close only the profile/menu surfaces.
  - Otherwise replace the current room entry with the conversation-list entry, then push exactly one target-room entry, establishing the canonical `[conversation list] -> [conversation room]` stack.
  - Apply the same list-reset navigation to Connect and My Page profile starts, including native tab-root and conversation-restore guards.
  - Stop an active source-room STT session before leaving it and keep the delayed iOS navigation guard alive through route settling.
- Data contract: None. No Prisma migration, API namespace, or server change is required.
- Testing notes: TypeScript, targeted ESLint, and history/navigation unit tests pass. Verify room-avatar and participant-profile flows for same-room continuation and different/new-room navigation, plus Connect and My Page profile starts, iOS edge-swipe back, Android back, and composer keyboard behavior on rebuilt apps.
## 2026-08-20 - Add permission-aware profile locations

- Surface: The location row below the handle on the authenticated My Page and public user profiles.
- Issue: Profiles had no city-level location context, and a previously saved location could remain visible after the user disabled location access in the device settings.
- User impact: Users could not share a useful, approximate location or open it on a map, and a stale profile location could be shown after permission was revoked.
- Resolution:
  - Show a localized location row below the handle. The authenticated user sees an add/update action; other profiles show the city and country or a localized empty state.
  - Open a localized OpenStreetMap view from the row, with reverse-geocoded city and country labels requested in the active UI language.
  - Keep the location permission request deferred until the user taps the add/update action. Page entry and page visibility changes perform a silent permission check only.
  - Clear the saved location locally and through the profile API whenever native or browser permission is not granted. Store only rounded city-level coordinates and labels, never a precise address.
  - Add native Location When In Use permission declarations and bridges for both iOS and Android; the existing iOS and Android back behavior closes the map modal first.
- Data contract: Add nullable city-level location fields and permission verification timestamps to `app_users`; the existing v2.0.0 profile endpoints expose the nested location object.
- Testing notes: Verify add/update requests the system permission only after the button tap, denied permission removes the row after returning from Settings, each primary UI language localizes the row and map labels, and Android back closes the map before exiting the screen.

## 2026-08-20 - Present profile locations as a full-screen side panel

- Surface: The profile location map opened from My Page or another user's profile.
- Issue: The map opened as a compact bottom-sheet-style dialog, which made the map and supporting text feel cramped and inconsistent with the app's existing menu pages.
- User impact: Users had less map context and the title, location label, permission description, and actions were difficult to read.
- Resolution:
  - Replace the compact dialog with a full-screen panel that slides in from the right using the same transition direction as the profile and settings menus.
  - Use a menu-style top-left back button and preserve the native back handler so Android back closes the map panel before the underlying profile or app.
  - Increase the map panel typography and action target sizes, and allocate more vertical space to the map.
  - Narrow the OpenStreetMap embed bounds to keep city labels readable at the larger panel size.
- Data contract: None.
- Testing notes: Verify the panel enters from the right on iOS and Android, the top-left back button and Android back close only the panel, the map labels are readable, and the enlarged controls remain localized in all supported UI languages.

## 2026-08-20 - Preserve viewer-language profile location labels after remount

- Surface: The localized city and country label on another user's profile.
- Issue: The first visit could briefly show the profile owner's stored language before the viewer-language reverse-geocoding response arrived. On later visits, a cached reverse-geocoding result could be overwritten by a zero-delay fallback reset, leaving the label in the stored language.
- User impact: An English viewer could see a Korean location label again after leaving and reopening the same profile.
- Resolution: Keep the current profile data as the render fallback and remove the delayed fallback reset. The viewer-language result now wins consistently for both network and cached responses.
- Data contract: None. The server still stores the profile's fallback city and country; the client resolves display labels with the viewer's locale.
- Testing notes: Verify the first render can transition from the stored label to the viewer-language label, reopening the profile preserves the viewer-language label, and a failed reverse-geocoding request still falls back safely.

## 2026-08-20 - Localize profile map labels with Google Maps Embed

- Surface: The full-screen map opened from a profile's city and country label.
- Issue: The profile label was localized for the viewer, but the embedded OpenStreetMap standard layer could continue rendering local-language map labels because its standard raster tiles are not selected per viewer locale.
- User impact: An English viewer could see `Seoul, South Korea` above a map that still displayed Korean place labels.
- Resolution: Replace the standard OpenStreetMap iframe with Google Maps Embed and pass the viewer's primary locale through the `language` parameter. Keep the existing coordinates and full-screen panel interaction unchanged.
- Data contract: None. Profile coordinates and localized reverse-geocoded labels remain unchanged.
- Testing notes: Verify English, Korean, and the remaining primary UI locales render the Google map with the requested language when `NEXT_PUBLIC_GOOGLE_MAPS_EMBED_API_KEY` is configured. Verify the panel shows the existing map-unavailable fallback when the key is absent.

## 2026-08-22 - Complete multi-member privacy and primary-locale UI copy

- Surface: Conversation list avatars, direct-message entry, pending group invites, the blocked composer state, and the multi-member/profile UI added in this branch.
- Issue: A blocked counterpart was correctly marked in the conversation summary but the list's `otherMembers` payload still carried the original photo and crop values. Direct-message lookup also accepted any pending room containing the target, so a pending group such as `[B, C]` could be reused for an A-to-B message. Invite creation accepted unknown user ids, which left invalid pending rows that could fail first-message membership materialization. Several new controls and states were localized only for Korean/English, including the public-profile Message action, blocked composer copy, profile sharing, notifications, usage settings, and profile image cropping.
- User impact: A blocked person's photo could remain visible, a private message could reach an unintended group member, an invalid invite could create a room that failed to materialize reliably, and users in the other primary UI languages could see mixed English/Korean copy in newly added flows.
- Resolution:
  - Null counterpart image and crop fields in every conversation summary and hydration path whenever the viewer has blocked the only other real member; retain the name and blocked-room marker so the room remains understandable without exposing the photo.
  - Narrow pending direct-room reuse to a single pending target id, while keeping exact real-member filtering for materialized rooms.
  - Validate every invitee against `User` before duplicate checks or persistence, and defensively drop unknown legacy pending ids before the membership foreign-key write.
  - Use shared composer copy for both current and legacy renderers, including a localized blocked message and send-message label.
  - Add complete copy tables for all 15 primary UI locales (ko, en, ja, zh-CN, zh-TW, fr, de, es, pt, it, ru, ar, hi, th, vi) across group invitations, profile messaging, QR sharing, notifications, profile image cropping, usage settings, and accessibility labels. New supplemental copy resolves to English for every other supported locale.
- Data contract: No Prisma migration or API namespace change is required. Invite validation and legacy-row filtering use the existing `User` table and `pending_invitee_user_ids` field.
- Testing notes: Conversation, route, i18n, composer, copy-action, profile-link, TypeScript, ESLint, and the full 128-file/1,115-test unit suite pass. Verify blocked avatars, A→B messaging from a pending `[B,C]` room, invalid invite rejection, and every newly added UI surface in the 15 primary locales plus an unsupported locale such as Polish.
## 2026-08-22 — Admin conversation history review controls

- Surface: `mingle-app/src/app/admin/conversations/page.tsx`, `mingle-app/src/app/admin/conversations/admin-conversations-view.tsx`
- Issue: The admin conversation history view loaded all matching rooms and messages in one unbounded page. The page did not own a scroll viewport, deleted records were difficult to distinguish, and source/translation language codes were shown without readable language names or flags. This made long user histories difficult to inspect and made targeted support investigations slow.
- User impact: Administrators could lose access to the lower part of a long transcript, could not efficiently find a phrase in the records already loaded, and could not distinguish deleted rooms, messages, and content at a glance.
- Resolution: Added a bounded full-height scroll viewport, server-side room pagination (10 rooms per page), per-room message pagination (200 messages per page), room sorting, separate room/message deletion filters, deletion status badges, and client-side search restricted to the currently loaded records. Source and translation contents now show a flag, role, and English language name.
- Tests: TypeScript validation was run; the repository still reports pre-existing errors in unrelated language-selector, dictionary, and dashboard BigInt test files.

## 2026-08-22 — Admin conversation room drill-down and infinite history

- Surface: `mingle-app/src/app/admin/conversations/page.tsx`, `mingle-app/src/app/admin/conversations/admin-conversations-view.tsx`, `mingle-app/src/app/admin/conversations/[conversationId]/messages/route.ts`
- Issue: Showing every conversation room and its transcript on one screen made room selection and long-history review cumbersome. The message order and room pagination also needed to match support-review behavior: newest records first, with older records revealed progressively below.
- User impact: Administrators had to scan large transcript blocks before finding the room they needed, and long conversations were difficult to review without loading excessive data at once.
- Resolution: The default view now shows a latest-first room list with 20 rooms per page. Selecting a room opens a dedicated transcript view ordered newest-to-oldest; it loads 200 messages initially and automatically requests the next 200 older messages as the transcript scroll reaches the bottom. Existing deletion filters, language badges, and loaded-content search remain available.

## 2026-08-22 — Admin conversation browser session cache

- Surface: `mingle-app/src/app/admin/conversations/admin-conversations-view.tsx`, `mingle-app/src/app/admin/conversations/[conversationId]/messages/route.ts`
- Issue: Reopening an already reviewed room caused the browser to wait for the same transcript pages again, making repeated support investigation unnecessarily slow.
- User impact: Administrators had to wait through repeated transcript loads when switching between a room and the room list or revisiting messages in the same tab.
- Resolution: Cached loaded room lists and transcript pages in versioned `sessionStorage` keys scoped by user, room, deletion filter, sort, and page. Cached transcript pages are shown immediately and older pages continue to append through the existing authenticated endpoint. The server no longer renders the first 200 messages on every room navigation; it returns the room shell and the client fetches or reuses the first page.

## 2026-08-22 — Admin conversation cache-first refresh

- Surface: `mingle-app/src/app/admin/conversations/page.tsx`, `mingle-app/src/app/admin/conversations/admin-conversations-view.tsx`, `mingle-app/src/app/admin/conversations/data/route.ts`
- Issue: Although transcript pages were cached in the browser, a hard refresh still waited for the server page to query the user, count rooms, load the room list, and aggregate message counts before the client could read `sessionStorage`.
- User impact: Returning to an already reviewed user still showed a slow blank/loading page, defeating the purpose of the browser cache.
- Resolution: Reduced the server page to an authenticated shell. The client now reads the scoped `sessionStorage` snapshot immediately, renders it, and refreshes the same data in the background through the authenticated admin data endpoint. The endpoint returns room metadata only; transcript pages continue to load lazily and use the existing per-room cache.

## 2026-08-22 — Admin cache-first update apply control

- Surface: `mingle-app/src/app/admin/conversations/admin-conversations-view.tsx`
- Issue: Background refreshes still replaced the visible cached room list or transcript as soon as the server response arrived, causing the page to re-render while an administrator was reviewing records.
- User impact: A support reviewer could see the currently displayed list or transcript shift unexpectedly after a refresh completed.
- Resolution: Cached data remains the visible source after a lookup. Background responses now update `sessionStorage` first and only enable the top-level `새 데이터 적용` button when the response differs. Clicking the button applies the cached snapshot to the visible list or transcript in one client-side render. The same behavior applies to the initial room message refresh and preserves lazy 200-message loading.

## 2026-08-22 — Admin room loading state during cache/API handoff

- Surface: `mingle-app/src/app/admin/conversations/admin-conversations-view.tsx`
- Issue: When navigating from the cached room list to a room, the previous request's data state could remain visible for one render while the new room request was still pending. If that stale snapshot had no selected room detail, the UI incorrectly showed `해당 대화방을 찾을 수 없습니다.` before the API response arrived.
- User impact: Operators could mistake a transient cache/API handoff state for a genuinely missing conversation.
- Resolution: Scoped rendered data and error state to the current request key. A room with no usable cached detail now stays in the loading state until the database response completes; only a completed response that confirms the room is absent shows the not-found message. Usable cached room detail remains visible while background refresh waits for manual application.

## 2026-08-23 — Admin conversation client-side controls

- Surface: `mingle-app/src/app/admin/conversations/page.tsx`, `mingle-app/src/app/admin/conversations/admin-conversations-view.tsx`, `mingle-app/src/app/admin/conversations/data/route.ts`, `mingle-app/src/app/admin/conversations/[conversationId]/messages/route.ts`
- Issue: Room sorting, deletion filters, and room pagination were coupled to the database lookup request, so changing a browsing control could trigger another server query and made the cached review experience less responsive.
- User impact: Administrators could not treat sorting and filtering like the existing client-side search over the already loaded support data.
- Resolution: The lookup now fetches the complete room metadata dataset and unfiltered message pages for the selected user. Room deletion filtering, message deletion filtering, sorting, and 20-room pagination run entirely in the browser over the cached/fetched data; the server is only contacted for user/room data retrieval and lazy 200-message pages.
- Tests: Targeted ESLint and TypeScript validation were run; the repository still reports the known unrelated test type errors in language-selector, dictionary, and dashboard BigInt files.

## 2026-08-23 — Admin conversation latest-message sorting

- Surface: `mingle-app/src/app/admin/conversations/admin-conversations-view.tsx`, `mingle-app/src/app/admin/conversations/data/route.ts`
- Issue: Room sorting included room update time, creation time, and title, but not the timestamp of the newest message.
- Resolution: Added a latest-message timestamp to the cached room metadata and a `최근 메시지 최신순` client-side sort option. Rooms without messages are placed after rooms with messages.

## 2026-08-23 — Admin conversation single-scroll cache-first room view

- Surface: `mingle-app/src/app/admin/conversations/page.tsx`, `mingle-app/src/app/admin/conversations/admin-conversations-view.tsx`
- Issue: The room view had both a page-level scroll area and a fixed-height transcript scroll area. Cache hydration also used a transition, so a repeat lookup could keep showing the loading state while the background database refresh was pending.
- User impact: Operators had to manage two scrollbars while reading a transcript and could wait for the database refresh instead of seeing the same user's cached room list immediately.
- Resolution: Removed the inner transcript scroll container and kept one full-height admin page scroll area. Older message loading now listens to that single page scroll position. Cached user data is applied synchronously as soon as the client starts, while the fresh response continues in the background and only enables the manual update control.

## 2026-08-23 — Keep the keyboard open after text-message submission

- Surface: The conversation room's keyboard-mode message composer on the current mobile/web conversation surface.
- Issue: Tapping the send button caused the textarea to lose focus, so iOS/Android mobile WebViews dismissed the keyboard immediately after each submitted message.
- User impact: Users had to reopen or retap the composer before entering the next message, making rapid text conversations unnecessarily slow.
- Resolution:
  - Keep the existing composer open state unchanged after a successful submit.
  - Re-focus the same textarea and place the caret at the end after clearing the submitted draft.
  - Prevent the send button's pointer-down default from stealing textarea focus, avoiding a keyboard close-and-reopen flash.
  - Preserve the existing close button, native back handling, and outside-tap blur behavior so users can still dismiss the keyboard intentionally.
- Data contract: None. No Prisma migration, API namespace, or server change is required.
- Testing notes: Verify multiple consecutive sends on iOS and Android, confirm the keyboard stays visible without flickering, confirm the caret is ready for the next message, and confirm tapping outside or using the close/back controls still dismisses it.

## 2026-08-24 — Remove unsolicited iOS Bonjour permission prompt

- Surface: iOS native app launch configuration in `mingle-app/rn/ios/mingle/AppDelegate.swift` and `mingle-app/rn/ios/mingle/Info.plist`.
- Issue: The app requested iOS Local Network access on first launch even though the product does not use Bonjour discovery in its normal conversation flow. The prompt was especially confusing because it appeared before any user action that needed local-network access.
- User impact: A first-time iPhone install showed an unexpected Bonjour/Local Network permission dialog, creating uncertainty about why Mingle needed access to nearby devices.
- Resolution: Removed the launch-time `NWBrowser` call that browsed the unused `_mingle-lnp._tcp` Bonjour service and removed its matching `NSBonjourServices` and `NSLocalNetworkUsageDescription` declarations. Android has no corresponding Bonjour implementation and was not changed. `NSAllowsLocalNetworking` remains because it is a transport exception for development endpoints and does not itself request the permission dialog.
- Data contract: None. No Prisma migration, API namespace, or server change is required.
- Testing notes: Install a newly rebuilt iOS app on a clean device and confirm that the initial launch no longer shows a Local Network/Bonjour permission prompt. Verify microphone, camera, photo-library, location, and push-notification permission flows remain unchanged.

## 2026-08-24 — Preserve live utterance order across conversation hydration

- Surface: The 2.0.0 conversation-room transcript while consecutive STT turns are moving from live drafts to finalized, server-persisted messages.
- Issue: A locally captured utterance used its speech-start timestamp while live and immediately after finalization, but repeated conversation hydration replaced that timestamp with the later `AppMessage.createdAt` persistence timestamp. WebSocket pushes and the 20-second fallback poll both invoke the same full hydration merge. If a newer turn was still live when an older finalized turn returned from the server, the server timestamp could cross the newer turn and temporarily render the transcript as `1, 2, 3, 5, 4`; once the newer turn persisted, the order could return to `1, 2, 3, 4, 5`.
- User impact: Message bubbles could visibly jump above or below one another during active speech even though their source turns were captured in the correct order. The issue was specific to the repeated 2.0.0 multi-member synchronization path and did not require an STT final event to look incomplete in the UI; local final rendering happens before asynchronous translation and server persistence finish.
- Resolution:
  - Keep WebSocket push and fallback polling so other members' messages still arrive in already-open rooms.
  - When hydration returns a message ID already present on the client, accept the server's text, translations, speaker data, and other authoritative fields while preserving the client's established `createdAtMs` display-order timestamp.
  - Continue using the server timestamp for messages that are genuinely new to this client.
- Diagnostics: Before applying the protected merge, compare the incoming server timestamp with the existing local timestamp and all committed/live timeline anchors. If the server timestamp would cross another visible utterance, emit `conversation_hydration_order_preserved` through the existing client-event API. The event is stored in `AppEventLog` and emits the backend log marker `[conversation-order] hydration timestamp drift preserved`, including the hydration trigger (`mount`, `push`, or `poll`), both timestamps, delta, and crossed message IDs. Diagnostic events are deduplicated client-side and contain no transcript text, so a TestFlight or internal-test build can validate the hypothesis without Metro.
- Data contract: No Prisma migration or API namespace change is required. The existing client-event endpoint accepts one additional additive event type.
- Testing notes: Added a regression case where server persistence time would move finalized turn 4 below live turn 5; the merge keeps `4, 5` while still applying server-confirmed content. Added diagnostics coverage confirming the event is stored and logged without creating or notifying another conversation message. Targeted tests, TypeScript, and ESLint pass.

## 2026-08-24 — Profile location reliability and edge-swipe navigation

- Surface: `mingle-app/src/components/profile-location.tsx`, the Android native location bridge, and the profile PATCH flow.
- Issue: The location panel used an independent full-screen animation instead of the shared `SlideSurface`, so an iOS edge swipe could be handled by the native WebView history gesture instead of dismissing the location panel. Android waited on a single `LocationManager` provider and could remain on `Getting your current location...` when GPS did not produce a fix. Reverse geocoding and profile persistence had no request-level timeout, so a slow upstream could leave the loading state unresolved.
- Resolution:
  - Reused `SlideSurface` for the location panel so its shared edge gesture and native navigation suppression apply consistently with other profile surfaces.
  - Added Android fused-location, fresh last-known, and simultaneous network/GPS fallback paths while retaining a bounded 12-second overall timeout.
  - Added bounded reverse-geocode and profile-save/clear requests. A transient location failure no longer clears an existing saved location; permission denial still performs the privacy cleanup.
  - Added metadata-only diagnostics for request ID, provider, location receive time, reverse-geocode outcome, and profile persistence timing. Coordinates and address text are not logged.
- Data contract: No Prisma migration, API namespace, or new server endpoint is required. Android now includes the Google Play Services location client dependency.
- Testing notes: Verify location acquisition on Android with GPS disabled or slow, with cached location available, and with network fallback. Verify iOS edge swipe from the left screen edge dismisses the panel, while center swipes remain available for map/content scrolling. Confirm reverse-geocode and profile-save failures leave a bounded error state.

## 2026-08-24 — Android native STT ready, teardown, and keyboard-microphone recovery

- Surface: Android native STT capture, the React Native-to-WebView bridge, conversation-room lifecycle, and both keyboard/voice microphone controls.
- Issue: Android reported audio capture as `running` before the STT server confirmed `ready`. The web UI correctly treated that early signal as `connecting`, but the native layer never emitted a distinct server-confirmed ready state and the React Native start Promise could overwrite an early ready event with `running`. A room close or hook unmount could also release only the web owner while native capture continued. Queued native messages then waited behind a stale owner until the room remounted, and the keyboard-mode microphone could lose its click while the textarea blurred and the WebView resized.
- User impact: The microphone could remain disabled behind an indefinite connecting spinner even though native capture had started. Transcripts could appear only after leaving and reopening the room, and tapping the microphone from keyboard mode could feel unresponsive.
- Resolution:
  - Promote the explicit STT server `ready` payload to an Android native status event and preserve that status across audio-route recovery.
  - Preserve an already received `ready` state when the asynchronous React Native start call resolves, with raw server-message recognition as a bridge-level fallback.
  - Stop the active room's STT session before closing the conversation and send an idempotent native stop during hook unmount if the owner still exists.
  - Reclaim a stale native owner only when a queued message carries an explicit conversation ID matching the current room; add metadata-only debug markers for blocked ownership, takeover, queue drain, unmount stop, and watchdog timeout.
  - Add a 12-second native connecting watchdog that stops the stale session, returns the control to an actionable state, and records the timeout through the existing STT session event path.
  - Prevent microphone pointer-down from stealing textarea focus. Once the click is confirmed, switch keyboard mode to voice mode before starting STT so viewport/layout movement cannot cancel the initiating gesture.
- Data contract: No Prisma migration or API namespace change is required. The mobile version remains `2.0.0` with `android/v2.0.0`.
- Testing notes: Verify first-start ready transition, rapid stop/start, room close while connecting and while ready, force-close/re-entry queue behavior, keyboard-mode microphone start, audio-route recovery, and the 12-second timeout fallback on an intentionally unreachable STT endpoint.
## 2026-08-24 — Admin conversation staged browser history

- Surface: `mingle-app/src/app/admin/conversations/page.tsx`, `mingle-app/src/app/admin/conversations/admin-conversation-lookup-form.tsx`, `mingle-app/src/app/admin/conversations/admin-conversations-view.tsx`, `mingle-app/src/app/admin/dashboard/page.tsx`
- Issue: The admin conversation review flow had an unnecessary dashboard entry point, and the initial external-user lookup could remain in browser history. Pressing Back from a room could therefore return to the pre-lookup screen instead of the room list.
- User impact: Operators could lose the loaded room list while navigating through a user’s history and had to repeat the lookup before continuing their review.
- Resolution: Removed the dashboard conversation button, changed external-user lookup navigation to replace the pre-lookup URL, and kept room selection as an explicit history push. Browser Back now moves from a room to its room list while preserving the loaded user context.

## 2026-08-24 — Suppress iOS foreground message alerts

- Surface: iOS native push notification presentation in `mingle-app/rn/ios/mingle/AppDelegate.swift`.
- Issue: APNs message payloads intentionally include alert, sound, and badge data for background delivery, but iOS was also presenting those options while Mingle was already in the foreground. Android did not show the same foreground alert.
- User impact: A user actively reading a Mingle conversation could receive an unnecessary banner, sound, and badge update for the message already visible in the open room.
- Resolution: Keep the notification center delegate and background/tap handling unchanged, but return an empty presentation option set from `willPresent`. APNs delivery continues, while foreground iOS messages no longer show a banner, play a sound, or update the badge.
- Data contract: None. No Prisma migration, API namespace, or server payload change is required.
- Testing notes: Install the new iOS TestFlight build on a device, keep Mingle in the foreground, send a message from a second account, and confirm there is no banner, sound, or badge change. Background and notification-tap behavior must still work.

## 2026-08-24 — Let message bubbles use their natural available width

- Surface: Collapsed and expanded message bubbles in the 2.0.0 conversation room, including the localized Expand/Collapse control beside each bubble.
- Issue: The bubble content switch used `fit-content` as a shrinkable flex item beside the toggle. During flex sizing, WebKit could resolve that item near its min-content width before the message received the remaining row width. A language badge could therefore occupy the first line by itself while short text such as `Again`, `What is it?`, or a short Japanese translation wrapped underneath even though substantial horizontal room remained.
- User impact: Short messages looked arbitrarily narrow, longer messages wrapped much earlier than necessary, and expanded multi-language bubbles became tall and visually uneven.
- Resolution:
  - Start both collapsed and expanded bubble sizing from their max-content width, then allow the flex row to shrink them only when the available conversation width is genuinely smaller.
  - Keep the bubble capped by the full remaining message column so long text naturally grows to the widest safe width before wrapping.
  - Reduce the bubble-to-toggle gap from 4px to 2px. The reclaimed space is available to the bubble while the localized text control remains attached to the bubble baseline.
- Data contract: None. No Prisma migration, API namespace, or native change is required.
- Testing notes: Verify short Korean, English, and Japanese rows (`또`, `Again`, `また`), mixed rows such as `What is it?`, and long multi-line translations on narrow iPhone and Android widths. Text should remain beside the flag when it fits, wrap only after the bubble reaches its safe maximum width, and keep Expand/Collapse 2px from the bubble.

## 2026-08-24 — Complete profile details in image preview

- Surface: The full-screen profile-image preview opened by tapping another member's profile photo, plus the user's own profile-image preview.
- Issue: The preview showed only one language pill below the image. It omitted the profile identity details that were already available on the public profile surface, so the image view felt disconnected from the profile the user had selected.
- Resolution:
  - Added a compact translucent information card below the image with the display name, `@handle`, and bio.
  - Kept the primary-language flag and localized language name in a separated, aligned row so language metadata remains visible without competing with the identity details.
  - Reused the same preview structure for the current user's image so opening either kind of profile has consistent hierarchy.
- Data contract: No Prisma migration or API change is required. The existing public profile response already supplies name, handle, bio, and primary language data.
- Testing notes: Verify a profile with all fields, a profile with only a name and language, and a profile with no image or optional text. The card must remain readable on narrow iOS and Android screens and must close with the existing close button, backdrop tap, edge/back navigation, and Android back handler.

## 2026-08-24 — Profile edit persistence and handle conflict feedback

- Surface: The profile edit form for display name, handle, and bio.
- Issue: The profile PATCH response updated the handle and bio in local state but omitted the saved display name, so a successful name edit could appear to revert. Duplicate handles also needed a clear save-time explanation.
- Resolution: Apply the API response's name and nullable bio to local profile state, preserve the unique-handle conflict response, and distinguish handle conflicts from unrelated profile-save failures.
- Testing notes: Verify name-only edits, clearing name or bio, and saving a handle already used by another account.

## 2026-08-25 — Localized Royce signup welcome message

- Surface: The automatic Royce follow-back and first-message onboarding flow for newly created accounts.
- Issue: New users received Royce's English source message, but the message had no stored translation content for the user's conversation languages. The room therefore could not show the welcome message in the same language-aware bubble flow as ordinary messages.
- Resolution: Keep the English text as the `SOURCE` content and persist deterministic hardcoded `TRANSLATION_FINAL` contents for every current non-English app locale, including both Chinese script variants. The existing per-room client message ID remains idempotent, so retries update the source and translations without creating another welcome message or changing the unread behavior.
- Data contract: No Prisma migration or API namespace change is required. The message metadata records the welcome-message version and the languages included in the precomputed translation set.
- Testing notes: Verify a fresh signup receives one unread Royce message, the source remains English, all 60 current non-English locale entries are present, and selecting the user's default conversation language displays the corresponding translation.

## 2026-08-25 — Keep Explore tab entry keyboard-free

- Surface: The Explore/search tab and its search field in `mingle-app/src/components/connect-page.tsx`.
- Issue: Opening the Explore tab automatically focused the search field through both the input's `autoFocus` attribute and delayed focus calls. On mobile WebViews this also opened the keyboard, including when the user returned to or tapped the already-selected tab.
- User impact: Users saw the keyboard and a focused search field before choosing to search, reducing the visible Explore surface and adding an unwanted interaction step.
- Resolution: Removed the tab-entry focus attribute and the animation-frame/timer focus sequence. The search field remains fully available and still receives focus when the user explicitly taps it or clears an active query.
- Data contract: None. No Prisma migration, API namespace, or native rebuild is required.
- Testing notes: Verify that entering Explore leaves the keyboard hidden and the search field unfocused on iOS and Android WebViews. Tapping the field must still open the keyboard, and clearing a query must still return focus to the field.

## 2026-08-26 — Local-first conversation continuity for the 2.0.0 WebView

- Surface: The 2.0.0 iOS and Android conversation list, conversation-room transitions, room transcript hydration, live settings controls, and finalized-message persistence.
- Issue: Several independently correct server-authoritative paths combined into a poor mobile experience. Account preference GET responses could replace a slider value after the user moved it, rapid preference PATCH requests could complete out of order, a background live room could briefly render above a newly selected room, every WebSocket event and fallback poll could start another full refresh, and structurally identical responses still replaced React arrays and stores. Conversation-list cache survived only the current WebView session, finalized STT messages had no durable browser outbox, usage counters caused parent updates every second, and an ordinary React remount re-entered the full-screen Mingle wordmark bootstrap gate.
- User impact: Controls appeared to snap backward, opening one room could briefly show another room's content, lists and transcripts visibly stuttered despite having no new data, the Mingle loading screen appeared more often than expected, and a transient network failure could leave a locally visible finalized message without a later persistence retry. These costs were especially visible in iOS WKWebView rendering and compositing.
- State ownership decision: Keep the server authoritative for durable account history, membership, permissions, unread state, and cross-device reconciliation. Make the client the working source of truth for the currently rendered list, room, settings edit, and pending message delivery. Server hydration now reconciles into that local state and cannot replace a newer local intent. This is a bounded local-first sync model rather than a risky full transfer of permanent data ownership to browser storage.
- Resolution:
  - Seed account controls from an account- and API-namespace-scoped local snapshot, persist edits immediately with a pending-sync marker, and reject a GET hydration result when a newer local revision exists. When the server already matches the local snapshot, clear the pending marker without an unnecessary PATCH.
  - Serialize account preference PATCH operations with one trailing latest-value write. Rapid slider and menu changes therefore cannot let an older response overwrite a newer preference on the server or mark stale state as synchronized.
  - Move the identity-scoped conversation-list warm snapshot to durable `localStorage`, retain the existing seven-day freshness boundary, migrate legacy session snapshots, and throttle large snapshot serialization to one trailing write per second.
  - Mount a background recording room below the explicitly selected room, make the background transition instant during a room switch, and reserve the top layer for the active user intent. The old live room can keep its capture lifecycle without appearing above the selected room.
  - Coalesce list and room hydration into one in-flight request plus at most one trailing refresh. Keep the 20-second poll only while the corresponding WebSocket is unavailable instead of polling alongside a healthy socket, and do not start list refresh or realtime transport before authentication resolves.
  - Preserve existing list and transcript store references when hydrated content is structurally unchanged. Also preserve an unchanged leave-notice array and report running usage statistics to the parent at most every five seconds while still reporting message-count and stop changes immediately.
  - Queue finalized STT message payloads in an identity-scoped durable browser outbox before delivery. Reuse the existing `(sessionKey, clientMessageId)` idempotency contract, retry on launch, foreground, network recovery, and a visible 15-second interval, and remove a record only after an HTTP success response.
  - Resolve the persisted language-onboarding marker in a pre-paint layout pass and reuse the resolved phase across ordinary component remounts in the same WebView process. Session restoration now leaves the locally rendered list or its compact content spinner visible behind a temporary interaction guard instead of replaying the full-screen wordmark gate.
- Data contract: No Prisma migration, new endpoint, native-code change, mobile version bump, or API namespace change is required. The installed app remains `2.0.0`, with `ios/v2.0.0` and `android/v2.0.0`; the improvements can ship through the remotely loaded web application and its existing 2.0.0 API routes.
- Testing notes: Verify rapid manual-finalization slider drags during a deliberately slow account-preference GET/PATCH, rapid changes across multiple settings, A-to-B room switching while A continues recording, repeated identical WebSocket pushes, socket loss and poll recovery, process/WebView recreation with a cached list, offline finalized speech followed by network restoration, account switching, and first-launch onboarding. Confirm no stale room is visible, local controls never move backward, each finalized message persists once, and server-confirmed cross-device changes still hydrate when there is no newer local edit.

## 2026-08-27 — Diagnose the pre-hydration canvas shift and blocked interaction window

- Surface: Initial iOS and Android WebView load of the conversation list, especially returning users opening the 2.0.0 host for the first time.
- Issue: The server-rendered mobile canvas always starts at scale `1` and a fixed width of 400px because the server cannot read `window.innerWidth`. `MobileCanvasShell` calculates the real device scale only in a client `useEffect`, after JavaScript loads and React hydration begins. At the same time, `ConversationList` initially renders its language bootstrap phase as `resolving` and places a transparent full-screen layer at z-index 199 over the already visible list. That layer is removed only by the client layout effect. The native startup splash is a separate opaque layer and is not the cause when the web UI is already visible.
- User impact: A static conversation screen can appear before it is correctly fitted or interactive. On a 390px iPhone viewport, the 400px server canvas visibly settles to a 0.975 scale; narrower Android viewports shift more. Scroll and button input appear dead until hydration installs handlers, recalculates the canvas, and removes the transparent interaction guard, so all three changes seem to happen at once. Slow script download, parsing, or main-thread hydration extends this window even after the server HTML is visible.
- Contributing architecture: The root layout and conversation entry perform authenticated server work before sending the complete route, while the conversation list remains a large client component. Returning 1.1.4 users also move from the `mingle-1-1-4-production` origin to the `mingle-2-0-0-production` origin, so the new WebView cannot read the old origin's browser cache. These factors can lengthen cold startup, but they are distinct from the deterministic 400px-to-device-width layout shift.
- Data-bootstrap assessment: Do not block the app while downloading every message from every room into `localStorage`. A room hydration currently reads up to 100 messages plus message contents, member metadata, usage, and a full message count. Warming 32 rooms would fetch up to 3,200 message payloads before pagination, multiply database work, risk synchronous localStorage serialization/parsing on the iOS main thread, and make the hydration delay worse for the users with the largest histories.
- Recommended direction:
  - Make the initial canvas fit independent of React hydration, using native/server-provided viewport data or a pre-hydration CSS/inline bootstrap, and remove the transparent interaction guard for already rendered returning-user content.
  - Treat the first 2.0.0 load as a resumable, non-blocking cache seed: fetch and persist the conversation manifest first, then warm only the active/recent rooms with bounded concurrency and a bounded recent-message window.
  - Prioritize a room immediately when the user opens it, lazy-load older history on upward scroll, and keep the UI usable while background warming continues. A small progress banner may explain the first upgrade, but it should not require the user to wait.
  - Use IndexedDB or a native database if broad transcript caching becomes a product requirement; retain the server as the durable authority and continue incremental synchronization after the initial seed.
- Status: Diagnosis and architecture recommendation only. No behavior change has been implemented in this entry.

## 2026-08-27 — Fit the mobile canvas before hydration and preserve native scrolling

- Surface: Initial render of every non-admin mobile WebView route, with the most visible impact on the conversation list.
- Issue: The server emitted a 400px canvas at scale `1`, then `MobileCanvasShell` measured `window.innerWidth` in a React effect and replaced the DOM after hydration. `ConversationList` also rendered a transparent full-screen interaction layer while its persisted language marker was resolving. Users could therefore see a misfitted static list that neither scrolled nor accepted actions, followed by a visible fit correction and interaction unlock.
- Resolution:
  - Run a small synchronous canvas bootstrap before the application markup is parsed. It calculates the fixed-canvas scale from the already-applied device viewport and publishes scaled width, inverse frame height, transform, and compositing values through CSS custom properties.
  - Keep one stable mobile-canvas DOM shape on the server and client. React no longer owns initial scale state or replaces the unscaled tree after hydration, while resize and orientation changes continue to update the same CSS properties.
  - Do not render the transparent language-resolution interaction layer over server-rendered content. Native CSS scrolling remains available before React hydration; the interaction guard is reserved for a real client-side session check, and the existing opaque locale-switch shell remains unchanged.
- Data contract: No Prisma migration, API namespace change, native-code change, or mobile rebuild is required. This is a remotely delivered WebView fix for the installed 2.0.0 application.
- Testing notes: On narrow iPhone and Android viewports, cold-load the conversation list with a throttled network and confirm the first visible frame is already fitted, the list can scroll before full hydration, and no later width snap occurs. Repeat at widths below, equal to, and above 400px, rotate the device, verify admin routes remain unscaled, and confirm authenticated, unauthenticated, first-language-onboarding, and locale-switch states retain their intended gates.

## 2026-08-27 — Diagnose legacy WebView-origin identity discontinuity after the 2.0.0 upgrade

- Surface: Users who created conversations on the 1.1.4 Railway origin and then updated the same installed app to 2.0.0, whose WebView loads a different Railway origin and asks them to sign in again.
- Issue: The browser tracking identity is stored in the host-scoped, HTTP-only `mingle_uid` and `mingle_sid` cookies. An application update preserves the WebView data store but does not make the old host's cookies available to the new host. The 2.0.0 origin therefore creates a new tracking identity, while a newly authenticated account has no automatic claim over conversations owned by the old anonymous user. The data appears deleted even though its rows remain in the production database.
- Production evidence: A read-only Railway configuration comparison confirmed that the 1.1.4 and 2.0.0 services use the same `DATABASE_URL`, `AUTH_SECRET`, Google client ID, and Apple client ID. A privacy-safe aggregate query found 1,029 active conversation channels used by 1.1.x clients and owned by anonymous users, no matching legacy channels owned by registered users, and no channel with both legacy and 2.0.0 activity. No production records were changed during the diagnosis.
- Fast recovery direction:
  - Tell the affected user not to delete or reinstall the app; the legacy-origin cookies are the strongest deterministic recovery proof and should still exist on the upgraded installation.
  - Add a top-level legacy-host recovery hop. The legacy host reads its own HTTP-only cookies, creates a short-lived single-use opaque claim, and redirects to the authenticated 2.0.0 host. The current host verifies and consumes the claim, shows a dry-run summary, and transactionally moves the legacy conversations and message ownership to the signed-in account.
  - For an urgent one-off recovery before the self-service flow ships, identify the current account by its login email, identify the legacy owner from the old cookie or a tightly reviewed device/session match, verify room count and recent room titles with the user, then run the same merge transaction in dry-run and commit modes. Never merge solely by IP address, display name, or approximate timing.
- Recurrence prevention:
  - Use one stable first-party WebView domain across app versions and keep versioning in the API namespace rather than the browser origin.
  - Claim the current anonymous identity into the authenticated account during every first login, with an idempotent audited merge record and conflict-safe handling for channel sequence numbers, memberships, messages, preferences, and social relations.
  - Persist a native installation identity in Keychain/Keystore and inject it into WebView requests as a future recovery signal; it must supplement authenticated identity rather than authorize a merge on its own.
  - Monitor upgraded accounts that suddenly have only the signup room while a recoverable legacy identity exists, and offer recovery instead of presenting an empty list.
- Status: Diagnosis and recovery architecture only. No identity merge, production data mutation, or Prisma migration has been implemented in this entry.

## 2026-08-28 — Make the authenticated account the sole 2.x data owner

- Surface: 2.x conversation lists and rooms, finalized messages, account preferences, translation-model selection, TTS event logging, feedback history, and message-history clearing.
- Issue: Device/browser analytics identity and account identity shared the same `User` table. The client-event handler first upserted a `User` by the `mingle_uid`/`x-mingle-user-id` tracking value and only afterward resolved the authenticated NextAuth session for the actual message or event. Other routes built one composite identity containing both session fields and tracking fields, then fell through from a missing session record to the tracking user. A read-only production review confirmed that a single signed-in 2.0.0 device had created multiple empty anonymous `User` rows with the same version, screen, locale, and IP fingerprint. Code review also found that native Apple exchange initially stored the stable Apple subject in `externalUserId`, but the following credentials-bridge sign-in could overwrite it with the internal User ID; a later Apple login without an email claim could then miss the original account.
- User impact: A signed-in person could have one visible account record while usage metadata or other state was written to additional anonymous records. Preference hydration could therefore read a different row and appear to move a slider back. During session restoration, a tracking-owned conversation lookup could briefly expose the wrong room list before the authenticated list replaced it. The split also made support investigation and legacy-account recovery substantially harder.
- Ownership decision:
  - A verified NextAuth account is the only data owner for current unversioned and 2.x routes, regardless of OAuth provider or email/password sign-in.
  - Device/browser tracking IDs remain analytics correlation keys and may enrich the canonical account, but they cannot select, create, or replace the data owner after authentication.
  - Anonymous `User` ownership remains available only through an explicit versioned 1.x route for backward compatibility with installed pre-account clients.
- Resolution:
  - Resolve the authenticated session before any tracked-user upsert. Update telemetry fields on the canonical account by its database ID without copying the device tracking ID into `externalUserId`.
  - Return `401` from current conversation, message-persistence, preference, feedback, and history-clear writes when the authenticated account is not yet available. The durable finalized-message outbox retains non-successful writes and retries them after session restoration instead of allowing the server to redirect ownership.
  - Remove tracking identity fallback from current conversation-list fast paths, account preferences, feedback history, message deletion, and translation-model lookup. Authenticated reads now use only the account ID/email resolved from the session.
  - Keep TTS delivery independent from analytics logging. If a current TTS request has no canonical account, audio can still return while its optional event log is skipped; legacy 1.x requests retain anonymous logging.
  - Link native Apple identities through the existing NextAuth `Account(provider, providerAccountId)` relation, backfill that link when an older native account signs in, and stop credentials/sign-in callbacks from overwriting an existing provider identity.
  - Fail closed when a session claims an account that no longer exists instead of silently storing data on a tracking user.
- Existing split records: This prevention change does not automatically merge or delete existing anonymous rows. A browser tracking header or cookie is not strong enough proof to transfer message history, so existing recovery must use the separately planned audited claim/merge flow or a reviewed operator migration.
- Data contract: No Prisma migration, API namespace change, native-code change, or mobile rebuild is required. The fix can ship in the remotely loaded web application for installed 2.0.0 clients and also applies to a future 2.0.1 namespace.
- Testing notes: Added regressions for session-over-tracking precedence, missing-session rejection on current routes, stale-session fail-closed behavior, canonical telemetry updates without `externalUserId` mutation, authenticated feedback/message isolation, and explicit 1.x anonymous compatibility. TypeScript, targeted ESLint, and the complete unit suite pass.
