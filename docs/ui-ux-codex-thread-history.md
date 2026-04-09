# Mingle Codex Thread-by-Thread UI/UX Audit

## Scope

- This pass is organized by session ID, not by merged issue theme.
- It covers 277 unique Codex sessions whose `cwd` matched `mingle`, including archived sessions.
- Source split in this rescan: 29 live sessions and 248 archived sessions.
- Sessions with standalone UI/UX issues: 24.
- Total standalone UI/UX issues documented in this file: 43.
- Sessions with UI/UX feature/polish requests only: 11.
- Sessions where a UI/UX issue was only mentioned or handed off: 6.
- Sessions with no UI/UX issue found: 236.
- `019d4cae-5142-7be2-9c74-30f95bfb5787` is listed first, exactly as requested.
- For each later session, the verdict is one of: `UI/UX issue found`, `UI/UX feature/polish request only`, `UI/UX issue mentioned but no standalone fix recorded here`, or `No UI/UX issue found`.
- Pure backend/build/release/research threads are still listed, but they are marked as having no UI/UX issue when appropriate.

## Detailed First Thread

### `019d4cae-5142-7be2-9c74-30f95bfb5787` | UI/UX issues found

- Thread focus: Phase 1 multi-conversation rooms on web/API/DB first, followed by a long chain of multi-room UI/UX fixes.
- High-level verdict: this thread absolutely contained many separate UI/UX issues. It should not have been collapsed into one line item.

1. **Conversation-list header and CTA chrome were repeatedly off**
   Problem: The list header became taller than the intended `bottom-tabs` reference, the top gap was overcounted by spacer/safe-area math, the CTA sat inside the wrong shell, and the CTA shadow/glow made the whole bar look washed out or noisy.
   Attempted fix: Realigned the header to `56px + safe-area`, removed the bad spacer logic, removed the orange glow, and converted the bottom shell into a full-width CTA bar.
   Status: Resolved in-thread.

2. **Conversation-list and in-room banner offsets were wrong**
   Problem: The list banner floated too low below the header, the in-room top/bottom banners sat too far from the actual chrome, and iOS still had a small bottom-banner hover gap even after the main tightening pass.
   Attempted fix: Split list-vs-room offsets, tightened chat/banner clearances, then added a tiny iOS-only bottom nudge.
   Status: Resolved in-thread.

3. **Banner transitions lagged during history navigation**
   Problem: Moving between list and room could leave the old banner visible for too long because the app switched directly between visible zones instead of neutralizing first.
   Attempted fix: Added a `hidden` banner zone and pre-hid the current banner before the next screen asserted its zone.
   Status: Resolved in-thread.

4. **In-room header, bottom bar, and run control were visually too bulky**
   Problem: The in-room header and bottom control bar looked taller and heavier than the list chrome, and an old top safe-area fallback still existed above the header.
   Attempted fix: Reduced header/bar density, removed the top fallback behavior, shrank the mic button, removed extra chrome/shadow, and clarified the running-state icon.
   Status: Resolved in-thread.

5. **`Start Conversation!` sometimes opened a room without actually starting STT**
   Problem: The CTA could create and enter a room but fail to behave like a true start action, and one attempted path even created a ref-callback update loop.
   Attempted fix: Moved auto-start to the post-mount path, removed the ref-loop, and only consumed auto-start after real `running/connecting` confirmation.
   Status: Resolved in-thread.

6. **Conversation rows initially lacked recent-message context**
   Problem: The new room list could show only room labels/status without the latest utterance, which made the list hard to scan.
   Attempted fix: Loaded a recent finalized-message preview into each row and truncated it for compact display.
   Status: Resolved in-thread.

7. **Row previews could disappear after PATCH calls**
   Problem: After recent-message previews were added, pausing a room or changing languages could blank that line until a full refetch.
   Attempted fix: Reattached `latestMessagePreview` in single-room summary responses and added a defensive client merge.
   Status: Resolved in-thread.

8. **Recently viewed room context was lost on full app reopen**
   Problem: A full reopen could dump the user back to the generic list instead of restoring the exact list/room context they had just been using.
   Attempted fix: Stored the last viewed conversations URL per locale/tracking-user and restored it on the next `/[locale]/conversations` entry.
   Status: Resolved in-thread.

9. **Paused rooms could reopen without finalized history or usage**
   Problem: After a relaunch, a paused room could come back looking empty or missing usage even though the room had real finalized content already.
   Attempted fix: Added a room-level read path and a server fallback hydration step when local state was missing.
   Status: Resolved in-thread.

10. **Room open/close state and real STT activity were conflated**
   Problem: The thread explicitly reworked the model because `live/paused` had been tied too much to room visibility/open state instead of actual STT activity, which caused the wrong room to look live or lose visible state.
   Attempted fix: Separated visible-room state from live-STT ownership and made server/client room status follow real STT activity.
   Status: Resolved in-thread.

11. **Hidden non-owner rooms could consume another room's native STT events**
   Problem: Background-mounted rooms were still listening to the same native STT global events, so room 2 could ingest room 1 partial/final text.
   Attempted fix: Forced a single native STT event owner and ignored those events in non-owner rooms.
   Status: Resolved in-thread.

12. **List status and ordering could lag after restore or stop**
   Problem: Restored rooms could keep stale `active` badges, and pressing stop could update `paused` and row order too late, producing delayed flicker/reordering.
   Attempted fix: Seeded list status from restored summaries and pushed `paused` to the parent list immediately when stop is requested.
   Status: Resolved in-thread for the explicitly confirmed cases.

13. **iOS mic-permission denial could trap the room in retry/error UI**
   Problem: Permission denial could strand the room in a bad retry/error state, then the first attempted recovery aggressively jumped straight into Settings.
   Attempted fix: First reset denial back to `idle` and kept the mic control re-clickable, then refined the flow so Settings opens only on the next explicit retry instead of immediately on denial.
   Status: Resolved in-thread.

14. **iOS swipe-back gestures were accidentally disabled**
   Problem: Regular WKWebView swipe-back stopped working because gesture enablement regressed into being tied to the native menu overlay being open.
   Attempted fix: Restored gesture enablement for iOS generally instead of gating it by menu-open state.
   Status: Resolved in-thread.

15. **iOS room swipe-back flickered when returning to the list**
   Problem: A room close via swipe-back could show `room -> list -> room re-open flicker` because history-close animation and route-sync reopen were competing.
   Attempted fix: Restored native-history signaling and added `instant` close for history-driven closes, while keeping animate mode for explicit app-driven back.
   Status: Resolved in-thread.

16. **iOS drawer swipe-back also flickered**
   Problem: After swiping back out of the drawer, the drawer could appear one more time and then close again because it replayed its own exit animation after the system transition.
   Attempted fix: Rolled back an earlier edge-only workaround and added the same `animate / instant` split already used by the main room overlay.
   Status: Resolved in-thread.

17. **iOS forward navigation could fail to restore the conversation cleanly**
   Problem: After swiping back to the list, swiping forward could leave the list visible or replay a fresh room-open animation instead of restoring the existing room state.
   Attempted fix: Subscribed route sync directly to the `conversation` query and reopened via the history-specific instant path.
   Status: Resolved in-thread.

18. **Room swipe-back was too edge-dependent on iOS**
   Problem: Users had to start from the far-left edge to leave a room, which felt brittle inside the new multi-room UI.
   Attempted fix: Kept the native edge swipe and added a web-side helper so a rightward swipe from most of the room body can also go back, while excluding buttons/inputs/drawers/dialogs.
   Status: Resolved in-thread.

19. **Conversation-list copy shipped partially in English**
   Problem: The visible `Start Conversation!` CTA was hardcoded in English and 7 of the 15 shipping locales still fell back to English for the conversation-list copy.
   Attempted fix: Removed the hardcoded CTA label and filled the missing locale dictionaries for `zh-CN`, `zh-TW`, `ru`, `ar`, `hi`, `th`, and `vi`.
   Status: Resolved in-thread.

20. **A late-session five-item room-state bundle was not clearly closed**
   Problem: Late in the session the thread explicitly grouped several remaining problems together: an `isLikelyIOSPlatform` runtime error, non-owner rooms still looking live just by being opened, and ordering needing to follow latest utterances rather than stale status changes. The captured trail ends while those edits are still in progress.
   Attempted fix: Earlier ownership/list-state fixes had already landed, and another pass started for the remaining bundle.
   Status: Not clearly resolved inside the captured thread. Marking this as unresolved/unfinished.

## Remaining Sessions

- `019c52c6-0c6b-7ba0-b8fd-a566d5a6f8b0` | No UI/UX issue found.
- `019c52c6-d0f5-7c20-bf10-60abd034b1ea` | No UI/UX issue found.
- `019c52c7-dd99-7d41-bf04-c337e06f352a` | No UI/UX issue found.
- `019c52cf-6e60-75b1-a47b-521a4b9c6d25` | No UI/UX issue found.
- `019c5302-fb6b-7393-a71c-ded42accc3a6` | No UI/UX issue found.
- `019c5304-b4b1-7bf0-b768-81ea87605468` | No UI/UX issue found.
- `019c55e2-5f5f-7e11-a066-4bfa55f62e03` | No UI/UX issue found.
- `019c55fb-57da-7a92-aec2-2561a237566d` | No UI/UX issue found.
- `019c55fc-6a14-7b42-b8fe-31425ac7f2e1` | No UI/UX issue found.
- `019c5623-e849-7461-ae84-240a7693ea09` | No UI/UX issue found.
- `019c5662-1c56-75f0-b5d9-cfd633fdfe75` | No UI/UX issue found.
- `019c568d-6ebb-7631-90aa-2f179b5e8abe` | No UI/UX issue found.
- `019c568e-11fc-7750-a632-17c29060bd13` | No UI/UX issue found.
- `019c572c-a147-7c21-8b82-fed87a40a573` | No UI/UX issue found.
- `019c5737-cdbe-7ed0-b00c-acf21b014031` | No UI/UX issue found.
- `019c5768-326e-70e2-a693-5042890aeb5e` | No UI/UX issue found.
- `019c5783-e59a-7181-8850-3c73b88095e0` | No UI/UX issue found.
- `019c57d5-8d82-7093-afaf-a5787fd9be32` | No UI/UX issue found.
- `019c5b3d-17d9-7f30-bbc0-8cba3d9f8745` | No UI/UX issue found.
- `019c5b3f-3262-79f1-ad42-a999b8258497` | No UI/UX issue found.
- `019c5c28-0ec3-76e3-9a0a-9d0fc59fff61` | No UI/UX issue found.
- `019c5c43-c3ae-76f1-bfbf-a3be7fd105f3` | UI/UX issue found. Problem: intermittent favicon load crash on first activation/refresh. Attempted fix: serve favicon as a static public asset. Status: resolved.
- `019c5c86-e70a-7880-bcbc-55dd30263975` | No UI/UX issue found.
- `019c5c98-b2a2-77a1-9c86-b9bf9fcef5b9` | No UI/UX issue found.
- `019c5ca5-5af0-7c61-9cb7-3ecfa9a8978d` | No UI/UX issue found.
- `019c5d09-8297-7fb1-b30e-170157988bfd` | No UI/UX issue found.
- `019c60f9-f131-7d31-bffc-053015acbe53` | No UI/UX issue found.
- `019c6578-d27f-7400-a22e-8c6c977af21a` | No UI/UX issue found.
- `019c657a-263b-7923-ac29-67502733eae2` | No UI/UX issue found.
- `019c657c-1de3-7663-8644-226a7e33a58c` | No UI/UX issue found.
- `019c6a45-f896-7842-8798-3ec3966d7332` | No UI/UX issue found.
- `019c6f34-f356-78c3-b52b-15d11f5e921f` | No UI/UX issue found.
- `019c6f40-5ed2-7933-9acd-9302b505584e` | No UI/UX issue found.
- `019c7529-aa7d-79d1-a945-0f38ddc9fda8` | No UI/UX issue found.
- `019c756e-8522-7eb0-ab7a-f3032bcd29ee` | No UI/UX issue found.
- `019c757a-4441-77e2-ba5e-fb2a9ed67d8e` | No UI/UX issue found.
- `019c757a-6667-7812-a0b9-81d2678aa85b` | No UI/UX issue found.
- `019c7700-1655-7b40-ad13-618b3fcd7bf6` | No UI/UX issue found.
- `019c7919-4a00-7f21-a8f2-e9d4fffcdcbd` | No UI/UX issue found.
- `019c791e-6c04-7a02-bf32-65b4ca811c76` | No UI/UX issue found.
- `019c79a5-a788-7023-a79f-5fe87fbd0468` | No UI/UX issue found.
- `019c79e1-3ee4-7750-9f73-fb18d19c3625` | No UI/UX issue found.
- `019c7a09-8d4d-70d1-8279-e1b130ec66f5` | No UI/UX issue found.
- `019c7a3a-7e26-7161-aad0-9320e5a0b4a6` | No UI/UX issue found.
- `019c7a43-b17d-7642-8db2-2d38feb7842b` | No UI/UX issue found.
- `019c7a44-5bec-7990-9be8-a1f687c91755` | No UI/UX issue found.
- `019c7a96-9a95-7971-9de5-7bcd9367baec` | No UI/UX issue found.
- `019c7c60-3dd9-7802-b521-09dc6423aa5c` | No UI/UX issue found.
- `019c7c6a-7ab2-7fa0-83f6-935d8d9982e5` | No UI/UX issue found.
- `019c7e94-b141-7803-8479-4bd439bf7b03` | No UI/UX issue found.
- `019c7e96-50ab-7a42-b721-4186e5eb3115` | No UI/UX issue found.
- `019c7e98-4b0b-7a41-ad88-e7cdd8ea64fa` | No UI/UX issue found.
- `019c7ea8-bef7-7a22-943a-0025345790a3` | No UI/UX issue found.
- `019c7ebf-5768-7991-b324-4587f5a62297` | No UI/UX issue found.
- `019c7ec0-5db0-7db0-892e-b5af65bae018` | No UI/UX issue found.
- `019c7ec4-07bf-70c2-be71-202d71a2a4f4` | No UI/UX issue found.
- `019c7ec7-d1a1-7160-800c-5f3e81d58abf` | No UI/UX issue found.
- `019c7ec9-cc3f-7611-937e-d167cc28b851` | No UI/UX issue found.
- `019c7ed8-cd9c-7b81-ba85-7b645e0c912e` | No UI/UX issue found.
- `019c7eeb-c803-7273-9fd2-4b294d2c29d0` | No UI/UX issue found.
- `019c7f18-f467-7ea2-9f1d-89b20476f8bc` | No UI/UX issue found.
- `019c7f7e-870b-7b40-b8ea-87938538ff87` | No UI/UX issue found.
- `019c7f8f-9d77-7e50-b04e-3983402aae10` | No UI/UX issue found.
- `019c7f98-f1a4-7883-b297-fe343fbd7a9d` | No UI/UX issue found.
- `019c7fb2-1d9e-7cd3-94e3-2738f4068d3f` | No UI/UX issue found.
- `019c7fd6-cd81-7533-8ed8-e6e0def4adbb` | No UI/UX issue found.
- `019c7ffc-8270-7001-bc52-ee09c9f66acb` | No UI/UX issue found.
- `019c800b-967c-75d3-b670-ce1204f56173` | No UI/UX issue found.
- `019c8036-6bd5-7ed1-9666-f62db59d2655` | No UI/UX issue found.
- `019c80c7-1c75-7b30-8dbe-bd2cf6fd11a0` | No UI/UX issue found.
- `019c8820-6004-7181-9ba1-daf7239fa2a1` | No UI/UX issue found.
- `019c8826-2159-7ad1-8366-89589b7e10ce` | No UI/UX issue found.
- `019c897a-5cea-7492-9dcc-edfb13ea8e9c` | No UI/UX issue found.
- `019c897d-69f1-7073-b316-b36d9ca56fc0` | No UI/UX issue found.
- `019c89b3-c13b-7633-95ce-513bcd73fb5e` | No UI/UX issue found.
- `019c8fa7-a546-7940-84aa-bf4e60e5b2db` | No UI/UX issue found.
- `019c8fb0-87a8-7ed1-bae5-403b4dda82da` | No UI/UX issue found.
- `019c8fb5-45db-7303-99b8-1b58a547c4e2` | No UI/UX issue found.
- `019c8ffb-0899-74c0-a937-23eecf933693` | No UI/UX issue found.
- `019c9001-1c9e-7f42-a94b-599f2142fbaa` | No UI/UX issue found.
- `019c9034-32ab-7ce0-8627-15ab63d5945d` | No UI/UX issue found.
- `019c908b-c204-7ec2-8a47-a8616135792d` | No UI/UX issue found.
- `019c90e8-f2e3-7e23-8a4c-2b4ab61f0797` | No UI/UX issue found.
- `019c90ee-2b33-7df2-8b7d-79b5dc37a806` | No UI/UX issue found.
- `019c90f0-0940-7180-8bfa-5fd33c4faa0b` | No UI/UX issue found.
- `019c90fd-30d5-7643-8462-853738eb5975` | No UI/UX issue found.
- `019c9464-4a46-7ee0-bb8c-717fced42eeb` | No UI/UX issue found.
- `019c94d3-528e-75e1-a95e-f646bb6096f5` | No UI/UX issue found.
- `019c9515-4c61-7310-acfb-23632cb2fc6a` | No UI/UX issue found.
- `019c9528-172a-7513-a92c-f8febcc5a33f` | No UI/UX issue found.
- `019c9596-73a5-7ea0-9591-ea1af260b6a7` | No UI/UX issue found.
- `019c95be-6f61-7a73-9728-c1f017a1e7ca` | No UI/UX issue found.
- `019c95e8-00df-7180-8366-54a76bd59ccc` | No UI/UX issue found.
- `019c981a-90c3-7ea1-852a-d72ba6d40e40` | No UI/UX issue found.
- `019c9828-433f-7792-895f-939387497143` | No UI/UX issue found.
- `019c9911-aa7c-7f43-8108-348dbbda5e17` | No UI/UX issue found.
- `019c992c-911f-7b23-8a18-3a0e4d5007df` | No UI/UX issue found.
- `019c9930-1391-7582-9e8a-35fae3ae2bc1` | No UI/UX issue found.
- `019c9932-22f5-7870-9de6-557e8a16593b` | No UI/UX issue found.
- `019c9987-d5df-7772-b6cf-6995e5f201c7` | No UI/UX issue found.
- `019c99d8-4af9-76d3-a343-09a335801a17` | No UI/UX issue found.
- `019c9a3a-9b1b-7f13-aa0e-6abdc5366692` | No UI/UX issue found.
- `019c9a60-fdce-73d3-8dbc-983cf8aeb628` | No UI/UX issue found.
- `019c9ee2-e8f9-7ed3-8603-0dd4f09895af` | No UI/UX issue found.
- `019c9f66-dff3-7612-94f5-52ab7df0303c` | No UI/UX issue found.
- `019ca08b-fcff-7ba3-b22f-d4a11d6203a8` | No UI/UX issue found.
- `019ca08e-1177-7141-a848-a157a080e450` | No UI/UX issue found.
- `019ca267-86fd-73d3-b635-7608423be358` | No UI/UX issue found.
- `019ca36e-8c7b-7b61-ac9b-d8a424c5a08d` | No UI/UX issue found.
- `019ca44a-10f9-7ba1-a03a-324fec2a8941` | UI/UX feature/polish request only. Focus: add a delete-account confirmation modal with i18n; not a pre-existing UI bug thread.
- `019ca451-b5bf-7101-ac73-32363c8c017c` | UI/UX feature/polish request only. Focus: add a share button to the hamburger menu; not a bug thread.
- `019ca7dd-8216-77e1-bbfe-8e8758e651c6` | No UI/UX issue found.
- `019ca7f0-31e2-7833-8e21-dfea8a20e507` | No UI/UX issue found.
- `019ca859-df7f-73e0-b271-0d9081356b91` | No UI/UX issue found.
- `019ca866-7124-7540-9deb-b4dc2b286116` | No UI/UX issue found.
- `019ca870-b2f5-79a3-9cf5-472c02dc61e3` | No UI/UX issue found.
- `019ca893-cee7-7843-beba-f40d6cb5a1af` | No UI/UX issue found.
- `019ca8b3-62f0-7721-a821-bbda4ea044cb` | No UI/UX issue found.
- `019ca8b5-5308-7ba3-80a8-91abbd61a27c` | No UI/UX issue found.
- `019ca8b5-a45e-7481-88ae-1ec55578bb49` | No UI/UX issue found.
- `019ca986-c3dc-77e3-91cf-b1a9bd2fb2ad` | No UI/UX issue found.
- `019ca9f3-8e33-73d0-b68a-358667f16cea` | No UI/UX issue found.
- `019caad5-6bb0-7d92-bea8-5037f761994d` | UI/UX feature/polish request only. Focus: email-login flow, swipe panels, and bottom-sheet auth UX; not a pre-existing bug thread.
- `019cad53-394c-74d0-9859-9635b48a03fb` | No UI/UX issue found.
- `019cad54-b14d-7e02-81c9-6b22dc6896e9` | No UI/UX issue found.
- `019cad5b-6537-7b92-8579-e9f00a507532` | No UI/UX issue found.
- `019cad74-8e9d-79c3-ac0e-c3cbbd0f9c8b` | No UI/UX issue found.
- `019cc735-c885-7981-83fc-b6da3b1cb7f8` | No UI/UX issue found.
- `019cd18f-a888-7ba3-836a-d080e8a646ce` | No UI/UX issue found.
- `019cd249-3202-7903-9b35-b39f722ae195` | No UI/UX issue found.
- `019cd739-6b32-7403-8871-4587ae75842c` | No UI/UX issue found.
- `019ce117-7975-7c12-a3c1-c8852e9e67dc` | No UI/UX issue found.
- `019ce214-ca01-72b1-9a79-614345ca09e9` | No UI/UX issue found.
- `019ce243-ae7c-7471-8ed6-ccb088b180b4` | No UI/UX issue found.
- `019ce90c-9c4a-7143-96d5-8fa2764d4572` | No UI/UX issue found.
- `019cf5d5-1394-7680-ab90-b3af3530cb22` | No UI/UX issue found.
- `019cf6d2-0b8a-71d3-b50a-72eb9b168f05` | No UI/UX issue found.
- `019d0511-9a81-7cb0-9eee-67761e98cb2d` | No UI/UX issue found.
- `019d0514-065c-7493-9eb9-ce8c137a0a98` | UI/UX issue found. Problem: users did not recognize the top-right language control as a dropdown. Attempted fix: add a minimal visual cue. Status: likely resolved; this captured session later focused on cleanup.
- `019d0528-958b-7e20-b478-0a507b194f84` | No UI/UX issue found.
- `019d0532-cea8-7930-8b2b-f4a087d98987` | No UI/UX issue found.
- `019d075f-2b45-7f33-8cf3-267e79c6f503` | No UI/UX issue found.
- `019d09ba-95de-7443-a031-9d2516c5425e` | No UI/UX issue found.
- `019d09bb-8a9d-72c3-b709-b80d4cf6b65f` | No UI/UX issue found.
- `019d09c4-4bbb-7712-bfff-af784ff51f88` | UI/UX issue found. Problem: translation bubble meta rows made bubbles too thick. Attempted fix: move flags/time outside the bubble. Status: likely resolved earlier; this captured session later focused on cleanup.
- `019d0a14-c17f-7fd3-af01-e02b23765d6d` | UI/UX feature/polish request only. Focus: add random speaker animal avatars; not a bug thread.
- `019d0a1a-70aa-7231-bb3b-ff84bd64563e` | No UI/UX issue found.
- `019d0ad8-60e5-7600-a9d7-b9e5ca944554` | No UI/UX issue found.
- `019d0b62-238c-77f3-8695-9cd3309958ef` | No UI/UX issue found.
- `019d0b66-694f-7711-88f9-8455fd11d52a` | No UI/UX issue found.
- `019d0bb0-a3bc-75f3-928a-8622fc6f0b26` | No UI/UX issue found.
- `019d0bb7-75eb-7982-8452-1d3200e49826` | No UI/UX issue found.
- `019d0bc2-8898-7ab0-a919-329337c0d625` | No UI/UX issue found.
- `019d0bca-ff49-7a02-bdfc-000135a4dc2a` | No UI/UX issue found.
- `019d0c72-41cf-7403-9d1e-d8f1fc16d91d` | No UI/UX issue found.
- `019d0c72-803e-7121-883d-94b1bb30d995` | No UI/UX issue found.
- `019d0ef1-ec3b-7d90-98e0-68cee77dfbb3` | No UI/UX issue found.
- `019d0ef3-db87-7240-8167-b281b6e3e60b` | No UI/UX issue found.
- `019d0f14-ee9d-7ba2-a04e-461e6809ebc5` | No UI/UX issue found.
- `019d0f6b-c968-7153-bbac-6a744cf5f962` | No UI/UX issue found.
- `019d0fa6-5807-7530-8a07-bcfbc74882c3` | No UI/UX issue found.
- `019d0fbd-04ca-77d3-b18b-a92be64ccbf9` | No UI/UX issue found.
- `019d100e-3ed5-7852-84e9-40f0556d704d` | No UI/UX issue found.
- `019d100e-aed0-71b1-8cd7-337013892e31` | No UI/UX issue found.
- `019d104f-7e0c-7451-ab81-271aec412518` | No UI/UX issue found.
- `019d1074-7a81-7a13-9d34-ce399753c359` | No UI/UX issue found.
- `019d10e1-9693-7a92-bb87-c25a4907c539` | UI/UX issue found. Problem: splash logo yellow did not match the splash background. Attempted fix: replace the launch image asset so its background color matches the runtime splash color. Status: resolved.
- `019d117a-0b87-7552-b5bb-1277eb9d2fc8` | No UI/UX issue found.
- `019d1447-5bd5-7d43-84cf-ec956c87cb15` | No UI/UX issue found.
- `019d144c-f526-7380-991d-988ef57ed3c6` | No UI/UX issue found.
- `019d1503-a483-73b3-8d98-133e7ed456c8` | No UI/UX issue found.
- `019d162b-4b15-7763-88f2-7571532d1ed6` | UI/UX issue found. Problem: animal avatar SVGs had too much whitespace and one asset looked bad. Attempted fix: asset-trim/polish request. Status: likely resolved on its feature branch; this entry is design-polish rather than a runtime bug.
- `019d16e6-cba0-7db2-8227-56ec4b9b464d` | No UI/UX issue found.
- `019d16e8-8c5b-73f3-8660-e4f72666236b` | No UI/UX issue found.
- `019d18f0-c3d8-71c3-b1cb-f3b6a8c94e21` | UI/UX issue found. Problem: iOS resume showed a brief white flash. Attempted fix: investigation only in this thread. Status: unresolved in this session.
- `019d18f1-d54f-75f2-b893-1ffb6ef5ccf0` | No UI/UX issue found.
- `019d18f2-8f47-7c43-b52f-b08ce0ae78b8` | UI/UX issue found. Problem: auto-scroll triggered too often and fought manual scrolling. Attempted fix: throttle/recheck bottom-follow logic. Status: resolved.
- `019d191f-7488-73d1-a772-f694c9faa9d5` | No UI/UX issue found.
- `019d1998-e85c-75f3-ad64-e67eadf8d75f` | No UI/UX issue found.
- `019d199b-d514-7891-99d1-f261a7feb213` | No UI/UX issue found.
- `019d19a3-df70-7a42-bd7b-ff6ac157d4a3` | UI/UX issue found. Problem: Android background translations did not visibly update until foreground. Attempted fix: investigation only. Status: unresolved in this session.
- `019d1a31-81a9-7233-86c4-c0d89045632b` | No UI/UX issue found.
- `019d1a3a-5621-7443-bc5d-5b9da3eaa864` | No UI/UX issue found.
- `019d1a4e-f254-7c42-a901-58d2d8ac9f10` | No UI/UX issue found.
- `019d1ac6-5b92-74d2-9519-53b8df36731d` | No UI/UX issue found.
- `019d1acc-de1c-78d3-bfdc-6682552af25b` | No UI/UX issue found.
- `019d1f5b-6d3c-7393-aecf-fc0fcd3e7951` | No UI/UX issue found.
- `019d1f82-8255-7c20-a4c5-0203ec657330` | No UI/UX issue found.
- `019d1faf-7c71-7c53-9025-6f825575d813` | UI/UX feature/polish request only. Focus: revive the hamburger drawer with a right-side full-height panel and swipe/overlay close UX.
- `019d1fb4-12fb-7443-ba29-2a156d635e93` | No UI/UX issue found.
- `019d1ff5-41d8-7801-83ec-6f0984eabb56` | No UI/UX issue found.
- `019d2488-db3d-7820-951d-ae9c7bb2676c` | No UI/UX issue found.
- `019d2653-9139-7143-96cf-90dc54e2a88d` | No UI/UX issue found.
- `019d29c8-ffd0-7c40-9200-d7d7501f835c` | No UI/UX issue found.
- `019d29d5-7bbe-7660-a135-078eb1403e45` | UI/UX issue found. Problem: the onboarding overlay showed a ghost play icon that misled users into tapping the wrong target. Attempted fix: remove the misleading icon and rely on copy/arrow guidance. Status: resolved.
- `019d29d6-477e-74c1-aa18-d07e4823e3ec` | No UI/UX issue found.
- `019d29e2-1298-7300-8b06-4a5abb0e978d` | No UI/UX issue found.
- `019d29f1-a463-7c70-a3ad-626b04046182` | No UI/UX issue found.
- `019d29fb-3dda-7680-a598-4cfac587cd4c` | No UI/UX issue found.
- `019d2a13-5d6c-7892-9f2b-9143113463b0` | UI/UX issue found. Problem: initial room landing with existing history did not snap to bottom. Attempted fix: wait for hydration readiness before the one-time bottom anchor. Status: resolved.
- `019d2a18-e89c-7402-a092-ea24306a0b30` | No UI/UX issue found.
- `019d2a3f-2705-7810-a0e0-a2281881a606` | UI/UX issue found. Problem: relaunch auto-scroll happened only once instead of on every fresh open. Attempted fix: several approaches explored. Status: no clearly landed final fix in this thread.
- `019d2a5e-1106-7c10-8ed8-d24fecd9c0e2` | No UI/UX issue found.
- `019d2a6b-4331-7e60-8d5e-6eb8313f2035` | No UI/UX issue found.
- `019d2a76-7c01-75e2-9512-1c6b1a8481a8` | No UI/UX issue found.
- `019d2a78-0c79-7d23-a260-1d2d2b4d0f7c` | No UI/UX issue found.
- `019d2aa5-4b64-7890-a99a-b7a0e02c4849` | No UI/UX issue found.
- `019d2aa8-b553-75d1-8de2-7272a0eaaea5` | No UI/UX issue found.
- `019d2ab1-9dd3-70a2-8874-9ad4df97e088` | No UI/UX issue found.
- `019d2b2e-91d2-7c70-90b5-09043b6c4ff2` | No UI/UX issue found.
- `019d2ec9-a8b1-7cd3-bb6e-b3fff0775f0b` | No UI/UX issue found.
- `019d2f8d-a163-7082-93a1-fcf44ead13fd` | No UI/UX issue found.
- `019d2f95-6e34-7013-8961-35857fe8f51d` | No UI/UX issue found.
- `019d2ff6-1b7a-7441-9d56-992703b1d40f` | No UI/UX issue found.
- `019d303e-8684-7980-9772-221f9bb459c8` | No UI/UX issue found.
- `019d306f-3d86-7671-90c4-a569ee988857` | No UI/UX issue found.
- `019d3706-7b91-7241-9c9f-bbb6a1fa5b1c` | No UI/UX issue found.
- `019d3709-051d-7301-b2a0-02c38a0e0985` | No UI/UX issue found.
- `019d3726-7648-7163-9172-856e52a90fae` | No UI/UX issue found.
- `019d389c-fdd9-7361-be90-b54449317e69` | No UI/UX issue found.
- `019d391d-4b31-7ad1-91f2-03a3dcb90001` | UI/UX issue mentioned, but this thread is only a shadow summary of another conversation. No standalone fix was performed here.
- `019d3989-cd8b-75d3-b8da-c60918a4ba01` | UI/UX issue mentioned, but this thread is only a Telegram summary/handoff. No standalone UI/UX fix was completed in this session.
- `019d3d5d-7670-79a3-98fb-4aa6c0e1367b` | No UI/UX issue found.
- `019d3d66-33ad-7563-b95c-43a4cebb7018` | No UI/UX issue found.
- `019d3d66-a204-7531-8218-7d9f34ba5e6b` | No UI/UX issue found.
- `019d3d67-0539-73d2-8ccc-2830c27de92b` | No UI/UX issue found.
- `019d3e77-4298-7e60-b031-2cb46546bafd` | No UI/UX issue found.
- `019d4364-53e0-7df3-8573-c108b28db591` | No UI/UX issue found.
- `019d4369-1572-77f2-ab69-44b4a7348af1` | No UI/UX issue found.
- `019d4388-488a-78d3-9cc3-046fa784890c` | No UI/UX issue found.
- `019d4398-a433-7652-a450-2704223b9242` | UI/UX issue mentioned only indirectly. The captured action here was mainly auth/config cleanup (disable noisy web Apple OAuth wiring); no standalone UI bug was resolved here.
- `019d43a0-9cba-7df0-afc4-91103077efe8` | No UI/UX issue found.
- `019d43a0-d5ec-7fd1-94b1-884dcea6de65` | UI/UX issue found. Problem: iOS banner/runtime debugging expanded into a hydration mismatch around render-time Date/Intl formatting. Attempted fix: banner/runtime work landed, but the hydration mismatch itself was only diagnosed. Status: mixed.
- `019d43a3-c1e7-7600-858d-64964413a683` | UI/UX issue found. Problem: tab/body chrome tuning also exposed My Page scroll-chain bugs and spacing issues. Attempted fix: confine scrolling to internal content and contain overscroll. Status: resolved.
- `019d43ae-bb58-7202-80ff-dfaa9ef50e68` | UI/UX issue found. Problem: branch-level bottom-tabs work continued banner/layout/ad polish. Attempted fix: this session is mostly a meta/summary handoff, not a standalone fix thread. Status: no independent verdict beyond the linked implementation threads.
- `019d4785-e9ae-7251-901a-522eb61b1b1b` | UI/UX feature/polish request only. Focus: planning how to split the large social-style UIUX branch into a smaller release train.
- `019d482b-5732-7533-b684-9a706ecd36a3` | UI/UX feature/polish request only. Focus: review/planning of the multi-conversation branch structure; no standalone bug fix in this thread.
- `019d4868-b7ff-7743-8246-76ea234a0773` | No UI/UX issue found.
- `019d4caf-4787-77f2-9e97-a7695630b6d2` | UI/UX issue found. Problem: mic-permission denial recovery felt bad and could strand users in a failed state. Attempted fix: reset back toward retryable/idle behavior. Status: later resolved across follow-up permission-retry threads.
- `019d4d16-3c07-7c91-b787-66f177fbfc1f` | UI/UX issue found. Problem: banner/ad placement and scene transitions broke across room/list/drawer/menu states. Attempted fix: explicit banner zones and runtime-param preservation. Status: resolved.
- `019d4d1e-bf31-7550-8116-f2654014ec7c` | No UI/UX issue found.
- `019d4dc4-914e-7912-aae5-b8021b4973cf` | No UI/UX issue found.
- `019d4e35-c559-7232-ae76-6b5ab334f0b8` | No UI/UX issue found.
- `019d4eb1-8d6b-7192-8ffb-22deeead662c` | No UI/UX issue found.
- `019d4eba-14af-7523-ad3c-0f5a5b3a810b` | UI/UX issue found. Problem: forced WebView reload/flicker could leave STT still running while room metadata/status looked reset or stale. Attempted fix: native/WebView state-reconcile work. Status: issue clearly existed; exact final closure is spread across follow-up reconcile threads.
- `019d4f37-af30-7872-bc3a-4f68be0fabd6` | UI/UX issue found. Problem: Android could show a stopped/orange run button while STT was still actually running. Attempted fix: diagnosis of native/WebView state split only. Status: unresolved in this thread.
- `019d4f51-c903-7e73-a4f0-f1d1d42bcbba` | No UI/UX issue found.
- `019d5430-7b59-78a2-8ced-f6488ba97e7e` | No UI/UX issue found.
- `019d56dd-4efc-7131-84f3-fb54707d0fdd` | UI/UX feature/polish request only. Focus: add per-bubble copy buttons and narrower bubbles. This later got reversed by thread 019d5714 because the result felt too noisy.
- `019d5706-019e-7aa2-af37-3a7c53eb31b1` | No UI/UX issue found.
- `019d5714-6710-7343-b2a8-b4faa797c702` | UI/UX issue found. Problem: per-bubble copy buttons made the conversation UI visually noisy. Attempted fix: keep only whole-utterance copy and use selection/long-press plus toast for the rest. Status: resolved.
- `019d636a-628d-7f60-8936-e9e2637a026c` | No UI/UX issue found.
- `019d6713-37ce-7720-9faa-73c92e919e97` | No UI/UX issue found.
- `019d6724-7531-79e1-8f01-d5009d91318f` | No UI/UX issue found.
- `019d6737-7b85-7080-bce8-dccb05377c6e` | UI/UX feature/polish request only. Focus: messenger-style keyboard input bar with animated mode toggle; not a bug thread.
- `019d6c60-8f36-74e0-9be6-c4af43d77204` | No UI/UX issue found.
- `019d6c8e-0f4b-7742-a086-9fdb21cc62d7` | No UI/UX issue found.
- `019d6d01-77d8-7ed1-b8d3-b512139ecd15` | No UI/UX issue found.
- `019d6d47-cbeb-7a01-9349-8ad7b520919b` | No UI/UX issue found.
- `019d6d6d-cd79-71b0-99e5-c0296b0adeae` | UI/UX issue found. Problem: keyboard-mode composer could grow but not shrink back. Attempted fix: immediate remeasurement/shrink synchronization plus tests. Status: resolved.
- `019d6d6f-b9c2-7343-b4f8-aeaa753c3f1c` | No UI/UX issue found.
- `019d6d79-cfda-70d2-b96c-19522f7edfbc` | UI/UX feature/polish request only. Focus: translation-model dropdown badges and wider opened menu layout.
- `019d6d85-612d-7622-909b-b22f7a04681b` | No UI/UX issue found.
- `019d6d99-14df-7910-827a-26d32cc47d39` | UI/UX issue found. Problem: keyboard mode added too much bottom margin when the banner position was bottom. Attempted fix: subtract non-covering clearance and later fix native inset reporting. Status: resolved.
- `019d6da8-8dde-7f32-be86-7f473baf85ba` | No UI/UX issue found.
- `019d6db1-d0e3-7722-bd33-27c2ec279816` | No UI/UX issue found.
- `019d6dbd-f288-74e1-9afa-f98dbd8c74fa` | No UI/UX issue found.
- `019d6dc3-9387-7781-af63-4fb1286d9670` | UI/UX feature/polish request only. Focus: add a full-delete action and confirm modal inside the drawer menu.
- `019d6f80-a10d-7b10-ac88-4dd9ad89e780` | No UI/UX issue found.
- `019d6f81-c484-7ca3-8d8e-35eda0d82a5b` | UI/UX issue mentioned in the opener, but this captured session ended as worktree cleanup only. No standalone UI/UX fix recorded here.
- `019d6f82-c1a0-7d70-8577-894e00b96f24` | UI/UX issue mentioned in the opener, but this captured session ended as worktree cleanup only. No standalone UI/UX fix recorded here.
- `019d6f83-3566-78f1-bfea-c78a915dca28` | UI/UX issue mentioned in the opener, but this captured session ended as worktree cleanup only. No standalone UI/UX fix recorded here.
- `019d6f83-810e-7573-ae59-bae9a403a787` | UI/UX issue found. Problem: i18n coverage was fragmented and non-ko/en/ja locales were getting dropped. Attempted fix in this captured session was planning/review only. Status: issue identified, no standalone implementation in this exact thread.
- `019d6f86-9cff-73a1-b425-1b407e9f82d5` | UI/UX issue found. Problem: voice-to-keyboard transition stuttered. Attempted fix: unify clearance/composer settling so the layout drops in one smooth pass. Status: resolved.
- `019d7003-dbb6-7801-a8d9-649857671dbc` | No UI/UX issue found.
- `019d7151-fed2-75a1-8efe-69fc947979f4` | No UI/UX issue found.
