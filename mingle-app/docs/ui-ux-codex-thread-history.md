# Mingle App UI/UX Codex Thread History

One entry per UI/UX fix, newest first. This is the only copy; add new entries here.

## 2026-10-29 — Conversation list header (2.2.0+): search, bell, gear instead of compose

- Surface: `AppTopHeader` on the conversation list (posting-feed clients, 2.2.0+) in `conversation-list.tsx` and `app-top-header.tsx`.
- Issue: The shared posting header replaced the list's old header on 2.2.0, so the gear menu (sort order, app update card and its dot) disappeared from the list, while the list got a compose button that the feed and My page already have.
- Resolution: The list header is now search, bell, gear. `AppTopHeader` takes an optional `onCompose` (the feed still passes it) and a `trailing` slot; the gear menu is one `settingsMenu` element shared by both list headers. The list no longer mounts its own compose overlay.
- Verification: Header order test, type check, lint and the component/lib/API suites. Not tried on a device yet.

## 2026-10-29 — Conversation list: no transparent tap guard while the session loads

- Surface: `conversation-list.tsx` (the `z-[199]` layer added on 2026-08-26 and capped at 3 s by #299).
- Issue: While next-auth checked the session, a transparent full-screen layer swallowed every tap on the cached list. The check has no timeout, so a stalled request left nothing tappable.
- Resolution: The layer and its 3 s timer are gone; the cached list takes taps at once. Writes wait for the session instead of the UI blocking: queued room mutations (rename, delete/leave, status, languages, read) already flush only once authenticated and are adopted from the tracking owner to the user, and the two writes sent straight to the server (create a room, enable sharing) now await `waitForSessionSettled()` first and stop if signed out (the sign-in screen covers the list then). No new UI: such a tap just takes a little longer.
- Verification: Type check, lint and the component/lib suites. Not tried on a device yet.

## 2026-10-29 — Export chat from the room menu as a .txt file

- Surface: Room hamburger menu "Export chat" item (`LivePhoneDemo.tsx`, `conversation-export.client.ts`), `GET /api/{ns}/conversations/[id]/export` (unversioned, ios/android v2.0.0, v2.1.0, v2.2.0; 2.1.1 reaches it through the v2.1.0 rewrite).
- Feature: The server writes every visible message of the room, oldest first, as `[YYYY-MM-DD HH:mm] Name`, the original text, and an indented `(lang) translation` line in the reader's display language only (skipped when the message is already in that language). Header: room title, active participants, export time with the time zone. Photos are `[Photo]`; unsent messages are left out. Labels in 15 locales (`conversation-export-copy.ts`); times in the device's time zone; capped at 50,000 messages.
- Delivery (web only, no app release needed): the share sheet with the file where Web Share accepts files (iOS); if the tap expired during the fetch, a toast offers a Share button; a file download in desktop browsers; the clipboard inside the app when neither works (Android WebView has no Web Share). A native share bridge for Android is planned for the next app version.
- Verification: Unit tests for the text format, translation pick, time zone fallback, file name and copy; type check, lint and the full suite; exported a real room from the local database. Not tried on a device yet.

## 2026-10-29 — Long press in a room no longer selects text; app update card in the conversation-list settings menu

- Surface: Chat message list (`chatViewportStyle` in `LivePhoneDemo.tsx`) and the gear menu at the top right of the conversation list (`conversation-list.tsx`).
- Issue (selection): Long-pressing a bubble to open its menu often selected nearby text instead, as if dragged with a mouse: language dividers, read receipts, times and the expand/collapse toggle. The bubble itself is `user-select: none`, but its surroundings were selectable, and iOS WebKit's long press picks the nearest selectable text.
- Resolution (selection): The whole chat scroll container is `user-select: none` with `-webkit-touch-callout: none`. Copying still goes through the bubble menu. The list has no inputs, so nothing typed there is affected.
- Feature (update): The gear menu shows the same app update card as the room menu and My page (installed version, latest version, status and an Update button that opens the store), in the native app only. An amber dot on the gear shows when an update is available. The card, its content and the store-opening command now live in `native-app-update-card.tsx` and are shared by all three screens.
- Verification: Unit tests for the card content; type check, lint and the component suites passed. Not yet tried on a device.

## 2026-10-01 — Photo viewer: label fit, progress, drag-away backdrop and paging through the room's photos

- Surface: Full-screen photo viewer (`ConversationImageViewer.tsx`, `ZoomableConversationImage.tsx`, `PhotoTranslationOverlay.tsx`, `photo-translation-geometry.logic.ts`, `photo-viewer-pager.logic.ts`). The viewer moved out of `ConversationImageBubble.tsx`; the bubble only opens it.
- Issue (labels): Translated labels were the wrong size and place. A paragraph was padded by 15% of its whole height, so its patch ran past the photo and the text, centered on that patch, was cut off at the edges; the translation kept the photo's line breaks (orphan words); alignment came from unrelated blocks anywhere in the photo; sideways text (a chart's y axis) became a tall box with tiny text; a translation longer than its original ("된장찌개" -> "Soybean Paste Stew") overflowed its patch.
- Resolution (labels): Padding is 15% of one line, capped at 4% of the photo's shorter side, and the patch is kept inside the photo. Text turned 60 degrees or more is a quarter turn and is laid out along its long side. A translated paragraph is reflowed when the source lines look like a wrapped paragraph (long lines of similar width); lists keep their breaks. One-line labels borrow the empty room beside them in their row, up to the neighbouring blocks, along the photo's alignment. Alignment is what the OCR model read (new `align` field, optional so earlier photos still work); without it only blocks within three line heights vouch for an edge, and a paragraph starts at its reading edge. Wrapping labels use `text-wrap: balance`, set only for wrapping text because the shorthand would otherwise reset `white-space: nowrap`.
- Issue (OCR): gpt-6-luna as the OCR model (merged in the previous change) put boxes in the wrong place on dense photos; see the OCR default change for the measurements. The OCR prompt now skips letterless blocks and asks for alignment.
- Issue (progress): Nothing said that a photo was still being read or translated.
- Resolution (progress): While the shown language is translating, the pill says "Translating…" (the spinner alone was easy to miss) and each block being translated shows a shimmering placeholder where the text will go, which cross-fades into the label. While the server is still reading the photo's text (status pending) a status chip and a soft scan sweep show instead of the pill. No status for the first answer in flight or for photos without text, so fast answers do not flash.
- Issue (drag away): Swiping the photo down left the viewport's own black rectangle behind it while the backdrop faded.
- Resolution (drag away): The viewer is full screen and its viewport has no background, so the dialog backdrop is the only dark layer; the backdrop, close button, counter, arrows and pill fade with the drag, and the photo is no longer clipped at the viewport's edge.
- Feature: The viewer opens on all of the room's loaded photos in conversation order (`ConversationImageGalleryProvider` around the chat list; screens without it open one photo). A horizontal drag at base zoom turns the page (20% of the width, capped at 140 px, or a flick), with edge resistance; only the neighbours stay mounted; the photo on screen is tracked by message so older photos loading above do not change it. Counter ("2 / 5"), arrow buttons for mouse pointers only, and Left/Right keys (not while the translation menu is open). Translation data is fetched only for the photo on screen. A photo that fails to load shows a retry inside its slide instead of closing the viewer. Only photos already loaded in the chat are included; older ones appear after loading older messages.
- Verification: Unit tests for the geometry, pager math, gallery collection, progress rule, copy for 15 locales and source contracts. Rendered in headless Chrome with real OCR and translation output of a dense chart reproducing the reported screenshot, a menu, a poster, a sign and an app screenshot; drove touch gestures (page turn at 130 px, spring back at 40 px, flick, edge resistance, drag-down dismiss) and checked the translating and reading states. Not tested on a physical iOS or Android device or in WKWebView.

## 2026-09-30 - Make operator badges tappable across chat surfaces

- Surface: Operator names in chat bubbles, room headers and lists, participant rows, and reaction-participant lists.
- Issue: W4's chat badge was a static span, so it could not open the W3 explanation sheet. Putting the shared button inside the existing full-row profile or room buttons would also create nested buttons and steal the badge tap.
- Resolution: `ChatAccountBadge` now adapts the shared `AccountBadge`, including its localized explanation sheet and 44px hit area. Participant and conversation rows use `IdentityRow` so the profile/room action stays under the row content and the badge remains its own button. Conversation-row long-press handling ignores badge touches. The reaction list yields Escape and focus handling while the badge sheet is active.
- Verification: Focused badge tests and the integrated web unit suite passed. Final type and local database checks are recorded in the operator runbook. No server or physical-device run was performed.

## 2026-09-30 — Gemini Flash as the default TTS model; tts_model stays NULL until chosen

- Surface: Room settings menu "TTS model" row (`src/components/LivePhoneDemo/LivePhoneDemo.tsx`) and the TTS model default in `src/lib/tts-models.ts`.
- Issue: The default TTS model was Inworld, and the client wrote the displayed default into `app_users.tts_model` on any account-preferences PATCH (speaker toggle, input mode, text size, ...). A later change of the default would never reach those users.
- Decision: The default is now `gemini-3.8-flash-tts`; Inworld stays the automatic fallback when a Gemini synthesis fails. `tts_model` NULL means "follow the server default": GET `/api/account/preferences` returns `ttsModel: null`, the client keeps `null` through hydration and the local cache, and PATCHes and TTS requests omit `ttsModel` while it is `null`.
- UI: The row shows the effective model (`ttsModel ?? DEFAULT_SELECTABLE_TTS_MODEL`) with the same look and checkmark as before, so a user who never picked sees `gemini-3.8-flash-tts` selected. Tapping any option, including the one shown as the default, is an explicit choice and is persisted (with the usual pending-sync retry when offline).
- Verification: Unit tests cover the Gemini default and Inworld fallback, GET returning null for a NULL column, null surviving hydration/cache/reload, PATCH omitting `ttsModel` after a speaker or text-size change and including it after an explicit selection, and TTS requests omitting it while null. Not yet tested on a device.

## 2026-09-30 — Gemini TTS pace matched to Inworld and a male Korean voice

- Surface: TTS playback (bubble tap `/tts/inworld` and inline finalize audio), server-side in `src/server/api/shared/tts-provider.ts`, `src/server/api/shared/audio-dsp.ts`, and `src/server/api/shared/inworld-voice.ts`. No client change.
- Issue: With Gemini 3.8 Flash TTS as the default, Korean playback sounded clearly slower than Inworld (speakingRate 1.3) and used the female `Kore` voice. Gemini clips also carried about 0.27 s of silence at each end.
- Measurement (live, 7 chat lines in ko/en/ja): Gemini Korean speech ran 1.12-1.73x Inworld's duration (mean ~1.4x) with every voice tried; English (~0.83x) and Japanese (~1.0x) were already at Inworld's pace or faster. The Interactions API has no speed field in `speech_config`, and TTS models refuse `system_instruction` (400 "Developer instruction is not enabled for this model"). A `speech_metadata.style` pace hint was never read aloud but over-shot (0.53-0.94x) and raised pitch, so it was not used.
- Decision: Gemini audio is trimmed to about 80 ms of leading/trailing silence and time-stretched on the server with pitch-preserving WSOLA (pure TypeScript, no ffmpeg or native binary, about 10-20 ms per clip). The default factor is 1.4 for Korean and 1 elsewhere; `GEMINI_TTS_SPEED` overrides it (`1.2`, or `ko=1.4,ja=1.1,*=1`). Korean now uses the male Seoul-Korean library voice `ko-kr-csagent-11` (median F0 ~130 Hz); other languages keep `Kore`. `GEMINI_TTS_VOICE_<LANG>` overrides one language and `GEMINI_TTS_VOICE` still sets the default for languages without their own voice. Inworld Korean pins the male `Seojun` (F0 ~100 Hz) instead of relying on the voice-list order.
- User impact: Korean Gemini speech now lands at 0.92-1.08x Inworld's duration (mean ~1.02x) in a male voice; English and Japanese are unchanged apart from the shorter silence. A Gemini transcription of every output matched the input text exactly (no instruction leakage).
- Verification: Unit tests cover WAV parsing, silence trimming, WSOLA length ratio and pitch (sine within 3%), per-language voice/speed resolution and env overrides, the request body, and the Inworld Korean pin. The full web unit suite (197 files, 2,017 tests), `tsc --noEmit`, and ESLint on the touched files passed. Not yet tested on a device.

## 2026-09-30 — Resume and integrate mobile admin operator tools

- Context: Work stopped after the shared groundwork and the shell, account-creation, and staff-alert tasks were merged into `feat/admin-operator-accounts`. Non-chat badges and chat disclosure were completed on separate branches; inbox and scheduled-post implementations remained uncommitted in their worker worktrees.
- User decision: Show age on profiles. Public profile APIs and shared profile links now expose a server-calculated age, never the original birth date. Missing, invalid, and future dates render no age. The same localized presentation applies to ordinary and operator accounts.
- Identity disclosure: Operator identity flags are carried through profile, feed, comments, search, notification, follower/member, and conversation payloads. Operator badges use the shared explanation sheet. Parent profile/conversation/member buttons are restructured to avoid nested controls. Rooms and public conversation viewers retain the operator disclosure notice.
- Admin navigation: Four bottom tabs provide inbox, accounts, posts, and more. Successful login defaults to the inbox while preserving an explicit valid admin return path. The inbox tab refreshes its unread count on navigation, focus, visibility, read events, and a 20-second polling fallback.
- Account creation: Staff review country-specific profile drafts before creation and assign uploaded avatars. Approved bios are saved with account creation so a process restart cannot discard a waiting source bio. Translation remains in the bounded background queue.
- Inbox: Conversation cards, account filtering, message/photo bubbles, administrator-only Korean translation, replies in the selected operator's primary language, and read-state updates use the operator-scoped server APIs. The admin room includes a sticky composer with visual-viewport keyboard handling. Text-send alerts are moved after the response so staff push delivery does not delay the user's send.
- Posts: Staff preview primary-language conversion, assign operator-owned photos, select immediate or scheduled publication, and view/cancel queued jobs. The default spreads posts over six hours with per-account spacing. The worker publishes through the existing publication service with atomic claims and retries. Post screens now use the shared admin scroll container instead of nesting a second viewport-height scroll area below the admin header and tabs.
- Verification scope: Unit and database checks run against local resources only. No devbox, development servers, production migration, or physical-device acceptance is performed during this continuation. Phone keyboard behavior, photo uploads, actual AI output, and push delivery remain live acceptance items.

## 2026-09-30 — Gemini TTS asked to speak fast in every language; new Korean male voice

- Surface: TTS playback (bubble tap `/tts/inworld` and inline finalize audio), server-side in `src/server/api/shared/tts-provider.ts`. No client change.
- Report: After the 1.4x time-stretch shipped, Korean playback still sounded too slow in a same-take A/B (original / 1.2x / 1.4x). The goal changed from "match Inworld" to "fast speech that stays clear", for every language.
- Measurement (live, 7 chat lines in ko/en/ja, 2 takes for finalists, every output transcribed by Gemini and compared with the input): the structured `speech_metadata.style` annotation is never read aloud. "speaking rapidly" and "speaking very fast" gave the same Korean pace (~0.74x Inworld's duration); "quick, fast-paced delivery" was slower (~0.83x). In the calibration round all three pushed a short Japanese line to 0.44-0.52x and it was misheard ("明日の会議" came back as "明日の講義" or "朝の会議"). "slightly faster than normal pace" kept Japanese at 0.58-0.81x with exact transcripts in all three takes. Under the fast style `ko-kr-csagent-11` rose to 133-161 Hz; of five low-pitch Korean male voices, `ko-kr-csagent-8` was the lowest and steadiest (median 137 Hz, 8 of 9 takes under 150 Hz).
- Decision: Every Gemini request now carries `speech_metadata.style` = "speaking rapidly"; Japanese uses "slightly faster than normal pace". `GEMINI_TTS_STYLE` replaces the style for every language (`none` turns it off), and `GEMINI_TTS_STYLE_<LANG>` overrides one language. Korean switches to `ko-kr-csagent-8`. The time-stretch is off by default for every language (`GEMINI_TTS_SPEED` still enables it); the silence trim stays, and trim-only output is now bit-exact.
- User impact: Korean Gemini speech is about 0.78x Inworld's duration (about 1.3x faster than the 1.4x-stretch build), English about 0.56x and Japanese about 0.69x, all with exact transcripts. Request latency dropped from about 3.6 s to about 2.6 s (mean over the same 7 lines), because a faster reading returns less audio.
- Verification: Unit tests cover the default and per-language styles, `GEMINI_TTS_STYLE` / `GEMINI_TTS_STYLE_<LANG>` overrides and `none`, the request body with and without the annotation, the new Korean voice, tempo 1 by default with `GEMINI_TTS_SPEED` still stretching, and bit-exact trim-only output. The full web unit suite (197 files, 2,026 tests), `tsc --noEmit`, and ESLint on the touched files passed. Not yet tested on a device.

## 2026-09-30 — 이어폰 모드: 세션마다 한 언어(L)의 번역만 읽고, 켤 때 안내창에서 그 언어를 고른다

- 화면: 이어폰 모드 자동 읽기(`src/components/LivePhoneDemo/live-phone-demo.earphone-mode.logic.ts`, `live-phone-demo.earphone-auto-read.ts`), 켤 때(off → on)마다 뜨는 안내창(`EarphoneModeNotice.tsx`, `LivePhoneDemo.tsx`), 방의 기본 표시 언어 페이지(행만 `LanguageRadioOption.tsx`로 분리). 브랜치 `feat/earphone-mode`, 웹만 변경.
- 이전 동작: 자동 읽기는 메시지마다 접힌 말풍선이 보여 주는 언어를 그대로 읽었다(수동 탭과 같은 텍스트·언어). 그래서 내가 한국어로 말한 문장도 한국어 원문으로 다시 읽었고, 번역이 없는 메시지는 원문 언어로 읽는 등 메시지마다 읽는 언어가 달라질 수 있었다.
- 결정(사용자 최종):
  1. 이어폰 모드 한 세션에 TTS 언어 L은 하나. 기본 L = 이 방에서 지금 보는 표시 언어. 접힌 말풍선과 같은 `resolveInitialDisplayLanguage`(방 멤버 `display_language` / 솔로 방 `default_display_language` → 사용자 기본 언어, 방 언어 안에서만 → 없으면 방의 첫 언어)를 방 언어 목록에 그대로 적용한다(`resolveEarphoneModeDefaultReadLanguage`). 새 규칙을 만들지 않고 재사용.
  2. 자동 읽기는 L 번역만 읽는다. 원문이 L인 메시지는 읽지 않는다(사용자가 이미 이해함, 내가 L로 말한 문장 포함). 번역이 끝났는데 L이 없으면 건너뛴다. L 번역이 아직 오는 중이면 지금처럼 기다린다(15초 stall 규칙 그대로). 수동 탭 듣기는 그대로.
  3. 켤 때마다 뜨는 안내창에 언어 선택을 넣는다. 선택지 = 방 언어(방 표시 언어 페이지와 같은 목록·이름), 기본 선택 = 기본 L. 문장 "한국어로 번역된 모든 문장을 한국어 음성으로 들려드려요. 한국어로 말한 문장은 읽지 않아요."는 선택을 바꾸면 바로 바뀐다. 기존 줄(이어폰·헤드셋 착용 시에만 동작, 지금 연결 안 됐으면 연결하면 시작)은 유지.
  4. 어디에도 저장하지 않는다(마이그레이션·localStorage 없음). 모드가 켜져 있는 동안만 유지하고, 껐다 켜면 다시 방 표시 언어부터 시작한다. 방이 바뀌거나 L이 방 언어에서 빠지면 기본 L로 돌아간다.
  5. UI는 새 스타일·시안 없이 방 표시 언어 페이지의 행을 그대로 쓴다.
- 판정 규칙(`classifyEarphoneModeUtterance`): 사진·빈 메시지·내 메시지 스위치 → 초안이거나 번역 대기(`translationStatus`)면 대기 → 원문이 L이면 번역이 도착한 뒤 `source_language`로 건너뜀(도착 전에는 번역 결과가 원문 언어를 다시 판정할 수 있어 대기) → L 번역이 확정이면 읽음 → 번역이 끝났는데 L이 없으면 `missing_language`로 즉시 건너뜀(큐를 막지 않음) → 그 밖(L 번역이 오는 중·스트리밍 중)은 대기. "번역이 끝남" = 번역 대상 언어가 없거나, 확정된 번역이 하나 이상 있고 스트리밍 중인 번역이 없음. 번역은 한 묶음으로 도착하므로(서버는 SOURCE와 TRANSLATION_FINAL을 한 트랜잭션에 쓰고, 내 메시지는 durable finalization 결과가 한 번에 옴) 이때 없는 L은 더 오지 않는다.
- 읽는 대상(`resolveEarphoneModeReadTarget`): 말풍선이 쓰는 대상 언어 목록·키(`buildTargetLanguagesForUtterance`, `findDisplayTranslation`, 중국어 간체/번체 포함)로 L 번역 행을 찾아, 그 행을 수동 탭했을 때와 같은 텍스트·언어·playbackKey(`translation:<id>:<l>`)로 읽는다.
- 세션 언어 보관: `LivePhoneDemo`는 안내창에서 고른 값만 React state(`earphoneModeReadLanguagePick`, 고른 방의 키 포함)로 들고 있고, 이어폰 모드 on/off가 바뀌면(이 방·다른 방·다른 탭 모두, `subscribeEarphoneModePreference`) 비운다. 실제 L은 `resolveEarphoneModeReadLanguage`: 고른 값이 이 방 것이고 아직 방 언어면 그 값, 아니면 기본 L. 고르지 않았으면 L은 방 표시 언어를 따라간다. 저장소에 쓰는 것은 기존 on/off 키(`mingle_earphone_mode_enabled`) 하나뿐.
- 켜진 상태에서 L이 바뀌면(안내창에서 변경, 기본값으로 복귀) 컨트롤러가 아직 큐에 있는 항목을 새 L로 다시 판정한다(옛 언어로 받던 오디오 요청은 취소). 이미 읽었거나 건너뛴 항목은 그대로 둔다.
- 문구: `src/i18n/live-phone-demo-earphone-mode-copy.ts`에 15개 로케일의 언어 문장 함수와 목록 제목(ko "들려드릴 언어")을 추가했다. 언어 이름은 앱의 `getSttLanguageDisplayName`을 문구와 같은 로케일로 부른다(확장 로케일은 영어 문장 + 영어 이름). 한국어는 마지막 음절 받침으로 '로/으로'를 고른다(예: "중국어(대만)으로"). 러시아어는 격 변화 때문에 두 번째 언급을 "на этом языке"로 썼다. 예전 둘째 문장("켜져 있는 동안 새 메시지를 소리 내어 읽어 드립니다")은 새 언어 문장이 대신해 모든 로케일에서 뺐고, 한국어 기존 두 줄은 사용자 예시 문장에 맞춰 해요체로 바꿨다("…동작해요.", "…연결되어 있지 않아요. …읽기 시작해요.").
- 안내창 순서: 제목 → 이어폰 착용 시에만 동작 → L 문장 → (미연결일 때) 연결하면 시작 → "들려드릴 언어" + 언어 목록(`role="radiogroup"`, 제목으로 `aria-labelledby`) → 확인. 목록 행은 방 표시 언어 페이지와 같은 `LanguageRadioOption`(국기, 이름, 체크, 선택 시 amber 테두리)이고, 표시 언어 페이지 모양은 바뀌지 않는다.
- 알려진 한계: L이 접힌 말풍선의 언어와 다르면 자동 읽기 표시기("…"·재생 막대)는 L 번역 행에 붙으므로 펼친 보기에서만 보인다. 같은 메시지의 다른 언어 행을 수동으로 탭해도 L 항목은 큐에 남아 뒤이어 L로 읽힌다(키가 같을 때만 수동 탭이 자동 항목을 소비). 안내창이 열린 몇 초 사이 옛 L 기준으로 건너뛴 메시지는 L을 바꿔도 되살리지 않는다. 실기기 확인은 아직 안 했다.
- 검증: 새·수정 테스트를 HEAD(`9d30dfb6`) 구현에 돌려 19개 테스트 실패와 2개 파일(안내창 렌더, 배선) 로드 실패를 확인했다(원문=L 건너뛰기, L 없음 즉시 건너뛰기, L 번역 선택, 기본값 해석과 접힌 말풍선 일치, 선택 비저장·세션 리셋, 켜진 중 L 변경, 안내창 목록·문장). 새 구현에서는 전체 웹 유닛 스위트 206개 파일 / 2,174개 테스트, `tsc --noEmit`, 변경 파일 ESLint가 통과했다.

## 2026-09-30 - iPhone Bluetooth speech input barely recognized in earphone mode (investigation)

- Report: While testing PR #246 on a physical iPhone 14, speech input rarely produced text; one utterance was recognized as French. The same earphone microphone worked in an online meeting immediately beforehand. The earphone model has not yet been supplied.
- Checkout: `feat/earphone-mode`, starting at `fb4c047e`. The existing devbox device profile serves web/STT/messaging on ports 16278/18278/20278. No service restart was performed during this investigation.
- Confirmed transport: The 18:47:33-18:48:29 session received and forwarded 357 PCM chunks (1,462,272 bytes), with no queued chunks. A following 194.3-second session forwarded 1,480 chunks (6,062,080 bytes). This establishes transport, not microphone signal quality or recognition accuracy.
- Confirmed route: iPhone CoreAudio logs at 18:47:33 report Bluetooth SCO input at 16,000 Hz, mono, and recording enabled/unmuted. They also report an internal Float32 converter from 16,000 to 48,000 Hz. An internal converter does not establish the format transmitted to Soniox. Existing application NSLog fields were private in the retrieved log archive, so the provider's declared rate and signal amplitude could not be read.
- Code findings: Earphone-mode route classification reads the audio route and does not select the microphone. The STT session options and capture implementation predate this feature. Automatic earphone playback uses the existing TTS path, which shares AVAudioSession and preserves its mode while STT owns it. Both Bluetooth input and A2DP output are allowed; the observed recording route uses SCO. Current web AEC is fixed off.
- Outstanding code risk: STT declares the initial input format's sample rate once, while route/engine restarts and AEC changes can install another tap format without resampling or reconfiguring the provider. A rate change can therefore make the stream inconsistent. No mismatch has yet been demonstrated for the reported session; do not attribute this incident to that risk without actual buffer/config evidence.
- Diagnostic change: Added public structured `STTAudio` logs for audio-session input/output port types, hardware rate, mode/AEC, initial provider sample rate, tap format, actual buffer rate/frame count, and accumulated RMS dBFS/peak amplitude (first chunk and every 20 chunks). No speech samples, transcript, device names, or conversation identifiers are logged by these diagnostics.
- Verification: Release iOS build succeeded and the diagnostic app was installed on the same iPhone at 20:11 KST. Built app version is 2.1.0 and API namespace is ios/v2.1.0. Automatic launch was denied because the device was locked. USB syslog connectivity is currently unavailable, although CoreDevice can still reach the phone. Recognition acceptance and root cause remain pending a fresh physical-device reproduction and readable diagnostics.
- Follow-up: Reproduce 10 seconds of Korean speech using the same earphones. Compare actual buffer rate with the declared provider rate and RMS/peak while speaking. Then compare earphone mode on/off while retaining the same physical route, and built-in input if necessary. A UI toggle comparison alone does not compare different microphones.

## 2026-09-30 — Install source line in the app-update card

- Surface: The app-update card on My Page (`NativeAppUpdateCard` in `src/components/my-page.tsx`) and the same card in the room settings menu (`src/components/LivePhoneDemo/LivePhoneDemo.tsx`). `LivePhoneDemoLegacy.tsx` is unchanged.
- Issue: The card showed the installed and latest versions but not where the running build came from, so an App Store, TestFlight, Google Play, or devbox install of the same version looked identical in screenshots and QA reports.
- User impact: Every user now sees one extra line directly under the installed version, for example "설치 경로 TestFlight" / "Installed from TestFlight". The values are App Store, TestFlight, Google Play, "로컬 빌드 (devbox)" / "Local build (devbox)" (devbox, Xcode, and adb installs), and "기타 경로" / "Other source". Store names stay in English in every locale, and all 15 app-update copy locales have the label and values.
- Resolution:
  - One value list (`app_store`, `testflight`, `play_store`, `local`, `other`) and `normalizeInstallSource()` live in `src/lib/native-app-install-source.ts`. The web app imports it directly, and the RN shell imports it through a relative path (`rn/src/appUpdateStatus.ts`), the same way RN already imports the shared locale modules, so both sides accept exactly the same values.
  - Detection sits in the existing `NativeRuntimeConfigModule` `runtimeConfig` constants, with no new module or dependency. Android reads the installer package (API 30+ `getInstallSourceInfo().installingPackageName`, otherwise the deprecated `getInstallerPackageName`, and an exception counts as no installer): `com.android.vending` is Google Play, no installer is local, and anything else is other. iOS returns local on the simulator or when the bundle embeds `embedded.mobileprovision`, TestFlight when the App Store receipt is a `sandboxReceipt`, and App Store otherwise. `App.tsx` normalizes the value and forces local for `__DEV__` bundles.
  - Devbox builds are local. Devbox installs iOS with `xcodebuild … build` plus `xcrun devicectl device install app` (a development-signed build, so the bundle carries `embedded.mobileprovision`), and Android with `./gradlew installDebug|installRelease` (an adb install with no installer package). There is no separate devbox marker, so an Xcode or Android Studio install shows the same label.
  - Every native app-update snapshot (checking, unknown, and resolved) carries `installSource`, so the first emit to the web already has it. `parseNativeAppUpdateDetail` keeps it only when it is a known value. The line is a copy of the latest-version row (same classes) and is hidden whenever the source is unknown, whatever the update status is. Builds up to 2.1.0 never send the field, so their card renders exactly as before.
- Verification: Unit tests cover the normalizer (valid, invalid, missing) and the pinned value list on both sides, every snapshot creator with and without an install source, the `__DEV__` override, the web parse whitelist, the copy for every locale, and the card with the line shown and hidden. The full web unit suite (199 files, 2,041 tests), `tsc --noEmit`, ESLint on the touched files, and the full RN Jest suite (19 suites, 118 tests) passed. Android `:app:compileDebugKotlin` and an unsigned generic-iOS-device Debug `xcodebuild` (which also Metro-bundles the shared module) succeeded. Real App Store, TestFlight, and Google Play installs have not been checked, and nothing has been tested on a device yet.

## 2026-09-30 — Photo translation overlay selected mockup B

- Surface: Full-screen photo viewer overlay and translation control in `src/components/LivePhoneDemo/ConversationImageBubble.tsx`.
- Decision: The user selected mockup B ("글래스 라벨") from `/Users/nam/.kiro/crew/artifacts/88d6e9ac9bf2867c/current.html`. This supersedes the earlier A lens-style direction recorded above; the original decision and evidence remain in that entry for history.
- Change: Translation labels now use `rgba(12,14,18,.66)`, 6 px backdrop blur, white text, 5 px radius and fixed 4 px horizontal padding. The centered bottom pill has two rows: language icon/name followed by cycle dots. The long-press menu is centered above it. Image-pixel sampling was removed because B does not use sampled colors. Geometry now fits text against the fixed 4 px inset so a narrow OCR box cannot size text as if the old photo-proportional inset applied. The full-width centering wrapper passes pointer events through; only the pill/menu receive them, preserving pinch, pan and dismiss gestures across the rest of the viewer.
- Verification: Added geometry coverage that checks the fixed inset affects font fitting and a viewer wiring assertion for pointer pass-through. Full `pnpm test` passed (215 Vitest files, 2,299 tests, and 6 script tests); `pnpm exec tsc --noEmit` and ESLint on all changed feature TS/TSX files passed. No physical iOS/Android or WebView acceptance is claimed.

## 2026-09-30 — Same-language row of mixed-language speech disappeared after finalization

- Surface: Chat bubbles in rooms (`ChatBubble.tsx` `buildTargetLanguagesForUtterance`), the same message on other members' screens, room history after a reload, and the public share page `/s/<shareToken>`.
- Report: When one utterance mixes languages or scripts (Korean with Japanese, Korean with Chinese characters), the bubble also shows a fully same-language rendering (a `ko` row for a `ko` original). The row was visible while speaking and right after the finalize translation, then disappeared a moment later. Branch `fix/mixed-language-source-translation`.
- Root cause: The row is only kept while the utterance carries `sourceLanguagesMixed` / `sourceTextHasForeignScript`, which translate/finalize returns. Those flags only ever lived in the speaker's local store. The client sent them with the translation update, but `log-client-event` never stored them, room history (`getConversationHydrationStateForRecord`), the committed realtime frame and the share payload never returned them, `normalizeConversationHydrationUtterances` dropped unknown fields, and `mergeServerHydrationUtteranceWithRoomLanguages` replaced the local utterance with the flagless server copy (it kept the local translations, but not the flags). The stored `ko` translation then looked like an echo of the original and was filtered out.
- Regression: The flags were client-only from the start (`fc1ae03a` / `fba55e74`, 2026-03-22/23). Mount hydration has replaced local rows with server copies since `83975f51` (PR #174, 2026-04-27), so the row was already lost on a room reopen. Since `4047c86c` (2026-08-20) every persisted message publishes a realtime invalidation that also reaches the speaker's own socket, and the client re-runs hydration on every push and on a fallback poll in every room; `cbbc5c51` (2026-09-05, durable finalization) and `60f13766` (2026-09-08, committed message payloads) made that merge run right after every commit. All three reached main together in PR #203 (`0e158bed`, 2026-09-18); from then on the row disappeared seconds after each utterance finalized. The Chinese-variant work in PR #235 kept the same filter and is not the cause.
- Change: One pure helper (`src/lib/source-language-bubble-flags.ts`) carries the flags, as `true` only, through every hop. `log-client-event` stores them in `AppMessage.metadata` with the translation result they came from, keeps the stored ones on a source-only rewrite, and adds them to the committed realtime frame. Room history, the public share payload, the share page's server render and the spectate client return them. The client passes them through hydration and keeps the local flags when a same-text server copy lacks them (a copy read before the translation update landed, or stored by an older server). A speech-recognition final that only confirms the finalized text (the `reuse_local` source replacement) keeps the flags too, because that text is not translated again; a changed text still drops them until its own finalize translation lands. Metadata is a JSON column, so there is no Prisma migration. Old clients ignore the new optional fields.
- Legacy: `use-realtime-stt-legacy.ts` (v1.0.11 and below) keeps utterances only in localStorage and never merges server copies, so it does not have this bug and is unchanged.
- Verification: New `mixed-language-source-row` tests walk the real store path (live draft, local finalize, finalize translation, then push/poll/committed server copies, a source-only copy that raced ahead, a reload from the server copy alone, and another member's committed frame) for a Korean+Japanese and a Korean+Chinese-characters utterance, plus a plain Korean message whose `ko` echo must stay hidden. New server tests cover storing, keeping and replacing the flags and the committed frame, history returning them, and the share payload and spectate mapping. The 11 new regression tests failed with the fix stashed. Four more tests (both scenarios) cover a speech-recognition final that confirms the text, which failed without that change, and one that changes the text. An independent read-only audit of main mapped every hop that could drop the row and agreed on the cause. The full web unit suite (198 files, 2,045 tests), `tsc --noEmit`, and ESLint on the touched files passed. Not yet tested on a device or against a real database.
- Known limit: Messages stored before this change have no stored flags, so their same-language row stays hidden after a reload (the flags cannot be reconstructed: every finalize also stores a same-language echo for ordinary speech). In the collapsed bubble display mode the same-language rendering shares the original's language button, so it cannot be selected there; that is unchanged.

## 2026-09-30 — Photo text translation overlay in the full-screen viewer (client)

- Surface: Full-screen photo viewer (`src/components/LivePhoneDemo/ConversationImageBubble.tsx`), opened from an image bubble in the LivePhoneDemo chat list. New pieces: `PhotoTranslationOverlay.tsx`, `PhotoTranslateControl.tsx`, `photo-translation-context.tsx`, `use-photo-translation-text.ts`, and the pure `photo-translation-toggle.logic.ts`, `photo-translation-geometry.logic.ts` and `photo-translation-fetch.logic.ts`. Copy in `src/i18n/conversation-image-copy.ts`.
- Issue: Text in a shared photo (a menu, a sign, a screenshot) stayed in its original language, while every text message in the room is already shown in the viewer's language.
- User impact: When the photo has text in another room language, the viewer paints the translation in place, "lens" style: each patch takes the photo's own background color, the text takes the photo's text color, the font fits the box, and the edges are feathered. It moves with pinch, pan, double-tap zoom and swipe-to-dismiss. A pill at the bottom-right of the viewer (44 px, glass, `Languages` icon) shows the current language or "Original"; tap cycles the languages that have something to translate and Original, and touch-and-hold (450 ms) opens a dark glass menu of every room language plus "Show original". Languages with nothing to translate are dimmed with "Same as original", and a failed one is dimmed without the tag. The choice is remembered per photo for the app session. Photos without text, or already in the viewer's language, show no pill at all.
- Resolution: The photo now sits on a contain-fit stage sized in px (useLayoutEffect + ResizeObserver) that carries the zoom/dismiss transform, so an overlay placed in percent matches the painted pixels (an object-contain img box letterboxes tall photos inside itself). `will-change: transform` applies only while a gesture or settle runs, so zoomed text re-rasterizes crisp. The pill is a sibling of the viewport (never inside the pointer-capturing viewport), stops event propagation to the chat list, cancels the synthesized click after a long press or drag, supports press-drag-release onto a row, keeps the menu open when released on the pill, and closes the menu on an outside tap, Escape (window capture, before the viewer's own Escape) or Android back (priority 50, above the viewer's 45). Keyboard: Enter/Space cycle; ContextMenu, Shift+F10 or Alt+ArrowDown open the menu; arrows move. Colors come from the loaded photo on a 512 px offscreen canvas (ring median for the patch, glyph cores for the text, 3:1 contrast rule, a blurred translucent plate over busy backgrounds), with the OCR style hints and then a dark scrim as fallbacks. Boxes are padded by 15% of their line height; rotated text is recovered from its axis-aligned box in pixels; vertical CJK stays top-to-bottom for CJK targets. On a language change a patch painted in both languages stays solid while only its text cross-fades (180 ms), so the original never flickers through; results that arrive while the viewer is open fade in with at most 150 ms of stagger; reduced motion turns both off. Data is fetched only when the viewer opens (none for bubbles), polled at the server's `retryAfterMs` while anything is pending (at most 45 s, paused while the page is hidden), aborted on close, and a final answer is not asked again on reopen.
- Decision: Rendering the overlay over the R2 probe photos in headless Chrome showed that fitting each translation into its original box alone shrank menu items to the 6 px floor ("김치찌개" becomes "Kimchi Stew") and turned a 13-degree sticker into a 7 px sliver. So a one-line translation (or a vertical banner written across) now grows into free background next to it, verified in the pixels (it stops at other text, a color edge such as a chip or card border, or another patch), along the photo's own alignment inferred from its sibling blocks: menu item columns stay left-aligned, prices right-aligned, headings centered. A rotated box whose spec inversion gives an implausibly thin line is re-solved from the box shape and the text's aspect. Both are refinements on top of the spec rules and are flagged to the parent for review.
- Compatibility: ChatBubble is unchanged. The room context is provided only around the LivePhoneDemo chat list, so the public share, spectate and legacy screens render the viewer exactly as before, with no pill and no request.
- Verification: New unit, SSR and source-contract tests cover the toggle rules (order, eligibility incl. ready-but-unchanged and failed, cycle, default, Off, memory key), the geometry and color math, the poller with fake timers (cadence, budget, hidden pause, abort, retries, deadline), the overlay/pill/menu markup and event wiring, the stage refactor and the provider placement. The full web unit suite (205 files, 2,137 tests), `tsc --noEmit`, and ESLint on the touched files passed. A local headless Chrome harness (no server; requests fulfilled over the DevTools protocol) rendered the real components over five probe photos with probe OCR/translation data and exercised tap, long-press, press-drag-release, release-on-pill, Escape, reopen memory, zoom, the pending spinner, the staggered arrival fade and reduced motion; it caught and fixed a tap that opened the menu 450 ms later. The API itself is not live on this branch (fixtures only). Not yet tested on a physical iOS or Android device, in WKWebView, or with Android WebView long-press and back.
- Self-review corrections (2026-09-30): The first 45-second client polling budget was shorter than the server's 90-second image-text lease, so an abandoned claim could remain pending after the viewer stopped polling. The client budget is now 240 seconds; each request still has its own 12-second timeout. This permits a retry after lease expiry but does not guarantee completion of the server queue within 240 seconds. At the end of a polling session, locally pending work is marked failed while ready OCR blocks and completed translations remain usable; reopening retries pending or failed cached work, while settled work is not fetched again. A→B account changes resolve response and selection snapshots against the new namespace/account/conversation/message key during render, before effects run. A cache miss for B resolves to `null` immediately; matching-key snapshots are retained. Regressions use distinct A and B objects and translation text, assert `A !== B`, and cover both the B cache miss and same-key snapshot. Six targeted test files passed (103 tests), and TypeScript plus targeted ESLint passed. No new live or physical-device run was done for this correction.

## 2026-09-30 — English label for a vertical Japanese photo banner

- Surface: Translation overlay in the full-screen photo viewer, for the vertical Japanese banner OCR block `本日のおすすめ` translated as `Today's Special`.
- Issue: The live OCR box was only 4.7% of the photo width and 44.5% of its height. Keeping English inside that tall, narrow source box split the two English words across many short lines and made the translation hard to read.
- Evidence: The source is a 1000×750 photo. In `s2_ja_sign_live.json`, block `b1` is `[0.856, 0.146, 0.903, 0.591]`; the neighboring OCR blocks bound the available space on the left, while the banner is close to the right photo edge.
- Resolution: When a vertical source block is translated to a horizontal-writing language, render a horizontal glass label whose height matches the original glyph-column width. Expand it only as far as the photo edge and neighboring OCR boxes allow, centered on the source banner. Keep its original rotation, alignment and language-specific vertical behavior; CJK translations still use vertical writing. Pass all OCR source boxes into the layout so unpainted or untranslated neighbors also constrain expansion.
- Verification: Added geometry coverage using the exact live `b1` and sibling OCR coordinates. It checks the label stays inside the photo, does not overlap neighboring text, preserves the source glyph-column height, keeps the English wording to at most two lines, and leaves Korean vertical. Geometry/overlay tests passed (53 tests), as did `tsc --noEmit` and ESLint on the three changed TypeScript files. The visual retest showed `Today's Special` intact in a compact centered band with no overlap after closing and reopening the language menu.

## 2026-09-30 - Earphone auto-read route refresh and revised-translation playback

- Surface: PR #246 (`feat/earphone-mode`), Android media-route reporting and the room's automatic translation-reading queue.
- Review issue (P1): Android device callbacks report connected-device additions/removals, so selecting the phone speaker while Bluetooth earphones remain connected can leave `earphonesConnected=true`. API 33+ can query the actual media route but has no public route-selection listener. A stale reading previously allowed HTML automatic TTS on the speaker.
- Resolution: Android checks the media route every 250 ms while the host is resumed and emits only meaningful changes from polling; a failed query reports an unknown/disconnected route until a later successful sample. Automatic HTML clips also make a correlated fresh native route query immediately before playback; failed, malformed or missing replies refuse playback. The existing iOS native disconnect guard remains in use. A rejected HTML autoplay attempt clears the old player source and retries through the queue, including another route check. Manual clips do not require the automatic preflight.
- Lifecycle: Android pauses automatic reading when the host pauses, treating the output as unknown/disconnected until resume obtains a new reading. This also prevents the system media-output picker from retaining the previous route while the activity is paused. Polling stops on pause, destruction and module invalidation. Android API 29-32 cannot query media-routing preferences, so these shells now advertise `audioRoute: false` and hide the earphone-mode controls. Their existing native route classification remains available internally but does not enable automatic reading.
- Review issue (P2): A queued candidate that was already ready kept its original target/audio even after the same message ID acquired a revised source or translation (for example, a later speech-final prefix expansion or authoritative server hydration). The visible text could differ from the text read aloud.
- Resolution: Every still-open candidate is classified again on updates. A changed target aborts and discards the old prefetch; an incomplete revision waits for its translation, and an unreadable revision is skipped. An identical read target retains its existing request/audio. Already consumed, dispatched or skipped candidates remain settled.
- Verification: Web regression tests cover stale in-flight audio resolving after cancellation, revised ready audio waiting behind an earlier message, source-language reclassification, a revision returning to pending translation, and unchanged-target reuse. Fresh-route tests cover correlated speaker/connected replies, unrelated replies, malformed replies and timeouts; the RN App bridge test covers request-ID propagation and a failed read after a connected reading. Related web tests (137) and the full RN Jest suite (153) passed; web TypeScript and changed web ESLint checks passed. RN TypeScript currently reports missing Node `fs`/`path` types and a resulting implicit-any in unchanged `universalLinkConfig.test.ts`. The standalone RN ESLint command also encounters the existing ESLint 8/9 plugin incompatibility; the web ESLint command applied to RN files reports existing require/module-variable rule violations. These were not introduced by this fix.
- Native verification: Android `:app:compileDebugKotlin` and `:app:testDebugUnitTest` passed. Three JVM tests cover route changes without device callbacks, unchanged-route deduplication, query-failure recovery, timer cancellation on pause/destroy, restart after resume, and disposal on invalidation.
- Acceptance: Physical Android output switching has not been reproduced in this work. Foreground polling detects ongoing output changes on its 250 ms cadence; it does not provide a zero-latency native stop for Android HTML playback. No app release or PR merge was performed as part of this fix.

## 2026-09-29 — Slower unread badge refresh and relaxed conversation-list idle poll

- Surface: Bottom tab bar unread badge (`bottom-tab-bar.tsx`) and the conversation list realtime fallback poll (`conversation-list.tsx`).
- Report: Supabase database egress averaged about 14 GB/day. `pg_stat_statements` (2026-09-16 to 2026-09-29) attributed about 80% of it (~143 GB, ~11 GB/day) to the latest-message-per-room query behind `GET /api/conversations`, which Prisma's `distinct` ran without a LIMIT and so returned every visible message of every listed room on each call.
- Evidence: The badge reloaded the whole conversation list every 20 s even while the page was hidden, and the list watchdog kept polling every 20 s once a healthy socket had been idle for 60 s, so list calls ran continuously for every open client.
- Decision: The server query now returns one row per room (`CROSS JOIN LATERAL ... LIMIT 1` on `app_messages_session_created_at_desc_idx`), with identical list output. On the client, the badge interval is now 60 s and is skipped while the document is hidden; it still refreshes on mount, `focus`, and `visibilitychange`. After a successful fallback refresh the list resets its idle watchdog, so an idle but healthy socket polls about every 60-80 s instead of every 20 s. A socket that is not open still polls every 20 s, and a failed refresh keeps retrying.
- Trade-off: Without a realtime push, the badge can lag by up to about 60 s while the app stays visible, and an idle list can lag by up to about 80 s. Push frames, focus, and returning to the page still refresh immediately.
- Verification: Unit tests cover the new query shape, multi-room preview/translation/speaker mapping, Chinese normalization inputs, empty rooms, and the poll cadence. A local-database comparison matched the old and new latest-message results for every session key. No device test yet.

## 2026-09-29 — TTS model picker in the room settings menu

- Surface: Room settings menu (`src/components/LivePhoneDemo/LivePhoneDemo.tsx`), a new "TTS model" row directly below "Translation model" and above "Bubble display mode".
- Issue: Users could pick a translation model but not a TTS voice model. With Gemini 3.8 Flash TTS added as a second provider, the only way to switch was a server-wide setting.
- User impact: Each user can now choose `inworld-tts-1.5-mini`, `gemini-3.8-flash-tts`, or `gemini-3.8-flash-lite-tts` for their own playback. Users who never choose keep Inworld.
- Resolution: The row is a straight copy of the translation model picker (same markup, classes, animation, listbox/aria wiring, selected highlight, and check icon), fed by `TTS_MODEL_OPTIONS` in `src/lib/tts-models.ts`. Labels show the model id, with no badge. It was copied rather than extracted into a shared component so the translation model row renders exactly as before. Choosing an option calls `handleTtsModelSelect`, which updates state and the local preference cache and PATCHes `ttsModel` to `/api/account/preferences`; the value then rides on every TTS request (`/tts/inworld` and `tts.ttsModel` in finalize). Opening the TTS menu closes the translation model, text size, and bubble display menus, and the reverse holds. Outside click, Escape (focus returns to the button), the back step, and menu navigation close it the same way they close the translation model menu. The label `ttsModelLabel` was added to the ko/en/ja/de/es/fr/it/pt dictionaries and to the generated dictionaries that carry `translationModelLabel` (zh-CN, zh-TW, ru, ar, hi, th, vi); ko is "TTS 모델", en is "TTS model". `LivePhoneDemoLegacy.tsx` (v1.0.11) is unchanged.
- Verification: On the local devbox web build (headless Chrome, mobile viewport, local test account), the closed and open states rendered, the two menus were mutually exclusive, the PATCH body carried `ttsModel`, and the choice survived a reload. The full web unit suite (194 files, 1,969 tests), `tsc --noEmit`, and ESLint on the touched files passed. Not yet tested on a physical iOS or Android device.

## 2026-09-28 - Voice-mode photo tap stopped STT; keyboard-mode photo pick closed the keyboard

- Report: On iPhone (devbox build 2.1.0 (108)), tapping the voice-mode photo icon while STT was running stopped recognition as the WKWebView upload menu (Take Photo / Photo Library / Choose File) appeared, before anything was chosen. In keyboard mode with the keyboard open, `+` -> photo closed the keyboard. Branch `fix/voice-photo-ux-stt`, PR #236.
- Evidence: The stored `stt_session_stopped` client event for the failing tap (`app.app_event_logs`, 2026-09-28 10:48:28.705 UTC) has `reason: manual_stop`, the web layer's own reason-less stop, not an iOS audio interruption or a native-side stop. Device log order: `Single tap identified` 28.644 -> `AVAudioEngine ... stop` 28.652 -> `commit potential tap` 28.680 -> upload context menu 28.707, so STT stopped on pointer-up, before the click that opened the menu. The STT server then logged `client disconnected code=1005` and `stop_requested=true`.
- Root cause (STT): While STT runs, the mic button renders an `animate-ping` layer (`absolute inset-0`, scales to 2x) and a loudness-scaled ripple. Both are positioned children painted above the neighbouring photo button, so part of the photo button's hit area belonged to the mic button (`handleMicPointerUp -> performMicAction -> handleStopRecording`). A 390pt headless replica returned the ping layer from `elementFromPoint` at the photo centre for about 300-1000 ms of every 1 s cycle. Once STT stopped the ping disappeared, so the following click reached the photo button and the menu still opened. The "only after keyboard mode" pattern was not reproduced; the hit is timing-dependent, so it was most likely coincidental.
- Root cause (keyboard): The `+` menu's photo item did not prevent pointer-down, so the tap moved focus off the textarea and iOS dismissed the keyboard; nothing refocused it after the chooser closed.
- Change: The four decorative mic layers (ping and ripple in voice and keyboard mode) are `pointer-events-none`, and `stt_session_stopped` records `source` (`mic_pointerup` / `mic_click`) for mic-driven stops. The photo item prevents pointer-down's default in keyboard mode (like the send button) and still opens the chooser from click; the composer refocuses the previously focused textarea 350 ms after cancel, an empty or invalid pick, or when the picked image's preview is closed or sent. Codex's native STT interruption guard (`016059d5`) was reverted on the branch (`a239b380`): unrelated to this bug and it would need an app release, so the fix ships as web-only.
- Verification: New `picker-focus-restore`, mic hit-area / stop-source and composer interaction tests; full web unit suite (190 files, 1892 tests), `tsc --noEmit` and ESLint on touched files passed. Device (user, 2026-09-28): the keyboard comes back after cancel and after send. Device (user, 2026-09-29, iPhone 14, devbox build 2.1.0 (108)): STT keeps running when the photo icon is tapped in voice mode.
- Review follow-ups: An invalid pick no longer refocuses the textarea while the error menu reopens (the keyboard would rise under a menu positioned from pre-keyboard coordinates); the restore is deferred until that menu closes, is dropped when a new chooser flow starts (a valid re-pick restores when its preview closes), and does not fire after unmount. The delayed refocus is also skipped when focus has meanwhile moved to another element; it still runs when only the body or document element holds focus.
- Known limit: iOS takes first responder while the system upload menu / photo picker is on screen, so the keyboard still hides during the chooser and returns afterwards. Keeping it visible the whole time would need an in-app photo panel in the keyboard area (native work, app release). iOS before 16.4 has no file-input `cancel` event, so a cancel does not refocus there. Android WebView was not verified: a timer-driven `focus()` may not raise the soft keyboard there. Voice-mode "Take Photo" (camera) during STT was not verified, since the native interruption guard was reverted.

## 2026-09-27 — Chinese Simplified/Traditional translation rows and flags

- Surface: Live conversation chat bubbles (collapsed flag buttons and expanded rows), the iOS Picture-in-Picture preview, the conversation-list latest-message preview, and the public share/spectate page, for rooms whose languages include Chinese (`zh-CN` Simplified, `zh-TW` Traditional).
- Issue: Chinese messages showed two or more CN/TW flags where only one had text (one TW and one CN, or two CN flags), two CN flags that were both Simplified, or a CN flag for every Chinese speaker, including in rooms where only Traditional Chinese was selected.
- Root causes:
  - Persistence stripped the region from every language code (`log/client-event/sanitize.ts` `normalizeLang`), so `zh-CN` and `zh-TW` translations were both saved under `zh` and one of them was lost. The stored target list kept `zh-TW`, so history and live socket merges produced an empty TW row next to an extra CN row, or two CN rows.
  - Soniox reports every Mandarin turn as generic `zh`, and the client always mapped it to `zh-CN` regardless of the room, so a Taiwanese speaker's message was labelled 🇨🇳 and still requested a separate 🇹🇼 translation.
  - The translation prompt listed bare codes (`targets=zh-TW`) without saying which script each one means, so models often copied Simplified text into the zh-TW key or left it blank. A model answer of `zh` or `Chinese` could also fail source detection.
  - The bubble and PiP renderers treated `zh`, `zh-cn`, and `zh-CN` as different languages, and a generic `zh` translation could fold into a Korean or English original.
- User impact: Chinese-speaking members saw empty or duplicated rows and the wrong script, and Taiwanese members saw their own speech labelled as mainland Chinese.
- Resolution:
  - Added one shared resolver (`src/lib/chinese-variant.ts`) that turns any Chinese code into `zh-CN` or `zh-TW`. It uses the room's single Chinese variant for speech recognition output, the script of typed text, and falls back to `zh-CN`. Every ingress (persistence, hydration, share payloads, socket merges, remote previews, translation responses) and every renderer now uses canonical codes, so each language gets exactly one row, button, and flag.
  - Simplified ↔ Traditional is now a script conversion on the server (`opencc-js`, `src/server/chinese-script-conversion.ts`) instead of a model translation. When the source is Chinese, the other variant is the OpenCC conversion of the source, with regional wording such as 软件 → 軟體. Every `zh-CN` value is Simplified and every `zh-TW` value is Traditional. If one of two requested variants is missing or is an untranslated copy, it is converted from the other.
  - The prompt now names each variant's script, a Chinese model answer is always resolved to a variant, and Simplified/Traditional differences no longer count as foreign script.
  - A zh-TW original recognized in Simplified characters is shown in Traditional through the display-only `originalDisplayText`. The recognized text itself is never rewritten, because the client uses it to match and dedupe turns. Legacy rows stored as `zh` are repaired when they are read.
- Verification: Unit tests cover the resolver, OpenCC conversion, persistence, hydration, finalize post-processing, the client pipeline, and bubble/PiP rendering across the audited scenario matrix. The full web suite passed (188 files, 1,881 tests), along with TypeScript, ESLint on the changed files, script tests, and a production `next build`. The build confirmed the OpenCC dictionaries appear only in server chunks. No device test yet.

## 2026-09-26 - Open https share links in the app instead of the browser

- Surface: Conversation-share links (`https://<host>/s/<shareToken>`) tapped from messengers, mail, or the browser on devices with the app installed.
- Issue: Only the custom-scheme share link opened the in-app share overlay. The https link that people actually send always opened the public web page first, because the iOS apple-app-site-association file and Android's verified https intent filter listed only `/p/` profile links. An app user had to tap "Open in app" a second time, which contradicted the deep-link fix this branch set out to make.
- Resolution: Added `/s/*` next to `/p/*` in both AASA `paths` and `components`, and a `/s/` path prefix to the same auto-verified Android filter (same host, so `assetlinks.json` needs no change). The React Native link router already parsed https `/s/<token>` URLs on the configured web origin and sent them to the same overlay as the custom scheme, on cold and warm starts, so no JavaScript change was needed. `/p/` handling is unchanged.
- Compatibility: This needs a native rebuild (AndroidManifest) plus a server deploy of the new AASA, so it ships with app 2.1.0 and the new `ios/v2.1.0` / `android/v2.1.0` API namespaces. Android re-verifies App Links after install, which can take a short while.
- Verification: New AASA route tests (3) and RN link-config tests (5, parsing the manifest and entitlements to check `/p/` and `/s/` share one verified host) passed with the existing RN link suites (26 tests). No physical-device run yet: universal links can only be exercised after the AASA is served from the production host.

## 2026-09-26 - Align share-toggle copy with the link's real capability and revoke old links

- Surface: Conversation-management share toggle (`shareToggleDescription`, 15 locales), the public `/s/[shareToken]` page, and the native in-app share overlay.
- Issue: The share toggle described the link as view-only — "anyone with the link can view this conversation. They can't send messages or join" — while the overlay's Join action has let any logged-in viewer become a full room member since the native join flow shipped. A member turning sharing on was therefore consenting to something narrower than what the link actually granted. Separately, "stop sharing" was only ever a pause: the share token was minted once and reused, so re-enabling sharing silently re-armed every link the member believed they had taken back.
- Decision: Joining from a share link stays allowed, with the existing capacity and block checks under the channel row lock. The copy is what was wrong, not the behavior.
- Resolution: Rewrote the toggle description in all 15 locales to say anyone with the link can view **and join** the conversation, keeping each locale's existing length and speech level. Audited the other share surfaces (public page copy, overlay copy, spectate copy module) and found no further view-only claim to correct. Made disabling sharing a real revoke: the next enable mints a fresh token, so an old link now fails the same way an unknown one does — 404 on the public view API and on the join API, both of which gate on token plus enabled state, including inside the join's row lock. Re-enabling while already enabled still keeps the live token and only re-stamps the snapshot, which is what the separate refresh action does.
- Privacy: The unauthenticated snapshot response no longer carries any account id. Speakers are identified by an opaque per-response alias (`s1`, `s2`, … by first appearance) that the client maps into the bubble's speaker key, and the sharer arrives as their already-public profile card instead of an id the overlay had to look up. The public payload is now shaped in one shared serializer used by both the API route and the page's own server render, so the two cannot drift.
- Verification: The public share route suite (6 tests, including a new assertion that no account id value and no `*UserId` field appears anywhere in the payload at any depth) and the conversation library suite (118 tests, including first-enable, re-enable rotation, already-enabled retention, refresh retention, token-collision retry, and dead-token view/join lookups) passed, alongside the wider conversation API and share suites — 12 files, 221 tests. Web TypeScript and targeted ESLint passed. These are mocked-database regressions; no physical-device or live-database run was performed, so a real re-share cycle on a device remains to be checked.

## 2026-09-26 - Keep public conversation previews within their sharing boundary

- Surface: Public conversation-share API, browser spectate page, and native in-app share overlay.
- Issue: The public API returned the room's internal `sessionKey` inside its member-oriented hydration payload. Legacy 1.x identity lookup accepts that value as a request header, so a share-link viewer could be identified as a room speaker and read private conversation data. The same payload included current invitations and member profiles made after the `sharedAt` cutoff, despite presenting the link as a fixed snapshot.
- Interaction issue: Reusing the native overlay for links A and B left A's preview visible while B loaded. A request started for A could also complete after B and replace B's preview because both requests shared one cancellation flag.
- Resolution: Allowlist only the public fields needed for spectating; exclude the room's `sessionKey`, internal room/message IDs, membership lists, and invitation/leave notices. Keep the sharer's public profile ID and speaker ID because the existing native preview uses them. Bound actual member participation and usage events at the snapshot cutoff, omit pending invitee identities (reinvites reuse an old invite record), and use the stored title instead of deriving one from current membership. Track preview results by share token, cancel superseded requests, and hide the previous room immediately while the new link loads.
- Compatibility: Existing v2.0.4 API namespace rewrites continue to route to the v2.0.0 handlers. No native version change or Prisma migration is required.
- Verification: All 181 web unit-test files passed (1,685 tests), including public response allowlist and snapshot cutoff regressions. Web TypeScript, targeted ESLint, and `git diff --check` passed. The request-isolation fix was reviewed at the hook/effect level; no mounted WebView or physical-device run was performed. Live database validation remains pending. Existing membership rows lose earlier leave/rejoin intervals, so this change avoids exposing that unverifiable history through the public response rather than claiming exact historical membership reconstruction.

## 2026-09-26 - Restore room membership when joining a conversation share link

- Surface: The conversation-share overlay's Join action on web and native WebViews.
- Issue: A departed member, including a departed room owner, could receive a successful join response while their retained membership still had `leftAt` set. Opening the room then failed. The share join also ignored reserved pending invitees when checking the ten-person limit.
- Resolution: Restore departed memberships, preserve owner identity, and count distinct active members plus pending invitees before admitting a viewer. Convert a pending invitation into real membership without counting that account twice.
- Permission: Active room members may manage sharing; this follows the existing feature's permission model.
- Compatibility: iOS and Android v2.0.4 already route these endpoints through their existing namespace rewrites. No native version change or database migration is needed.
- Concurrency: Share joins lock the channel row and re-read availability, membership, reserved capacity, and blocks before writing. Existing invite/materialization concurrency behavior is outside this bounded change.
- Verification: All 181 web unit-test files passed (1,681 tests), followed by the expanded 108-test conversation suite including the additional capacity re-read regression. Web TypeScript passed. Tests cover departed owner/member restoration, active-member idempotence, pending capacity and removal, and changed capacity/block/share state before the locked read. These are mocked database regressions; real PostgreSQL concurrency and physical-device validation were not performed.

## 2026-09-26 — Posting feed: post images broken for signed-out readers

- Surface: Home feed, post viewer, profile grid and search tiles (`GET /api/posts/{postId}/image`).
- Issue: The feed was made readable without signing in, but the image route still returned `401` when there was no session. The post wire shape (`FeedPostDto.image.url`) also built its URL with a client-side helper on the server, which could emit a namespace with no image route (e.g. `ios/v2.0.0`) depending on build-time env.
- User impact: A signed-out reader would see every photo post as a broken image, and a signed-in reader could hit the same failure in production depending on server env.
- Resolution: The image GET resolves visibility with a null viewer, so public posts serve to everyone while blocks, hides, archive, trash and moderation still apply. The serializer emits the unversioned `/api/posts/{id}/image` path directly.
- Verification: New route tests (signed-out public 200, signed-in viewer passed to the visibility rule, invisible 404) and an exact-URL serializer assertion; TypeScript and the full unit suite passed.

## 2026-09-26 — Posting feed: first screen switched for every installed app version

- Surface: App launch landing (`src/web/shared/v1.1.0/home-entry.tsx`), bottom tab bar.
- Issue: The web UI is shared by every installed app version, but the posting routes exist only in the `v2.1.0` API namespace. Switching the landing to the feed applied to 2.0.x apps too, whose namespace answers every posting call with `404`.
- User impact: After a web deploy, a user still on a 2.0.x app would open the app straight into a failing feed.
- Resolution: In progress. One capability rule (`namespaceSupportsPostingFeed`, 2.1.0+ or the plain web) now exists, and every posting entry point is being gated on it so older apps keep the previous conversation-first behaviour.
- Verification: Rule covered by unit tests; entry-point gating pending.

## 2026-09-26 — Posting feed: unknown post background drawn three different ways

- Surface: Feed card, 3-column grid tile, compose preview.
- Issue: Each surface had its own fallback for a background key missing from the catalog (dark slate in the feed, light gray in the grid, warm cream in compose).
- User impact: A post with a retired or malformed background key would look different in the feed, on the profile grid and in the editor preview.
- Resolution: The catalog owns one fallback (`resolveBackgroundPreset`, the first preset), and all three surfaces use it.
- Verification: Feed, grid and compose tests passed; TypeScript clean.

## 2026-09-26 — Posting feed: comment sheet showed a blank identity for the author's own new comment

- Surface: Comment sheet, optimistic rendering of a comment or reply the viewer just sent.
- Issue: The sheet read the viewer's name, avatar and language from a `window.__MINGLE_VIEWER__` global that nothing injects, and sent the viewer's display language as the comment's source language.
- User impact: A just-sent comment appeared with a neutral avatar and no name until the list reloaded, and comments were stored with no usable source language, so they were never translated.
- Resolution: In progress. The sheet will read the signed-in user from the app's real session source and send no source language, and the server will detect the language from the text.
- Verification: Pending.

## 2026-09-26 — Posting feed: "See all" people list does not restore its exact scroll position

- Surface: Explore tab → "See all" people list and post grids hosted inside the sliding surface.
- Issue: Scroll restoration is keyed to the window, but these lists scroll inside the sliding surface's own container.
- User impact: Returning from a profile to a long "See all" list can land at a different position than the one the user left.
- Resolution: Open; queued with the explore-tab cleanup.
- Verification: Pending.

## 2026-09-26 — Conversation list: search entry moved from the header to the top of the list

- Surface: Conversation list header and list (posting-capable clients: app 2.1.0+ and the plain web).
- Issue: The planning spec requires the conversation-list header to match the feed header exactly (Mingle on the left; compose and the notification bell on the right). Adopting the shared header removed the header's conversation-search button.
- User impact: On 2.1.0+ the only entry point to conversation search would have disappeared.
- Resolution: By the user's decision, a search bar is now the first row inside the conversation list's scroll area and scrolls with the list. It calls the same `handleOpenSearch` the old header button called, so it opens the existing search overlay with the same filtering, results, empty state, clear/IME handling and analytics. The header keeps the shared `AppTopHeader`. Clients before 2.1.0 keep the previous header and search button unchanged.
- Verification: Label resolver unit test; conversation-list, header and posting-guard tests (69) passed; TypeScript clean. On-device check pending in the device test.

## 2026-09-26 — Posting feed gap audit: fixes merged into `feat/posting-feed`

A four-part audit of the posting feed against the numbered spec (`docs/posting-feed-checklist.md`) found the UI/UX issues below. All of them were fixed on `feat/posting-feed` (not `main`). Across the merged branch: web unit tests 276 files / 2,817 passed, RN 20 suites / 111 passed, TypeScript clean. On-device checks listed per entry are still pending (no connected device).

### Feed: a requested translation never reached the body
- Surface: Feed card (center large text, photo-post caption, expanded body).
- Issue: After "See translation" the button switched to "See original", but the photo caption and the expanded body kept the original. The text resolver only trusted the server's `ready` state, not a translation the viewer had just fetched.
- User impact: Viewers outside the four default languages effectively could not read posts in their language, and the three places showed different languages.
- Resolution: One resolver (`resolveCardTexts`) derives all three texts from the text currently shown. Loading a post whose stored translation failed no longer shows an unrequested failure toast, and photo-only posts no longer show a translate button.
- Verification: `feed-card-format` and `use-feed-translate` tests (failed before the fix).

### Feed: position and expanded state reset after every tab switch
- Surface: Home feed after returning from a profile, the comment sheet or another tab.
- Issue: On the first render (no posts yet) the persist effect overwrote the saved state with an empty one, and the default `source` object was recreated on every render.
- User impact: Returning to the feed always landed on the first post, collapsed.
- Resolution: The saved state is read synchronously before cards mount, and writes start only after the start position is applied. A notification deep link (`?postId`) takes precedence. A saved post that is no longer visible shows the existing "no longer available" toast.
- Verification: `feed-restore-state` tests. On device: restore after a profile round trip.

### Feed: unseen posts skipped while paging; feed stopped at the end
- Surface: Home feed scrolling.
- Issue: The server re-ranked on every page request using the latest seen set and cut by offset, so posts seen on page 1 pulled other unseen posts forward and they were skipped. At the end the server wrapped to offset 0, but the client discarded the repeated ids, so nothing was appended.
- User impact: Some posts were never shown, and with few posts the feed simply ended.
- Resolution: Each snapshot ranks from views before its `snapshotAt`, with a deterministic tiebreak. A cached ranked list keeps pages stable within the snapshot. The end cursor starts a fresh snapshot, and the client appends repeated ids as a new cycle with per-occurrence keys. A like or a comment marks the post seen at once. One visit must show the post for 1 continuous second to count as seen.
- Verification: `feed-service`, `feed-ranking`, `view-dwell`, `feed-list` tests.

### Feed: white controls invisible on light backgrounds; some gradients below 3:1
- Surface: Author row, time, follow, expand, translate and like/comment/⋯ icons, plus the transparent header over the active post.
- Issue: All glyphs were hard-coded white. Five light presets made them nearly invisible. White text on golden-hour, ocean-blue, sunset-orange and aurora-green measured below 3:1.
- User impact: Unreadable controls on about half of the text posts.
- Resolution: `postForegroundTone()` in `post-backgrounds.ts` is the single rule, and the card and the header both follow it. Light backgrounds get dark glyphs without shadow; photos and dark backgrounds get white glyphs with shadow. The four gradients were darkened (golden-hour now uses dark text). "Pattern" presets now render real patterns.
- Verification: A per-preset contrast test over every color stop (failed before the fix).

### Feed: photos cropped; broken images and load-more errors unreachable
- Surface: Photo posts, the end of the feed.
- Issue: Photos used `object-cover`. The image-error props were not wired. The load-more spinner and the retry sat outside the mandatory snap, and requests had no timeout.
- User impact: Faces or text in photos were cut off, broken images showed as blank, and a stalled network produced an endless, unretryable wait at the bottom.
- Resolution: `object-contain` over the post background. Original dimensions are now stored (`imageWidth`/`imageHeight`, migration `20260926150000_add_post_image_dimensions`) and used for layout. A failed image shows a message and a retry. The end of the feed is a snapping full-height status card (loading / failed + retry). Feed requests time out after 15 s.
- Verification: `fetchWithTimeout` and `imageAspectRatio` tests. On device: letterboxing, status card.

### Feed: publish banner pushed cards; swipe hint blocked swipes; a11y chevrons visible
- Surface: Feed overlays.
- Issues:
  - The publish banner sat in the layout flow, so the fixed-height cards overflowed and the bottom row clipped. The banner was also missing in the loading, error and empty states.
  - The first-run hint covered the whole feed and swallowed swipes, and a programmatic restore scroll marked it complete.
  - The `sr-only-focusable` class was undefined, so the keyboard previous/next chevrons showed on every card.
- Resolution:
  - The banner is an overlay under the header in every state.
  - Card height is measured from the real container.
  - The hint passes touches through (only its close button is interactive), completes only on a real gesture, and uses localized copy ("swipe up for the next post").
  - The utility class is defined.
  - The follow button is a small "+", the compose icon is a note-and-pencil (`SquarePen`), and times are locale-formatted.
- Verification: Unit tests where pure. On device: banner position under the notch, hint pass-through.

### Comments: auto-translated comments could not show the original
- Surface: Comment sheet.
- Issue: The server's translated `displayText` was used as the "original".
- User impact: Users of the four default languages could never read a foreign comment's original.
- Resolution:
  - A translated comment opens in translation with "See original" and toggles to `sourceText`. It uses the same Globe icon as the feed.
  - On touch keyboards Enter inserts a newline, and sending uses the button. On desktop an Enter pressed during IME composition no longer sends.
  - A failed reply retries to its original target.
  - The @name is inline with the body, and "View N replies" uses plural rules.
  - The sheet traps and restores focus.
- Verification: `comment-state`, composer and API tests.

### Notifications: dot could persist, follow alerts ignored the toggle, labels untranslated
- Surface: Bell dot (feed and conversation list), notification list, My page toggle, feed tab.
- Issues:
  - The dot query and the list used different visibility filters, so an unread alert from a blocked author kept the dot on forever.
  - Opening the list skipped the read PATCH when nothing unread was visible.
  - Follow alerts and pushes ignored "app notifications off", and a re-follow re-notified.
  - The toggle title and description and the feed tab label fell back to English or Korean in 13 languages, and comment, reply and follow pushes were missing in 6 languages.
- Resolution:
  - One visibility filter for both queries.
  - The list marks everything read up to its load time and clears the dot optimistically.
  - Follow alerts respect the toggle and are not duplicated.
  - All strings exist in 15 languages.
  - Rows wrap to two lines.
  - The list pages and merges like-groups across pages.
- Verification: Notification route tests (7 failed before the fix), follow route and copy-completeness tests.

### Compose: previewed background not saved; second publish lost; failures discarded
- Surface: Compose, edit, publish banner, drafts, archive/trash/hidden lists.
- Issues:
  - The server re-randomized the background on publish and on "change background", so the result differed from the preview.
  - Publishing while another publish ran was silently dropped.
  - Dismissing a failed banner discarded the text and photo, and autosave was not flushed when leaving.
  - An image-only edit was reported as a failure.
  - Archive and trash thumbnails returned 404 for the author.
  - Restoring a post deleted from the archive made it public.
- Resolution:
  - The previewed key is saved.
  - A second publish is blocked with a notice while the content goes to drafts.
  - A failed publish is saved as a draft, and discarding asks first if that save failed.
  - Autosave is serialized and flushed on pagehide and hide.
  - A no-op or image-only edit succeeds, and concurrent edits get a conflict notice with reload.
  - The author (and the person who hid a post) can see its image.
  - Restore keeps the archived state.
  - Lists page with "More".
  - Large photos (up to 50 MB) are downsized instead of rejected, and HEIC or decode failures have clear messages.
- Verification: Route and publish-store tests (failed before the fix). On device: keepalive flush on app switch, HEIC.

### Search and profile: IME, state loss on back, "See all" screen, grid scroll
- Surface: Explore unified search, "See all" people, profile grids.
- Issues:
  - A Korean composition could end without triggering the people search, and the post grid bypassed the debounce.
  - Results cleared on every new query.
  - Going back lost the query, results and scroll.
  - "See all" was a bare page, and the people ranking held only within each page.
  - Profile grids restored the window scroll instead of the real container's.
- Resolution:
  - One composition-aware dispatch drives people and posts.
  - Previous results stay while loading, with a small spinner.
  - The query lives in `?q=` with a session cache for results and scroll.
  - "See all" is a right-sliding surface with a header and a back button.
  - Tiering (exact → prefix → contains) and post scoring run in SQL across all rows.
  - Grids bind to their scroll container and load pages until the saved position is reachable.
  - This supersedes the earlier open entry about the "See all" scroll position.
- Verification: Search controller and route tests. SQL parity checked against the old in-memory algorithm on temp tables. On device: IME order on Gboard, Samsung and iOS keyboards.

### Restricted accounts saw generic failures and endless retries
- Surface: Every posting write path (publish, drafts, edit, image upload, post and comment likes, comments).
- Issue: The server's 403 `account_restricted` was never recognised by the client.
- Resolution: A shared detector (`lib/account-restriction.ts`) and one 15-language notice (`i18n/moderation-copy.ts`). Every write path shows the notice, offers no retry and keeps the user's input.
- Verification: `moderation-copy`, `like-state`, `publish-store`, `draft-autosave` and comment API tests.

## 2026-09-26 — Posting feed: official badge, read-only archived posts, measurement (wave 2)

Merged into `feat/posting-feed` (not `main`). Web 286 files / 2,930 tests, RN 111 tests, TypeScript clean. On-device checks pending.

### Operator content was indistinguishable from member posts
- Surface: Feed card author row, comments and replies, other-user profile, My page, people search rows.
- Issue: The initial content is posted by the Mingle team account, but nothing marked it (spec item 84).
- User impact: Readers could take operator-written posts for other members' experiences.
- Resolution:
  - A new `User.isOfficial` column (migration `20260926170000_add_user_official_flag`) marks the account, and one shared `<OfficialBadge>` renders it everywhere in 15 languages.
  - On feed cards the badge follows the card glyph tone (white on photos and dark backgrounds, sky pill on light ones).
  - Long names truncate and the badge stays visible.
  - The badge never changes counts or ranking.
  - Operators mark the account with the seed script (`--mark-official`); `--create-author` creates it as official.
- Verification: Serializer, list, comment and search response tests (failed before the fix). On device: narrow screens, RTL (ar).

### Authors opening an archived or trashed post could try to like or comment
- Surface: Full-screen viewer opened from the archive or trash list.
- Issue: The author can now load their own archived and trashed posts, but likes and comments on them return 404.
- Resolution:
  - A pill under the header reads "Archived post" or "Post in trash" (15 languages).
  - Like and comment are dimmed and disabled, and double-tap like and the heart effect are off.
  - The ⋯ menu (restore, delete) is unchanged.
- Verification: `read-only-post` tests. On device: pill position under the notch.

### Following from a restricted account showed a generic failure
- Surface: Feed card "+" follow button.
- Resolution: A 403 `account_restricted` shows the shared restricted-account notice with no retry, and "+" stays.
- Verification: `use-feed-follow` tests.

## 2026-09-26 — Swipe-down-to-dismiss for the full-screen photo viewer

- Surface: Full-screen conversation photo viewer (`ConversationImageBubble` → `MessageMediaDialog` + `ZoomableConversationImage`). Photos sent by the viewer and by other members, as well as the public conversation-share page, all open this same viewer through `ChatBubble`.
- Issue: The viewer could only be closed with its X button, Escape, or the native back action. Dragging the photo down, the standard mobile photo-viewer gesture, did nothing.
- User impact: On phones, users had to reach the small top-right X button to leave every photo they opened.
- Resolution: Added swipe-down-to-dismiss. The gesture rules live in the pure `swipe-to-dismiss.logic.ts` module. The gesture engages only after an 8px slop when downward vertical movement dominates; horizontal and upward drags are ignored, so edge swipe-back is not taken over. Releasing dismisses when the drag passes min(22% of the viewer height, 120px) or on a downward flick of at least 0.5px/ms that has also travelled at least 24px. Flick velocity is measured over the pointer samples from the last 80ms rather than the last single move, so one quick sample cannot close the viewer, and a release more than 100ms after the last move counts as a hold rather than a flick. Any other release springs back. While dragging, the photo follows the finger 1:1, scales down to 85%, and the backdrop fades toward 15% of its opacity. A 200ms transition runs only while a released drag settles (spring-back or animate-out), so pinch, zoomed pan, and double-tap zoom keep their original untransitioned response. Dismissal completes on `transitionend` or a 260ms fallback timer, whichever comes first, through an idempotent close; a spring-back likewise clears its transition state on `transitionend` or a 260ms fallback timer, so the settle state cannot stick when no transition runs. Touches that land during the animate-out are ignored, so the photo cannot jump back under the finger. Swipe-dismiss is available only at base zoom; a second finger cancels it; `pointercancel` springs back; `prefers-reduced-motion` closes without animation. The `touchend` that ends a dismiss drag calls `preventDefault()`, and the reduced-motion close waits 80ms instead of unmounting inside `pointerup`, so the click that iOS WKWebView synthesizes cannot land on the chat bubble behind the viewer and reopen the photo. The X button, Escape, native back, focus restoration, and dialog semantics are unchanged, and no dependencies were added.
- Verification: 30 logic tests (slop and direction lock, distance cap, flick minimum distance, windowed velocity, stale-velocity guard, spring-back, cancel), `tsc --noEmit`, ESLint on the touched files, `git diff --check`, and the full web unit suite (189 files, 1,911 tests) passed. The gesture has not yet been exercised on physical iOS or Android devices.

## 2026-09-24 — Translation model selection for new accounts

- Surface: Translation model selector and account preferences after registration.
- Issue: GPT-6 Luna carried the `Best` badge, but a newly registered account inherited the Gemini fallback until it selected a model manually. An unrelated setting edit before the first server preference fetch could also sync the temporary Gemini UI value and overwrite a new account's GPT selection.
- User impact: New members could start with Gemini despite the new-account policy, while changing the shared fallback would unexpectedly switch existing accounts whose preference is unset.
- Resolution: Seed GPT-6 Luna only when a registered account row is first created across email, OAuth, and native Apple registration. Preserve all existing preference values and the Gemini fallback for existing unset and anonymous accounts. For a fresh account without cached preferences, omit the temporary model from pre-hydration preference patches and merge the server model into unrelated local edits; keep an explicit user model selection.
- Verification: Focused auth, account-preference, cache, and translation tests passed (130 tests), along with TypeScript, focused ESLint, and `git diff --check`.

## 2026-09-23 — Translation model Best badge correction

- Surface: Translation model selector in the live conversation settings.
- Issue: The `Best` badge still identified Gemini 2.5 Flash Lite after GPT-6 Luna became the preferred translation model.
- User impact: The badge could steer users toward a model other than the current recommendation.
- Resolution: Moved the `Best` badge to GPT-6 Luna and removed the badge from Gemini 2.5 Flash Lite. The default selected model and other model badges remain unchanged.
- Verification: Updated the translation model catalog test to assert the displayed badge metadata.

## 2026-09-18 — Correct dashboard usage for concurrent conversation sessions

- Surface: `/admin/dashboard` usage-time chart and its All, Android, and iOS filters.
- Issue: The dashboard interpreted `app_event_logs.usage_sec` as one monotonically increasing counter for each user. Current clients persist that cumulative counter per conversation session, so a person using two rooms could interleave a small counter from one room with a large counter from another. The old raw-event delta query then counted the counter gap as new use time repeatedly. Out-of-order asynchronous event retries could add further false deltas.
- User impact: The September 17 usage chart showed 1,419,645 seconds, obscuring the actual daily trend with an implausibly large spike.
- Evidence: A read-only production check found 7,317 usage events across 15 session counters that day. One interleaved user's two room-scoped counters accounted for 1,395,406 of the reported seconds. Re-running the corrected calculation for September 17 returned 29,219 seconds. A preliminary 2,206-second result exposed an additional first-observation case and was deliberately not shipped.
- Resolution: Collapse events to one daily high-water mark per `(user_id, session_key)`, then difference adjacent daily snapshots only within that same session. Carry each session's final pre-range snapshot forward so the first requested day remains comparable. If a session has no prior record, use its first in-range observation as the baseline, preserving its measured intra-day increase without inventing time before its first event. Treat a decreasing counter as a reset that contributes zero. The query retains a separate legacy null-session branch, allowing the normal and legacy baseline lookups to use equality predicates.
- Cache and performance: Bump the usage metric cache version from 1 to 2, so cached historical days are recomputed with the corrected rule without a manual cache-clear action. Add the partial `(user_id, session_key, created_at DESC, id DESC)` usage-baseline index. Production has no Prisma migration-history table, so the idempotent concurrent index was installed directly without changing event data; the checked-in migration preserves the same index for tracked environments.
- Verification: The production baseline lookup plan uses `app_event_logs_user_session_usage_created_desc_idx` and completed in 54.562 ms in the measured plan. The exact corrected September 17 aggregation returned 29,219 seconds after the index was added. Focused automated dashboard tests cover the daily high-water/session partition rule, first-observation baseline, legacy null-session handling, and cache-version invalidation.

## 2026-09-18 — Virtually deck mobile viewport fit correction

- Surface: `mingle-app/public/legal/xr-virtually.html`
- Issue: The Virtually presentation was visually acceptable on desktop but had several mobile-only layout failures. The first slide's copy retained a desktop left margin and created a hidden horizontal overflow; the IRIAM video on slide ten became too small on a 320px viewport; the strategy slide fourteen clipped its title at the top on short screens; and the opportunity slide nineteen exceeded the mobile slide height, hiding its title and overlapping the bottom navigation. The same title clipping also appeared on slides eleven and thirteen for Japanese and Simplified/Traditional Chinese at the smallest tested viewport.
- User impact: On narrow phones, viewers could miss the opening title, inspect the vertical demo only as a tiny thumbnail, lose the beginning of strategy/market titles, or see the opportunity sequence cut off behind the navigation controls.
- Resolution: Added mobile-only overrides under `max-width: 900px`. Removed the opening copy's leftover desktop margin, enlarged the vertical IRIAM video to a bounded `48vh`/`360px` mobile size, compressed the small-screen strategy spacing, changed the opportunity steps to a compact two-column mobile grid with a full-width highlight card and smaller logo cloud, and added small-screen compression for the CJK cost and market slides. No desktop selector or base desktop value was changed.
- Verification: Traversed all 20 slides at `390×844` and `320×568` for `ko`, `en`, `ja`, `cn-ZH`, and `cn-TW`. All 50 viewport/locale runs had zero external viewport-boundary overflows. Representative captures confirmed the opening image, slide-ten video, slide-fourteen title, slide-nineteen opportunity card, and CJK slide-eleven/slide-thirteen titles remain visible. A `1440×900` PC check confirmed the mobile class and mobile media query are inactive and the desktop opening composition remains intact. `git diff --check` passed.

## 2026-09-18 — Virtually short-mobile dense slide fit correction

- Surface: `mingle-app/public/legal/xr-virtually.html`
- Issue: The previous mobile rules did not cover a `375×568` viewport. Slides 8, 11, 13, and 17 centered content taller than the available screen, which clipped titles or put content behind the bottom navigation. Slide 12 kept its long English prompt on one line, and slide 18 left too little width for the final ecosystem label. The same short-height centering issue was also reproduced on slides 9 and 14.
- User impact: On short mobile captures, viewers could lose the beginning of a slide title, see the prompt cut off horizontally, or see data continue underneath the navigation controls.
- Resolution: Added a mobile-height-aware media block for the affected slides. Slides 8, 11, 12, 14, 17, and 18 use top-aligned compact layouts with reduced spacing and media typography up to an `820px` mobile viewport height; slide 12 wraps the prompt and constrains the reference image at every mobile height; slide 13 retains the domestic/global headings and first two representative categories per region while hiding the lower-priority rows on compact mobile screens; slide 18 uses smaller, width-safe ecosystem columns at every mobile height. Desktop rules remain unchanged.
- Verification: Checked all 20 slides at `375×568`, `375×812`, and `390×844` for `ko`, `en`, `ja`, `cn-ZH`, and `cn-TW`; all 75 runs had no title clipping, external viewport overflow, or direct slide-content boundary overflow. Confirmed the PC layout at `1440×900` keeps the mobile class/media query inactive and all eight slide-thirteen data blocks visible. `git diff --check` passed.

## 2026-09-18 Native bottom banner obscured the attachment tooltip

### `2026-09-18-attachment-tooltip-native-banner-overlay` | UI/UX issue found

1. **The attachment tooltip could render behind a bottom native AdMob banner**
   Problem: The attachment tooltip is rendered inside the WKWebView with a high CSS `z-index`, but the AdMob banner is a React Native sibling outside the WebView. A WebView element cannot paint above that native sibling, so the lower part of the tooltip was hidden whenever the conversation banner occupied the bottom edge.
   Fix: The conversation now treats the attachment menu and image preview as native-overlay state. While the composer reports its `open` state, the existing native overlay bridge hides the conversation banner; closing or unmounting the composer reports `false`, and the native conversation banner is restored through the existing zone transition. Browser/Web-only sessions are unchanged because the bridge is unavailable there.
   Data change: None. This is a native banner visibility and WebView overlay coordination fix.
   Verification: Focused composer interaction tests, TypeScript, ESLint, and the existing native banner-zone tests passed. Physical TestFlight verification remains pending.

## 2026-09-17 — Bound Soniox startup and propagate terminal STT failures

- Surface: Shared STT server and the conversation WebView STT hook on iOS, Android, and web.
- Evidence: Connections 513 and 524 reported Soniox 408 before client disconnection 30.0s and 22.5s later. The old server only logged provider errors and discarded audio received while the provider socket was connecting. These code defects are confirmed; the logs do not prove that either caused the upstream request timeouts.
- User impact: Early speech could disappear and a terminal provider failure could leave the app displaying a stale recording/connection state until the sockets eventually closed.
- Resolution: Buffer up to five seconds of PCM (also bounded to 512 queued chunks), send it in order after the provider configuration, bound the provider handshake to 10s, and reject slow-provider backpressure explicitly. Never restart a connection after Stop or accept a second configuration on the same client connection.
- Audio gaps: Send Soniox's JSON keepalive every 5s only while audio is absent. End sessions with no first audio after 15s, or with a 30s ongoing input gap, so keepalive cannot hide a dead microphone or retain paid sessions indefinitely. Normal silence is still valid PCM and does not trigger this timeout.
- Failure behavior: Flush the pending transcript once, settle any pending finalize, send a structured error and close immediately with code 1011. Stop-in-progress still receives its acknowledgement. Dispose queues and timers on Stop, disconnect, and failure; force-close an unresponsive client after 5s.
- Diagnostics: Record provider error type/request ID and aggregate audio counts/timestamps at failures and upstream close. Do not record audio payloads or transcript content. Record requested language hints separately from the legacy `languages` field; the existing disabled-hints behavior is unchanged.
- Authentication scope: The Google callback in the attachment had no cookies at all, then the next attempt succeeded. This branch already uses provider-specific SameSite cookies (Google Lax, Apple None). The attachment does not establish why that browser lost its cookies; no state/PKCE validation is bypassed or weakened.
- Verification: All 57 STT tests (including 12 new transport regressions), the STT production build, all 1,540 web unit tests, web TypeScript and targeted ESLint passed. Local mock-WebSocket tests cover ordered startup audio, silence, duplicate configuration, handshake timeout, upstream 408 without provider close, abrupt disconnect, Stop races, final transcript/ack ordering, keepalive, missing audio and bounded buffers. These tests need no external API keys. Added the STT suite/build to CI, including PRs targeting the messenger branch. Physical-device and production-provider validation remain pending; deployment requires the web and STT services, with no native binary or database migration change.

## 2026-09-17 — Re-review PR #219 interaction and storage edge cases

- Review findings: A keyboard context-menu action on a reaction badge opened the participant list but left the following synthetic click able to toggle that reaction. The copy/reaction menu also always chose below the message when the upper space was short, which could place a bottom-of-viewport menu outside the visible area. A partially configured private R2 credential pair could be combined with the public profile pair and produce an invalid mixed credential.
- Resolution: Mark keyboard participant actions as click-suppressed, choose the menu side with the greater available viewport space, constrain the menu height to the viewport, and fail closed when only one private credential is configured. No schema or migration change was needed.
- Validation: Added focused side-selection and credential-pair tests; the complete unit suite (1,636 tests), TypeScript validation, and targeted ESLint checks passed. User-owned uncommitted composer UI changes remain untouched.

## 2026-09-12 - Keep diagonal edge swipe-back gestures from becoming scrolls

- Surface: All full-screen panels and nested pages using the shared `SlideSurface`, including notifications, profiles, follow lists, location, sharing, room settings, and language selection.
- User report: On iOS, an edge-swipe-back that includes a small upward or downward component can begin moving the panel to the right, then hand control to the panel's vertical scroller. The panel returns toward its original position while the content scrolls, making the gesture feel like a failed close. The issue is intermittent and is not caused by a small hit area.
- Cause: The surface starts an x-axis Framer Motion drag at the left edge while keeping `touch-action: pan-y`. Its direction lock can classify an early diagonal sample as vertical, after which the browser's scroll handling wins and the panel drag is interrupted.
- Resolution: When a touch starts inside the existing 32px left-edge zone, claim the gesture immediately by temporarily changing only that surface's touch action to `none`, prevent scrolling after a small movement threshold, and keep the drag on the x axis without Framer's first-sample direction lock. Restore the caller's original touch action on pointer/touch end or cancellation. Touches outside the edge zone continue using the existing vertical scrolling behavior; button dimensions and content layout are unchanged.
- Compatibility: The native iOS WebView suppression already owned by `SlideSurface` remains unchanged. No route, history, API, database, Prisma migration, mobile/API namespace, or translation behavior changes are required.
- Verification: A WebKit fixture with a long scrollable surface confirmed `pan-y → none → pan-y` for an edge gesture. Targeted edge/history tests passed (16 tests), TypeScript no-emit and targeted ESLint passed, and `git diff --check` passed. A physical iOS device run is still required to confirm the exact reported diagonal gesture on WKWebView after the new WebView bundle is deployed.

## 2026-09-12 - Preserve language-selector open intent on iOS

- User report: The room header's language selector intermittently fails to appear until it is tapped several times on iOS. The user confirmed the tap target is large enough and that this behavior was not present previously. Keep the existing button dimensions, flag layout, and language-selection UI.
- Reproduced failure: A WebKit touch-enabled browser fixture used the pre-fix room's actual open/close/popstate callbacks and the real LanguageSelector/SlideSurface. Delay the browser's back traversal by 350 ms, close the selector, and tap the header again 40 ms later. The second tap sets the selector open, but the earlier traversal subsequently sets it closed. Repeated trigger activation also alternates between opening and closing. The initial ordinary tap opened normally in this fixture; this does not establish that every physical-device report has the same cause.
- Resolution: Extract selector navigation into a room-instance-owned controller and React hook. Opening is idempotent, closing updates local visibility immediately, and only one close traversal may be in flight. A new open during that traversal shows the selector immediately and adds exactly one fresh history entry after the old close completes. Another close, a hidden room, or a different URL cancels the reopen intent. Preserve Next.js and conversation-route state; do not use a timed iOS back/forward correction loop for this selector.
- Isolation: Include the owning room instance in the selector history marker. Background/running rooms ignore another room's selector events, and their cleanup cannot erase its marker. The existing full-screen slide animation, language-option behavior, keyboard search, member-cache refresh, and native back-handler priorities are unchanged. This change does not enlarge the touch area, add a network dependency, or alter conversation language defaults.
- Verification: The same WebKit fixture keeps the reopened selector visible at its final on-screen position after the delayed traversal, and repeated activation keeps it open with a single overlay entry. Twelve close/reopen cycles at 25/120/400 ms intervals, Escape, and browser back/forward also pass with room history preserved. Unit regression cases cover delayed close/reopen, duplicate close, the latest close winning, browser back/forward, room/route changes, background room isolation, menu cancellation, and owner-only cleanup. All 165 non-live test files / 1,536 tests pass, along with TypeScript no-emit and targeted ESLint. Physical iOS app testing has not been performed in this change; the fixture is WebKit automation, not a connected WKWebView session.
- Delivery: WebView code only on `codex/messenger-tabs-device-test`. No production database writes, Prisma migration, mobile rebuild, store release, or mobile/API namespace change is required. After the web deployment completes, reopen the iOS app and verify a single tap as well as closing and immediately reopening the selector.

## 2026-09-11 — 번역 대기 영역 재발

- 요청: 발화 버블 첫 표시부터 번역 대상별 국기와 대기 표시가 자리를 차지하고, 발화 종료/최종 번역 전환 중에도 사라지지 않아야 한다.
- 작업 위치: `codex/messenger-tabs-device-test`의 `92413c9a`에서 새 브랜치 `codex/translation-placeholder-session-stop`과 별도 워크트리 `/Users/nam/mingle-translation-session-fix`를 생성했다.
- 번역 초기 표시 원인: `60f13766`에서 추가된 공유 대화 실시간 전송은 원문/번역 텍스트만 보내고 `targetLanguages`를 보내지 않았다. 받는 기기는 첫 번역이 도착하기 전까지 표시할 번역 언어를 알 수 없었다. 로컬 발화 생성기와 펼친 버블 자체에는 이미 대상 언어/대기 표시 지원이 있었다.
- 번역 확정 전환 원인: `66a5010d`에서 도입된 `pruneUnresolvedTranslationTargets`가 일부 중간 번역을 확정 발화에 옮길 때도 아직 텍스트가 없는 대상을 삭제했다. 공유 미리보기를 원문만 저장된 서버 메시지로 교체할 때는 미리보기의 번역 대상/중간 번역도 함께 사라질 수 있었다.
- 수정: 실시간 송신/메시징 중계에 검증된 번역 대상 목록을 추가했다. 대상 정규화는 빈 번역 텍스트만 정리하고 대상 언어 행은 유지한다. 공유 미리보기에서 저장 메시지로 전환할 때 번역 대상과 중간 번역을 이어받고, 최종 번역이 도착하면 해당 텍스트로 교체한다. 원문을 먼저 저장하는 API에도 그 발화의 대상 목록을 함께 보내고 메시지 메타데이터에 보존해, 실시간 미리보기를 놓쳤거나 만료된 수신자와 재접속/새로고침 hydration에도 대기 행을 복원한다. 후속 원문 전용 서버 응답도 기존 대상 목록을 지우지 않는다. 과거 메시지에 현재 방의 언어 설정을 소급 적용하지 않는다.
- 자동 Stop 조사 및 수정은 사용자 지시로 되돌렸다. 현재 브랜치에는 이 문제를 위한 네이티브 앱 변경이 포함되지 않는다.
- 검증: 전체 웹 단위 테스트 160개 파일/1,494개와 스크립트 테스트 6개를 통과했다. 번역 대상의 웹 송신·내구성 전송·서버 저장·재접속 hydration을 포함한 집중 266개, 메시징 24개, 웹/메시징 TypeScript 및 변경 파일 ESLint 검사도 통과했다.
- 회귀 검증 범위: 실제 송신기 → 메시징 중계 → 다른 사용자 미리보기 → 원문 저장 → 최종 번역의 경로에서 렌더링된 행 수/국기/대기 표시를 검사했다. 로컬 발화 확정도 미완료 언어를 유지한다.
- 한계: 물리 기기 마이크 테스트는 수행하지 않았다. 번역 텍스트가 여러 줄로 늘어날 때의 정상적인 높이 증가는 남는다.
- 반영 범위: 새 작업 브랜치에 커밋/푸시한다. 번역 수정은 웹 앱과 메시징 서비스를 함께 배포해야 한다. 이 작업에서 네이티브 앱 변경, 운영 배포, 앱/API 버전 변경, 스키마 변경과 마이그레이션은 없다.

## 2026-09-09 - Paginate crowded user search results

- Surface: Explore/search tab user results on web, iOS WebView, and Android WebView.
- Issue: User search returned only one server page of 20 users. When a query matched more users, the list silently ended after the first viewport-sized page, so users could not discover the remaining matches or tell whether more results existed.
- Resolution: Add deterministic cursor pagination ordered by `updatedAt` and `id`, keeping the existing account, block, deactivated-user, and anonymous-user filters. The API returns at most 20 users plus an opaque `nextCursor`; malformed cursors are rejected before the database query. The client resets pagination for every new query, appends de-duplicated pages, and keeps the cursor in the scoped search cache and history snapshot.
- Interaction: Keep the first result page visible while loading additional pages. Show a localized “Load more” action below the results and automatically request the next page when the sentinel approaches the scroll viewport. The button remains available as an explicit fallback, shows a loading state during the request, and exposes a retryable error without discarding already-loaded users. The control is hidden when the server reports the final page.
- Compatibility: This is a Web/API change only. No Prisma migration, native code, mobile version, or API namespace change is required; existing versioned search routes re-export the shared handler.
- Verification: Search-route tests cover the 20-user page boundary, cursor emission, and malformed-cursor rejection. Search-cache tests cover cursor persistence, pending-query clearing, namespace/account isolation, anonymous filtering, and stale snapshots. Targeted Vitest, TypeScript no-emit, targeted ESLint, and whitespace checks pass. Physical iOS/Android scrolling and real authenticated Devbox data remain manual follow-up checks.

## 2026-09-09 — Resolve PR 219 photo storage and push review findings

- Review findings: Conversation images used the public profile R2 bucket, allowing
  anonymous reads when the object URL was known. Image sends also omitted the
  APNs/FCM conversation-message notification, so backgrounded recipients received
  no photo-arrival notification.
- Storage correction: Require the dedicated `CLOUDFLARE_R2_CONVERSATION_BUCKET_NAME`
  (or `R2_CONVERSATION_BUCKET_NAME`) and reuse the existing R2 account credentials.
  Refuse missing credentials/bucket and either configured public profile bucket.
  Every put/get/delete targets only the dedicated bucket; missing objects never
  trigger a public fallback. Profile-image storage remains unchanged. Provisioning
  must disable r2.dev, custom domains, and any public Worker access to this bucket.
- Credential correction (2026-09-09): Prefer the separately scoped
  `CLOUDFLARE_R2_CONVERSATION_ACCESS_KEY_ID` and
  `CLOUDFLARE_R2_CONVERSATION_SECRET_ACCESS_KEY` when present. Fall back to the
  profile credential variables only for deployments whose single token can access
  both buckets. This prevents a profile-only token from causing photo uploads to
  fail with R2 `AccessDenied`.
- Image viewing (2026-09-09): Tapping a sent photo opens a dark, full-size viewer.
  The viewer uses pointer gestures with `touch-action: none` so iOS and Android
  WebViews can pinch to zoom up to 4x and pan the enlarged image without scrolling
  the conversation. A double tap toggles 2x zoom, and the close control remains a
  44px touch target above the image.
- Notification correction: The successful database insert schedules the existing
  conversation push helper through Next after(). Resolve recipients after pending
  invitation materialization and use the stored message ID, authenticated sender,
  and a Photo preview. Matching retries and concurrent insert losers do not queue
  another push. Provider errors are caught after the response and do not turn a
  saved image into a failed send. Delivery retains the existing best-effort policy.
- Validation: 62 targeted tests passed, covering private-bucket-only reads/writes/
  deletes, unsafe or missing configuration, missing private objects, image access
  rules, JPEG processing, successful push scheduling, retries/concurrent losers,
  newly materialized recipients, push failure, and existing text/realtime behavior.
  A real request to the existing isolated devbox returned HTTP 503 without the new
  bucket setting, confirming public storage is not used as a fallback. Full TypeScript
  and targeted ESLint checks passed.
- Deployment: Add the dedicated private bucket setting and grant the existing R2
  credential access before enabling photo sends. This follow-up does not provision
  or change production Cloudflare/Vault resources. Private-bucket live access and
  native APNs/FCM delivery still require deployment/device verification. The two
  existing PR migrations remain the only database changes; no new migration or
  native/version change is introduced here. Updated the Railway deployment guide
  with the bucket, migration, existing-object cleanup, and device test sequence.

## 2026-09-09 — Install PR 219 on connected iOS 18 and Android phones

- Request: Rebuild/install the current branch on the connected iOS 18 and Android
  phones and restart all devbox services using prod Vault and Cloudflare tunneling.
- Runtime: Restarted this worktree's devbox supervisor with `--profile device`,
  `--tunnel-provider cloudflare`, and `--vault-path secret/mingle/prod`. Do not use
  `--device-app-env prod` for this setup: that option skips local servers/tunnels
  and points the native apps at the production service. The three local services
  run on ports 15558 (web), 17558 (STT), and 19558 (messaging).
- Connectivity: The web tunnel returns HTTP 200 after its locale redirect; the STT
  tunnel completes a WebSocket handshake; messaging health reports realtime
  configured. Both apps point to `mingle-app-devbox.photo-for-passport.com` and
  `mingle-stt-devbox.photo-for-passport.com`. Servers and the named tunnel remain up.
- Devices: Installed and launched Release builds on the connected iPhone 11 Pro
  running iOS 18.6 and Galaxy S9 (SM-G960N). iOS is 2.0.3 (105) with `ios/v2.0.3`
  and the photo-library usage description; Android is 2.0.3 (97) with
  `android/v2.0.3`. Native app processes were verified running on both phones.
- Android install issue: The existing installation had a different signing
  certificate, so in-place installation failed with INSTALL_FAILED_UPDATE_INCOMPATIBLE.
  Uninstalled it and installed the successfully built APK, then launched it.
  Android requires signing in again. iOS installation preserved its app data.
  Local CocoaPods checksum/formatting churn was removed from the tracked diff.
- Pending prerequisites: Read-only inspection found none of the four new feature
  tables in the prod Vault database and no Prisma migration-history table. Asked
  the user before applying the two migrations to that production database; no DDL
  has been executed. The dedicated private bucket setting is missing from prod
  Vault, and the existing R2 object credential cannot list/manage buckets (403).
  The Mac is locked, preventing Cloudflare dashboard access, so requested unlock
  to provision private storage. No production Cloudflare/Vault changes were made.
  Installation and service connectivity are complete, but reaction/biography and
  photo feature acceptance must wait for these database/storage prerequisites.

## 2026-09-09 — Align conversation photo controls and anchor attachment menu

- Report: Voice mode showed a plus button at a different height from the keyboard control; keyboard attachments opened an unnecessarily large modal.
- Change: Voice mode now opens the photo picker directly through a photo icon with the same button dimensions, icon size, stroke, and vertical alignment as the keyboard control. Keyboard mode keeps the photo trigger beside the independent keyboard-close control and shows a compact photo-only tooltip immediately above the trigger. The preview remains a confirmation dialog.
- Follow-up: The first tooltip implementation was clipped by the input shell's `overflow-hidden`; changing that shell to `overflow-visible` kept the tooltip anchored to the button while preserving the input layout.
- Validation: TypeScript check and targeted ESLint passed. Android physical-device verification confirmed the voice-mode alignment, keyboard-mode side-by-side controls, and visible anchored tooltip. iOS was relaunched against the same tunnel; physical screenshot verification remains pending.

## 2026-09-09 — Avoid the generic Mingle user label in Explore search

- Surface: Explore search result names and handles, including cached results restored after tab navigation.
- Issue: A valid user with a handle but no profile name was rendered as the localized fallback `Mingle 사용자`, even though the row already contained the account's real handle. This made an incomplete profile look like a synthetic system account and caused the generic label to reappear after returning to the search tab.
- Resolution: Use the trimmed handle as the display name when a profile name is absent, and render the secondary handle line only when it adds information beyond the profile name. The existing fallback remains only for malformed records with neither a name nor a handle, while cached and fresh search payloads now follow the same rendering rule.
- Data change: None. No Prisma migration, API namespace, native bridge, or server configuration change is required.
- Testing notes: Search for a broad query that returns a name-less account, verify the real handle is shown once instead of `Mingle 사용자`, then leave and return to Explore to confirm the cached row uses the same display rule.

## 2026-09-09 — Localize Explore pagination controls

- Surface: Explore user search pagination, including the `Load more`, loading, and retry-error states.
- Verification: The app exposes 15 primary UI languages. Pagination copy is defined beside the existing Explore/search copy in `primary-ui-copy.ts`, merged through `getSupplementalDictionary()` and `getDictionary()`, and consumed by `connect-page.tsx` instead of owning a separate translation path.
- Resolution: Require all three pagination strings in every primary UI dictionary and add an exact 15-locale contract test. Supported locales outside the 15 primary UI languages continue to use the established English supplemental fallback.
- Data change: None. No Prisma migration, API namespace, native bridge, or server configuration change is required.
- Validation: The i18n test covers all 15 localized values and the English fallback for a non-primary supported locale.

## 2026-09-09 — Preserve restored Explore search pages

- Surface: Explore search when returning from a user profile or remounting the search tab after loading multiple result pages.
- Issue: The history snapshot restoration effect populated the query, results, and next cursor, but the initial search effect then ran with its first-render empty query and cleared those values. The restored list could disappear or trigger an unnecessary first-page request, losing the loaded-page state.
- Resolution: Track the pending restored query separately. Skip the initial empty-query search effect, preserve the matching restored query state once it arrives, and consume the restore marker when the user changes the query so normal search behavior remains unchanged. Normalize restored history queries before comparing them.
- Data change: None. No Prisma migration, API namespace, native bridge, or server configuration change is required.
- Validation: Added restore-state regression tests for the initial effect, repeated mount-effect replay, restored query, and changed-query paths. The full web unit suite passed with 164 files and 1,521 tests; targeted lint and TypeScript checks also passed.

## 2026-09-09 — Hide the reserved admin handle from Explore search

- Surface: Explore user search API responses, fresh result rendering, and cached result restoration.
- Issue: The reserved `admin` account was still eligible for user search and could appear as a normal followable result. This was especially visible in broad searches that were being used to validate pagination and cache restoration.
- Resolution: Treat `admin` case-insensitively as a search-excluded handle alongside anonymous tracking handles. The database query excludes it before pagination, while the client and session cache remove any stale `admin` row that was already received.
- Data change: None. No user record, Prisma migration, API namespace, native bridge, or server configuration change is required.
- Testing notes: Search with a broad query and an `@admin`-like query, verify no case variant of the reserved handle appears, then return to Explore from a cached result set and confirm it remains absent.

## 2026-09-08 - PR 217 delayed translation preview refresh

- Issue: The conversation list reported a finalized utterance only once per ID. Translations arriving after source finalization, corrected final translations, and display-language changes updated the room bubble but left its list preview stale.
- Resolution: Compare the latest reported message content as well as its ID. Publish same-message preview changes while preserving the original reported timestamp. Only a new message clears the interim preview or triggers read-state updates, so a late translation cannot erase the next live utterance's preview.
- Verification: Regression coverage follows one finalized message through original text, delayed translation, final correction, duplicate updates, and display-language changes; it also checks a new message with identical text and stable timestamps for legacy messages without creation times. All 616 related conversation and bubble tests, full TypeScript checking, and ESLint for the changed components passed.
- Deployment: No new Prisma migration, environment variable, native rebuild, mobile version change, or API namespace change is required. PR 216 and PR 217 use existing message content and language fields.

## 2026-09-08 - Prepare the unified 2.0.3 store release

- Integrated service-branch PR #215 before release. Retained timestamp-descendant scroll anchors and calendar-day dividers while preserving the Local-first branch's canonical speech-start ordering and message-ID tie breaker. Both branches' issue histories remain intact.
- Set iOS marketing version/API namespace to 2.0.3 (build 105) and Android version/API namespace to 2.0.3 (version code 97). Extended Android 2.0.2/2.0.3 aliases and compatible pending-work namespaces to preserve installed 2.x server behavior and recover an upgrading user's queued work.
- Production packages use the verified Railway production web/STT endpoints, production client configuration, release signing and disabled QA bridges. Production Vault currently lacks the public runtime URLs, so archive arguments explicitly provide the verified production endpoints without changing Vault secrets or using development tunnels.
- Do not raise minimum/recommended/latest-version server policy before store availability. This release preparation does not add a Prisma migration or change those policies. Store submissions and server deployment must be verified independently from successful local builds.

## 2026-09-08 - Stream counterpart speech before finalization

- Surface: Shared conversation bubbles, the same mounted room's hidden list consumer, and conversation WebSocket delivery.
- Report and cause: The recipient still waited until speech finalized, then fetched room history after an invalidation. Reserving speech-start order did not transmit partial text. Local development history requests also added seconds of DB/network latency; changing the tunnel alone could not remove the finalization gate.
- Resolution: Coalesce each local turn's latest partial into bounded WebSocket updates (at most four frames/second per room hook, with one-second unchanged heartbeats). The receiver renders an ephemeral bubble immediately and replaces it by the committed message with the same client ID. Source and final translations travel in the committed payload without waiting for a room GET or optional title generation. Late source-only updates retain already received translations. Server-signed first-preview time also supplies the durable voice-order receipt. The existing HTTP reservation remains a fallback.
- Safety: Read and write capabilities are separate, account/room scoped, refreshed every 20 seconds and expire after 30 seconds. Membership and write-block checks run when granting capabilities. Legacy tokens cannot opt themselves into content streaming. Sender ID and name come from signed server claims, not preview fields; frames, memory, sequence and backpressure are bounded. Commit tombstones reject late partial resurrection. Account/room/namespace changes isolate client state; temporary previews never enter localStorage or the durable outbox. Durable source/translation retry and reconnect hydration remain intact, with a visible-room recovery check at least once per minute even during uninterrupted preview traffic. Shared payload attribution checks membership at the persisted message timestamp, preserving historical solo/diarized messages after joins or departures.
- Compatibility and limits: Legacy sockets and all conversation-list topics retain invalidations. Mid-speech previews cover an already subscribed room (including its mounted hidden consumer), not every unopened room in the list. Pending invitees still become members at the first persisted message and cannot receive its earlier partial. Offline recipients recover persisted messages after reconnect, not transient speech history. Partial text expires after 15 seconds without updates; finalized previews have a 120-second grace per received frame while durable persistence continues independently. Permission revocation has a maximum existing-capability lifetime of 30 seconds. STT/provider and network latency before partial text exists is not eliminated.
- Verification: 159 web test files / 1,472 tests and 20 messaging tests pass. Web and messaging TypeScript checks and targeted web ESLint pass. Isolated real WebSocket clients verify reception before finalization, committed translations, legacy compatibility and room separation. Additional regressions cover expired/cross-account capabilities, spoofed identities, late-frame fences, offline coalescing, preview expiry, final-translation preservation, signed ordering and historical solo attribution. These tests do not use production conversations or substitute for physical microphone tests. Live provider tests require a separate configured harness and were not validated.
- Deployment: No new environment variable, migration, native code or version change. Deploy both mingle-app and mingle-messaging; updating the web service alone cannot enable the new transport. The existing native apps can load the updated WebView. Device checks: reopen both apps, speak a long sentence and verify counterpart text appears before stopping; verify one bubble survives source/final translation delivery, ordering agrees on both devices, and reading older messages does not force-scroll to the bottom.
- Local runtime verification: Restarted this worktree's Devbox with `secret/mingle/prod` and the named Cloudflare tunnel. Public web and messaging health endpoints returned 200. Two synthetic subscribers in a unique, otherwise unused room received a partial through the actual Cloudflare endpoint in 135 ms, followed by the synthetic committed translation payload. This checks transport only, not microphone recognition or DB persistence; it wrote no production messages and sent no audio.

## 2026-09-08 - Keep native Stop intent stable through trailing events

- Surface: Shared iOS/Android WebView STT controls and the React Native stop lifecycle bridge.
- Resolution: Keep a bounded, account/API-namespace/conversation-scoped in-memory Stop intent shared by visible and hidden hooks. ACK, close, error, and the existing five-second fallback end the pending wait but do not clear the intent; a subsequent explicit native Start clears it. Ignore live status replay before session adoption while stopped and prevent trailing activity from reopening the control. Do not reuse a stopped cached session on restart.
- Compatibility: Installed iOS shells can still emit an early synthetic stopped status. That status no longer completes the WebView stop wait or retires the pending identity. Actual ACK/close resolves it, with the existing timeout retaining a restart escape route. Parse messages before activity promotion: control ACKs, pong, and malformed messages are not recording activity. Final transcripts remain eligible for processing while stopped; partial transcripts do not reopen a completed turn.
- Native correction: Emit stopping before calling the native stop API. Promise resolution means request acceptance, so preserve stopping until the real terminal event (or preserve a terminal state already delivered by Android). Stop acceptance no longer emits a synthetic stopped event or prematurely retires the native identity. Existing stale-session filtering remains; this change does not add generation metadata to Swift.
- Verification: The complete web suite passed 158 files / 1,464 tests, followed by a four-test focused lifecycle suite including an additional timeout regression. All 13 RN suites / 68 tests and both TypeScript checks passed. Targeted web ESLint passed. RN ESLint could not initialize because the RN ESLint 8 runner loaded a parent ESLint 9 rule implementation; no lint success is claimed for RN. Jest reported a post-suite open-handle warning. The lifecycle regression exercises ordered early stopped/running/final/ACK/closed/stale-ready events through the production guards and shared registry; it is not a real microphone or mounted-device integration test.
- Deployment and limits: No DB migration, environment variable, or API/app version change is introduced. The WebView protection supports currently installed shells after the updated page loads. The RN correction requires a rebuilt installed app bundle and was not installed in this change. Stop intent is in-memory, not durable across a full WebView process reload. Device voice testing remains with the user: verify Stop stays on Start, last words persist, and an intentional subsequent Start records normally, including room/list transitions.

## 2026-09-08 - Diagnose recurring iOS Stop/Start control flicker

- Observation: Pressing Stop briefly shows Start, then Stop again, then Start, particularly on iOS. This investigation reads current source/history only; it does not establish physical microphone restart or measure the reported 100-ms transitions on a device.
- Existing protection remains: The May 25 stop-pending status/activity guards from `1908e2de` are still present. Recent voice-order/translation/entry changes did not remove them.
- Lifecycle mismatch: iOS NativeSTTModule.stop calls beginGracefulStop and immediately resolves the native promise while its socket remains alive for trailing transcripts/stop_recording_ack. React Native handleNativeStop treats that promise resolution as completion and emits stopped with stopping:false. The WebView's idle-status handler clears nativeStopRequested and resolves the pending stop; the awaiting stop routine then clears isStopping. These protections are therefore gone before native cleanup necessarily finishes.
- Re-entry path: iOS emits raw messages with conversation ID but no session-generation ID/event sequence. Once the early stopped event clears the active identity, these untagged trailing messages are not rejected by the retired-session filter. The WebView promotes idle to ready for any accepted native message BEFORE inspecting whether it is merely stop_recording_ack. Swift itself emits that ack message before calling finishGracefulStop/close, so even an acknowledgement can create the observed ready/idle flash. No new Start command or microphone restart is required for this UI transition.
- Historical interaction: The explicit RN stopped notification was added in `1efd5d1e` (conversation-scoped native sessions), and later restart/handoff work (`91a6e9f3`, `b367ae93`) added/refined idle-driven stop completion. Android has session IDs, status sequences, and explicit stopping metadata that reduce exposure; the shared acknowledgement/promotion logic still deserves regression coverage there.
- Proposed correction: Distinguish stop request acceptance from actual capture/transport termination; preserve stop intent until a genuine terminal lifecycle event. Parse control messages before promoting activity and never let stop acknowledgements promote ready. Identify retired generations end-to-end and allow final transcript persistence without reopening the UI. Add an ordered integration regression covering tap, early native promise completion, trailing final text/ack, close, and an intentional subsequent Start, rather than testing only guards with isStopping=true.
- Scope: Diagnosis recorded only; no product/native code, installation, configuration, or production data changes were made.

## 2026-09-08 - Remove the translation waiting label

- User request: Remove the visible translation-pending/original-fallback explanatory text from message bubbles.
- Resolution: Remove the label and its unused localized copy. Preserve original-text fallback, the existing interim indicator, translation retries, and automatic preferred-language selection when translations arrive.
- Verification: Rendering regressions cover both pending and retrying states, asserting that the original remains visible without the waiting label. No native rebuild, schema migration, or runtime configuration change is required.

## 2026-09-08 - Preserve voice start order, follow arriving translations, and anchor only on entry

- Voice order: On a new local pending voice turn with recognized text, request an authenticated, account/session/message-scoped server start receipt through the existing client-event handler. The server checks current room membership/block eligibility, timestamps receipt at request entry, and signs it with a domain-separated HMAC using the existing messaging secret. Finalization verifies signature, scope, non-future timestamp, and 30-day expiry, then stores the verified start time in message metadata. Shared-room canonical display ordering uses that time plus the DB message ID. Database creation time, unread calculations, membership attribution, and pagination cursors remain based on persistence time; no empty draft messages are inserted.
- Reservation lifecycle: Deduplicate per owner/API/session/message, bound the in-memory cache to 200 entries with 30-minute expiry, abort the request after 3.5 seconds, and wait at most 200 additional milliseconds for an in-flight receipt when finalizing short speech. Persist the receipt into the durable message journal before source transmission and reuse it for translation updates and retries. Missing/failed/expired reservations, unavailable signing configuration, final-only STT events, and offline starts fall back to persistence order rather than trusting a device timestamp or withholding the message. This reserves order; it does not stream another member's unfinished speech. Existing messages are not backfilled. History pages still represent persistence windows and are merged into display order on the client.
- Translation display: Replace the mount-time automatic language snapshot with a derived choice that follows available languages and the viewer's preferences. Keep only explicit per-message language choices in state. A counterpart source-only snapshot can initially show the original and then switch to the preferred translation when it arrives; a manual original-language choice is not overwritten. Move translation-update realtime publication ahead of optional AI title generation. This fixes the confirmed display path and a publication delay, not a guarantee against external translation-provider failure.
- Entry scrolling: Remove the initial server-response gate for cached transcripts. After local hydration and viewport mount, anchor to the latest message synchronously in a layout effect, before the transcript's visible paint, once per visible room entry. Reset the entry anchor only on leaving/changing the room. Cold rooms wait for the first message snapshot before anchoring. Remove the 180-ms/120-ms forced-follow timers and repeated entry animation-frame jumps.
- Reading protection: After the entry anchor, keep the existing 100-pixel near-bottom new-message policy and older-history prepend anchoring unchanged. Neither a new server snapshot nor translation arrival resets the entry flag. Reading above the near-bottom range must not be overridden by the removed entry-follow timer.
- Verification: Added signed-receipt tampering/scope/expiry/configuration tests, permission-denied reservation tests, no-placeholder/no-backdated-creation assertions, scoped reservation deduplication and timeout tests, durable receipt checkpoint/source/translation propagation, long-voice-versus-earlier-persisted-reply ordering, automatic/manual language reconciliation, and one-shot cached/cold entry regressions alongside the existing near-bottom tests. Full non-live suite: 157 files / 1,460 tests; TypeScript and targeted ESLint passed. The local Cloudflare web endpoint and installed iOS namespace are reachable; an unauthenticated room probe returns 401 as expected. No physical-device or microphone test was performed in this change.
- Delivery: Web/server changes only on the client-SOT branch. No Prisma migration, new environment variable, native rebuild, installation, service-branch merge, or production deployment. Existing `MINGLE_REALTIME_SECRET` enables start receipts; absence gracefully retains persistence ordering. Reopen both test apps to load the new WebView and verify long voice/reply ordering, counterpart translation arrival/manual language override, immediate bottom entry, and preservation of an intentionally scrolled-up viewport.

## 2026-09-08 - Diagnose long-turn positioning, counterpart translation display, and bottom entry

- User observations: A long voice turn starts its local bubble much earlier than its eventual finalized message insertion, counterpart messages appear as original text without translation, and room entry shows older messages instead of opening directly at the bottom. This entry records diagnosis and proposed work, not implemented fixes or new physical-device tests.
- Long-turn limitation: The shared timestamp/ID ordering fix makes acknowledged messages converge but uses database insertion time after finalization. It therefore cannot preserve a long utterance's starting position. The recommended protocol reserves a stable message identity and server-authoritative ordering position when a shared utterance starts (or its first recognized fragment arrives), then updates that same message on finalization/translation. Do not substitute unvalidated local device timestamps for global order. Define offline provisional behavior and cancellation/recovery before implementing a reservation protocol; transient drafting indicators are distinct from publishing partial speech content.
- Translation display defect: Source-first hydration derives targetLanguages only from persisted final translations. A newly mounted source-only ChatBubble therefore initializes its displayLanguage to the original. Later translation hydration adds available languages, but the component has no reconciliation effect for that automatic initial selection; setDisplayLanguage is only called by user interactions after initialization. The fix should follow the viewer's preferred language as translations arrive unless the user explicitly selected a language. This establishes a display failure path, not proof that every reported translation reached the database/device. Separately, durable delivery waits for source acknowledgement before uploading translation results, and translation-update handling awaits automatic title generation before realtime publication; both can add delivery delay. Recent finalize HTTP 200 logs alone do not prove complete translation delivery for the affected message.
- Bottom-entry defect: LivePhoneDemo still returns a full loading frame while initial server hydration is pending, even with locally cached messages. The chat scroll element is absent then. Initial-bottom effects can run while its ref is null and do not directly depend on the server-pending gate opening. Subsequent timer-based height correction starts at 180 ms and repeats every 120 ms; cached data being available does not by itself guarantee a bottom-aligned first visible frame.
- Proposed entry behavior: Render cached room content without waiting for unrelated server notices, anchor the mounted chat viewport to the bottom before its first visible paint, and preserve that anchor through initial layout changes without smooth scrolling. Stop automatic following on intentional upward scrolling; preserve older-history prepend position. Keep permission/revocation checks server-authoritative and scope cached notices to the correct room/account. A no-cache first visit still requires fetching messages, but should reveal the resulting transcript already at the bottom.
- Verification scope: Read current source and existing local Devbox request logs only. No product code, native installation, production data, or runtime configuration was changed for this diagnosis.

## 2026-09-08 - Converge shared-message order and reduce hydration round trips

- Surfaces: Shared-room messages on iOS/Android, persisted local message caches, history pagination, and realtime-triggered room hydration.
- Ordering fix: Add optional `serverCreatedAtMs` and `serverMessageId` to shared-message hydration. Reconcile these fields into already-cached utterances and use the same timestamp/ID comparator in store insertion, merged display messages, and the final room timeline. Each sender retains its original capture timestamp for existing display/draft behavior, but acknowledged shared messages no longer use a mixture of local capture time and counterpart persistence time as their ordering authority. Equal database timestamps resolve by database message ID, matching history pagination. Pending messages remain immediately visible with provisional local ordering until acknowledged; this does not claim a global order for unsent messages.
- Scope/compatibility: Emit canonical fields for currently shared rooms or messages marked shared at creation. Keep solo speech capture ordering, existing source text/translation reconciliation, the existing database cursor, membership authorization, block filtering, usage values, total message count, invitation notices, and member profiles. Optional response fields do not require an API namespace or native version change.
- Latency fix: Replace the sequential transaction of independent hydration reads with concurrent reads and start member/pending-invite profile reads in the same group. Do not remove aggregate values from push refreshes. An experimental reduced response path skipped usage/count reads but did not materially improve warm latency and could leave counters stale; it was removed before commit. Realtime delivery still invalidates and fetches a full authorized room snapshot, rather than transporting message content or introducing a new delta protocol.
- Read-only performance verification: Alternated the previous committed hydration helper and the updated helper against the same production test room via the prod Vault database URL. Baseline durations were 3622, 2625, and 2614 ms; updated durations were 2384, 1653, and 1640 ms. Both returned 55 messages with a total count of 55. The last two warm samples averaged 2619.5 versus 1646.5 ms, approximately 37% lower. These are local-to-production hydration-function timings, not phone send-to-display latency or production-server benchmarks. Initial connection/pool setup affected the first pair. No database rows were modified; temporary probes were removed.
- Regression verification: All 155 non-live test files / 1,450 tests passed, along with TypeScript. New tests cover opposite sender caches, repeated snapshots without state churn, cache serialization/reload, identical timestamps with deterministic ID ties, reversed legacy caches, older-page arrival, device clock skew, malformed cached timestamps, retained aggregate reads, and membership denial before message reads. Targeted ESLint and whitespace validation were also run.
- Local delivery: The existing prod-Vault Devbox web server and Cloudflare tunnel are reachable. Both installed mobile API namespace routes compile and reject unauthenticated probes with 401 as expected. These checks do not substitute for a new physical-device authenticated end-to-end run; no voice test was performed.
- Deployment: Commit only on `codex/messenger-client-sot-2.0.1`. No service-branch update, production deployment, new secret, Prisma migration, native rebuild, or reinstall is needed for this change. Reopen both test apps to load the updated WebView, then compare message order after acknowledgments, re-entry, and history loading. Remaining local network/persistence delay is not eliminated by this optimization.

## 2026-09-08 - Diagnose cross-device message latency and divergent ordering

- User observation: In a shared room between the connected iOS 18.6 and Android phones, counterpart messages appear several seconds late and the two phones show different message orders. Diagnosis performed against client-SOT commit `9937c3cf` and the running prod-Vault Devbox; no product fix or device automation was performed for this investigation.
- Ordering cause: `mergeServerHydrationUtteranceIntoStoreState` keeps an existing local `createdAtMs` indefinitely. New remote utterances receive `AppMessage.createdAt` from server hydration. The timeline sorts by these mixed timestamps. Each sender therefore retains its own capture time and sees the other sender's later persistence time. The same preservation logic also exists in `codex/messenger-tabs-device-test` at `4e8df995`.
- Reproduction: A temporary Vitest fixture invoked the actual merge helper with synchronized clocks, A locally created at T, B at T+500 ms, and an identical server snapshot placing A at T+2000 ms and B at T+2500 ms. A's store resolved to A,B; B's store resolved to B,A and remained different after three identical hydration passes. The diagnosis test passed and was removed afterward to avoid enshrining incorrect behavior as a desired contract. This demonstrates the code defect, not extraction of the phones' exact displayed message pair.
- Latency evidence: The current Devbox log repeatedly shows shared-room GET requests around 3.1–4.8 seconds, with compilation generally only a few milliseconds. Some client-event POSTs take 6–10 seconds, but those also include work after realtime publication, so their total duration is not a direct send-to-display measurement. A separate read-only Prisma connection using the prod Vault DATABASE_URL measured SELECT 1 at 1228 ms initially, then 453, 593, 363, and 448 ms. No production rows were changed by the diagnostic probe.
- Delivery path: Source persistence and membership resolution precede realtime publication. The realtime event contains invalidation keys, not message content. The receiver then fetches full room hydration (identity/membership, messages, usage, counts, invites, and member profiles). Ongoing hydration coalesces pushes into a subsequent fetch. Remote database round trips amplify this path in the local environment; the exact production latency and the precise contribution of Cloudflare were not measured.
- Proposed correction: Keep local-first pending display, but assign acknowledged shared-room messages a common canonical order with a deterministic ID tie-breaker. Separate display/capture time from canonical ordering and pagination identity; reconcile already-cached records on hydration, while preserving live-draft stability. For latency, measure persistence-to-publish and push-to-apply, reduce sequential DB work, and introduce an authorized message-delta or lightweight refresh path instead of fetching the full room for every message. Preserve current access revocation checks and compatibility with installed clients.

## 2026-09-08 — Review and verify chat date markers on Android (PR #215)

- Surface: Conversation timeline date dividers and the date label beside the scrolling indicator.
- Issue: Leave/invite timeline wrappers moved timestamp-bearing message rows below the scroll container's direct children. The old direct-child scan therefore returned no message anchors, hiding the floating date label. The timeline also lacked persistent calendar-day dividers.
- Resolution in PR #215: Query timestamp-bearing descendants for scroll anchors and insert one absolute-date divider at each local calendar-day transition, including timelines containing leave/invite notices. Missing or nonpositive message timestamps do not create an epoch divider.
- Reviewed implementation: `cc5bccf19b02935cd268570843add0585007c8d7`, based on `codex/messenger-tabs-device-test`. No actionable correctness issue was found in the reviewed change.
- Automated verification: All 384 LivePhoneDemo tests passed and TypeScript checking passed. An additional temporary harness evaluated the PR's actual date functions and timeline construction in Asia/Seoul and America/New_York: 16 checks passed for same-day grouping, midnight, missing timestamps, notice interleaving, same-day history prepending, year boundaries, DST, and locale fallback.
- Device verification: Rebuilt the Android release app with the QA bridge, uninstalled the existing package, and installed version `2.0.1` on a Samsung Galaxy S9 (SM-G960N, Android 10). The final server setup used this PR worktree, `secret/mingle/prod`, and ngrok for web, STT, and messaging; all 73 Vault runtime keys loaded successfully. The app used the matching `android/v2.0.1` API namespace.
- Observed on device: The opened conversation contained 77 message anchors, zero timestamp-bearing direct children, and two correctly rendered date dividers (August 26 and September 8). At eight scroll positions spanning the date boundary, the floating label matched the top visible message's date in every sample, changing from `Wed, 8/26` to `today`. The original scroll position was restored after checking. Existing message history was not replaced with synthetic QA data.
- Environment notes: Initial development Vault access and client-policy settings were unavailable; the final run explicitly used the reachable local HTTP Vault address and the requested production Vault path. Accepted ngrok's first-visit notice in the app WebView so subresource requests could load scripts and styles. These were test-environment setup issues, not changes required by this PR.
- Deployment contract: No new environment variable, Prisma migration, mobile/API version bump, or data backfill is required for this UI change. Verification covers the changed timeline behavior; voice recognition and other unrelated flows were not exercised as part of this review.

## 2026-09-08 — Preserve concurrent voice-message order through finalization

- Surface: Two members speaking at the same time in a shared conversation. Their bubbles repeatedly exchanged positions as partial speech became locally finalized text, persisted source, and translated content.
- Root cause: A live preview received a server start timestamp, but local finalization rebuilt the row with only its device capture timestamp. Disposing the preview also disposed its order. Persistence restored the server timestamp, moving the bubble again. Equal-time comparisons additionally switched from client message IDs to database IDs. Independent HTTP and WebSocket reservations could assign different times, and a later metadata update could erase or replace the persisted order.
- Client resolution: Keep a bounded account/room-scoped order cache separate from ephemeral previews. Carry the order into local finalization and into a locally finalized row receiving a late first echo. Retain ordering fields through pre-DB cache hydration and incomplete server snapshots. Use the stable client message ID for ties throughout the lifecycle. Preserve the first cached receipt and send it on preview retries so messaging can restore order after a restart.
- Server resolution: Route HTTP reservations through the same messaging-service authority used by WebSocket previews. A finalization missing its receipt resolves that same reservation rather than inventing a separate time. A bounded service timeout preserves the existing persistence fallback when messaging is unavailable. Serialize same-message source/translation/retry upserts with a transaction-scoped advisory lock, preserving the first persisted order (or the existing DB creation time for legacy rows). The DB ID, persistence timestamp, history cursor, and unread-count timestamps are unchanged.
- Verification: All 160 web test files / 1,489 tests and all 23 messaging tests passed. Web and messaging TypeScript checks and targeted web ESLint passed. Regressions cover two viewer states with skewed device clocks, equal and unequal server timestamps, opposite finalization/DB arrival order, translations, cached hydration, missing ordering fields, late echoes, HTTP/WS arrival races, signed receipt replay after restart, forged/cross-account receipts, authenticated reservation requests, and immutable persisted order across retries. Existing real-socket delivery coverage also passed. No microphone or physical-device test was performed in this change, and production user data was not modified.
- Scope boundary: This fixes repeated reordering after a shared order has been received. Optimistic device-local messages can still reconcile once when they first receive server order, including after an offline interval. Guaranteeing zero movement before any server acknowledgement while also guaranteeing identical order on both devices would require delaying initial shared-message placement; this change does not introduce that delay.
- Deployment: Deploy the updated web app and messaging service together. No native rebuild, app/API version change, environment variable, Prisma migration, or historical-data rewrite is required. PR #211 was already merged; this follow-up is committed to `codex/messenger-client-sot-2.0.1` and is not automatically included in that prior merge. No service-branch merge or production deployment was performed for this follow-up.
- Subsequent user-directed integration: Applied only this fix from `6a48c1be` directly to `codex/messenger-tabs-device-test`, after fast-forwarding its clean local worktree to the already-merged PR #211. The cherry-pick was conflict-free and its resulting code tree matched the tested source tree. Pushing the service branch requests its normal automatic deployment; deployment completion is a separate runtime status.

## 2026-09-08 — Search tab scroll boundaries and keyboard handling

- Report: [Search tab scroll area and keyboard issue](https://app.notion.com/p/roycenam/3d122e3ed20a80ceb402fa52755319d9). Long search results moved the search header and bottom tabs along with the results.
- Branch: `codex/search-scroll-keyboard`, based on `origin/codex/messenger-tabs-device-test` at `9c94e666`.
- Root causes:
  - The 400px mobile canvas scales down on narrow screens, leaving a layout box taller than its visible shell. `overflow: hidden` still permits programmatic/focus scrolling. A result button receiving focus scrolled the outer shell by 19px at 360px width, moving the header above the viewport and the tabs away from the bottom.
  - The search page did not track the visual viewport when the keyboard covered part of the screen.
  - The native iOS layout route list omitted `/connect`, leaving whole-WebView scrolling, bouncing, and the keyboard accessory enabled on search.
- Resolution:
  - Use `overflow: clip` for the search page and its canvas ancestors, scoped to search, while retaining the result list as the scroll container with contained overscroll.
  - Observe visual viewport resize/scroll and parent resize, convert visible pixels to canvas coordinates, and cap page height to the parent. Android WebView resizing does not cause a second keyboard-height subtraction. Clean up listeners, the observer, and scheduled frames on unmount.
  - Submit the search form to dismiss the keyboard without navigating or clearing the query. Dismiss on result-list dragging, result selection, and bottom-tab selection. Keep clear-and-refocus behavior and reset the result scroll offset when editing the query.
  - Apply the existing iOS fixed-screen scroll and keyboard-accessory policy to localized search routes.
- Validation:
  - 34 Vitest checks passed for viewport geometry/lifecycle, native layout routes, mobile canvas scaling, search cache, and tab navigation. ESLint and the full web TypeScript check passed.
  - Browser verification used the actual search component, viewport observer, bottom tabs, and generated application CSS with 20 synthetic users and mocked authentication/network responses, served through this worktree's local devbox.
  - At 390x844, the results reached scroll offset 635.5px while the header stayed at 0 and tabs stayed at 844px. At 360x740, focusing a bottom result kept the outer shell at scroll offset 0 and the header at 0, fixing the reproduced 19px displacement.
  - A simulated 300px keyboard reduction moved the tabs to 440px on the 740px screen; closing restored their position. Search submission blurred the input, changing the query reset the result offset to 0, and a follow action completed with one click while the input had focus.
- Limits: Browser keyboard geometry was simulated; physical iOS/Android keyboards and touch dragging were not exercised. The iOS WebView policy change requires a rebuilt native app. No release or production deployment was performed; app/API namespaces remain at 2.0.3.

## 2026-09-08 — Hide search tabs while the keyboard is open on both platforms

- User clarification: The keyboard should cover the bottom tabs on both iOS and Android. The search header must remain fixed. This supersedes the earlier behavior that raised the bottom tabs above the keyboard.
- Change: Hide the search tab bar while a focused search field reduces the available viewport by more than 100px. The result list fills the space above the keyboard. Restore tabs after viewport recovery, including when Android Back closes the keyboard without blurring the input. Keep tabs hidden if blur precedes the keyboard-closing resize.
- Platform handling: Remember the unobscured viewport height so Android `adjustResize` is detected even when `innerHeight` and `visualViewport.height` both shrink. iOS overlay keyboards use the same observer. Small toolbar changes and hardware-keyboard focus do not hide tabs. Width changes reset the height reference.
- Validation: 35 targeted tests passed, including separate iOS-overlay and Android-resize lifecycles, plus ESLint and the full web TypeScript check. In the devbox browser fixture at 390x844, a simulated 300px keyboard hid the tabs and let results extend to 544px; closing restored tabs at 844px. The header remained at y=0 in both states, and tabs restored while the input remained focused.
- Limits: Physical-device keyboards were not tested. No additional native code or app/API version change is introduced by this follow-up.

### Device installation follow-up

- Installed and launched this branch on the wired iPhone 11 Pro and Galaxy S9 on 2026-09-08. Both devices received clean installs; Android required uninstalling the previous package because its signing certificate differed.
- The devbox web, STT, and messaging servers run from the search-scroll-keyboard worktree using 73 runtime values read from `secret/mingle/prod`. Cloudflare named-tunnel bridges route to local ports 5538, 7538, and 9538. Servers and the connector remain running for user testing.
- Verified the installed iOS app is 2.0.3 (105) with `ios/v2.0.3`, and Android is 2.0.3 (97) with `android/v2.0.3`. Both built apps point to `mingle-app-devbox.photo-for-passport.com` and `mingle-stt-devbox.photo-for-passport.com`.
- Confirmed both native app processes are running, the web tunnel returns HTTP 200, the STT tunnel accepts a WebSocket handshake, and messaging health reports realtime configuration active. Physical keyboard behavior has not yet been exercised after login; the clean installs require signing in again.

## 2026-09-08 — Preserve native Google login attempts through auth-screen recreation

- Report: Google login did not complete in the freshly installed Android app.
- Evidence: The devbox server recorded a successful Google OAuth callback and native-auth completion for the original Android request, while subsequent pending-result polls used different request IDs. This supports a lost/replaced client attempt; the exact device-side trigger was not captured. The custom callback scheme resolves to the installed Mingle activity, and the server completed Google authentication, so an OAuth client/signature rejection was not the observed failure.
- Code defects addressed: The auth-session reset effect stopped polling and cleared the loading state even when an external native login was still active. A login-screen remount lost its request/provider refs, and another Continue action could replace the request before the native browser completed it.
- Resolution: Preserve active attempts across unauthenticated session refreshes, reject duplicate starts synchronously, and retain only request ID/provider/start time in sessionStorage so a recreated screen resumes polling without reopening OAuth. Retire the saved attempt on completion/error; expire abandoned saved requests after the native browser's three-minute timeout. No bridge token or account credentials are persisted by this recovery mechanism.
- Validation: 15 targeted auth tests passed. In a browser fixture using the actual MingleHome component under React StrictMode and mocked OAuth, one start retained the same request across remount and loading-to-unauthenticated transitions; the completion event invoked signIn exactly once. Targeted ESLint and source TypeScript checks passed. The full generated Next route check is blocked by the pre-existing exported `upsertNativeAppleUser` helper in the Apple exchange route, outside this change.
- Device handoff: The existing prod-Vault devbox server serves the fix. Android was restarted without deleting app data; a real Google account retry is still needed to confirm the end-to-end outcome. No native rebuild or production deployment was performed for this auth follow-up.

## 2026-09-08 — Keep search tabs hidden through keyboard rotation

- PR review issue: Android `adjustResize` reports keyboard-reduced heights after rotation. Resetting the unobscured reference to that height incorrectly restored the bottom tabs above the open keyboard.
- Resolution: Preserve keyboard detection through width changes and remember unobscured heights by viewport width. For a previously unseen orientation while the keyboard is open, use the previous width as an estimated unobscured height, allowing the existing 100px system-bar tolerance. Do not retain the old portrait height in landscape, which would prevent tab restoration on keyboard dismissal.
- Validation: 22 viewport/native-layout tests passed, and targeted ESLint passed. The viewport lifecycle checks now cover rotation with an open keyboard, dismissal without blur in landscape, reopening, and rotation back to portrait for both iOS overlay and Android resize models.
- Limits: Rotation was simulated in unit tests, not exercised on physical devices. First-time orientation detection still estimates geometry; unusual multi-window sizes are not covered. This web-only correction is served by the existing devbox without a native rebuild.

## 2026-09-08 — Persistent message reactions in conversation rooms

- Request: After merging PR #218, add thumbs-up, heart, check, sad, and laugh reactions to messages, starting from `codex/messenger-tabs-device-test`.
- Workspace: `codex/message-reactions` at `/Users/nam/.codex/worktrees/mingle/message-reactions`, based on merge commit `8e96841c`. PR #218 merged successfully and its Railway deployment reported success.
- Interaction: Long-press or right-click a completed message to reveal five reactions above the existing copy/listen actions. Keyboard users can focus a bubble and press Enter or the context-menu shortcut; Escape closes the menu. Reactions apply to the entire message, including its translated bubbles. Draft speech has no reaction controls.
- Selection: Each user has one reaction per message. Choosing another replaces it; choosing the current reaction again removes it. Badges under the message show counts and highlight the viewer's selection. Tapping a badge adds, switches, or removes the viewer's reaction. Failed requests display a localized retry message without inventing a successful count; duplicate taps are guarded while a request is pending.
- Persistence/security: Add `AppMessageReaction` with a composite message/user primary key and cascading foreign keys. API requests require a signed-in conversation member; writes also use the existing block/left-member policy. Lookups are scoped to the room's session key and exclude soft-deleted messages. Clients cannot choose another user's identity. Explicit PUT set/remove operations are idempotent. Responses expose counts and the viewer's selection, not other users' IDs.
- Synchronization: Reuse the existing room event bus for invalidation, plus a five-second visible-room polling fallback and refresh on reconnect/visibility. Batch reads by the currently mounted message IDs (100 per request). Hidden rooms/tabs skip reads, overlapping refreshes are suppressed, and stale reads cannot overwrite a local mutation. Room state is isolated without remounting the live conversation when visibility changes.
- Compatibility: Shared web, iOS, and Android endpoints cover current `v2.0.3` namespaces through the existing `v2.0.0` rewrite contract. App and API versions remain 2.0.3. No new environment variables or native rebuild are required.
- Migration: `20260908135150_add_message_reactions` was generated and applied using `prisma migrate dev`. The existing migration `20260803150000_add_app_event_log_message_event_type_unique` fails on an empty database because it executes `CREATE INDEX CONCURRENTLY` in a transaction. For this isolated local test database only, the unchanged base schema was baselined in a temporary migration directory, then Prisma generated and applied the new table migration. Only the generated incremental migration is committed. Production data and migration history were not modified. Apply this new migration before deploying this feature's web code.
- Validation: 56 targeted tests passed across reaction authorization/validation/aggregation and existing message, menu, timestamp, and auth behavior. Full TypeScript validation passed. Live devbox checks on the dedicated `mingle_message_reactions` database verified both v2.0.3 API namespaces, anonymous/nonmember denial, two-user counts, repeated-write idempotency, switching, and cancellation preserving the other user's reaction. A real messaging WebSocket received a notification after mutation.
- Browser validation: Actual ChatBubble and reaction components under React StrictMode used real local API/DB calls with disposable test accounts. Verified selection, a second user's count update, cancellation, refresh persistence, visible error feedback after an authentication failure, keyboard menu access, and the five-option menu at 360px width. Physical iOS/Android long-press gestures were not exercised. Temporary QA assets and local test session tokens are excluded from the PR.

### Reaction placement and participant-list follow-up

- User decision: Keep reaction results directly below their message, right-aligned for the viewer's messages and left-aligned for received messages; reserve space only when a reaction exists. The own-message column now stacks vertically, preventing badges from taking text width beside the bubble.
- New interaction: Short taps still select/switch/remove the viewer's reaction. Holding a result badge for 450ms opens a bottom sheet showing who reacted. Moving more than 10px or canceling the pointer cancels the hold, and the click following a completed hold is suppressed so inspecting a list never removes a reaction. Desktop right-click and keyboard context-menu/Shift+Enter shortcuts also open the sheet.
- Participant sheet: Switch among all five reaction kinds; display each person's name and handle with a marker for the viewer. Support loading, empty and retry states, 50-person cursor pages, a scrollable list, safe-area padding, focus containment/restoration, Escape, backdrop/close button, and native Back. Closing or switching kinds cancels the previous list request; hidden conversation rooms close the sheet.
- Access: Participant reads reuse the authenticated room-membership and visible-message checks. The list endpoint selects only name/handle/ID and the viewer marker; no email or private account fields. Cursor pagination uses user-ID ordering and continues even if the previous cursor user's reaction was removed. Existing summary responses remain unchanged.
- Review recovery fix: All reaction reads/writes have a ten-second deadline covering response body parsing. Aborted/stalled requests release pending state so future polls and user retries can proceed. Participant requests also abort on close/switch. Reaction notification publishing has a three-second server deadline, so a stalled messaging service cannot indefinitely hold a successfully saved reaction response.
- Validation: 75 targeted tests passed, covering participant authorization/pagination, request timeouts/cancellation, notification timeout, and existing message/menu/timestamp behavior. Browser checks using actual components and local API/DB confirmed the own-message badge starts below the message, both participant names appear, switching to an empty kind works, Escape restores focus, and short taps still remove only the viewer's reaction. Simulated touch-pointer holds opened the list without changing the count; pointer movement canceled the hold without changing the count. Physical phone long-press was not exercised.
- Deployment: No additional migration, environment variable, or native rebuild. The previously generated `20260908135150_add_message_reactions` remains the only migration required by PR #219.

## 2026-09-08 — Send conversation photos from the existing composer

- Request and decision: Add photo/image messages on the same `codex/message-reactions` branch. The user selected replacing the keyboard-close icon inside the text field with a plus menu containing Choose photo and Hide keyboard. Keep the microphone, input width, and send control. Voice mode exposes the same plus beside its keyboard button.
- Interaction: Choose one JPG, PNG, or WebP image up to 10MB, inspect its preview, then explicitly send it. Canceling the picker/menu does not send a message or clear the text draft. While sending, disable repeat submission and bound the request to 45 seconds. A failed request retains the selected image and client message ID for retry. Hide keyboard returns to the existing voice mode.
- Display: Render a photo thumbnail on the sender's usual side, with the existing timestamp and reaction badges. Tap/Enter opens a larger viewer; close, backdrop, Escape, and native Back dismiss it. Long-press/context menu offers reactions and Copy photo link. Image activation does not invoke the text bubble's double-tap copy/listen behavior. Failed image loads offer retry. Dialogs contain keyboard focus and restore it on dismissal.
- Persistence: Store image references and dimensions in existing AppMessage JSON metadata, with a Photo text fallback for lists and older clients. Hydration and local-cache reconciliation retain image data; images are excluded from speech translation context. Image uploads bypass translation requests. The server validates actual raster bytes, rotates EXIF orientation, scales within 2048px, removes metadata, and encodes JPEG before storing through the existing R2 configuration. Clients receive authenticated room/image paths rather than object keys. Reads require room membership and a visible message; writes also enforce the existing block/departure policy. Recheck membership after upload and clean up failed/concurrent losing uploads. Identical retries reuse the saved message. Room/list invalidation uses the existing messaging service.
- Validation: 156 targeted tests passed, including real image decoding, EXIF removal, spoofed format rejection, access checks, post-upload membership revocation, storage failures, concurrent retries, and upgrading cached text fallbacks to image messages. Full TypeScript and targeted ESLint checks passed. Real devbox requests against an isolated local PostgreSQL database and the existing R2 service verified upload, JPEG retrieval by another member, nonmember/anonymous rejection, sanitized hydration, and idempotent retries through both iOS/Android v2.0.3 routes. Only generated test images were uploaded; test objects and their isolated database messages were removed afterward.
- Browser validation: Actual composer, ChatBubble, image viewer, and reaction components under StrictMode at 360x740 verified file selection, preview, explicit send, thumbnail load, enlargement, Escape/focus restoration, a heart reaction surviving reload, and Hide keyboard. The test wrapper used simplified surrounding controls; the complete live screen and native photo pickers were not exercised on phones.
- Deployment: No additional database migration or environment variable. PR #219 still requires the previously generated reaction migration. Add sharp as an explicit server dependency and the iOS photo-library usage description. The permission description requires an iOS rebuild; native apps were not rebuilt/reinstalled for this follow-up. App/API versions remain 2.0.3. HEIC/GIF/multiple-image selection are outside this implementation.

## 2026-09-08 — Translate profile biographies with versioned publication

- Request: Apply the agreed content-translation policy to every profile biography display, while keeping the existing authoring screen and account-ID ownership. Continue on `codex/message-reactions` / PR #219.
- Display: The shared ProfileBio component reads the viewer's saved default display language, the same account preference updated by collapsed-message language selection. It falls back to the viewer's primary/default conversation languages and then UI locale. Display a cached translation automatically, otherwise the published original with a Languages icon and See translation in a single minimum-44px button. Identical source/target codes suppress the button. During a requested translation keep the original and show Translating; support original/translation toggling and explicit retries after failure. Reset the toggle when version or display language changes. Profile, public profile, and image-preview captions use the component. The image preview now scrolls long captions within its viewport.
- Editor/navigation: The textarea always receives the owner's saved original through the owner-only bioDraft field, while the profile display receives the published original. Show processing/ready/partial-failure status beneath the textarea. Saving does not disable Back. A save completing after its editor was closed/reopened cannot close the new editor session. Profile requests carry the initiating account ID and ignore results after an account change; server ownership continues to come exclusively from the authenticated account.
- Save policy: Persist the new original and its immutable version before returning the profile response. Next after() runs bounded translation work after the response, independently of the initiating screen. First-time biographies become public immediately. Generate English, Simplified Chinese, Japanese and Korean except the detected source language. On subsequent text changes, include every additional language with a previously successful saved translation. Unchanged text and name/photo-only edits do not create a version or translation batch.
- Publication/failures: ProfileBioState tracks draft and published version IDs separately. Existing public text/translations remain on the published version until the replacement batch settles. Publish the latest matching version atomically after all attempts finish or its 55-second deadline expires. Each provider call has a 15-second deadline; four workers bound concurrency. Expired interrupted jobs settle on the next read without restarting translation. Failures store no translated text and never automatically retry. Clearing a biography clears both pointers immediately. Late results cannot publish over a newer version or restore a cleared biography.
- Shared requests: DB rows are keyed by biography version and target language, with per-attempt IDs/deadlines. Short per-user row locks serialize claims across server processes; no transaction remains open while calling the provider. Eight concurrent requests were verified to yield one job. Reuse successful translations across viewers. On-demand jobs can wait for an initial batch and have a bounded lease; expired attempts cannot overwrite a retry. Legacy biographies are not bulk translated. Viewing one may cache source-language detection only, so same-language buttons can be suppressed; translation generation waits for an edit or explicit request.
- Language/support: Provide button, pending, retry and editor-status copy in all 15 primary UI locales. Preserve line breaks, wrap long words, support automatic text direction, and retain native navigation. Translation polling reads status only: every two seconds while processing and every fifteen seconds otherwise, skipping hidden documents. Successful display-language mutations emit an invalidation event; focus/visibility changes also refresh.
- Schema/deployment: Prisma generated and locally applied `20260908144017_add_profile_bio_translations`, adding state/version/translation tables. The same isolated base-schema migration workspace used for the earlier reaction migration avoids the pre-existing historical concurrent-index replay failure. This is PR #219's second migration; apply it before deploying the new web code. No new production environment variables; use the existing GEMINI_API_KEY and Gemini Flash Lite provider. No native code/version change in this biography follow-up; app/API namespaces remain 2.0.3.
- Automated validation: 197 targeted regression tests and 10 real-PostgreSQL lifecycle tests passed. The lifecycle suite uses an explicitly supplied isolated test DB and disposable users; it covers the four-language/source-skip rule, unchanged saves, concurrent shared requests, additional-language regeneration, partial failures/manual retries, stale edits, abandoned jobs, a never-resolving provider, late manual results, deletion, and legacy publication. Full TypeScript validation passed. Real devbox HTTP tests exercised iOS v2.0.3 save and Android v2.0.3 snapshot routes. The save returned in 342ms while the previous public text remained; real provider translation subsequently succeeded for all applicable defaults. A German request from the actual component showed original + Translating, then a real German translation, then toggled back to the English original.
- Provider-format correction (2026-09-09): Real Japanese/Korean responses sometimes echoed the input JSON wrapper despite a plain-text instruction. Require structured JSON output with one text field, validate its type/length, and expose only the field value. Six provider-response tests cover extraction and malformed/empty/oversized responses. A subsequent real save produced clean Japanese, Korean, Chinese, and previously requested German translations with no wrapper text.
- Final UI validation (2026-09-09): Actual ProfileBio components were exercised in Android Chrome on the connected Galaxy S9 (360px viewport) and Safari on an iPhone 17 / iOS 26.5 simulator (402px viewport). Both passed original/translation activation, a 44px button height, scrolling a generated long translation, and no horizontal overflow; text heights were 1183px and 968px respectively. These were scrollable component fixtures, not a rebuilt Mingle native app or a physical iPhone test. A browser fixture also changed the real conversation display-language preference and observed the saved Japanese biography translation. An authenticated owner deletion returned HTTP 200 and immediately removed the displayed biography; changing saved-original props invalidates stale polls. Temporary fixtures, generated QA users, and test-driver processes were cleaned up. Full TypeScript and targeted ESLint checks passed.

## 2026-09-07 - Reduce pending-write retry and synchronous storage overhead

- Surfaces: Offline conversation settings and durable message recovery, particularly WebView main-thread work on iOS.
- Queue issue: A transient room failure ended the current flush, deferring unrelated rooms. Existing later flushes already skipped backoff-blocked rooms; this was not an indefinite global queue lock. Repeated failures could still retry every minute throughout the 30-day retention window.
- Queue resolution: Preserve ordering within each failed room while continuing other rooms in the bounded 50-request batch. Stop the batch on network, authentication, or rate-limit failure. After ten failures, retain the pending edit with a 15-minute retry interval that focus/forced flushes cannot bypass. A newly coalesced user edit resets the interval. Keep automatic recovery and the existing retention policy rather than silently dropping edits at an attempt limit. A dependent edit within the same room still waits for its predecessor.
- Storage resolution: Coalesce replay-safe source-delivery checkpoints over 50 ms; immediate persistence cancels any pending checkpoint timer. Flush pending checkpoints when the last owner consumer releases. Original message intent, translation results, deletion, and ownership transitions remain synchronous. Skip warm-cache writes when the serialized content is unchanged, including repeated retry notifications. A WebView termination before a checkpoint may replay an acknowledged source using its existing idempotent client message ID.
- Verification: All 154 non-live test files / 1,445 tests passed, including six new regressions covering independent rooms, offline request fan-out, cooldown reload/recovery, new edits, checkpoint batching, and unchanged retry caches. TypeScript and targeted ESLint passed. The broad test invocation also attempted five live API tests, which failed because no server was listening on localhost:3000; eight live files were skipped. No physical-device performance or voice test was performed.
- Limits: This reduces selected redundant synchronous writes; it does not replace localStorage, add a storage quota policy, or establish measured iOS frame-time improvement. Pending source intent is not evicted to satisfy a new count limit.
- Deployment: Web code only; no new server environment variables, Prisma migration, native rebuild, or version/API namespace change.

## 2026-09-06 — Recover queued work across app updates and protect account changes

- Surfaces: Pending conversation messages, conversation language/title/status/read/removal changes, profile language defaults, and account preference writes.
- Upgrade issue: A user could load the Local-first WebView in an installed 2.0.0 app, leave a message unsent, then update the native app. Recovery selected only the new API namespace, leaving the old message journal unreachable. Conversation mutations had the same per-version storage gap.
- Upgrade resolution: Transfer the same authenticated account's pending message and conversation-mutation work between explicitly compatible namespaces on the same platform. The allowlist follows the existing v2.0.0 handler aliases: iOS 2.0.0–2.0.3 and Android 2.0.0–2.0.1. Requests use the current namespace; source message IDs, acknowledged source delivery, completed translations, and pending removals survive. Legacy 1.x, unknown contracts, other platforms/accounts, and tracking-only ownership are not automatically migrated. Conversation records now include the namespace in memory as well as in storage. Persist the target mutation journal before deleting the prior journal, and retain the latest intent when settings overlap.
- Account-change issue: A slow settings request could finish after another tab replaced the login session. Its worker then submitted the next old-account edit with the new account's cookies; late response bodies could also update the new view.
- Account-change resolution: Tie the conversation mutation worker to an abortable authenticated component scope, check scope again after asynchronous response parsing, and retain unfinished work after cancellation. An aborted worker cannot start another request or clear a replacement worker's promise. Add an optional expected-account precondition to queued conversation, profile-default, account-preference, and message writes, plus durable translation recovery. The server compares it with the authenticated session and rejects a mismatch with 401 before persistence or AI work. The precondition does not grant authentication or replace room permission checks. Existing clients that omit it retain their API contract.
- Verification: All 154 web test files / 1,439 tests passed, along with TypeScript and targeted ESLint. Regressions exercise cold namespace updates, already completed translations, account/platform/legacy exclusions, account mismatch and retry, cancellation of a never-resolving request, delayed UI response bodies, legacy journal shape, and a real removal queue pausing its migrated message. These are automated code/handler tests with fake network/storage/DB providers, not a new physical-device run.
- Deployment: No new environment variable, Prisma migration, or native rebuild is required for these fixes. Deploy the WebView code and server account-precondition checks together. No production data or existing accounts were merged or edited during verification.

## 2026-09-05 - Preserve installed-client behavior while integrating service updates

- **Scope:** Merge service commit `4e8df995` from `codex/messenger-tabs-device-test` into `codex/messenger-client-sot-2.0.1`, whose prior tip was `2fc127eb`. The service branch is not a merge destination.
- **Compatibility issue:** The incoming shared WebView showed the Picture in Picture button on every native iOS runtime. Installed iOS 2.0.0 and 2.0.1 shells do not implement its native commands, so users could press an inert button after a server-only deployment. This was established from the native bridge and WebView code, not by reinstalling old production binaries.
- **Resolution:** Gate PiP availability, event effects, and the start callback on an iOS API namespace of at least 2.0.2. Preserve PiP for the 2.0.2 native release and already-installed 2.0.3 beta. Ordinary conversation, preference, translation, navigation, and recovery behavior does not require PiP. Both native-runtime detection and the installed namespace must qualify; Android and browser-only runtimes remain excluded.
- **Existing clients:** Keep iOS 2.0.0/2.0.1/2.0.2 and Android 2.0.0/2.0.1 API contracts, plus the iOS 2.0.3 beta alias. The installed shell's URL namespace takes priority over the server build's default. Existing authenticated sessions retain their user ID; no existing users are merged or bulk-reassigned. An old finalized-message payload without `translationPending` or `translationUpdate` still persists the original and translations, refreshes realtime subscribers, and sends its normal single push. New recoverable two-stage delivery remains supported alongside it.
- **Merge preservation:** Retain both complete UI/UX history blocks, all incoming native PiP/STT coordination and dashboard platform-cache changes, and the local-first account writer, conversation mutation queue, cached profiles, durable message finalization, account-owner cancellation, and QA debugging safeguards. The overlapping room and event-handler changes were reviewed against both parents, including the removal of console-only hydration diagnostics while retaining their persisted events.
- **Device-tooling conflict:** Combine exact physical-UDID-to-CoreDevice lookup with generic builds for explicitly selected phones. Auto-selected build destinations must resolve that same physical phone, not an independent first connected device, and keep Xcode's `id=` destination syntax. A stale device list may fall back only to the selected hardware UDID. Verify reachability before uninstalling, building, or installing; an unreachable target never redirects installation to another phone.
- **Verification:** 154 web unit/contract files with 1,416 passing tests; 13 React Native suites with 67 passing tests; 6 app script tests; 23 Devbox/tunnel parser tests. Web and native TypeScript no-emit checks, targeted web ESLint, shell syntax, Swift parsing, and Xcode project syntax also passed. The native test runner emitted an open-handle warning after all tests passed and then exited successfully. See `docs/qa/pr-211-service-integration-2026-09-05.md` for the compatibility matrix and evidence boundaries.
- **Data and release boundaries:** Incorporate the service branch's existing dashboard-platform migration and regenerate only the local Prisma client. The user reports the migration is already applied; do not rerun it against production. No new migration, server environment variable, mandatory native bridge, production deployment, phone reinstall, or voice test is introduced by this integration fix.

## 2026-09-05 - Stop queued message recovery when account ownership ends

- **Surface:** The durable original-message/translation recovery queue used by conversation lists and rooms in PR 211.
- **Issue:** Review found that releasing the last account consumer aborted only currently active requests. Each two-worker flush still held a snapshot of up to 20 pending jobs and could start its next job after logout/account-switch cleanup. A delayed replacement delivery could also restart after cancellation. In a deterministic three-message reproduction, requests for messages one and two were canceled but message three still started. This was reproduced with mocked fetches, not by changing a production user's account.
- **Cause:** The flush and deferred-delivery continuations had no account-lifecycle token, and direct delivery did not require a retained account consumer. Flush cleanup unconditionally removed the shared flush slot, potentially interfering with a newly mounted same-account recovery run. Repeated cleanup could decrement another consumer's reference count.
- **Resolution:** Require an active account/API-namespace owner for all delivery entry points. Capture the owner instance and cancellation generation for every run; check them before starting each queued message, before each request, and before applying asynchronous results or removing the journal record. Cancellation invalidates the entire generation and detaches its flush before aborting active requests. Tracking-to-account adoption cancels the source batch before moving its jobs. Cleanup releases each consumer only once, and an old flush can remove only its own shared slot.
- **Recovery behavior:** Cancellation preserves unsent originals, translation intent, and acknowledged stages. Retaining the original account again can immediately resume them without joining the canceled flush or reviving its callbacks. Closing a room while a same-account list remains mounted keeps recovery alive. Other retained accounts and API namespaces are not canceled.
- **Verification:** Eight newly added reproduction checks failed against the old implementation and passed after the change. Eleven additional regression cases now cover queued source-only/translated messages, inactive-owner entry points, account return, independent account/API scopes, explicit cancellation, immediate remount, repeated cleanup, deferred replacement, and tracking adoption. The final run passed 151 unit-test files / 1,342 tests and 6 script tests, plus TypeScript no-emit checking, targeted ESLint, and diff whitespace checks. See `docs/qa/pr-211-message-recovery-2026-09-05.md` for the separate device-test boundaries.
- **Boundaries:** This change prevents new client requests and late client-state updates after owner release/cancellation; it cannot undo a request already accepted by the server. No actual logout/account-switch device test, voice input, production DB write, native rebuild, API namespace/version change, migration, or service-branch modification was performed for this follow-up.

## 2026-09-05 - Recover interrupted message delivery and translation

- **Surface:** Finalized text/utterance persistence, collapsed translated bubbles, cold-start conversation lists, and optimistic room removal in PR 211.
- **Issues addressed:** The two device-QA failures below allowed an unresolved translation to strand a local message, and an offline translation failure to remain untranslated after the original eventually reached the server.
- **Resolution:** Write the complete original, stable message/session identity, and translation request into one synchronous local journal before clearing the text composer. Deliver the original and request translation independently; persist each completion separately. The same server message is enriched only after source acknowledgement, and the job is removed only after the final acknowledgement. Failed or malformed responses retain the job with bounded retries and request/body timeouts. Stored successful translations are reused after an acknowledgement failure rather than requesting AI again.
- **Restart and ownership:** Resume from either the conversation list or a room on mount, reconnect, visibility restoration, and periodic retry. Scope recovery by account and API namespace. Multiple mounted rooms/list consumers share ownership; closing one room does not cancel another room's work, but removing the last account consumer aborts old-account requests. Tracking-to-account adoption retains the completed stages.
- **Presentation:** A selected translation with no text shows the original and a localized pending label instead of an empty bubble. Late source-only server snapshots preserve already-completed local translations. Foreground translation rendering/playback scheduling does not wait for the following persistence request; background recovery does not autoplay historical speech.
- **Removal safety:** Pending removal pauses delivery. An optimistic room clear preserves the journal until server acknowledgement, so rejected removal can restore both the room and its unsent message. Confirmed removal discards the job; explicit history clearing also discards it. This is separate from hiding/removing the room's warm cache.
- **Server behavior:** Initial source delivery does not wait for title-generation AI. Translation enrichment still updates message content, tracked DB metadata, and realtime subscribers, but does not emit a second push notification or another message-sent analytics event.
- **Verification:** Automated journal, UI callback, bubble, server, and hydration regression tests; iOS 18.6 and Android text recovery tests using the existing authenticated apps. Voice recording/TTS device testing remains with the user. See `docs/qa/pr-211-message-recovery-2026-09-05.md`.
- **Boundaries:** This is a recoverable finalization queue, not an offline translation model or a full-history database migration. The journal uses browser storage with a 30-day recovery window; browser storage unavailability, explicit app-data clearing, and uninstalling before synchronization remain durability limits. It does not infer ownership and resend arbitrary pre-existing orphaned cache entries. No native rebuild, API namespace change, Prisma migration, production deployment, or service-branch mutation is included.

## 2026-09-05 - Device QA exposes translation/delivery recovery gaps

- **Scope:** Non-voice PR 211 verification on iPhone 11 Pro / iOS 18.6 and Galaxy S9 / Android 10, using Devbox, Cloudflare, and the production Vault environment. Temporary solo rooms isolated test writes. No service-branch modification.
- **P1, interrupted translation:** Holding `/translate/finalize` unresolved, sending text, then terminating/relaunching the app leaves three local messages but only two server messages and an empty outbox on both devices. The interrupted message's original text survives in the bounded cache, but its translated-language bubble is blank and no delivery job is reconstructed. The outbox insertion currently occurs after translation resolves, leaving a durability gap before that point.
- **P2, offline translation failure:** Rejecting API calls and sending text produces a durable original-message job. Reconnect delivers the original exactly once, but the server retains `unknown` source language and no translations. The outbox retries event persistence, not translation, and there is no durable translation recovery state.
- **Recommended resolution:** Persist original-message delivery intent before the translation request, use stable idempotent message IDs, queue translation separately, resume both on restart, and show original text with an explicit pending/retry state whenever a translation is unavailable. These findings are documented, not fixed in this testing task.
- **Passed paths:** Warm list/room display, language/slider stability under failed API calls, account preference propagation between rooms, queued rename/read preservation, rejected-rename rollback, pending-edit/delete ordering, draft/title restoration after process restart, cached avatar presentation, and native back navigation. Android older-history pagination reached 142 messages while its local cache remained capped at 100.
- **Limitations:** Physical offline networking, voice paths, same-account concurrent devices, account switching, and full-history storage were not certified. One warmed iOS edge-swipe sample avoided hydration reentry; a process-restored room's return path performed a separate document navigation and is not a general flicker-free guarantee.
- **Detailed report:** `docs/qa/pr-211-device-local-first-2026-09-05.md` includes evidence, ownership boundaries, scenario results, and cleanup scope.

## 2026-09-05 - Preserve explicit iOS installation targets in Devbox

- **Surface:** USB device build/install workflow with multiple iPhones connected.
- **Issue:** `run_ios_mobile_install` honored `--ios-udid` for Xcode compilation but independently selected the first CoreDevice for uninstall/install/launch. This could overwrite an unrelated phone even when an explicit target was provided; the issue occurred during the local test setup.
- **Resolution:** Use the same selected hardware UDID for every device operation. `devicectl` accepts that UDID directly, so there is no need for an independent first-device lookup. Verify the requested phone's model/OS before installation; do not reinstall or restore an unintended phone without the user's direction.
- **Regression coverage:** Execute the installation function with mocked Xcode/device commands and an intentionally different auto-detected phone. Assert both normal and clean-install workflows use the explicit target for build, uninstall, install, and launch.
- **Data and release impact:** Developer tooling only; no app/API version or database change.

## 2026-09-05 - Resolve PR 211 local-first synchronization races

- **Scope:** Changes are confined to `codex/messenger-client-sot-2.0.1`, reviewed against `codex/messenger-tabs-device-test`. The service branch is not modified.
- **Account settings:** A background STT room and a visible room previously had independent full-snapshot PATCH/retry loops. An old room's retry could overwrite a newer successful text-size, silence-slider, model, or banner setting. Use one account/API-namespace-scoped writer and merge only fields changed by the user into the latest shared cache. Mounted rooms subscribe to preference updates; retries consume shared intent rather than a stale room ref. Slow server GETs cannot overwrite a newer edit, including one that was already acknowledged while the GET was in flight. Keyboard focus/composer visibility remain room-local.
- **False pending settings:** The old 200ms room-local cache timer could run after PATCH success and mark a saved value pending again. Remove that timer; persist actual edits immediately, and acknowledge only the exact shared revision sent. A no-op from a stale room does not create a new pending write. This also preserves edits when a room unmounts immediately after interaction.
- **Display language:** Patch normalization incorrectly inserted `defaultDisplayLanguage: undefined` into unrelated mutations. Reading a room, renaming it, or changing recording status could clear its visible display language until the next server refresh. Preserve omitted fields while still allowing an explicit `null` reset, both in memory and after restoring the queue from storage.
- **Language selection:** The selected-language handler still sent a direct PATCH while speech/link/display settings used the durable queue. Late responses could undo subsequent edits. Route selected-language edits and the user's default languages through the queue; preserve per-member attribution and the full room union, including unions larger than one member's five-language limit. Coalesced changes retain the original rollback snapshot but take their latest user-action position relative to other setting kinds.
- **Removal and retries:** A transient failure could be overtaken by deletion, leaving title/settings writes retrying 404 responses against a removed room. Preserve ordering within a room during backoff. Pending deletion supersedes room edits; confirmed deletion (including already-absent 404) discards them, while rejected deletion retains them. Other rooms can still progress during one room's backoff.
- **Regression coverage:** Exercise account-scoped concurrent writers, stale-room retries, stale GETs, persistence/reload after acknowledgment, account isolation/subscriber cleanup, display-language preservation, explicit resets, coalesced language/link ordering, full shared-language unions, deletion success/404/rejection, and the actual conversation-list selection callback's queue wiring.
- **Manual follow-up:** Keep STT running in room A, open room B, change settings with an interrupted connection, reconnect, and re-enter both rooms. Also check rapid language/link changes, read/rename without changing display language, and offline rename followed by deletion. No production DB or device actions are part of this fix.
- **Data and release impact:** No Prisma migration, native-code change, mobile version change, or API namespace change is required.

## 2026-09-05 - Cache platform-filtered dashboard metrics

- **Surface:** Service dashboard OS filters, daily charts, cumulative charts, metrics table, and cache refresh action.
- **Issue:** The newly added Android/iOS filters bypassed the daily cache because the cache key had no OS dimension. Every filtered request therefore recalculated the entire selected date range, making the dashboard slow even when historical data was already cached.
- **Resolution:** Extend the daily cache key from `day` to `day + platform`, preserving existing rows as the `all` platform. All three views now follow the same policy: always calculate today and yesterday, load existing historical rows, and calculate only historical dates whose selected-platform cache row is missing. Missing dates are grouped into contiguous ranges so unrelated cached dates are not recalculated. The refresh action clears only the selected platform's historical rows.
- **Data semantics:** Android and iOS classification uses each user's most recently recorded normalized client platform (`latest_client_platform`). Users without a recognized platform remain included in `전체` but are not included in either OS-specific view.
- **Data change:** Add a Prisma migration for the composite daily-metric key and platform index. No API namespace, native bridge, or server configuration change is required.
- **Testing notes:** Verify repeated requests for each platform recalculate only today and yesterday, a first request fills missing historical rows, existing rows are reused, `전체` does not mix with Android/iOS rows, the cache refresh action is scoped to the selected platform, and invalid `platform` query values still fall back to `전체`.

## 2026-09-05 — Eliminate dashboard usage baseline full-history scans

- Surface: `/admin/dashboard`, including the All, Android, and iOS filters and the `불러오는 중...` transition state.
- Issue: Historical daily cache rows were correctly reused, but the usage calculation for today/yesterday still used `DISTINCT ON` over all earlier event logs to recover each active user's starting counter. PostgreSQL chose a full-table scan and disk sort despite an existing partial user/timestamp/id index. The UI waited for this slow metric before displaying the dashboard.
- Evidence: The production request that populated Android's 28 historical cache rows took 93.741 seconds. Separate read-only `EXPLAIN ANALYZE` measurements of just the two-day usage query scanned 1,441,101 earlier events and took 24.316 seconds for All and 16.346 seconds for Android; this was not a recomputation of all historical daily metrics.
- Resolution: Use a correlated `CROSS JOIN LATERAL` with descending timestamp/id order and `LIMIT 1` for each user active in the requested interval. The existing `app_event_logs_user_usage_created_desc_idx` now supplies only that user's last non-null pre-range snapshot. Preserve range boundaries, counter reset handling, timestamp tie-breaking, platform filtering, and missing-baseline behavior.
- Cache contract: Keep the metric version unchanged so historical caches remain valid. Always calculate today/yesterday; calculate and persist only missing historical days; never recalculate cached days between noncontiguous gaps.
- Verification: Updated production-query measurements were 1.017 seconds for All, 0.081 seconds for Android, and 0.027 seconds for iOS. These are DB execution times, not end-to-end page times, and later runs benefited from warm database buffers. Plans confirm the full-history scan is gone and indexed baseline lookups run once per active user. Read-only PostgreSQL fixtures produced identical old/new daily totals for all three platforms across timestamp ties, null counters/users, resets, users without baselines, inactive users, and start/end boundaries. All 50 focused dashboard tests passed, including new 30-day cache-reuse and noncontiguous cache-hole regressions; targeted ESLint and whitespace validation passed.
- Deployment: No new Prisma migration, cache deletion, mobile rebuild, version change, or API namespace change is required. The existing platform-cache migration must already be applied.

## 2026-09-04 - Normalize language flags in iOS Picture in Picture

- **Surface:** The language badge rendered beside every original or translated row in the native iOS Picture in Picture conversation preview.
- **Issue:** PiP used a small native-only switch over raw language strings. Regional BCP-47 tags such as `en-US`, `ko-KR`, `ja-JP`, and `fr-FR` did not match its base-language entries and therefore appeared as the generic globe despite having a valid flag in the normal conversation UI.
- **Resolution:** Port the normal conversation UI's language canonicalization rules and complete STT flag catalog to the PiP renderer. The native preview now normalizes separators, aliases (`fil`, `iw`, `nb`, `zh-Hant`, and similar tags), partial script/region tags, and base-language fallbacks before choosing a flag. Unsupported or missing language data still uses the globe intentionally.
- **Cross-surface diagnosis:** The ordinary WebView conversation screen already uses the shared `canonicalizeTranslationLanguageCode` and `getSttLanguageFlag` path, which resolves the regional tags above. Its globe is therefore not this PiP mapping bug; it represents missing or unsupported source-language values such as `unknown` arriving during an interim/fallback STT path or from an older hydrated message. Capture an affected language value before changing that intentional fallback behavior.
- **Interaction:** PiP continues to be read-only. Flags match the normal conversation catalog while the compact native preview keeps its single-emoji presentation.
- **Data change:** Re-version the current iOS release to `2.0.2` and its required namespace to `ios/v2.0.2`. The server rewrites that namespace to the existing `ios/v2.0.0` contract and retains `ios/v2.0.3` only for already-installed beta device builds. No Prisma migration is required.
- **Testing notes:** Verify PiP rows for `en-US`, `ko-KR`, `ja-JP`, `fr-FR`, `zh-Hant`, `fil-PH`, and an unsupported value. Confirm the first six show their catalog flags and the unsupported value remains a globe. Verify the native app and WebView both use `ios/v2.0.2`.

## 2026-09-04 - Preserve iOS STT when closing Picture in Picture

- **Surface:** The iOS system Picture in Picture close action for a live conversation preview.
- **Issue:** The PiP playback delegate could send `setPlaying(false)` while the user dismissed the PiP window with its system close action. The app treated every false value as an explicit pause and force-stopped native STT, even though closing the read-only preview should leave the room's live recognition session intact.
- **Resolution:** Track the native PiP stopping lifecycle and defer a false playback-control event briefly. If `willStopPictureInPicture` or the completed stop lifecycle arrives, cancel the deferred pause event; only a PiP window that remains active after that confirmation interval forwards pause to STT. Keep play events immediate, and reset the guard for a newly started controller.
- **Interaction:** The PiP play/pause control still starts and gracefully stops STT. The system X close action dismisses only the PiP preview; the microphone, transcript stream, and conversation continue running. The preview remains read-only and non-scrollable.
- **Data contract:** No Prisma migration, mobile version, API namespace, or server change is required.
- **Testing notes:** On a physical iOS device, start STT, open PiP, then close it with X while continuing to speak. Confirm transcripts continue. Separately press PiP pause and confirm graceful STT stop, then press play and confirm a new STT session starts.

## 2026-09-04 - Hide anonymous tracking rows from user search

- **Surface:** Connect user search, search-result history restoration, and the session search cache.
- **Issue:** Anonymous tracking rows used an automatically generated `anon_...` handle and the fallback name `Mingle 사용자`. A broad query such as `a` could therefore consume result slots and make real users harder to find; an older cached search could also briefly restore those rows after the server-side fix.
- **Resolution:** Exclude the reserved `anon_` handle prefix in the shared user-search API, which covers the versioned Android/iOS search routes. Sanitize both newly written and previously stored Connect search snapshots, including the browser history snapshot, so anonymous rows are not rendered while a fresh response is pending. Existing follower/following relationship lists are unchanged.
- **Data change:** None. No Prisma migration, API namespace, native bridge, or server configuration change is required.
- **Testing notes:** Search for a broad value such as `a` and a name-like value such as `Mingle`, verify anonymous rows never appear and real users still fill the available result slots, then return to Connect or recreate the tab with an old cached snapshot and verify the anonymous row is removed.

## 2026-09-04 - Add OS filters to the admin dashboard

- **Surface:** Service dashboard date controls, daily charts, cumulative charts, and the metrics table.
- **Issue:** The dashboard could be filtered only by date range, so Android and iOS usage could not be compared without manually querying the underlying data.
- **Resolution:** Add an OS segmented filter with `전체` as the default and `Android`/`iOS` options. Date-range changes preserve the selected OS, and selecting an OS preserves the selected date range. The existing all-platform cache remains in use for the default view; filtered views calculate from source rows because the daily cache has no OS dimension.
- **Data semantics:** Android and iOS classification uses each user's most recently recorded normalized client platform (`latest_client_platform`). Users without a recognized platform remain included in `전체` but are not included in either OS-specific view.
- **Data change:** None. No Prisma migration, API namespace, native bridge, or server configuration change is required.
- **Testing notes:** Verify the default dashboard is `전체`, switching OS preserves the date range, charts/table values change consistently, invalid `platform` query values fall back to `전체`, filtered views do not show the all-platform cache refresh action, and long date ranges remain usable on narrow admin screens.

## 2026-09-03 - Connect iOS PiP playback controls to the STT lifecycle

- **Surface:** The iOS system Picture in Picture controls for the live conversation preview.
- **Issue:** PiP exposed play and pause controls even though the preview was a live snapshot stream, so pressing them did not affect the room's microphone session and could leave the control state misleading.
- **Diagnosis:** The native sample-buffer playback delegate intentionally treated the preview as always playing. The WebView had no lifecycle event channel for native PiP callbacks and could not route a system playback request through the existing STT start/stop pipeline.
- **Resolution:** Use the native playback delegate to emit scoped `started`, `stopped`, `failed`, and `playback_control` events through React Native. Forward the latest event into the WebView with a cached replay path for WebView reloads. Route PiP pause to the existing graceful STT stop (including pending-turn finalization) and PiP play to the existing STT start flow. Sync the native PiP playback state after successful starts, graceful stops, microphone permission failures, transport/audio errors, and other STT state changes.
- **Interaction:** Pausing PiP stops recognition gracefully while leaving the last preview frame visible. Playing PiP starts a new STT session; it does not resume a partially captured audio buffer. The PiP window stays open and remains read-only/non-scrollable. Stale native callbacks and queued playback requests are ignored when the controller or conversation has changed.
- **Data change:** None. No API, database, migration, or version change is required; the iOS app remains version `2.0.2` with namespace `ios/v2.0.2`.
- **Testing notes:** Verify play/pause from PiP on a physical iOS 26 device with an idle room, an active STT session, an in-progress utterance, a denied microphone permission, and an audio/transport failure. Confirm the last frame remains after pause, a new session starts after play, and a stale callback cannot affect a replacement PiP controller.

## 2026-09-03 - Keep iOS PiP text size stable and show live utterance progress

- **Surface:** The native iOS Picture in Picture preview during a long in-progress speech turn.
- **Issue:** The preview changed font size as the number and height of bubbles changed, which made the reading scale unstable. An interim translation also added a trailing `...` or showed only a placeholder while the live utterance continued, even though the current source text was already available.
- **Diagnosis:** The native packer used font reduction as its first response to a growing bubble stack. Interim translation markers were appended to any non-empty partial translation, and a missing target translation in collapsed mode had no useful live-text fallback.
- **Resolution:** Use a fixed 42pt preview font for the normal layout. Re-evaluate recent suffixes at that size and drop the oldest bubble before changing text size; only one unusually long latest bubble may use an emergency smaller floor to avoid clipping. Render non-empty interim text exactly as received, and fall back to the growing original text in collapsed mode until a target translation has content. Keep that fallback in the bridge payload as well, so the native layer never receives a placeholder for an available live source.
- **Interaction:** The latest in-progress message remains visible and updates without waiting for finalization. Expanded mode continues to expose an empty pending translation as `...`, while ordinary partial text is not decorated with an extra suffix. The PiP surface remains read-only and non-scrollable.
- **Data change:** None. The iOS app remains version `2.0.2` with namespace `ios/v2.0.2`; the device verification build advances for this stable-density policy.
- **Testing notes:** Verify stable 42pt text with four short messages, removal of the oldest bubble as the latest message grows, collapsed-mode original fallback while translation is pending, partial translation updates without an added ellipsis, expanded pending rows, and a very long single message on iPhone 14.

## 2026-09-03 - Drop older iOS PiP bubbles before shrinking text too far

- **Surface:** The live native iOS Picture in Picture preview while a new speech turn is still being recognized.
- **Issue:** As the active message grew, older bubbles could remain visible until the turn was finalized or until the layout had already reduced the preview text to an unnecessarily small size. The fixed 16:9 surface should prioritize a complete, readable current bubble over retaining historical bubbles.
- **Diagnosis:** The previous packing pass accepted any complete suffix that fit down to the renderer's absolute font floor. That allowed a multi-bubble stack to consume the available height while the in-progress turn was still changing. The selection rule did not express a separate readability threshold.
- **Resolution:** Evaluate the recent suffix from largest to smallest on every state update, using a 30pt readable-font floor. When the full suffix would cross that floor, remove the oldest bubble and retry (`4 → 3 → 2 → 1`). The final render still uses the largest font that fits, and only a single unusually long latest message may use the smaller absolute floor to keep its wrapped content complete.
- **Interaction:** Interim transcript growth and interim translation rows participate in the same measurement, so the preview can shed older bubbles before finalization. The latest message remains visible, ordinary text continues to wrap without truncation, and the surface remains read-only and non-scrollable.
- **Data change:** None. The iOS app remains version `2.0.2` with namespace `ios/v2.0.2`; the device verification build advances for this density policy.
- **Testing notes:** Verify a long in-progress utterance while three or four prior bubbles are visible, confirm older bubbles disappear before the text becomes too small, check that the latest bubble stays complete, and cover collapsed/expanded rows and interim translation updates on iPhone 14.

## 2026-09-03 - Prioritize complete iOS PiP bubbles over message count

- **Surface:** The native iOS Picture in Picture conversation preview after the bubble-style rendering update.
- **Issue:** A message could wrap to a third line in the source content, but the PiP preview reserved space for at most two lines whenever more than one message was visible. The result was a clipped bubble rather than a complete message. Short own messages were also right-aligned even though the compact PiP layout is easier to scan with one consistent left edge.
- **Diagnosis:** The native layout measured each language row with a fixed line-count cap before calculating the bubble height. The drawing pass then used that capped height, so additional wrapped lines had no drawable space. Message ownership was also still used for horizontal placement.
- **Resolution:** Measure every rendered row at its full wrapped height using the same character-wrapping paragraph style used by the drawing pass. Select recent messages by the complete measured stack, dropping older bubbles when the stack cannot fit before rendering. Preserve the largest font size that fits the selected complete bubbles. Anchor every bubble to the left content edge while retaining the existing own-message color treatment.
- **Interaction:** A long message receives all of its visible wrapped lines; the preview does not replace ordinary overflow with an ellipsis. The PiP surface remains read-only and non-scrollable, and collapsed/expanded language-row behavior is unchanged.
- **Data change:** None. The iOS app remains version `2.0.2` with namespace `ios/v2.0.2`; the device verification build advances for this layout fix.
- **Testing notes:** Verify one message with three or more wrapped lines, two messages with mixed short/long text, explicit newlines, collapsed and expanded language rows, interim translation dots, own/other bubble colors, and consistent left alignment on iPhone 14.

## 2026-09-03 - Match iOS Picture in Picture preview to conversation bubbles

- **Surface:** The native iOS Picture in Picture conversation preview after the density and orientation update.
- **Issue:** The preview still carried speaker identity data even though PiP should be content-only. It could keep only one message when two short messages fit, used trailing truncation instead of visible line wrapping, and did not preserve the room bubble language treatment: flags, the original-language marker, per-language translation rows, interim translation feedback, bubble colors, and left/right alignment.
- **Diagnosis:** The bridge sent one flattened text string per utterance, so Swift could not reproduce the expanded bubble structure. Message selection classified each candidate with a fixed line limit rather than measuring the complete bubble stack, and the native text renderer used `byTruncatingTail`, which produced ellipses at the edge of the available rectangle.
- **Resolution:** Remove speaker/handle data from the PiP bridge. Send original text, original/display language, translation entries with interim state, and own-message alignment. Render each preview item as a compact bubble with the existing white/amber background treatment, the counterpart sharp top-left corner, a language flag, an original-language quote badge, and stacked translation rows without internal dividers or extra per-language margins. Use a height-based recent-message packing pass so the preview keeps two short messages when they fit and drops older messages only when the complete bubble stack does not fit. Switch native text drawing to character/word wrapping without trailing truncation; an in-progress translation shows `...` explicitly, while ordinary long text wraps onto additional lines.
- **Interaction:** Collapsed mode keeps the selected display language in one bubble row. Expanded mode shows the original row followed by available translation rows, including a compact `...` row for translations that are still pending. The preview remains read-only and non-scrollable; message count and font size continue to adapt to the selected mode and the actual rendered content.
- **Data change:** None. The iOS app remains version `2.0.2` with namespace `ios/v2.0.2`; the device verification build advances to `100`.
- **Testing notes:** Verify iPhone 14 with one to four short messages, two messages that previously collapsed to one, long Korean/Latin/CJK text, explicit newlines, collapsed and expanded modes, original and translated flags, missing/interim/partial translations, own-message amber alignment, counterpart white alignment, and no visible speaker handle or trailing truncation.

## 2026-09-03 - Correct iOS Picture in Picture orientation and message density

- **Surface:** The native iOS conversation Picture in Picture preview shown after the startup fix.
- **Issue:** The preview rendered vertically inverted. It also reserved too much space for a four-card layout, which made the latest conversation text very small and left large empty areas when fewer messages were available.
- **Diagnosis:** The `CGImage` produced by `UIGraphicsImageRenderer` was flipped again while copying it into the sample-buffer pixel buffer. The fixed card height and four-message loop did not adapt to the actual text length or the available 16:9 canvas.
- **Resolution:** Remove the extra pixel-buffer flip. The preview now uses the full 16:9 canvas for recent messages only, aligns the newest message at the bottom, and selects up to four compact messages or up to two expanded messages. If recent text needs additional wrapping, older messages are removed before reducing the font; the largest fitting font is then used with compact bubble padding.
- **Display state:** The native preview follows the selected bubble display mode. Collapsed mode shows the selected display language only; expanded mode includes the available translation lines in each message and uses a smaller message-count cap.
- **Interaction:** PiP remains a read-only, non-scrollable preview. Short recent messages can appear together, while long or wrapped content receives the space of one large message bubble.
- **Data change:** None. The iOS app remains version `2.0.2` with namespace `ios/v2.0.2`; only the build number advances for device verification.
- **Testing notes:** Verify the physical iOS 26 device with zero, one, two, three, and four short messages; collapsed and expanded display modes; a selected translated language; long wrapped text; interim text; long speaker names; and repeated preview updates.

## 2026-09-03 - Make iOS Picture in Picture startup reliable after repeated taps

- **Surface:** iOS conversation-room Picture in Picture action and its native start feedback.
- **Issue:** The button could appear unresponsive while iOS was evaluating the sample-buffer source. Repeated taps replaced the pending native request, and the final request could show the same generic unavailable alert after a delay.
- **Diagnosis:** The custom sample-buffer source did not explicitly keep an active playback audio session while no STT/TTS session was running. The native bridge also had no in-flight start guard, it only supplied a single snapshot frame, and its `AVSampleBufferDisplayLayer` was not attached to the active UIKit view hierarchy. The iOS 26 device log then showed the source becoming supported and `isPictureInPicturePossible=YES`, but `startPictureInPicture()` was called while the controller status was still transiently prohibited (`status=0`), so the request failed before the delegate callback.
- **Resolution:** Acquire a coordinated PiP audio-session lease, keep the latest preview alive with a low-rate frame refresh timer, coalesce duplicate taps for the same conversation instead of cancelling and replacing the pending start, host the sample-buffer layer in an offscreen native view attached to the active root view, and require three consecutive possible checks before starting PiP. Add diagnostic logs for app state, audio session, renderer readiness, and `isPictureInPicturePossible` without logging conversation text.
- **Interaction:** The PiP window remains a read-only, non-scrollable 16:9 snapshot. Repeated taps during startup no longer create duplicate native attempts or duplicate unavailable alerts.
- **Data change:** None. The iOS app remains version `2.0.2` with namespace `ios/v2.0.2`; only the build number advances for device/TestFlight verification.
- **Testing notes:** Unlock the physical iOS 26 device, open Mingle (not another installed app), tap PiP once, and confirm the window appears. Also test an empty room, an active STT/TTS session, repeated taps, explicit stop, background/foreground transitions, and PiP close.

## 2026-09-03 - iOS conversation Picture in Picture preview

- **Surface:** Live conversation-room header and the iOS system Picture in Picture window.
- **Issue:** A conversation room could not remain visible while the user used another app. The room is rendered in a WebView, while iOS does not allow an arbitrary transparent or interactive app window over other apps. System Picture in Picture accepts video/sample-buffer content, but its floating surface is not a scrollable chat UI.
- **Resolution:** Add an iOS-only Picture in Picture action to the room header. The WebView remains the normal room surface and sends the current room title, status, and latest four original utterances to React Native. Swift draws a compact read-only 16:9 preview and feeds it as `CMSampleBuffer` frames to `AVSampleBufferDisplayLayer` and `AVPictureInPictureController`.
- **Interaction:** An explicit in-app button starts Picture in Picture. New final or interim transcript changes update the preview. Picture in Picture does not support scrolling, chat controls, translation selection, or composing; closing it leaves the WebView room intact. The action is shown only in the native iOS runtime.
- **Data change:** None. The iOS app release is version `2.0.2` with namespace `ios/v2.0.2`; existing `UIBackgroundModes=audio` remains the background capability declaration.
- **Testing notes:** Verify on a physical iOS device because Picture in Picture is unsupported or limited in the simulator. Cover a signed-in room, an empty room, final and interim messages, room switching and cleanup, Picture in Picture close, background/foreground transitions, long localized text, and App Store review eligibility for a read-only live snapshot preview rather than conventional media playback.

## 2026-09-03 - Wait for the iOS Picture in Picture preview to become renderable

- **Surface:** The iOS conversation-room Picture in Picture button and its native start failure state.
- **Issue:** The first implementation enqueued the preview frame and checked `isPictureInPicturePossible` in the same main-queue turn. On a physical iOS 26 device, the sample-buffer renderer had not finished accepting the first frame yet, so the app showed its own `Picture in Picture unavailable` alert even though the device supported Picture in Picture.
- **User impact:** Tapping the visible Picture in Picture button appeared to fail every time, making the new floating conversation preview unusable.
- **Resolution:** Mark snapshot frames for immediate display, wait briefly and retry until the controller reports that Picture in Picture is possible, and resolve or reject the bridge promise from the native start/failed delegate callbacks. Cancel pending retries cleanly when the room closes or Picture in Picture stops.
- **Data change:** None. No database migration or conversation data change is required. The iOS app is version `2.0.2` with namespace `ios/v2.0.2`.
- **Testing notes:** Build and install a signed Release build on a physical iOS 26 device, tap Picture in Picture from a room with and without messages, and confirm that the preview opens without the unavailable alert. Also verify explicit stop, room cleanup, and the existing no-scroll/read-only interaction boundary.

## 2026-09-03 — Short XR goal resolution and flow cue

- Surface: `mingle-app/public/legal/xr-short.html`
- Issue: The new solution pages needed a clearer visual distinction between the language-learning goal that translation removes and the resulting conversation flow from that solved state.
- User impact: The original second goal looked equally active on the first solution page, and the relationship between the updated right-side message and the left-side social goal was not immediately apparent on the following page.
- Resolution: Added the existing `xr.html`-style red cross treatment to the first solution page's language-learning goal, reduced that goal's text opacity, and overlaid a large `통번역 제공` badge at its right edge. Added a large curved right-to-left arrow across the second solution page while preserving the two-column goal content and responsive layout.
- Tests: Verified pages `06 / 10` and `07 / 10` at desktop and mobile sizes, confirmed the cross, badge, and arrow render without viewport overflow, confirmed the updated right-side message remains visible, and checked for browser console warnings or errors.

## 2026-09-03 — Short XR cause and four-category market page

- Surface: `mingle-app/public/legal/xr-short.html`
- Issue: The shortened presentation needed a centered cause page after the two goal slides, with the language-exchange category restored as the first part of the broader service landscape. The existing three-category market page also left more separation between categories and scattered icons than necessary.
- User impact: The reason social-linking services have not provided translation was not stated before the presentation moved on, and the market comparison was less compact than the intended visual rhythm.
- Resolution: Added a new eighth slide with the requested centered cause title and a four-column market row ordered as language exchange, sincere voice conversation, global dating, and offline meetups. Reused the six language-exchange app icons from the download proof page, reduced the fifth-page category gap, and tightened its irregular icon distribution while preserving the flat category treatment and key colors. The four-column row becomes a responsive 2x2 layout on mobile.
- Tests: Verified pages `05 / 11` and `08 / 11` at desktop and mobile sizes, confirmed all category titles and 15 local icons load, confirmed the requested title and page order, confirmed no viewport overflow, and found no browser console warnings or errors.

## 2026-09-03 — Short XR AI requirement problem page

- Surface: `mingle-app/public/legal/xr-short.html`
- Issue: The shortened presentation needed to explain why existing AI could not satisfy the demanding requirements of a social-linking conversation before presenting the solution.
- User impact: The transition from the market and cause slides to the proposed translation service lacked a concrete explanation of the technical and cost barriers.
- Resolution: Added a centered ninth slide with the requested problem kicker and title, followed by seven compact requirement cards covering continuous translation, speech recognition, multilingual ability, real-time translation, language switching, speaker separation, and price. The cards use a responsive three-column layout on desktop and a readable single-column layout on mobile.
- Tests: Verified page `09 / 12` at desktop and mobile sizes, confirmed all seven labels and descriptions, confirmed the title is centered, confirmed no viewport overflow, and found no browser console warnings or errors.

## 2026-09-03 — Short XR AI cost and performance page

- Surface: `mingle-app/public/legal/xr-short.html`
- Issue: The new AI requirement page needed a follow-up explanation of why existing translation services still fall short on price and practical conversation performance.
- User impact: The presentation moved directly from the seven requirement gaps to the solution without showing concrete examples of the current service limitations.
- Resolution: Added a new tenth slide based on page nine of `xr.html`, preserving its original cause kicker, title, and four service cards for Felo Translator, Google Translator, Apple Translator, and Papago. The existing responsive tool-card styles are reused, and the page counter now reflects 13 total slides.
- Tests: Verified page `10 / 13` at desktop and mobile sizes, confirmed all four service logos and descriptions load, confirmed the title and card stack remain within the viewport, and found no browser console warnings or errors.

## 2026-09-03 — Short XR page 8 icon scale refinement

- Surface: `mingle-app/public/legal/xr-short.html`
- Issue: The four-category service landscape page still felt sparse because its scattered app icons were too small for the available category areas.
- User impact: The service clusters read as disconnected points, weakening the comparison between each category and the apps inside it.
- Resolution: Increased the page-eight category icons to approximately 1.5 times their previous size while preserving their irregular positions, so the existing centers naturally produce tighter spacing. Applied the same scale increase to the responsive mobile layout while keeping the four-category page as a 2x2 grid.
- Tests: Verified page `08 / 13` at desktop and mobile sizes, confirmed all 15 local icons load, checked that the enlarged clusters stay within their category areas and the viewport, and found no browser console warnings or errors.

## 2026-09-03 — Short XR page 9 compact requirement cards

- Surface: `mingle-app/public/legal/xr-short.html`
- Issue: The eight AI requirement details became too wide and left excessive empty space after the speaker-separation item was split into separate speech and speaker separation gaps.
- User impact: The requirement comparison felt sparse, and the distinction between sentence segmentation and multi-speaker separation was not visible.
- Resolution: Reworked the ninth slide into a compact four-column desktop grid with narrower cards, kept a single readable column on mobile, and split the former `발화 분리` item into `발화 분리 — 문장 단위로 끊어주질 않음` and `발화자 분리 — 여럿이 말해도 분리가 안됨`.
- Tests: Verified page `09 / 13` at desktop and mobile sizes, confirmed all eight labels and descriptions in order, confirmed no viewport overflow, and found no browser console warnings or errors.

## 2026-09-03 — Short XR page 7 arrow alignment

- Surface: `mingle-app/public/legal/xr-short.html`
- Issue: The page-seven flow arrow was drawn across most of both goal cards, used a gradient, and did not visually stay within the space between the two goals.
- User impact: The arrow competed with the goal copy and made the intended right-to-left transition feel imprecise.
- Resolution: Changed the arrow to a solid red stroke and recalculated its path from the right card's inner-left 10% point to the left card's inner-right 10% point. The geometry is recalculated on load and viewport changes so the relationship remains correct across desktop and mobile layouts.
- Tests: Verified page `07 / 13` at desktop and mobile sizes, confirmed the solid red stroke and endpoint alignment against both goal boxes, confirmed no viewport overflow, and found no browser console warnings or errors.

## 2026-09-03 — Short XR AI capability comparison pages

- Surface: `mingle-app/public/legal/xr-short.html`
- Issue: The AI requirement problem page needed a ninth capability to explain the text-only limitation of existing voice interpretation, and the following page needed to present the corresponding AI-enabled solution capabilities in the same visual language.
- User impact: Voice interpretation was missing from the requirement comparison, the price item used a negative label after the comparison shifted toward value, and the solution transition did not directly map the nine problem requirements to nine achievable capabilities.
- Resolution: Added `음성 통역 — 텍스트밖에 출력 안됨` to page nine and renamed `비싼 가격` to `가성비`. Changed the shared requirement grid to three columns, producing a 3x3 layout for the nine desktop cards while retaining a single readable column on mobile. Replaced the former page-ten service-cost list with a copied requirement-card layout using the `해결책` kicker, the requested AI title, and the nine solution pairs for continuous translation, real-time translation, voice interpretation, speech recognition, multilingual ability, language switching, speech separation, speaker separation, and value.
- Tests: Verified pages `09 / 13` and `10 / 13` at desktop and mobile sizes, confirmed all nine labels and descriptions on both pages, confirmed the desktop cards form three equal columns and three rows, confirmed the exact solution title and kicker, confirmed no viewport overflow, and found no browser console warnings or errors.

## 2026-09-03 — Short XR requirement card width refinement

- Surface: `mingle-app/public/legal/xr-short.html`
- Issue: Changing the requirement grid from four columns to three left the full 1080px media width in place, so each card became substantially wider than the preceding requirement cards.
- User impact: The 3x3 comparison lost the compact card rhythm established on the earlier page, and the larger cards made the requirement groups feel too spread out.
- Resolution: Constrained the shared requirement grid to a centered maximum width of 810px. This keeps the three-column desktop cards at approximately their previous 260px width while preserving the 3x3 structure and letting the mobile layout continue to use the full responsive content width.
- Tests: Verified pages `09 / 13` and `10 / 13` at desktop and mobile sizes, confirmed centered desktop cards at approximately 261px each, confirmed three rows and three columns on desktop, confirmed all nine cards remain full-width and readable on mobile, confirmed no viewport overflow, and found no browser console warnings or errors.

## 2026-09-03 — Short XR page 7 arrow vertical alignment

- Surface: `mingle-app/public/legal/xr-short.html`
- Issue: After the arrow endpoints were shortened to the inner edges of the two goal cards, the arrow remained anchored near the cards' top edge instead of sitting at the visual center of the lower content.
- User impact: The arrow looked disconnected from the two messages and made the intended right-to-left flow cue feel top-heavy.
- Resolution: Centered the arrow element vertically against the goal-card row with a 50% anchor and vertical translation. Updated the SVG path baseline and control points so the red arrow stroke itself, including its head, sits at the cards' vertical midpoint across responsive sizes.
- Tests: Verified page `07 / 13` at desktop and mobile sizes, confirmed the arrow center matches the goal-card center, confirmed the short red path and inner-edge endpoints remain intact, confirmed no viewport overflow, and found no browser console warnings or errors.

## 2026-09-03 — Short XR page 5 market icon density

- Surface: `mingle-app/public/legal/xr-short.html`
- Issue: The three-category market page used smaller app icons and wider visual gaps than the later four-category market page, making the earlier comparison feel sparse and inconsistent.
- User impact: The voice conversation, global dating, and offline meetup groups received less visual emphasis, and the relationship between each category and its services was weaker than on page eight.
- Resolution: Reused page eight's enlarged icon scale, irregular positions, tighter cloud inset, and reduced category gap for page five while retaining its three-column layout and removing the language-exchange category from that copied structure. Synchronized the static page counter with the user's removal of the redundant former solution-proof page, bringing the current deck fallback count to 12.
- Tests: Verified pages `05 / 12` and `08 / 12` at desktop and mobile sizes, confirmed page five contains only the three requested categories and nine local icons, confirmed page-five icon dimensions match page eight's corresponding groups, confirmed the three-category row remains centered and within the viewport, confirmed no viewport overflow, and found no browser console warnings or errors.

## 2026-09-03 — Short XR requirement order alignment

- Surface: `mingle-app/public/legal/xr-short.html`
- Issue: The ninth-page problem cards used a different order from the corresponding solution cards on page ten, so related capabilities did not line up when the two pages were compared.
- User impact: Viewers had to mentally remap the requirement pairs instead of scanning the problem and solution pages in the same sequence.
- Resolution: Reordered page nine to match page ten exactly: continuous translation, real-time translation, voice interpretation, speech recognition, multilingual ability, language switching, speech separation, speaker separation, and value. Preserved the page-nine title and descriptions already customized by the user.
- Tests: Verified pages `09 / 12` and `10 / 12` at desktop and mobile sizes, confirmed the nine title sequences match exactly, confirmed the desktop 3x3 grids and mobile single-column layout remain intact, confirmed no viewport overflow, and found no browser console warnings or errors.

## 2026-09-03 — Short XR page 7 arrowhead visibility

- Surface: `mingle-app/public/legal/xr-short.html`
- Issue: The page-seven arrow was correctly positioned at the goal-card center, but its arrowhead wings were too narrow and one wing visually blended into the curved stem.
- User impact: The direction cue could be read as an incomplete or uneven arrow, reducing the clarity of the right-to-left flow between the two messages.
- Resolution: Expanded the arrowhead rise and drop to approximately twice their previous angles while keeping the arrow's position, solid red color, curved stem, and inner-edge endpoints unchanged. Updated the static SVG fallback to match the responsive JavaScript-generated geometry.
- Tests: Verified page `07 / 12` at desktop and mobile sizes, confirmed both arrowhead wings are visibly separated from the stem, confirmed the arrow remains centered between the goal cards, confirmed no viewport overflow, and found no browser console warnings or errors.

## 2026-09-03 — Short XR requirement bar color separation

- Surface: `mingle-app/public/legal/xr-short.html`
- Issue: The requirement cards on pages nine and ten shared an orange-to-red gradient bar, so the problem and solution pages did not have distinct visual states.
- User impact: The problem/solution contrast was weaker, and the gradient added unnecessary visual noise to each card's left edge.
- Resolution: Removed the gradient from the shared bar style. Page nine now uses a solid red bar (`#dc2626`), while page ten uses the solid primary brand accent (`var(--accent)`) so the two pages remain visually related but clearly differentiated.
- Tests: Verified pages `09 / 12` and `10 / 12` at desktop and mobile sizes, confirmed all nine bars on each page use solid colors with no background image, confirmed the expected red and accent RGB values, confirmed no viewport overflow, and found no browser console warnings or errors.

## 2026-09-03 — Short XR solution bar blue refinement

- Surface: `mingle-app/public/legal/xr-short.html`
- Issue: The solution page's yellow requirement bars felt too close to the warm page palette and did not provide enough contrast with the problem page's red bars.
- User impact: The problem/solution distinction felt less crisp, and the solution cards did not convey a calm, reliable finish.
- Resolution: Replaced the solution-page bars with a solid blue solution accent (`#2563eb`) while keeping the problem-page bars solid red and removing gradients from both states.
- Tests: Verified pages `09 / 12` and `10 / 12` at desktop and mobile sizes, confirmed page nine uses solid `rgb(220, 38, 38)` bars and page ten uses solid `rgb(37, 99, 235)` bars, confirmed no viewport overflow, and found no browser console warnings or errors.

## 2026-09-03 — Short XR video start position

- Surface: `mingle-app/public/legal/xr-short.html`
- Issue: The page-twelve Mingle video needed to open at the relevant moment from the shared YouTube link, but the watch-page `t=43s` syntax is not the correct parameter for an embedded player.
- User impact: Viewers would begin at the default video position instead of the intended 43-second context.
- Resolution: Added YouTube's embed-compatible `start=43` parameter to the existing `/embed/Esq6htnQj98` source while preserving the inline-playback and related-video settings.
- Tests: Verified page `12 / 12` through the local HTTP preview, confirmed the iframe keeps video ID `Esq6htnQj98` and resolves `start=43`, and confirmed no viewport overflow.

## 2026-09-03 — Short XR default video playback rate

- Surface: `mingle-app/public/legal/xr-short.html`
- Issue: The page-twelve video needed to begin at the requested 43-second point and play at a faster default speed for the presentation flow.
- User impact: Viewers would otherwise need to manually change the YouTube playback speed every time they started the video.
- Resolution: Enabled the YouTube IFrame Player API for the short-video iframe, set the page origin dynamically for both local HTTP previews and production, and apply a `1.5x` playback rate in the player's ready callback. The existing `start=43` position remains unchanged.
- Tests: Verified page `12 / 12` through the local HTTP preview, confirmed the iframe retains video ID `Esq6htnQj98`, resolves `start=43`, includes `enablejsapi=1` and the current HTTP origin, confirmed the YouTube API initializes, and confirmed no viewport overflow.

## 2026-09-03 — Short XR voice conversation bridge page

- Surface: `mingle-app/public/legal/xr-short.html`
- Issue: The short presentation needed to show the initial workaround of keeping a voice-conversation service open alongside Mingle before presenting the final integrated experience.
- User impact: The story moved from the requirement solution directly to the final video, leaving the practical two-service usage step unexplained.
- Resolution: Added a new thirteenth slide after the video slide with the `밍글` kicker and the requested title, reusing the original page-fourteen HelloTalk Voiceroom and Mingle image stack from `xr.html`. The runtime counter derives its total from the slide count.
- Tests: Verified page `13 / 13` at desktop and mobile sizes, confirmed both local images load and the stacked layout stays within the slide, confirmed the page counter and total slide count, confirmed no viewport overflow, and found no browser console warnings or errors.

## 2026-09-03 — Short XR customer reaction page

- Surface: `mingle-app/public/legal/xr-short.html`
- Issue: The short presentation needed to follow the two-service workaround with direct customer evidence from people who had tried Mingle.
- User impact: The presentation lacked a concise proof point showing why the experience was positively received after the workaround and feature comparison.
- Resolution: Added a new fourteenth slide after the voice-conversation bridge page with the `고객 반응` kicker, the requested title, and three right-side reaction cards based on the original page-fifteen response layout from `xr.html`. Replaced the source reactions with the requested continuous-translation, cross-language comprehension, and speech-recognition statements, and updated the static page counter to `01 / 14`.
- Tests: Verified page `14 / 14` at desktop and mobile sizes, confirmed all three reaction cards and their exact text render in the right-side stack, confirmed the card stack stays within the slide, confirmed no viewport overflow, and found no browser console warnings or errors.

## 2026-09-03 — Short XR customer dependence page

- Surface: `mingle-app/public/legal/xr-short.html`
- Issue: The customer-reaction sequence needed a follow-up page showing that some users had begun relying on Mingle during their regular HelloTalk conversations.
- User impact: Positive reactions were presented without a concrete usage signal showing repeated, habitual behavior.
- Resolution: Added a new fifteenth slide after the reaction-card page using the original page-seventeen layout from `xr.html`. Changed its kicker to `고객 반응`, preserved the original title and usage evidence, and reused the HelloTalk Voiceroom and Mingle image stack. Updated the static page counter to `01 / 15`.
- Tests: Verified page `15 / 15` at desktop and mobile sizes, confirmed the requested kicker, title, usage copy, and both local images render, confirmed the image stack stays within the slide, confirmed no viewport overflow, and found no browser console warnings or errors.

## 2026-09-03 — Short XR add-on subtitle demand page

- Surface: `mingle-app/public/legal/xr-short.html` and `mingle-app/public/legal/assets/xiaohongshu-pip-mingle.png`
- Issue: The short presentation needed to show demand for using Mingle as an add-on subtitle layer over an unrelated live-streaming service.
- User impact: The customer-proof sequence did not show that Mingle can accompany picture-in-picture viewing outside a dedicated socialing service.
- Resolution: Added a sixteenth left-aligned slide with the `고객 반응` kicker, the requested title, the attached Xiaohongshu PIP screenshot on the right, and a centered two-line explanation below it. Updated the static page counter to `01 / 16`.
- Tests: Verified page `16 / 16` at desktop and mobile sizes, confirmed the attached image loads, confirmed the caption remains below the image, confirmed no viewport overflow, and found no browser console warnings or errors.

## 2026-09-03 — Short XR add-on subtitle use-case collage

- Surface: `mingle-app/public/legal/xr-short.html` and `mingle-app/public/legal/assets/roblox-mobile-home.jpg`, `mingle-app/public/legal/assets/discord-mobile-chat.png`
- Issue: The add-on subtitle demand page needed to show that the use case extends beyond Xiaohongshu to other mobile-first services, including an active Roblox use case and interest in Discord.
- User impact: The single screenshot communicated one example but did not make the broader cross-service demand visually concrete.
- Resolution: Added Roblox and Discord mobile UI screens behind the Xiaohongshu PIP screenshot, keeping Xiaohongshu visually on top. Added the requested left-bottom body copy, including the statement that a user is already using Mingle with Roblox and that users sometimes want Mingle for content without subtitles.
- Tests: Verified page `16 / 16` at desktop and mobile sizes, confirmed all three images load with the intended z-order, confirmed the body copy remains under the left title, confirmed the caption remains under the image collage, confirmed no viewport overflow, and found no browser console warnings or errors.

## 2026-09-03 — Short XR offline and work translation reaction page

- Surface: `mingle-app/public/legal/xr-short.html`
- Issue: The customer-reaction sequence needed to acknowledge translation demand beyond social and content use cases, including offline and work contexts.
- User impact: The presentation ended the add-on subtitle examples without signaling that Mingle is also being considered for practical offline and workplace interpretation.
- Resolution: Extended page sixteen's left body copy with Discord interest and the broader no-subtitle-content demand, added `로블록스, 디스코드와도 함께 사용` to the right-side caption, and added a seventeenth left-aligned slide with the `고객 반응` kicker and requested title. Updated the static page counter to `01 / 17`.
- Tests: Verified pages `16 / 17` and `17 / 17` at desktop and mobile sizes, confirmed page sixteen's three-line caption remains below the collage, confirmed page seventeen's left alignment and exact title, confirmed no viewport overflow, and found no browser console warnings or errors.

## 2026-09-03 — Short XR offline/work media proof page

- Surface: `mingle-app/public/legal/xr-short.html` and `mingle-app/public/legal/assets/offline-work-mingle.png`
- Issue: The offline and workplace translation reaction page needed a concrete visual proof point alongside its left-aligned message.
- User impact: Page seventeen communicated the claim only as text, so the practical use case had less visual weight than the preceding add-on subtitle examples.
- Resolution: Added the attached mobile screenshot as a right-side media element on page seventeen, using the same left-copy/right-visual composition as page sixteen while preserving the requested kicker and title.
- Tests: Verified page `17 / 17` at desktop and mobile sizes, confirmed the attached image loads, confirmed the title remains left-aligned and the image stays on the right on desktop, confirmed the mobile layout stacks without clipping, confirmed no viewport overflow, and found no browser console warnings or errors.

## 2026-09-03 — Short XR offline/work visual treatment refinement

- Surface: `mingle-app/public/legal/xr-short.html`
- Issue: The page-seventeen screenshot was styled as a large rounded card and lacked the requested contextual caption.
- User impact: The visual felt heavier than page sixteen, and the salon and foreign-tourist use case was not explained below the screenshot.
- Resolution: Removed the decorative border radius and shadow, reduced the screenshot scale, and added the caption `미용실 사장님들이 외국인 관광객 대면할 때 많이 사용` below the image while keeping the image as a plain right-side visual.
- Tests: Verified page `17 / 17` at desktop and mobile sizes, confirmed the image and caption stay within the slide, confirmed the caption remains below the image, confirmed no horizontal overflow, and found no browser console warnings or errors.

## 2026-09-03 — Short XR offline/work customer evidence copy

- Surface: `mingle-app/public/legal/xr-short.html`
- Issue: The offline and workplace translation page needed concrete examples to support its customer-reaction claim.
- User impact: The slide showed the use-case heading and screenshot, but did not explain the kinds of people already finding practical value in Mingle.
- Resolution: Added the requested lower-left body copy describing an African young man who found interpreter work with Mingle despite limited English and a person who appears to guide Japanese tourists around Seoul.
- Tests: Verified page `17 / 17` at desktop and mobile sizes, confirmed the body copy sits below the left-aligned title, confirmed the image and caption remain visible, confirmed no viewport overflow, and found no browser console warnings or errors.

## 2026-09-03 — Short XR offline meetup competitor coverage

- Surface: `mingle-app/public/legal/xr-short.html` and `mingle-app/public/legal/assets/logo-market-couchsurfing.jpg`
- Issue: The offline-meetup category on the market pages represented the space with only Timeleft and Meetup.
- User impact: The category understated the breadth of established services used to connect travelers and locals in person.
- Resolution: Added the Couchsurfing app icon to the offline-meetup logo cloud on pages five and nine, using the same scattered presentation and a slightly larger scale for the prominent competitor.
- Tests: Verified pages `05 / 17` and `09 / 17` at desktop and mobile sizes, confirmed all three offline-meetup icons load on both pages, confirmed the icons stay within the viewport, and found no browser console warnings or errors.

## 2026-09-03 — Short XR seven customer experience categories

- Surface: `mingle-app/public/legal/xr-short.html`, `mingle-app/public/legal/assets/`
- Issue: The shortened XR presentation needed a single summary page showing the seven concrete user experiences Mingle plans to address individually.
- User impact: The preceding customer-reaction pages demonstrated demand through examples, but did not make the full set of target experiences easy to scan in one view.
- Resolution: Added an eighteenth centered slide with the `고객` kicker and requested two-line title. Added seven transparent category areas with one to three irregularly scattered service icons each: online cultural exchange, voice-call services, add-on subtitles, offline meetups, tourist-facing offline response, tourist information/consultation/reservations, and multilingual meetings. Added local App Store artwork for Immersive Translate, Caplo, Konest, Fresha, and Gangnam Unni, and reused the existing HelloTalk, K-Friends, Discord, Couchsurfing, Google Translate, and Cuckoo assets.
- Tests: Verified page `18 / 18` at 1280x720 desktop and 390x844 mobile sizes, confirmed all seven category titles and 11 icons load, confirmed the title and category labels are centered, and confirmed no horizontal viewport overflow.

## 2026-09-03 — Short XR vision and business model continuation

- Surface: `mingle-app/public/legal/xr-short.html`
- Issue: The shortened XR presentation stopped after the seven customer experience categories and did not carry the source deck's vision and business model conclusion.
- User impact: Viewers could not continue from the customer summary into the stated AI-native SNS goal and the two business model diagrams.
- Resolution: Added the source deck's ultimate-goal slide followed by the business Venn diagram and business matrix as pages nineteen through twenty-one. Reused the existing local business diagram assets and updated the static page counter to `01 / 21`.
- Tests: Verified pages `19 / 21`, `20 / 21`, and `21 / 21` at desktop and mobile sizes, confirmed the vision text and both diagram images render, confirmed the images stay within the slide, and confirmed no viewport overflow.

## 2026-09-03 — Short XR team and closing pages

- Surface: `mingle-app/public/legal/xr-short.html`
- Issue: The shortened XR presentation ended after the business model diagrams and omitted the source deck's team-recruitment and closing Q&A pages.
- User impact: The deck had no closing invitation for prospective team members and no final contact, repository, social, or app-download links.
- Resolution: Added the source deck's `팀원 구합니다` page and `감사합니다. Q & A` page as pages twenty-two and twenty-three, including the original closing links and store badges. Updated the static page counter to `01 / 23`.
- Tests: Verified pages `22 / 23` and `23 / 23` at desktop and mobile sizes, confirmed the recruitment copy and all closing links/badges render, confirmed local assets load, and confirmed no viewport overflow.

## 2026-09-03 — Short XR download QR placement

- Surface: `mingle-app/public/legal/xr-short.html` and `mingle-app/public/legal/assets/qr-mingle-download.svg`
- Issue: The opening and closing slides centered their content and did not provide a scannable path to the app download page.
- User impact: People viewing the deck on a second screen had no direct visual route to open the Mingle download page on their phone.
- Resolution: Added a local QR code for `https://mingle-landing.vercel.app/` to the right side of pages one and twenty-three, shifted both slide compositions toward left-aligned copy, and preserved the existing closing links below the Q&A title. Kept a stacked left-copy/QR arrangement for narrow mobile viewports.
- Tests: Verified pages `01 / 23` and `23 / 23` at desktop and mobile sizes, confirmed both QR images load, confirmed both QR links point to the Mingle landing page, confirmed page-one and Q&A copy are left aligned, and confirmed no viewport overflow.

## 2026-09-03 — Short XR customer experience category row refinement

- Surface: `mingle-app/public/legal/xr-short.html`
- Issue: The seven-category customer summary used one desktop row, which made each category narrow and reduced the readability of its label and app icons.
- User impact: The category map felt too spread across the page while the individual services appeared too small.
- Resolution: Changed the page-eighteen desktop summary to a centered four-plus-three flex layout, enlarged category titles and app icons, and kept each category's icons in a compact horizontal row. Preserved a responsive two-column/four-row mobile layout with the final category centered.
- Tests: Verified page `18 / 18` at 1280x720 desktop and 390x844 mobile sizes, confirmed four categories in the first desktop row and three in the second, confirmed seven categories and 11 local icons load, confirmed all per-category icon rows are horizontal, and confirmed no horizontal viewport overflow.

## 2026-09-03 — XR Venn diagram asset correction

- Surface: `mingle-app/public/legal/xr.html`, `mingle-app/public/legal/xr-short.html`, and `mingle-app/public/legal/assets/business-venndiagram.png`
- Issue: The Venn diagram used an earlier image containing a typo.
- User impact: The same incorrect diagram appeared on the corresponding Venn page in both the full and shortened XR decks.
- Resolution: Replaced the shared Venn diagram asset with the corrected attached image, so both decks update through their existing single-image page without changing the business matrix page or any other slide.
- Tests: Verified the corrected asset matches the attached PNG byte-for-byte, confirmed it loads on the Venn page in both decks, confirmed the matrix asset remains unchanged, and confirmed no viewport overflow.

## 2026-09-03 — Short XR K-Friends acquisition goal slide

- Surface: `mingle-app/public/legal/xr-short.html` and the two new K-Friends screenshot assets under `mingle-app/public/legal/assets/`
- Issue: The deck needed a concrete first-goal slide explaining the plan to absorb K-Friends users, supported by evidence from the competing app's product screens.
- User impact: The strategic goal lacked a visual anchor and the age of K-Friends' product updates was not immediately visible.
- Resolution: Added page nineteen with left-aligned goal copy, two slightly overlapping K-Friends mobile screenshots, and a compact caption pairing the K-Friends logo with `Kfriends 앱 화면. 2년에 한 번씩 업데이트.`. Shifted the existing business, vision, recruitment, and Q&A pages to follow it and updated the initial page counter to twenty-four.
- Tests: Verified the new screenshots and logo load locally, confirmed the two images overlap slightly in the right-side media area, checked the caption at desktop and mobile sizes, confirmed the page counter and total slide count are twenty-four, and confirmed no horizontal viewport overflow.

## 2026-09-03 — Short XR K-Friends screenshot sizing refinement

- Surface: `mingle-app/public/legal/xr-short.html`
- Issue: The two K-Friends screenshots on page nineteen were smaller than the neighboring mobile-screen examples and their decorative rotations made the composition feel unstable.
- User impact: The evidence screens were harder to inspect and the right-side visual did not match the deck's established phone-screen treatment.
- Resolution: Matched the screenshot height to the page-seventeen mobile-screen scale, removed the rotations, and retained only a slight horizontal overlap between the two images on desktop and mobile.
- Tests: Rechecked page `19 / 24` at desktop and mobile sizes, confirmed the images remain fully visible with a small overlap, and confirmed no horizontal viewport overflow.

## 2026-09-03 — Short XR K-Friends screenshot order refinement

- Surface: `mingle-app/public/legal/xr-short.html`
- Issue: The K-Friends version-history screen was on the left, while the user wanted the app screen to lead the composition from the left.
- User impact: The visual emphasis did not follow the intended reading order for the competing app evidence.
- Resolution: Moved the version-history screen to the right and kept the story app screen on the left with the foreground z-index, preserving the slight overlap and existing scale at desktop and mobile sizes.
- Tests: Verified page `19 / 24` at desktop and mobile sizes, confirmed the story screen is left and in front of the version-history screen, and confirmed no horizontal viewport overflow.

## 2026-09-03 — Short XR video start time and caption default

- Surface: `mingle-app/public/legal/xr-short.html`
- Issue: The page-twelve YouTube demonstration needed to begin later in the source video, without showing YouTube captions by default.
- User impact: Viewers could see the demonstration begin before the intended moment and could get duplicate captions alongside Mingle's translated output.
- Resolution: Changed the embedded video start time to 57 seconds and added YouTube's `cc_load_policy=0` parameter so captions remain off on initial playback.
- Tests: Confirmed the page-twelve iframe source contains `start=57` and `cc_load_policy=0`, and confirmed the embed retains inline playback and the existing playback-rate initialization.

## 2026-09-03 — Short XR smart download QR and closing alignment

- Surface: `mingle-app/public/legal/xr-short.html`, `mingle-app/public/legal/assets/qr-mingle-download.svg`, and `mingle-landing/app/download/route.ts`
- Issue: The opening and closing QR codes led to the general landing page, requiring an extra tap before a viewer could install Mingle.
- User impact: Scanning the QR code did not take iOS and Android viewers directly to their respective app stores, and the closing slide did not visually center its Q&A title within the left content area.
- Resolution: Added a QR-only smart-link route that detects iOS or Android from request headers and redirects directly to the matching store, with the normal landing page as the unknown-platform fallback. Repointed the QR asset and both QR anchors to that route, placed the Mingle app icon above each QR code, and centered the page-twenty-three Q&A composition within its left column.
- Tests: Verified iOS, Android, client-hint, and fallback redirect destinations with route tests; confirmed the QR asset encodes the smart-link route; and verified pages `01 / 23` and `23 / 23` at desktop and mobile sizes with the icon, QR, title alignment, and no viewport overflow.

## 2026-09-03 — Short XR QR label refinement

- Surface: `mingle-app/public/legal/xr-short.html`
- Issue: The Mingle app icon above the QR code appeared by itself without explaining what it represented.
- User impact: The download visual on pages one and twenty-three felt disconnected, and the relationship between the icon and QR code was not immediately clear.
- Resolution: Grouped the smaller Mingle app icon with the label `Mingle 다운로드 링크` above both QR codes and added a centered downward-pointing finger emoji between the label and QR code. Kept the compact treatment responsive for mobile viewports.
- Tests: Verified pages `01 / 23` and `23 / 23` at desktop and mobile sizes, confirmed the label, icon, and pointer appear in the requested order, confirmed the Q&A title remains centered within the left column, and confirmed no viewport overflow.

## 2026-09-03 — Short XR QR label typography refinement

- Surface: `mingle-app/public/legal/xr-short.html`
- Issue: The QR label `Mingle 다운로드 링크` was too small and visually heavier than the adjacent app icon and QR treatment.
- User impact: The download callout was less readable at a glance and felt overly bold on both desktop and mobile layouts.
- Resolution: Increased the label size and reduced its font weight for pages one and twenty-three, with a responsive mobile size that remains within the existing QR media column.
- Tests: Verified the label typography at desktop and mobile viewport sizes and confirmed no horizontal overflow or QR layout shift.

## 2026-09-02 - Clarify new conversation-room creation labels

- **Surface:** Conversation-list create action and the modal that chooses between a solo conversation room and inviting friends.
- **Issue:** The Korean create action said `새 대화 시작`, which described starting a conversation but not creating the persistent conversation room. The solo option `혼자서 시작하기` also did not explain what would be created. The English `Start Conversation!` had the same ambiguity and retained an unnecessary exclamation mark.
- **Resolution:** Rename the Korean create action to `새 대화방 만들기` and the English action to `Create a new chat`. Rename the solo option to `혼자 쓰는 대화방` and `Your own room`. Localize both labels for all 15 primary UI locales, using concise, natural chat/room terminology where a literal translation would be too long or unnatural.
- **Interaction:** Keep `Invite friends`, `Cancel`, the invite-screen title, and the invite-screen submit action unchanged. The modal continues to present the solo and friend-invite choices without adding a visible title.
- **Data change:** None. This is a presentation-only i18n change.
- **Testing notes:** Verify both labels in all 15 primary UI locales, with special attention to Spanish and Vietnamese button widths, RTL Arabic layout, CJK rendering, and fallback locales that resolve supplemental copy through English.

## 2026-09-02 — Short XR presentation goal split

- Surface: `mingle-app/public/legal/xr-short.html`
- Issue: The shortened XR presentation needed an additional third page to explain the two competing motivations behind the language-exchange problem. The existing centered slide treatment did not provide enough visual separation or emphasis for the two goals.
- User impact: Viewers could not immediately distinguish between wanting to make foreign friends and wanting to learn a foreign language, which weakened the problem framing in the short presentation.
- Resolution: Added a centered third slide with the `문제` kicker and `닭 vs 달걀 문제` title. Added a responsive two-column goal layout with larger type, separate accent treatments, gradient key-color bars, soft tinted panels, and mobile sizing that preserves the side-by-side comparison. Updated the static page counter to six slides; the existing slide navigation continues to derive the final count from the slide elements.
- Tests: Verified six top-level `.slide` elements, confirmed the requested page order and text, and ran `git diff --check`.

## 2026-09-02 — Short XR goal slide kicker alignment follow-up

- Surface: `mingle-app/public/legal/xr-short.html`
- Issue: The new third slide used centered content, but the absolutely positioned `문제` kicker still inherited the default left anchor from the generic slide-copy style.
- User impact: The kicker appeared on the left while the title and two goal cards were centered, creating a visible alignment inconsistency at the top of the slide.
- Resolution: Centered the goal slide kicker independently with a 50% anchor and horizontal translation. The rule applies across desktop and mobile layouts.
- Tests: Rechecked the third-slide DOM layout and ran `git diff --check`.

## 2026-09-02 — Short XR market comparison slide

- Surface: `mingle-app/public/legal/xr-short.html`, `mingle-app/public/legal/assets/`
- Issue: The shortened XR presentation needed a market-context page showing that multiple product categories already address parts of the foreign-friend and language-learning problem. A plain competitor list would not communicate the breadth of the market or keep the slide visually scannable.
- User impact: Without a compact market map, viewers could miss the distinction between language exchange, sincere voice conversation, global dating, and offline meetups, as well as the competitive context for Mingle.
- Resolution: Added a fourth slide with a left-aligned `시장` message and a right-side 2x2 category grid. Each category uses a distinct key color, soft tinted panel, and irregularly scattered local service icons without divider lines. Grouped K Friends, HelloTalk, Tandem, Hilokal, and Yeetalk under `언어교환`; Maum, Connecting, and Wakie under `진솔한 음성 대화`; Meeff, Azar, Tinder, and Yubo under `글로벌 데이팅`; and Timeleft and Meetup under `오프라인 모임`. Added local app artwork assets and updated the presentation count to seven slides.
- Tests: Verified the page-four text, category counts, local image loading, and `04 / 07` counter in the local browser at desktop and mobile sizes. Confirmed no viewport overflow and ran `git diff --check`.

## 2026-09-02 — Short XR market category simplification

- Surface: `mingle-app/public/legal/xr-short.html`
- Issue: The category panels on the market slide added visual weight that competed with the service icons and made the market map feel more like four separate cards than one comparison field.
- User impact: Viewers could focus on the panel decoration instead of quickly scanning the category names and the services grouped beneath them.
- Resolution: Removed category backgrounds, rounded-card treatment, shadows, glow ornaments, and corner dots. Kept the 2x2 placement, category names, per-category title colors, and irregular icon clouds as the only visual structure.
- Tests: Rechecked the market slide at desktop and mobile sizes, confirmed all 14 local icons load, and ran `git diff --check`.

## 2026-09-02 — Short XR market category spacing refinement

- Surface: `mingle-app/public/legal/xr-short.html`
- Issue: After simplifying the market slide to names and icons, category labels were left-aligned, the overall grid sat too close to the viewport edge, and the icon clouds left too much unused space inside each 2x2 area.
- User impact: The category groups felt visually unbalanced and the service icons had less emphasis than the market comparison needed.
- Resolution: Centered every category title, added balanced outer padding around the market grid, reduced the internal category and icon-cloud insets, and increased the title and icon scale while preserving the irregular positions and responsive 2x2 layout.
- Tests: Verified all four titles use centered alignment, all 14 local icons load, the `04 / 07` counter remains correct, page three remains centered, and the layout has no body overflow at desktop and mobile sizes.

## 2026-09-02 — Short XR language-exchange market proof page

- Surface: `mingle-app/public/legal/xr-short.html`, `mingle-app/public/legal/assets/logo-market-kfriends-blue.jpg`
- Issue: The market comparison needed to show the scale of the language-exchange category before the broader four-category map. The existing Kfriends artwork represented a separate service from the provided KFriends app, so the competitor set also needed both apps without conflating their download sizes.
- User impact: Viewers could not immediately see how many large language-exchange services compete in this space or distinguish the two similarly named KFriends products.
- Resolution: Added a centered fourth slide stating that many language-exchange services still do not solve the chicken-and-egg problem. Added a single horizontal row of six apps ordered by estimated Android downloads—HelloTalk, Tandem, Yeetalk, K-Friends, Hilokal, and Kfriends—with each app name and estimate on two lines. Added the provided blue KFriends artwork as a separate local asset and added it to the language-exchange group on the following market map slide. Removed residual logo shadows so the category areas remain visually flat.
- Tests: Verified the new page as `04 / 08`, the moved market map as `05 / 08`, six horizontal overview items, six language-category icons, local image loading, centered page-four content, no body overflow on desktop/mobile, and no browser console warnings or errors.

## 2026-09-02 — Short XR market category row refinement

- Surface: `mingle-app/public/legal/xr-short.html`
- Issue: The language-exchange proof page made the language-exchange group redundant on the following market map, while the remaining categories were still shown as a 2x2 side panel beside left-aligned copy.
- User impact: The market page did not read as a single centered comparison, and the three remaining competitive spaces were harder to scan as a sequence.
- Resolution: Removed the language-exchange category from the market map, centered the market kicker and title, and changed the remaining sincere voice conversation, global dating, and offline meetup groups to one horizontal row. Preserved the irregular icon scattering within each category and added responsive sizing for the three-column layout.
- Tests: Verified page `05 / 08` at desktop and mobile sizes, confirmed the three category titles and icon counts of 3/4/2, confirmed local image loading and no viewport overflow, and found no browser console warnings or errors.

## 2026-09-02 — Short XR download estimate refresh

- Surface: `mingle-app/public/legal/xr-short.html`, `mingle-app/public/legal/assets/logo-market-kof.png`
- Issue: The language-exchange proof page presented Android-only figures without making the platform scope clear. The final Kfriends entry also represented the smaller Bibimbap Story app, while KOF had a larger publicly visible Android footprint and was a better market comparison.
- User impact: The scale comparison understated several competitors and made the source scope of the figures ambiguous. The similarly named Kfriends entry could also distract from the more relevant KOF competitor.
- Resolution: Recalculated the rounded figures using public Android and iOS indicators where available: HelloTalk `약 7,000만+`, Tandem `약 3,500만+`, Yeetalk `약 1,100만`, K-Friends `약 450만`, Hilokal `약 170만`, and KOF `약 60만`. Replaced the Bibimbap Story Kfriends artwork with a local KOF icon, added a platform-scope caption, and increased the app-name and estimate type sizes while preserving the six-item horizontal row. KOF is marked as Google Play-based because no matching Apple App Store listing was found.
- Tests: Verified page `04 / 08` at desktop and mobile sizes, confirmed the six apps remain in descending order, confirmed all local images load, checked the page-five 3/4/2 category layout for regression, confirmed no viewport overflow, and found no browser console warnings or errors.

## 2026-09-02 — Short XR market title and spacing refinement

- Surface: `mingle-app/public/legal/xr-short.html`
- Issue: The market page title needed to explain the broader connection-market problem, while the scattered competitor icons sat too far below their category labels.
- User impact: The message was less specific than intended, and the large vertical gaps weakened the visual relationship between each category and its services.
- Resolution: Replaced the market title with the requested two-line statement about abundant services and recurring language barriers. Reduced the category logo-cloud inset for the three-column market row on desktop and mobile, preserving the irregular icon positions and centered layout.
- Tests: Verified page `05 / 08` at desktop and mobile sizes, confirmed the exact title text and three category titles, confirmed local image loading and no viewport overflow, and found no browser console warnings or errors.

## 2026-09-01 - Render language-selector member avatars local-first

- **Surface:** The shared-room language selector, its per-language attribution avatar stacks, and the conversation-list-to-room handoff.
- **Issue:** The selector loaded every member profile from `GET /conversations/{id}/members` with `cache: "no-store"` each time it opened. The room/list snapshot already had the counterpart avatar metadata, but the selector did not consume it, and the full member response was not persisted locally. Slow or unavailable server reads therefore left the attribution avatars blank or delayed even though the conversation itself was already visible.
- **User impact:** Opening the language selector could show the language rows before the user's and counterpart's photos appeared. A temporary network failure removed the avatars instead of preserving the last known identity, making the selector feel like it was still loading and adding another visible server dependency to an otherwise local-first room.
- **Resolution:** Add an API-namespace, account/tracking-identity, and conversation-scoped member-profile cache with a seven-day bounded snapshot. Seed the selector immediately from cached profiles plus the already-hydrated counterpart profiles and signed-in viewer profile, then revalidate the member endpoint in the background. A failed revalidation now keeps the local snapshot; a successful response replaces and persists the authoritative member profile set.
- **Boundary:** Profile image URLs remain remote assets and may still be fetched by the browser when its image cache is cold. This change removes the blocking member/DB request from the first render and preserves the last known URL/crop metadata; it does not copy image bytes into IndexedDB or alter membership/privacy rules.
- **Data change:** None. No Prisma migration, API namespace change, native-code change, or mobile rebuild is required.

## 2026-09-01 — Scope Android native STT callbacks to a session generation

- Surface: Android native STT WebSocket/audio startup, the React Native status replay bridge, and room re-entry after a WebView reload or list navigation.
- Issue: Android could lose the first WebSocket callback when the native running guard or socket reference was not initialized before OkHttp delivered `onOpen`. A previous room's callback could also arrive while a new room was requesting capture. A graceful stop already in progress could make a recovery stop return before the native singleton was actually released.
- User impact: The microphone could remain in `connecting`, appear to switch between Start and Stop after returning to the room list, or accept a tap without delivering speech recognition. The same symptoms could recur nondeterministically because they depended on callback timing.
- Resolution:
  - Assign a unique session generation ID to every WebView/native STT start and carry it through Android lifecycle events and the WebView message buffer.
  - Initialize Android's running guard before opening the WebSocket and validate callbacks by session generation, avoiding the pre-assignment race on the WebSocket reference.
  - Require same-room reuse to also match the session generation; otherwise recover the process-wide native singleton before starting the requested room.
  - Allow a forced recovery stop to supersede an already-pending graceful stop and wait for the native cleanup path before the next start.
  - Replay native status on WebView load only to the room in the URL, and send an idle replay to a different room instead of inheriting the previous room's status.
  - Drop session-tagged queued messages from an old generation while retaining untagged messages for older native shells.
  - Keep the connecting watchdog at 20 seconds to accommodate cold Android audio/WebSocket startup while still recovering a lost handshake.
- Data contract: No Prisma migration or API namespace change is required. The mobile app remains `2.0.0` using `android/v2.0.0`; session IDs are opaque lifecycle metadata and contain no access token or transcript text.
- Testing notes: Verify cold start, rapid stop/start, room switch during `connecting`, graceful-stop overlap, WebView reload, list-to-room re-entry, stale callback rejection, queued-message filtering, and repeated Android runs. Confirm iOS behavior remains unchanged and install a newly built Android artifact before device validation.

## 2026-09-01 — Keep live STT running on the conversation list

- Surface: Conversation room back navigation, the conversation list, hidden live-room rendering, and Android room re-entry.
- Issue: Closing a room explicitly forced native STT to stop and then removed the live room from the mounted set. The list became visible before `history.back()` had settled, so an immediate Android row tap could reopen the room and then be closed by the delayed popstate. Repeated taps could also issue multiple native Start commands before React rendered the first `connecting` state.
- User impact: iOS and Android stopped recognition when returning to the list, the list action area flickered while the room changed from active to paused, Android sometimes required two taps to reopen a room, and repeated navigation could leave a phantom Stop control or an unresponsive Start control.
- Resolution:
  - Treat room close as visual navigation only. Keep the live room mounted and its STT, translations, and message persistence active while the conversation list is visible.
  - Preserve explicit Stop, room switching, deletion/leave, sign-out, and app teardown as the operations that actually end a session.
  - Queue a row tap that arrives before the room-to-list history transition settles, then open that room immediately after popstate completes.
  - Mirror connection status into the synchronous ref before React renders and suppress duplicate starts while the session is already connecting or ready.
  - Ignore Android's initial audio-route enumeration callback and scope delayed audio recovery to the session that requested it, preventing a stopped generation from recreating capture.
- Data contract: No Prisma migration or API namespace change is required.
- Testing notes: Start STT, return to the list, speak while the list is visible, and confirm the room preview updates without the session stopping. Reopen with one tap, continue speaking, repeat the cycle several times, then explicitly Stop. Repeat on iOS and Android; also verify starting STT in a different room cleanly transfers the singleton session.

## 2026-09-01 — Resynchronize Android STT after returning to a room

- Surface: Android native STT status, the React Native-to-WebView bridge, hidden live-room rendering, and conversation-room re-entry.
- Issue: The native recorder could continue capturing while the room was hidden on the conversation list, but a visible room hook could retain an old or missing session generation. The control then showed Stop while the visible room no longer consumed new transcript events; leaving the room made the hidden live room appear to recover, and repeated navigation could leave a phantom running state.
- User impact: Android users could see new speech appear only after returning from the list, repeatedly re-enter a room with no live transcription, or see Stop after the native session had actually stopped. App restart cleared the mismatch because it recreated the React Native and WebView state together.
- Resolution:
  - Pass room visibility into the STT hook and request an authoritative native status snapshot whenever a room becomes visible.
  - Add a room-scoped `native_stt_status_request` bridge command. Android answers it from the native singleton's actual running/server-ready state and session generation, then sends an explicit replay to the requested room.
  - Replace a remounted visible hook's stale session generation from the replay before draining queued transcripts, and defer session-tagged queued messages until that generation is known instead of deleting them.
  - Add an owner lease to distinguish a newly mounted same-room hook from the old hook's cleanup, so stale cleanup cannot release the new visible room's native ownership.
  - Keep a live session owned by another room untouched when a different room requests a status snapshot; that room receives an idle replay rather than inheriting a phantom Stop state.
- Data contract: No Prisma migration or server data change is required. The Android native bundle uses the existing `android/v2.0.1` namespace; iOS behavior and namespace are unchanged.
- Testing notes: Install a newly rebuilt Android native artifact before testing. Start STT, return to the list, speak, re-enter the same room, continue speaking, explicitly Stop, and repeat the cycle. Confirm the visible control matches the native session, queued messages are not lost, and an actually stopped session returns to Start. Device testing was not performed during this change.

## 2026-09-01 — Adopt the visible Android STT session after room re-entry

- Surface: The visible conversation room's STT hook, hidden live-room listeners on the conversation list, the React Native status bridge, and the Android native STT singleton.
- Issue: A room could remain mounted while hidden on the conversation list, then mount or become visible again with a different WebView lease. The hidden and visible hooks could compete for the same native message queue, while the visible hook still treated a cached session ID or a missing `ready` event as authoritative. This made Android show Stop without delivering new transcripts in the room, or show Connecting until a later navigation or app restart repaired the state.
- User impact: After one successful run and a list-to-room transition, new speech could appear only in the list and arrive in the room in a batch on the next navigation. A stopped session could also look active until the app was restarted. The issue was Android-specific in observed testing; iOS uses the same bridge safeguards but does not receive the Android native capture changes.
- Resolution:
  - Make the visible room request a native status snapshot only after its native event listener is installed, so the response cannot be lost during effect setup.
  - Treat a session ID supplied by a WebView request or cached status as provisional until a native status or transcript event confirms it. Do not discard session-tagged queued messages while that identity is provisional.
  - Keep hidden room consumers from draining native transcript events. The visible room can take over the same-conversation owner lease, while a different conversation cannot steal the process-wide native session.
  - Add monotonic Android status event sequence metadata and reject an older status from overwriting a newer session state.
  - Expose Android `running`, `serverReady`, `stopping`, and event sequence data through `getStatus()` and status events. Report `stopping` during graceful teardown and an explicit `idle` after native cleanup, so the WebView can distinguish an in-progress stop from a completed stop.
  - Make the 20-second connecting watchdog probe the authoritative native status once, then force-recover only if the probe does not reconcile the visible room within a short grace period.
- Data contract: No Prisma migration or server data change is required. The session metadata is internal lifecycle information only. The Android build remains on `2.0.1`; because the App Store Connect `2.0.0` pre-release train is closed, the iOS TestFlight build uses `2.0.1` with the matching `ios/v2.0.1` namespace.
- Testing notes: No device test or automated test suite was run during this change by request. Install the newly built Android artifact before validating cold start, permission grant, list navigation, same-room re-entry, repeated start/stop, graceful stop, and app restart. Confirm Start/Stop matches actual capture, room transcripts remain live after re-entry, and queued messages are neither lost nor duplicated.

## 2026-09-01 — Reconcile Android STT status in the visible room

- Surface: The visible conversation room's STT hook and the React Native status snapshot/replay bridge.
- Issue: After a text-message interaction and a room/list transition, the visible room could receive the native status event while a hidden same-room consumer still held a different owner lease. The visible hook then ignored the status even though the event was explicitly scoped to that room. React Native could also accept an older Android status event sequence and replay the stale `connecting` or terminal state back into the room.
- User impact: The conversation list could show active recognition while the room remained on Connecting or Start, and transcripts could appear only after leaving or re-entering the room.
- Resolution:
  - Allow a visible hook to take over same-conversation status ownership when the event carries the matching conversation ID, even if an older same-room lease uses a different owner key.
  - Reject older Android status sequences in the React Native event listener, status polling path, and cached native snapshot. Preserve the latest sequence when synthetic bridge statuses are emitted without sequence metadata.
- Data contract: No Prisma migration, API namespace change, or server change is required. The Android app remains on `2.0.1` with `android/v2.0.1`.
- Testing notes: No device test or automated test suite was run by request. Install a fresh Android artifact and repeat two text messages, start STT, remain in the room through `connecting`, visit the conversation list before and after the state settles, and confirm that the room and list show the same live state and receive transcripts.

## 2026-09-01 — Align Android counterpart bubble metadata with iOS proportions

- Surface: Shared-room counterpart names, language flags, and collapsed/expanded message bubble padding in `ChatBubble`.
- Issue: The speaker-name row was correctly given the same 20px height as the flag hit area, but the label was also increased to `text-base`. Android WebView font metrics made the name look noticeably larger than the iOS presentation. Counterpart bubbles also appeared to have excess top whitespace, especially around the inline language flag.
- Resolution:
  - Keep the speaker-name wrapper at `h-5` with `leading-5` so its layout height remains aligned with the flag control, while reducing the label to `text-sm`.
  - Keep the sender's bubble padding unchanged and reduce only counterpart collapsed and expanded bubble top padding to `pt-0.5`, retaining `pb-1` for the existing bottom rhythm.
- Data contract: No Prisma migration, API namespace change, native app version change, or server change is required.
- Testing notes: Updated the ChatBubble rendering contract, ran the focused 22-test rendering suite, and passed ESLint plus whitespace validation. Device testing was not performed by request; validate the Android WebView presentation against iOS after the web change is deployed.

## 2026-09-01 — Recover Android STT delivery from stale WebView readiness

- Surface: Android cold-start conversation rooms, React Native WebView lifecycle readiness, and native STT status/transcript delivery.
- Issue: Android WebView could leave the React Native `pageReady` flag false after the room was already interactive. The room could send the native Start command, native audio capture and the STT WebSocket could reach `ready`, and transcript messages could arrive, while the outbound bridge still discarded every status event and held transcript messages behind a queue. The visible room therefore remained on Connecting until its 20-second watchdog stopped the otherwise healthy native session. A legacy native listener-count guard added a second delivery-loss window under React Native's bridgeless architecture.
- User impact: Pressing Start immediately after opening the Android app could remain on Connecting and then return to Start without showing recognized speech. Leaving for the conversation list before the timeout could make the background session appear active even though the room itself had not consumed the native events.
- Resolution:
  - Treat any valid WebView-to-React-Native command as authoritative evidence that the current document is interactive, restore `pageReady`, and immediately flush queued native transcript messages.
  - Restore outbound delivery before handling the Start or status-request command so all subsequent native `connecting`, `ready`, and transcript events reach the initiating room.
  - Always emit Android native STT events through `DeviceEventEmitter`; it safely ignores missing JavaScript listeners, while gating on the legacy listener counter can incorrectly discard the only lifecycle event.
- Data contract: No Prisma migration, server change, API namespace change, or iOS behavior change is required. A new Android native build is required because the delivery fix changes the React Native shell and Kotlin module.
- Testing notes: Verify Android cold start followed by an immediate Start tap, remain in the room beyond 20 seconds, speak before and after `ready`, return to the list while recording, re-enter the room, explicitly Stop, and repeat. Confirm Connecting transitions to Stop/ready, transcripts stay visible in the room, and no watchdog-triggered stop occurs while native capture is healthy.

## 2026-08-31 — Make Android native STT start and room re-entry recoverable

- Surface: Android native STT capture, the React Native-to-WebView command bridge, conversation-room switching, and the room microphone buttons.
- Issue: Intermittent Android failures could leave the control in `connecting` until the timeout, silently ignore a start while the previous room was still stopping, or leave a stale process-wide native session after returning to the conversation list. Android WebView compatibility clicks could also be lost when `pointerdown` prevented textarea focus changes.
- User impact: Tapping Start sometimes did nothing, a later tap could repeat the same failed state, and reopening a room could show a non-actionable microphone control even though the native recorder was still running.
- Resolution:
  - Serialize native STT start and stop commands in the React Native bridge so a new room never starts before the previous native stop has completed.
  - Keep the native conversation cache owned by native lifecycle events, recover an `already_running` stale singleton by stopping it before retrying the requested room, and stop the previous room explicitly during room switching and close.
  - Let the microphone cancel an unresolved `connecting` session and use pointer-up activation as a fallback when Android suppresses the compatibility click. Duplicate pointer/click activation is deduplicated.
  - Do not let terminal `stopped`, `closed`, or error status events claim an otherwise unowned room's native STT owner, preventing stale terminal events from blocking later starts.
  - Resolve native stop completion from the terminal bridge status as well as close/error events, while retaining a bounded timeout fallback.
- Data contract: No Prisma migration or API namespace change is required. The mobile app remains `2.0.0` using `ios/v2.0.0` and `android/v2.0.0`.
- Testing notes: Verify repeated Android start/stop taps, start while a prior stop is pending, room switch during `connecting`, close and re-entry with missed status events, stale `already_running` recovery, and both pointer and keyboard activation paths. Confirm iOS behavior remains unchanged.

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
- Testing notes: Added regressions for session-over-tracking precedence, missing-session rejection on current routes, stale-session fail-closed behavior, authenticated history clearing without tracking-session fallback, canonical telemetry updates without `externalUserId` mutation, concurrent native Apple account-link ownership, authenticated feedback/message isolation, and explicit 1.x anonymous compatibility. TypeScript, targeted ESLint, and the complete unit suite pass.

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

## 2026-08-27 — Scope native STT lifecycle to its conversation

- Surface: Android and iOS native STT modules, the React Native-to-WebView bridge, and conversation-room teardown/re-entry.
- Issue: Native status, error, close, and transcript events did not carry the conversation that owned the native session. A WebView remount or a hidden room listener could therefore miss the active session, while a delayed stop from the old room could stop a newly opened room. The React Native status cache also remained `ready` after some close/error paths, so re-entry could restore a stale microphone state.
- User impact: Android could show an apparently inactive Start control while native capture was already running, or show Stop after re-entry without receiving transcripts. Leaving and re-entering the room could make the state change again and make recognition appear broken.
- Resolution:
  - Carry the owning conversation ID through native start/stop options and all native STT lifecycle events on Android and iOS.
  - Ignore stale stop commands when their conversation ID no longer owns the active native session.
  - Cache terminal native status updates so a closed or failed session cannot be restored as live after WebView navigation.
  - Allow a same-conversation start request to reuse an already-running Android native session instead of reporting a misleading duplicate-session failure.
  - Add Android metadata-only logs for server readiness, WebSocket message type, audio chunk delivery, rejected sends, and cleanup; no audio content or transcript text is logged.
  - Stop a native session during conversation close even when the room's React state missed the latest native status, provided the cached owner matches the closing room.
- Data contract: No Prisma migration or API namespace change is required. The mobile app remains `2.0.0` using `ios/v2.0.0` and `android/v2.0.0`.
- Testing notes: Verify first-start `connecting → ready`, Android transcript delivery, rapid stop/start, close/re-entry while connecting and ready, WebView remount, stale stop isolation between rooms, audio-route recovery, and iOS/Android native log continuity.

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
  - Coalesce list and room hydration into one in-flight request plus at most one trailing refresh. Keep the 20-second poll only while the corresponding WebSocket is unavailable instead of polling alongside a healthy socket, do not retry realtime-token setup when push is intentionally unconfigured, and do not start list refresh or realtime transport before authentication resolves.
  - Preserve existing list and transcript store references when hydrated content is structurally unchanged. Also preserve an unchanged leave-notice array and report running usage statistics to the parent at most every five seconds while still reporting message-count and stop changes immediately.
  - Queue finalized STT message payloads in an identity-scoped durable browser outbox before delivery. Reuse the existing `(sessionKey, clientMessageId)` idempotency contract, retry on launch, foreground, network recovery, and a visible 15-second interval, adopt a pre-session tracking-scoped record into the authenticated owner when session identity arrives, and remove a record only after an HTTP success response.
  - Resolve the persisted language-onboarding marker in a pre-paint layout pass and reuse the resolved phase across ordinary component remounts in the same WebView process. Session restoration now leaves the locally rendered list or its compact content spinner visible behind a temporary interaction guard instead of replaying the full-screen wordmark gate.
- Data contract: No Prisma migration, new endpoint, native-code change, mobile version bump, or API namespace change is required. The installed app remains `2.0.0`, with `ios/v2.0.0` and `android/v2.0.0`; the improvements can ship through the remotely loaded web application and its existing 2.0.0 API routes.
- Testing notes: Verify rapid manual-finalization slider drags during a deliberately slow account-preference GET/PATCH, rapid changes across multiple settings, A-to-B room switching while A continues recording, repeated identical WebSocket pushes, socket loss and poll recovery, process/WebView recreation with a cached list, offline finalized speech followed by network restoration, account switching, and first-launch onboarding. Confirm no stale room is visible, local controls never move backward, each finalized message persists once, and server-confirmed cross-device changes still hydrate when there is no newer local edit.

## 2026-08-26 — Show account status in admin conversation review

- Surface: The admin conversation lookup header shared by the conversation list and message detail views.
- Issue: Operators could inspect a user's conversation rooms and stored messages, but could not tell whether the account was currently active, deactivated, pending withdrawal, or already deleted without running a separate database query.
- Resolution: Extend the protected conversation lookup response with the account lifecycle fields and render a compact account-status card in the shared user header. The card shows the current status, handle, client platform/version, API namespace, signup time, last-seen time, deactivation or withdrawal time, and scheduled deletion time when available.
- Status rules: An anonymized/deleted record is shown as `삭제됨`, an account with `withdrawn_at` is shown as `탈퇴 유예 중`, an inactive account without a withdrawal request is shown as `비활성화`, and all other accounts are shown as `활성`.
- Data contract: No migration or API namespace change. The admin-only conversation data response now includes existing account lifecycle and client-version fields.
- Testing notes: Verify the shared status card appears on both the room list and room message views, handles cached-to-fresh data updates, and displays the correct status and relevant dates for active, deactivated, withdrawal-pending, and anonymized records.

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
- Diagnostics: Before applying the protected merge, compare the incoming server timestamp with the existing local timestamp and all committed/live timeline anchors. If the server timestamp would cross another visible utterance, emit `conversation_hydration_order_preserved` through the existing client-event API. The event is stored in `AppEventLog` with the hydration trigger (`mount`, `push`, or `poll`), both timestamps, delta, and crossed message IDs. Diagnostic events are deduplicated client-side and contain no transcript text, so a TestFlight or internal-test build can validate the hypothesis without Metro. The temporary backend console marker was removed after validation to avoid noisy production logs.
- Data contract: No Prisma migration or API namespace change is required. The existing client-event endpoint accepts one additional additive event type.
- Testing notes: Added a regression case where server persistence time would move finalized turn 4 below live turn 5; the merge keeps `4, 5` while still applying server-confirmed content. Added diagnostics coverage confirming the event is stored without creating or notifying another conversation message. Targeted tests, TypeScript, and ESLint pass.

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

## 2026-08-23 Speaker-based message bubble color

### `2026-08-23-speaker-based-message-bubble-color` | UI/UX issue found

1. **Original and translated rows did not share a clear speaker identity color**
   Problem: Expanded mode previously used white for the original row and amber for translation rows, which made language type compete with the more important distinction between the other participant's messages and the viewer's own messages.
   Fix: Both original and translated bubbles now use white for other speakers and a light key-color background for the viewer's own messages. The existing border, radius, shadow, alignment, language flags, and text treatment remain unchanged.
   Data change: None. This is a presentation-only change.
   Verification: Focused ChatBubble tests, TypeScript, ESLint, and `git diff --check` passed. Physical-device verification remains pending.

## 2026-08-23 Expanded message bubble layout regression

### `2026-08-23-expanded-message-bubble-layout-regression` | UI/UX issue found

1. **Opening a message bubble could separate its background from the text on iOS**
   Problem: The expanded original/translation rows used an inline `div` to wrap block-level paragraph content. On the iOS WebView, the bubble border and background collapsed into a narrow strip while the text and controls were displaced to the side.
   Fix: Expanded bubble surfaces now use a shared `inline-block` layout so the border, background, padding, and block text remain one shrink-to-fit bubble. The same class is used for interim rows to keep both states consistent.
   Copy follow-up: The Korean mode option now uses the user-facing label `번역문 펼쳐보기`; the existing `하나의 말풍선으로 표시` label is retained for the combined mode.
   Data change: None. This is a presentation-only fix.
   Verification: Focused ChatBubble and Korean copy tests, TypeScript, ESLint, and `git diff --check` passed. Physical-device verification remains pending.

## 2026-08-23 Conversation language defaults follow room selections

### `2026-08-23-conversation-language-default-sync` | UI/UX issue found

1. **Changing target languages inside a conversation did not update the user's default conversation languages**
   Problem: The room language selector changed only the current conversation, while the same preference remained available from My Page as a separate user-level setting. A later conversation could therefore start with an older language list.
   Fix: The selector's own language list now updates the local default immediately and, after the conversation PATCH succeeds, persists the same ordered list to the authenticated user's existing `default_conversation_languages` field through the profile API. Separate version guards keep rapid changes and unrelated language-setting responses from overwriting the newest choice; failed room/profile writes roll back the optimistic default when it is still current.
   Data change: None. The existing user field, profile PATCH endpoint, and new-conversation payload already support the preference.
   Verification: Focused conversation-list, conversation PATCH, and profile API tests passed; TypeScript validation, targeted ESLint, and `git diff --check` passed. The current worktree was clean-installed as iOS Release build 84 on the paired iPhone 14 through the Vault-backed Cloudflare devbox; manual interaction verification remains pending, and Android is still unavailable through ADB.

## 2026-08-23 Message-bubble display mode

### `2026-08-23-message-bubble-display-mode` | UI/UX issue found

1. **The 2.0.0 conversation bubble combined the original utterance and translations, while some users need the 1.1.4-style separate rows**
   Problem: A single combined bubble is compact, but it makes the original and each translation harder to compare and gives users no per-utterance copy action. Rapid taps near the language controls also benefit from a stable, explicit layout.
   Fix: Added a persistent user-level bubble display preference with two modes: separate original/translation bubbles and the combined bubble. The preference is exposed below the translation-model selector in the conversation hamburger menu and defaults to separate bubbles. Each message now has a side control stack with copy above an animated chevron; the chevron points down when expanded and right when collapsed. Separate rows also expose their own copy buttons.
   Data change: Added nullable `app_users.demo_bubble_display_mode` with an `expanded` default and account-preferences GET/PATCH support. Existing users and older clients fall back safely to the expanded mode.
   Verification: Focused ChatBubble, account-preferences, and account-preferences route tests passed; targeted ESLint and local Prisma migration deployment passed. Physical-device interaction verification remains pending.

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

## 2026-08-22 conversation creation banner and history stack

### `2026-08-22-conversation-creation-banner-history` | UI/UX issue found

1. **Starting a conversation showed an AdMob banner and could leave the creation screen underneath the new room**
   Problem: The conversation-create choice modal inherited the conversations-list banner zone, and creating a group room or opening a direct room from a public profile pushed the room above the creation/profile route. Pressing back could therefore reveal an intermediate creation surface instead of the canonical conversations list.
   Fix: The create-choice modal and invite-friends screen now hide the native banner. Group creation and profile-based direct conversation navigation first replace the current route with the conversations tab root, wait for it to settle, and then push exactly one conversation room entry. Standalone public-profile and native profile-link entry points use the same canonical stack helper.
   Data change: None. This is a native banner visibility and navigation-history fix.
   Verification: Focused banner-zone tests, web TypeScript validation, and targeted ESLint checks passed.

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

## 2026-08-20 Android system back audit across all 2.0.0 surfaces

### `2026-08-20-android-system-back-full-surface-audit` | UI/UX issue found

1. **The Android back behavior is inconsistent across tab-root overlays and nested surfaces**
   Scope: The active Android 2.0.0 native flow has six user-facing URL route files (`conversations`, `connect`, `mypage`, `mypage/follows`, `mypage/share`, and `users/[userId]`) and seven visible screen types when the conversation-room overlay is counted separately from the conversations list. The current implementation contains 20 active `role="dialog"` panel/dialog surfaces. Additional non-dialog transient surfaces are the conversation search overlay, the conversation-row action popover, the text-size dropdown, the translation-model dropdown, and the text composer mode.
   Navigation boundary: The three top-level tabs intentionally carry `nativeTabRoot=1`, so Android WebView history reports no back target at a tab root. A local React state panel must therefore register a native back handler and separately advertise an Android back capability; browser `pushState` alone is not sufficient.
   Confirmed working surfaces: My Page settings, its seven management pages, account-action confirmation dialogs, profile editing, and the My Page image preview use the Android capability signal and native back-handler stack added in `2b29af15`. The active conversation's room menu (root plus feedback, conversation management, participants, and display-language pages), language selector, text-size dropdown, translation-model dropdown, rename dialog, delete-conversation dialog, and normal room-to-list close path already have native handlers. Follow list and profile share return to the previous route when entered through their normal in-app history path; the native QR scanner closes first through the React Native shell.
   Known failing or incomplete surfaces: Conversation-list search, notifications, conversation/notification profile overlays, row-action popovers, list rename/delete dialogs, and the mandatory language-onboarding modal do not advertise Android back capability at the tab root. The logged-out authentication gate and its privacy/terms and email sheets have the same gap. In a public profile route, report and image-preview modals have no native handler, so Android history can leave the entire profile instead of closing only the top modal. In the conversation room, the delete-account dialog and text composer are not in the room back handler; depending on history availability, Android can close the room or finish the activity instead of closing only that surface.
   Expected root behavior: Pressing Android back on an unobstructed top-level Chats, Explore, or My Page tab exits the app because there is intentionally no prior in-tab screen at that navigation boundary. This is distinct from the failing behavior where a visible overlay is present.
   Product direction: Preserve the tab-root boundary and iOS behavior. Extend the existing Android-only capability signal and native back-handler stack to the remaining local overlays, with one back press closing exactly the topmost visible surface before any route history or activity exit is considered.
   Data change: None. This is an Android navigation and UI consistency audit.
   Verification: Source-level route/state inventory and handler-path audit completed. The connected Android device is currently logged out after the release reinstall, so signed-in interaction checks for every listed surface remain pending.

### `2026-08-20-android-system-back-installed-build-follow-up` | UI/UX issue found

1. **The installed Android build still exited from surfaces previously classified as handled**
   User report: The current installed build appeared to finish the app from My Page settings, profile editing, profile image preview, settings subpages and account dialogs, room menu/language/room-management controls, ordinary room-to-list back, follow list, and profile share. This invalidated the earlier source-only classification; all listed surfaces must be treated as failing until a signed-in physical-device pass confirms otherwise.
   Remediation: Added a shared Android back capability poster that preserves the existing iOS history signal. ConversationList now advertises the active room and its local overlays, handles row-action/list dialogs, and keeps the topmost list surface in the native back stack. Public profiles, follow lists, and profile sharing now register their existing animated back actions directly. Public-profile report/image-preview states close before the profile. The room handler now closes account deletion and text-composer surfaces. Authentication sheets and language-onboarding steps also register local handlers. The My Page handler now uses the same shared poster.
   Data change: None. This is an Android navigation and UI consistency fix.
   Verification: Web and React Native TypeScript checks, focused RN contract/external-navigation tests, and the web navigation contract suite passed. No Android device is currently connected to this workstation, so the rebuilt APK still needs signed-in physical-device verification.

## 2026-08-20 Android system back exits from tab-root panels

### `2026-08-20-android-system-back-navigation` | UI/UX issue found

1. **Android system back should match the visible in-page back action**
   Problem: The React Native back listener dispatches the WebView back bridge only when `canWebViewGoBack` is true or a native menu overlay is open. The tab bar marks top-level tab URLs with `nativeTabRoot=1` and reports `canGoBack: false`, while My page settings and feedback panels are local React state and do not register a native back handler. Android therefore receives `false` and finishes the activity instead of closing the visible panel with its upper-left back button.
   Fix: Kept the tab-root history boundary and existing iOS `canGoBack` state unchanged. Android now receives a separate panel-back capability signal, and My page panels register handlers that close the active panel first. Hardware back remains available to exit only at the top-level tab root.
   Data change: None. This is an Android navigation and UI consistency issue.
   Verification: TypeScript checks, focused native runtime contract tests, and an Android 2.0.0 release build/install passed. The connected device remains logged out of Mingle, so the panel interaction still needs a signed-in manual check.

## 2026-08-20 Android Instagram feedback link fallback regression

### `2026-08-20-android-instagram-feedback-external-navigation` | UI/UX issue found

1. **The Instagram feedback action could replace the 2.0.0 WebView with the legacy web app on Android**
   Problem: The feedback link opened inside the Android WebView. When Instagram was not installed, or when Instagram's logged-out web flow emitted an Android `intent://` navigation, the WebView load error activated the generic legacy-host fallback. Users then saw the old `mingle-app-xi.vercel.app` UI even though the installed native app was version 2.0.0.
   Fix: Instagram web and Android intent URLs are now handed to native linking, and WebView fallback activation is limited to failures during the initial Mingle host load. External app/browser failures no longer replace the active Mingle WebView with the legacy host.
   Data change: None. This is a native external-navigation and WebView recovery fix.
   Verification: Reproduced on Android 2.0.0 build 82 without Instagram installed; the post-fix release build was installed on the same device, and the Instagram web/intent handling is covered by focused tests and TypeScript validation. The device remained logged out of Mingle after reinstall, so the complete feedback tap could not be repeated without signing in.

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

## 2026-08-17 Shared English US/UK flag in language selectors

### `2026-08-17-english-us-uk-language-flag` | UI/UX issue found

1. **English was represented by a single US flag even though Soniox exposes English as one `en` language**
   Problem: The four language selection surfaces used a single US emoji for English, while the product does not distinguish US and UK English in its language data. Unicode also has no combined US/UK flag emoji.
   Fix: Added a shared `LanguageFlag` component that renders the existing US and UK flag emojis as a diagonal half-and-half mark only for English. All other language codes continue to use their existing emoji flags unchanged. The component is used by the conversation language selector, primary-language picker, default conversation-language picker, and app-language selector.
   Data change: None. This is a presentation-only change.
   Status: Implemented in-thread on 2026-08-17. Physical-device verification is pending.

### `2026-08-17-english-us-uk-conversation-display` | UI/UX issue found

1. **The English flag reverted to the US-only emoji after leaving the language selector**
   Problem: The conversation room's message language buttons, room header, default display-language menu, and preview rows still rendered the legacy string flag helper directly. English therefore appeared as only the US flag even though the selectors used the combined mark.
   Fix: Conversation-room display paths now use the shared `LanguageFlag` component, including the current and legacy room implementations. English keeps the diagonal US/UK emoji treatment, while all other language flags remain unchanged.
   Status: Implemented in-thread on 2026-08-17. Physical-device verification is pending.

### `2026-08-17-english-us-uk-all-language-surfaces` | UI/UX issue found

1. **Some language indicators outside the conversation room still showed only the US flag for English**
   Problem: Conversation-list rows, profile language stacks, usage breakdowns, and public profile image previews still rendered the old string flag helper or stored rendered flag strings. English therefore appeared inconsistently across the app.
   Fix: Language indicators now keep language codes until render time and use the shared `LanguageFlag` component across those surfaces. Nationality-only flags remain unchanged because they represent a country, not the English language.
   Status: Implemented in-thread on 2026-08-17. Physical-device verification is pending.

### `2026-08-17-notification-newest-first-order` | UI/UX issue found

1. **The notification drawer could show older read notifications above newer ones**
   Problem: The notifications API sorted by `readAt` before `createdAt`. Once notifications had been marked read at different times, an older read timestamp took precedence and made newer follow notifications appear lower in the first-tab notification drawer.
   Fix: Notifications are now fetched in descending creation time. The existing unread/read sections remain in place, while each section preserves newest-first order.
   Data change: None. This is an ordering-only API and presentation fix.
   Status: Implemented in-thread on 2026-08-17. Physical-device verification is pending.

### `2026-08-17-notification-profile-hide-admob` | UI/UX issue found

1. **The native AdMob banner remained visible behind a profile opened from a notification**
   Problem: Tapping a notification actor opened the public profile as a stacked surface above the notification drawer, but the native banner zone still treated the underlying conversations list as active. The profile therefore inherited a banner that should not compete with the profile details.
   Fix: Entering a notification profile posts the native `hidden` banner zone. Closing the profile through its header, edge/native back, or browser history restores the conversations-list `list` zone while keeping the notification drawer underneath.
   Data change: None. This is a native banner visibility and overlay-state fix.
   Status: Implemented in-thread on 2026-08-17. Physical-device verification is pending.

### `2026-08-17-conversation-target-language-selector-copy` | UI/UX issue found

1. **The target-language selector header used a long sentence that could be clipped in narrower locales**
   Problem: The Korean header asked “어떤 언어들로 번역해드릴까요?” and the corresponding localized sentences were long enough to be truncated in the compact top bar. The explanatory meaning also competed with the page title.
   Fix: Replaced the top-bar title with the concise localized equivalent of “번역 언어 선택” / “Select Target Languages”. Added a smaller explanatory sentence at the top of the scrollable content explaining that multiple selected languages are translated simultaneously. All supported room-management locales now have the same description field.
   Data change: None. This is a copy and layout-only change.
   Status: Implemented in-thread on 2026-08-17. Physical-device verification is pending.

### `2026-08-17-empty-conversation-start-guidance` | UI/UX issue found

1. **The empty conversation screen showed supported flags but did not clearly connect language recognition to the Start action**
   Problem: The empty room could say that any language was supported, but the carousel did not move automatically, the flags had no visible language names, and the screen did not guide the user toward the Start button.
   Fix: The 60-language carousel now auto-scrolls slowly in a seamless loop, pauses during touch, pointer, wheel, or keyboard interaction, and resumes after a short delay. Each flag has a localized language name beneath it. The main instruction now tells the user to press Start before speaking, and the existing stretched gray SVG arrow design connects the carousel to the bottom voice control. The existing white visual treatment and absence of carousel position indicators are preserved.
   Data change: None. This is a presentation-only change.
   Status: Implemented in-thread on 2026-08-17. Physical-device verification is pending.

## 2026-08-16 - Admin Dashboard Daily Metric Loading Delay

- Surface: `mingle-app/src/app/admin/dashboard/page.tsx`, `mingle-app/src/lib/admin-dashboard-query.ts`, `mingle-app/prisma/schema.prisma`
- Issue: Every dashboard request recomputed signup count, DAU, message count, usage seconds, and four latency series with six aggregate queries over the production tables. Switching between the 7-day, 30-day, and 90-day ranges repeated the same historical work and left the administrator waiting on the loading state.
- User impact: The service dashboard felt slow and made repeated date-range inspection impractical, even though the historical daily values did not change during normal use.
- Resolution: Added the `admin_dashboard_daily_metrics` daily snapshot table, persisted all calculated values for historical dates on first request, and served subsequent range changes from a primary-key date lookup. The current UTC day is refreshed on each request so live admin numbers remain current; completed dates remain stable snapshots. The existing chart, cumulative view, table layout, and loading copy were preserved.
- Tests: Added cache-hit, missing-history population, and current-day refresh coverage in `admin-dashboard-query.test.ts`; the targeted dashboard metric test suite passes.

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

## 2026-08-16 Unified conversation message bubbles

### `2026-08-16-unified-message-bubble-language-badges` | UI/UX issue found

1. **Original speech and translated outputs were rendered as separate stacked bubbles**
   Problem: Each utterance used one bubble for the spoken text and separate amber bubbles for every output language. This made one message look like several unrelated messages and increased the vertical space needed to read a turn.
   Fix: Each utterance now uses one white message bubble that displays one language at a time. The circular language buttons are appended directly before the displayed text without a separate row and are rendered at a compact 30px size with a small gap between buttons; selecting one switches the same bubble between the original text and the corresponding translation. The default display language comes from the signed-in user's profile primary language when that language is available, with the source language as the fallback. Only the original-language button carries a 12px white badge containing the provided black closing-quote image. The message copy button now copies only the currently displayed language, and its confirmation toast uses a black background with white text for contrast. Existing copy-all and selected-language pronunciation actions remain available.
   Status: Implemented in-thread on 2026-08-16. Physical-device verification is pending.

## 2026-08-16 Conversation language selector ordering

### `2026-08-16-conversation-language-featured-order` | UI/UX issue found

1. **The in-room language selector showed the full catalog without the same featured-language grouping as My Page profile editing**
   Problem: The My Page primary-language picker already surfaced seven featured languages first—English, Spanish, Korean, Japanese, Simplified Chinese, French, and Portuguese—while the conversation room selector showed one sorted list. This made the same language choice feel inconsistent and made common languages slower to reach.
   Fix: The room selector now uses the shared featured-language order, renders a `Popular languages`/`주요 언어` section first, and renders the complete locale-sorted or alphabetical catalog below it. Search filters both sections while preserving the fixed featured order. The section labels are resolved by the same helper used by My Page so the two surfaces remain aligned.
   Status: Implemented in-thread on 2026-08-16. Physical-device verification is pending.

## 2026-08-16 Profile QR Sharing and App Links

### `2026-08-16-profile-qr-app-link-flow` | UI/UX issues found

1. **Profile sharing still opened a placeholder route instead of a stable public profile link**
   Problem: The profile share surface generated a locale-specific My Page URL and its QR action was only a placeholder. A shared code could not reliably identify the intended profile after a handle change, and the browser route could render the profile instead of guiding an uninstalled user to the app.
   Fix: QR codes are generated on demand from the immutable profile user ID and an HTTPS `/p/{userId}` link. The QR image can be downloaded, the stable link can be copied or shared, and the browser route validates the ID without fetching or rendering profile content before offering the Mingle app links.

2. **There was no native scanner path for QR profile links inside the WebView app**
   Problem: A WebView-only camera scanner would make camera permissions and scan behavior inconsistent across iOS and Android. Invalid codes also had no product-level error boundary.
   Fix: The React Native shell now requests camera permission, presents a framed Camera Kit scanner, accepts only Mingle HTTPS or `mingle://profile/` links, and sends valid results back to the WebView for public-profile navigation. Invalid, cancelled, and unavailable-camera states have explicit feedback and settings fallback.

3. **Opening a shared HTTPS profile link did not have an app-link handoff**
   Problem: The native shell only handled the existing authentication callback scheme, so a shared profile URL could not reach the correct profile when the app was already running or cold-started.
   Fix: iOS Universal Links and Android App Links metadata were added, including the AASA and `assetlinks.json` endpoints. React Native handles both initial and subsequent URLs, queues the target until the WebView is ready, and then navigates to the localized public profile route. The first release intentionally uses link re-open or QR re-scan after installation instead of deferred deep-link persistence.

   Status: Implemented in-thread on 2026-08-16. iOS simulator and Android debug builds passed; production Android App Links remain inactive until the Google Play app-signing SHA-256 fingerprint is configured.

### `2026-08-16-profile-link-webview-routing` | UI/UX issue found

1. **Opening a shared profile link launched Mingle but did not reliably open the target profile**
   Problem: A profile link could reach the native shell while the WebView was still loading, or could be opened from a link inside the WebView without being routed through the profile handler. The resulting app launch left the user on the screen that was already open. The profile destination also omitted the active 2.0.0 API namespace and native WebView flags.
   Fix: Profile targets are now queued until the WebView is ready, intercepted for both external app links and in-WebView profile links, and opened with a history-preserving navigation to the localized public profile route. The destination carries the platform API namespace and native runtime flags so the target page uses the same 2.0.0 session as the rest of the app. Back/edge-swipe navigation can therefore return to the page that was open before the shared profile.
   Status: Implemented in-thread on 2026-08-16. Physical-device verification is pending.

### `2026-08-16-public-profile-layout-parity` | UI/UX issue found

1. **Public profiles used a different layout from My Page**
   Problem: Opening another user's profile showed a centered card with vertically stacked counts, while My Page used the compact avatar-and-stats layout with the name, handle, bio, and actions beneath it. The difference made the same profile information feel like two separate product surfaces.
   Fix: The public profile now follows the My Page layout and spacing, keeps the profile image preview and language display behavior, removes the edit action for other users, and uses the same action row for follow and profile sharing. Block and report remain available as secondary actions. Profile sharing now accepts the selected public user ID so a shared profile's QR/link represents that user rather than the signed-in account.
   Status: Implemented in-thread on 2026-08-16. Physical-device verification is pending.

### `2026-08-16-repeated-profile-link-open` | UI/UX issue found

1. **Opening the same shared profile link a second time could bring Mingle to the foreground without changing the WebView profile**
   Problem: The browser fallback always launched the identical `mingle://profile/{userId}` URL, while a warm native app depended on a single URL event and then navigated to a destination with the same route URL. Repeating the action could therefore be treated as a duplicate launch or appear to be a no-op when the same profile was already visible.
   Fix: The browser launch control now uses a real anchor default navigation so Chrome preserves the user's click activation. Each click updates the anchor with a fresh nonce while keeping the canonical `mingle://` scheme; the earlier scheme-alternation workaround is no longer used for browser launches. The native shell persists the latest profile URL at the app delegate/activity boundary, retries pending-link consumption briefly after warm activation, accepts a repeated identical URL after the short duplicate-event window, and records masked `[MingleProfileLink]` trace events across browser, native callback, Linking, pending storage, and WebView routing. Native WebView profile destinations still add a fresh navigation nonce while keeping the immutable user ID as the actual profile target.
   Status: Follow-up implementation started in-thread on 2026-08-16 after TestFlight 72 and 73 still reproduced the issue. Physical-device verification is intentionally left to the user on TestFlight 74.

### `2026-08-16-app-store-profile-link-install-branding` | UI/UX issue found

1. **The App Store install button used a generic outline apple instead of the recognizable Apple mark**
   Problem: The button used the Lucide `Apple` outline icon, which did not match the Apple logo users expect when choosing the App Store.
   Fix: The install page now renders a filled Apple mark directly in the button while keeping the existing store link and localized label unchanged.
   Status: Implemented in-thread on 2026-08-16. Physical-device/browser verification is pending.

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

## 2026-08-13 - My Page Safety History Empty and Auth States

- Surface: My Page hamburger menu safety management panel.
- Issue: The panel requested block and report history with `Promise.all`, so an unauthenticated 401 response from either endpoint replaced both sections with the generic `관리 내역을 불러오지 못했습니다.` message. This was especially confusing because My Page remains visible while the translator auth gate is disabled.
- User impact: Users could not distinguish an empty history from a request failure, and one failed collection prevented the other collection from being displayed.
- Resolution: Load block and report history independently. The panel now always renders both management sections, shows an explicit sign-in state when the account session is unavailable, keeps an empty state for authenticated users with no records, and limits the generic error state to the collection that actually failed.

## 2026-08-13 - Profile Edit Swipe Snap Behavior

- Surface: `mingle-app/src/components/my-page.tsx` profile edit panel.
- Issue: A short rightward swipe could leave the profile edit panel resting at an intermediate horizontal offset instead of returning to its fully open position or closing completely.
- User impact: The panel looked partially dismissed and required an extra gesture, making the back interaction feel unreliable.
- Resolution: Added explicit drag-settle behavior. Swipes below the distance and velocity thresholds animate back to `x: 0`, while qualifying swipes run the full exit animation before closing. The animation controls are guarded by the panel lifecycle to avoid starting animations after unmount.

## 2026-08-08 Native STT continuity across the My Page tab

### `2026-08-08-native-stt-mypage-event-loss` | UI/UX issue found

1. **Native STT appeared to stop when switching to My Page, although the native session was still running**
   Problem: When a user started STT in a conversation, switched to My Page, and returned to the conversations tab, the list could still display the running state. However, speech captured while My Page was open was not reflected in the conversation. Opening the room again appeared to turn STT on, and recognition resumed only from that point. Leaving the room directly for the conversations list did not reproduce the same loss.
   Root cause: The native STT session is owned by the React Native shell, but transcript event handling lived inside the room-only `useRealtimeSTT` hook. A top-level tab switch unmounted the conversation page and its native event listener without stopping the native microphone/WebSocket session. React Native continued injecting transcript events into the WebView, but no listener consumed them. The cached native status therefore remained `running` while partial and final transcript events were discarded.
   Fix: Native STT message events now carry the originating conversation ID and a queue ID. The WebView keeps a bounded in-memory queue of events that arrive while the room listener is absent, and React Native also retains messages briefly while the WebView itself is loading. When the conversations tab returns, it mounts the live room as a non-visible STT consumer instead of reopening the room UI; that consumer drains only its own queued events after storage hydration and keeps updating the list preview. Opening the room later promotes the same consumer to the visible room without restarting native STT.
   Regression coverage: Added unit coverage for message validation, conversation-scoped queue splitting, and delivered-event removal. Web lint and RN type-check pass. The Vault-backed devbox Release build was clean-installed on the connected iPhone, and the user confirmed that STT continues recognizing speech after switching through My Page and back to the conversations list without stopping or restarting when the room is opened.
   Status: Resolved in-thread on 2026-08-08. The native queue/bridge fix is included in the installed app; the list-side live STT consumer fix is served by the connected devbox WebView.

## 2026-08-08 Top-level tab navigation boundary while native STT is live

### `2026-08-08-native-stt-tab-root-boundary` | UI/UX issue found

1. **Switching from the conversation list to My Page and swiping back could reopen the live STT room instead of returning to the list**
   Problem: While native STT was running, the user could leave the conversation list for My Page and then use the iOS back gesture. The stale WebView history pointed back to the active conversation room, so returning to the conversations tab could reopen that room and appear to stop/restart the running STT session. This made a top-level tab change behave like an in-tab room navigation.
   Product decision: Conversations and My Page are top-level navigation roots. Switching tabs starts a fresh navigation boundary for the selected tab. The conversations tab always opens on the list after a tab switch; a room is entered only after the user explicitly taps a conversation. Native STT remains owned by the native shell and must continue without being stopped or restarted by the tab change.
   Fix: Tab links now use `replace` and add a `nativeTabRoot=1` marker while preserving only the native runtime parameters. The native bridge reports no back/forward gesture target while that marker is active, and the iOS WebView gesture gate rejects the stale cross-tab stack. The conversation list consumes the explicit tab-root/skip-restore marker without restoring the live room. When the user explicitly taps a room, the current tab-root list entry is converted back into an ordinary in-tab entry before the room is pushed, so room → list → room forward navigation remains available. The native shell also starts directly at `/conversations` instead of first loading the locale redirect, and clears its persisted room-restore hint whenever the WebView reaches a non-room route.
   Regression coverage: Added tab-root URL and native WebView gesture-gating tests, plus RN navigation-layout coverage. Physical-device verification is pending after rebuilding and reinstalling the devbox iOS app.
   Status: Implemented in-thread on 2026-08-08; the latest Release build was installed on the connected iPhone, with the final physical interaction check pending.

## 2026-08-08 Tab-root reset forward-navigation regression

### `2026-08-08-tab-root-reset-forward-navigation` | UI/UX issue found

1. **A normal room back gesture could return to the list but no longer allow a forward gesture**
   Problem: After the tab-root reset was introduced, opening a room from the conversations tab and swiping back to the list left forward navigation disabled. The user expected the ordinary in-tab sequence `room → list → room` to remain reversible; only an explicit top-level tab switch should discard the older cross-tab stack.
   Root cause: The initial implementation removed `nativeTabRoot=1` from the newly pushed room URL, but the preceding list history entry still carried the marker. When the room was popped, the native navigation bridge and iOS WebView gesture gate saw the marker on the list and treated the normal in-tab destination as a fresh tab root, hiding the forward target.
   Fix: On an explicit room open (`syncHistory: "push"`), the current tab-root list entry is first converted to an ordinary list entry with `replaceState`; the room is then pushed on top of it. A later room back therefore returns to an unmarked list entry, preserving forward navigation. Tab buttons still use `router.replace` and create the marked root, so only an actual tab switch resets navigation.
   Regression coverage: Focused web/RN tests pass, and the fix was committed as `caa7365c`. The connected iPhone was clean-installed with the Vault-backed devbox Release build; final manual confirmation of room → list → room and tab-switch behavior is pending.
   Status: Fix implemented in-thread on 2026-08-08.

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

## 2026-08-07 iOS room/list repeated back-forward regression follow-up

### `2026-08-07-ios-room-list-history-stale-popstate` | UI/UX issues found

1. **The first history fix could still leave a list screen in the forward stack after repeated edge swipes**
   Problem: After opening a room, swiping back, and swiping forward, the room could appear briefly and then snap back to the conversation list after roughly three seconds. From that list, another back swipe moved to the same list again, and a forward swipe restored the list instead of the room. The same failure family can appear when repeatedly navigating through room subpages such as the hamburger drawer, conversation management, or feedback.
   Root cause: The earlier mitigation separated the native-STT close guard from the popstate restore path, but still treated the delayed `popstate` event's route (or the transient URL) as authoritative. iOS can replay a stale list event from the previous back gesture after the WebView has already committed the forward room entry. The delayed event then closed the restored room, and the cleanup path could rewrite the current room history entry into another list entry. The native iOS restore-history seed also discarded the route metadata, leaving seeded entries without enough information to reject the stale event.
   Fix: Every conversation-list history entry now carries an explicit list-or-room route marker while preserving the native navigation index and other WebView state. Popstate handling resolves the current committed history entry before falling back to the event state or URL, so a delayed older list event cannot close the current room. List URL cleanup removes the legacy plain `conversationId` field, preventing a list entry from being mistaken for a room. The native iOS restore-history seed preserves the same markers, and the QA reset path now creates a clean marked list entry.
   Regression coverage: Unit, UI-contract, script, web production-build, and RN test suites pass. The physical iPhone edge-swipe scenario still needs manual confirmation because the connected iOS 26 WebDriverAgent cannot currently expose a usable WebView automation context.
   Status: Fix implemented in-thread on 2026-08-07; pending physical-device confirmation.

## 2026-08-07 iOS room/list repeated back-forward regression

### `2026-08-07-ios-room-list-history-regression` | UI/UX issues found

1. **Repeated iOS back/forward swipes could settle on the list while native history still pointed at a room**
   Problem: After opening a room, swiping back, and swiping forward, the WebView could remain unresponsive during the native transition and then show the conversation list again. A later back swipe appeared to slide the list over the same list, and a subsequent forward swipe restored the list instead of the room. The same history family had previously affected the room hamburger menu and its feedback/conversation-management subpages.
   Root cause: The conversation overlay close path marked every closed room with the native-STT restore suppression flag. When a legitimate forward `popstate` returned to that room, the route-sync and popstate-open paths treated it as an unwanted automatic restore and removed the `conversation` query with `replaceState`. That preserved the native stamped history index while changing the visible route to the list. The iOS native snapshot, delayed `popstate`, React overlay state, and URL then described different screens.
   Fix: Track the latest room/list target produced by an actual `popstate` separately from the native-STT suppression flag. History-forward restoration now consumes the close guard and reopens the room without rewriting the room history entry. App-driven back closes also keep route-sync from rewriting the current room entry before `history.back()` commits.
   Regression coverage: The iOS forward-swipe QA case now asserts the restored `activeConversationId`, not only the shared `/conversations` pathname.
   Status: Initial mitigation implemented in-thread on 2026-08-07; superseded by the stale-popstate follow-up above.

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

## 2026-05-08 STT 실행 중 뒤로가기 → 대화방 재진입 루프

### `2026-05-08-stt-back-reentry-loop` | UI/UX issues found

1. **STT 실행 중 뒤로가기 시 "대화방을 열지 못했습니다" alert와 함께 대화방이 자동으로 재오픈됨**
   Problem: native STT가 실행 중인 상태에서 뒤로가기(또는 iOS edge swipe back)를 하면 세 가지 결함이 연쇄적으로 발생했다.
   (1) `handleConversationRunningChange`의 status PATCH (active) `.catch` 블록이 native STT와 무관하게 `liveConversationId`를 null로 지우고 `window.alert(copy.openErrorMessage)`("대화방을 열지 못했습니다")를 띄웠다.
   (2) `liveConversationId=null + activeConversation=null`이 되면서 native STT restore effect(`isNativeSttStatusLive`)가 조건을 충족하고 방을 다시 `setActiveConversation`했다.
   (3) 재진입 때마다 `activeConversation pushState effect`가 또 `pushState`를 쌓아 `?conversation=abc` 항목이 history에 반복 적재됐다. 이후 popstate-open handler가 이 entry를 보고 또 방을 열어 루프가 반복됐다.
   Fix:
   - native runtime에서 status PATCH 실패 시 `liveConversationId`를 지우지 않고 alert도 띄우지 않으며 diagnostics log만 남긴다("native STT 실제 상태가 PATCH 응답보다 우선" 원칙).
   - `suppressNativeSttRestoreConversationIdRef`(conversationId 단위)를 추가. `closeConversationOverlay` 호출 시 세팅되어 native STT restore, route-sync open, popstate-open이 해당 방을 재오픈하지 않는다. suppress된 방의 URL이 들어오면 open 없이 URL만 정리(`replaceConversationOverlayUrl(null)`)한다. `openConversationSummary`에 `clearManualCloseSuppression` 옵션을 추가해 사용자가 목록에서 같은 방을 직접 탭할 때 suppress를 해제한다.
   - effect 기반 `activeConversation pushState`를 제거하고 `openConversationSummary`에 `syncHistory: "push" | "replace" | "none"` 옵션을 추가. restore/popstate-open 경로는 `none`, 사용자 클릭/새 방 생성은 `push`, QA 자동화는 `replace`를 사용해 history 중복 적재를 방지한다.
   Status: Fixed in-thread on 2026-05-08. 수정 파일: `src/components/conversation-list.tsx`.

2. **뒤로가기를 반복해도 대화목록으로 돌아가지 못하고 대화방이 또 나오는 증상**
   Problem: 위 루프(이슈 1)로 인해 `?conversation=abc`가 history에 여러 번 쌓여 popstate back이 대화방 항목으로 계속 돌아갔다. 사용자가 "갑자기 검정화면"이 뜨는 증상도 이 rapid remount/reload 사이클이 원인이었다.
   Fix: 이슈 1의 history 중복 적재 방지 및 suppress 플래그로 함께 해결됨.
   Status: Fixed in-thread on 2026-05-08.

## 2026-05-07 - Conversation List URL Store Desync And Auto-Reentry Loop

- Surface: `mingle-app/src/components/conversation-list.tsx`
- Issue: On the chat-scroll-performance branch devbox build, exiting a running room produced a `대화방을 열지 못했습니다` toast, the OK dismiss briefly returned to the list, then the room re-mounted with STT auto-restarting. Pressing back again repeated the loop. New conversations also showed a `대화방을 열지 못했습니다` toast on first STT activation even though the room opened correctly. Root cause: `subscribeToLocationSearch` (the `useSyncExternalStore` source backing `routeConversationId`) only listened to `popstate` and `hashchange`. Programmatic history mutations via `replaceConversationOverlayUrl` (close path) and the `setActiveConversation` → `pushState` effect (open path) silently changed the URL without notifying subscribers. After a close, `activeConversation` flipped to `null` while `routeConversationId` stayed at the old value for a render or two, so the route-sync `useEffect` re-opened the same room and re-armed STT. The same desync caused the create-flow status PATCH to land on a still-propagating record and surface the generic "open failed" toast.
- User impact: Users could not reliably exit a running conversation; pressing back or the in-room close button bounced them back into the room with STT re-running. New conversation creation showed misleading open-failure toasts even though the operation succeeded.
- Resolution:
  - Added a `mingle:conversation-location-sync` custom event. `replaceConversationOverlayUrl` and the `activeConversation` `pushState` effect now dispatch it, and `subscribeToLocationSearch` listens to it alongside `popstate`/`hashchange`. `routeConversationId` now converges to the URL on the same render as the close/open call site, so the route-sync effect no longer re-enters a just-closed room.
  - `updateConversationStatus` now retries transient failures (HTTP 404 or 5xx) once after a 500ms backoff before surfacing the failure to the catch path. This absorbs the read-after-write window where a brand-new conversation’s first status PATCH would otherwise alert the user even though the conversation exists. The retry honors the existing AbortController and preserves the 404+deleting short-circuit.
- Tests: existing `conversation-list.logic.test.ts` race-scenario tests still cover the version-tracker semantics. The location-sync event is exercised end-to-end on iOS devbox; an automated regression test for the `useSyncExternalStore` event subscription is deferred (would require a JSDOM popstate harness) and is captured in the manual QA checklist.

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

## 2026-04-27 Android WebView Timestamp Update Loop

### `2026-04-27-android-chat-timestamp-update-depth` | UI/UX issues found

1. **Android WebView could show the Next.js error overlay while the room was otherwise still usable**
   Problem: `ChatBubbleTimestamp` scheduled its next relative-time refresh from the exact millisecond remainder before the next second/minute/hour boundary. If an utterance `createdAtMs` included a fractional millisecond or landed just before a boundary, `getNextChatBubbleTimestampUpdateDelayMs()` could return a sub-millisecond delay such as `0.25`. Android WebView can effectively run that as an immediate timeout; because the timestamp effect depends on `tick` and increments `tick`, the component could immediately reschedule itself until React showed `Maximum update depth exceeded`. The user-facing symptom was a red Next.js `1 Issue` badge and overlay in the conversation room, even though STT and the transcript UI could still be running underneath.
   Reproduction: Run the Android devbox app against the local/devbox Next server in development mode so the Next.js overlay is visible. Open a conversation containing at least one rendered chat bubble timestamp whose `createdAtMs` is fractional and just short of a relative-time boundary; the minimal logic case is `getNextChatBubbleTimestampUpdateDelayMs(nowMs - 10_999.75, nowMs)`, which returned `0.25` before the fix. In the real device path, that appears as a red `1 Issue` badge; opening it shows the stack at `src/components/LivePhoneDemo/ChatBubbleTimestamp.tsx:34`, where `setTick(current => current + 1)` runs inside the timestamp timeout. The same condition can be verified without a device by adding/running a unit assertion for the fractional-boundary case in `chat-bubble.timestamp.test.ts`.
   Fix: The timestamp scheduler now rounds the next delay up with `Math.ceil()` and clamps relative timestamp refreshes to a minimum of `50ms`, so Android WebView cannot turn a nearly-zero refresh into a synchronous render loop. A regression test covers the fractional-boundary input and expects the clamped delay.
   Status: Fixed in-thread on 2026-04-27 in commit `35ec7cdd`.

## 2026-04-26 - Mobile WebView Swipe-To-Close Removal

- Surface: `mingle-app/src/components/LivePhoneDemo/LivePhoneDemo.tsx`, `mingle-app/src/components/LivePhoneDemo/LivePhoneDemoLegacy.tsx`
- Issue: The conversation root and right-side menu panel had custom left-to-right swipe-to-close handlers inside the mobile WebView, which overlapped with iOS edge-swipe back behavior and could make horizontal touches inside a conversation feel like accidental navigation.
- User impact: Mobile users could unintentionally leave a conversation or close the menu while performing horizontal touch interactions, especially on iOS where the OS already provides an edge back gesture.
- Resolution: Removed the app-level swipe-to-close pointer sessions, drag thresholds, drag state, and swipe-only touch-action overrides while keeping explicit back/close buttons, backdrop tap close behavior, browser/native history handling, and OS back gestures.

## 2026-04-26 - Mingle App Composer Jitter During STT/TTS Playback

- Surface: `mingle-app/src/components/LivePhoneDemo/LivePhoneDemo.tsx`
- Issue: In long conversations, switching to keyboard mode while STT/TTS was active could make the composer subtly flicker and move the caret away from the expected typing position. The risky paths were controlled textarea draft updates re-rendering the full live demo on every keystroke, animated textarea/container height changes, Framer layout measurement on the active bottom bar, and 1px-level `visualViewport` inset jitter feeding bottom padding.
- User impact: Text entry felt unreliable because the input area and caret could visually shift while the user was typing, especially with a large transcript and concurrent playback/recognition updates.
- Resolution: Moved the composer text draft to a ref-backed uncontrolled textarea, kept React state only for send-button availability and actual height changes, removed height transitions from the composer shell/textarea, disabled bottom-bar layout animation while text mode is open, and added a small stability threshold for keyboard viewport inset updates.

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
- Resolution: Added a centered bottom reference button linking to `https://translator.minglelabs.app/landing/`, styled to match the article's restrained button language.

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

## 2026-04-20 Translator Landing Social Route Follow-Up

### `2026-04-20-translator-landing-social-route` | UI/UX issues found

1. **The `/landing/social` variant was not reachable through the translator domain**
   Problem: The social landing configuration still existed in `mingle-landing`, but the version route guard and the translator legal proxy only allowed `normal` and `gaming` under `/landing`. As a result, `/landing/social` and localized social URLs could show a 404 instead of the existing social-focused landing page.
   Fix: Restored `social` as an allowed landing version in the `/landing/[version]/[[...locale]]` entry point, kept the direct version route in sync, and updated the legal proxy rewrite rules so `/landing/social` and `/landing/social/{locale}` forward to `mingle-landing`.
   Status: Fixed in-thread on 2026-04-20.

## 2026-04-20 Translator Landing Locale Follow-Up

### `2026-04-20-translator-landing-15-locales` | UI/UX issues found

1. **Translator landing exposed too few locale choices after the review fix**
   Problem: The first review fix prevented untranslated locale selection by limiting the custom translator landing selector to English and Korean. That avoided broken fallback copy, but it no longer matched the broader 15-language primary UI locale catalog already used by `mingle-landing`, making the landing experience feel incomplete for a multilingual product.
   Fix: The custom static translator landing now exposes the same 15 primary UI locales and includes a complete message dictionary for each visible locale. The `/landing/{locale}` rewrite also accepts those landing locale paths, including Simplified and Traditional Chinese casing variants.
   Status: Fixed in-thread on 2026-04-20.

## 2026-04-18 Android 1.1.1 Internal Test Banner Follow-Up

### `2026-04-18-android-1.1.1-banner-scroll-inset` | UI/UX issues found

1. **Android conversation transcripts did not reserve scroll space for the native banner**
   Problem: The Android 1.1.1 internal-test build could load a test AdMob banner, but the in-room transcript scroll area still ended directly behind the native banner. With the banner at the bottom, the last transcript items could sit under the banner; with the banner at the top, the same contract expected an equivalent top clearance. iOS already behaved correctly, making the Android room feel cramped and partially occluded.
   Fix: The room now converts the effective native banner inset into explicit top/bottom spacer elements inside the transcript scroll content instead of relying only on scroll-container padding. The native runtime detection and cached banner-layout listener were also relaxed so Android WebView bridge timing cannot skip the native layout event. RN now emits conversation top inset when the native banner is in the top slot and gates conversation bottom inset on the same render-ready conditions. Android bottom inset handling also no longer subtracts bottom-bar clearance when RN has already reported the banner's own height.
   Status: Fixed in-thread on 2026-04-18. Focused native UI and RN WebView layout unit tests passed; Android real-device QA passed after rebuilding the devbox app and clearing the stale WebView 502 state.

2. **Android internal-test WebView could reuse the old banner layout without a URL change**
   Problem: After installing Android internal-test build `1.1.1 (52)`, the native shell was updated but the WebView still used the same production URL as build `51`. Android can preserve WebView cache across app updates, and the initial URL did not include the native banner position or client build. If the web runtime missed the first native banner-layout event or reused older cached JS, both the transcript spacer and scroll-to-bottom button stayed at their pre-banner offsets even while the native banner rendered at the bottom.
   Fix: The RN shell now appends `nativeBannerPosition`, the initial matching banner inset, `nativeClientVersion`, and `nativeClientBuild` to the WebView URL. This gives the web runtime an immediate fallback for top/bottom banner clearance and changes the URL on each uploaded build number, forcing Android WebView to re-resolve the current production page instead of silently reusing the previous build's cached route.
   Status: Fixed in-thread on 2026-04-18 for the next Android internal-test build.

3. **Android conversation banner fallback could still be overwritten by stale web layout state**
   Problem: Android internal-test build `1.1.1 (53)` was installed from Google Play, but the bottom native banner still covered the conversation transcript and scroll-to-bottom button. The RN shell correctly added `nativeBannerPosition=bottom` and `nativeBottomInsetPx` to the WebView URL, but the web runtime could cache an earlier list-zone `banner_layout` event with `position: "top"` and `bottomInsetPx: 0`. Because the displayed banner position preferred native layout state before the URL query, and because `nativeBannerLayout?.bottomInsetPx ?? nativeBottomInsetPxFromQuery` treats numeric `0` as a real value, that stale event could override the URL fallback and keep the effective bottom inset at `0`.
   Fix: The web position resolver now prefers the URL-provided native banner position before cached native layout position, so a stale list-zone `top` event cannot override the runtime URL. The conversation layout also only trusts native layout inset values when they are positive and match the active displayed position; otherwise it falls back to the URL-provided top/bottom inset. This preserves the Android bottom spacer and scroll-to-bottom offset even if the conversation-zone banner event is delayed or missed.
   Status: Fixed in-thread on 2026-04-18 for Android internal-test build `1.1.1 (54)` and iOS TestFlight build `1.1.1 (52)`.

4. **Native banner position toggles could desynchronize from the URL fallback**
   Problem: After the Android stale-layout fix, native runtime preferred the URL-provided banner position over persisted web preferences. That protected startup from stale localStorage, but an in-session user tap on the top/bottom banner setting could no longer override `nativeBannerPosition` from the URL. The web spacer math could stay on the URL's bottom setting while RN moved the physical banner to top.
   Fix: The room now tracks an explicit session-level banner-position override. Native runtime resolves position as session override → URL query → persisted preference → layout event, and the RN `native_set_ad_banner_position` command also prefers the session override and URL query before stored fallback values. Startup remains protected from stale storage while current user taps take effect immediately.
   Status: Fixed in-thread on 2026-04-18 before merging the 1.1.1 QA branch.

## 2026-04-18 Admin Feedback Inbox

### `2026-04-18-admin-feedback-inbox` | UI/UX issues found

1. **The admin inbox route would have inherited the mobile WebView canvas and locale redirect**
   Problem: The root layout wraps app pages in the fixed 400px mobile canvas, and the proxy redirects unlocalized paths to locale-prefixed routes. A desktop admin inbox mounted at `/admin` would therefore either redirect away from the requested path or render as a clipped mobile viewport instead of a usable feedback-management surface.
   Fix: `/admin` now bypasses locale redirection in the proxy, and `MobileCanvasShell` renders admin routes without the mobile frame while preserving the existing mobile canvas for the app experience.
   Status: Resolved in-thread.

## 2026-04-17 Android/iOS 1.1.1 Devbox Local QA

### `2026-04-17-devbox-1.1.1-local-qa` | UI/UX issues found

1. **Android native/WebView remount could strand an in-progress conversation on the list**
   Problem: Android real-device QA reloaded the WebView to the conversation list after a native remount while native STT was still running. The list showed an in-progress conversation row, but the live room and QA bridge were unavailable, so the user-facing state looked paused even though native speech state was still active.
   Fix: The native shell now preserves the requested/current WebView URL across debug remounts, the room sends an explicit remount restore URL plus a short-lived restore marker, and the conversation list waits for loaded conversations before consuming that marker. The list also subscribes to native STT status events and performs a one-time active-conversation restore fallback when native status delivery is delayed.
   Status: Resolved on 2026-04-17. Android real-device QA passed 8/8 after restarting devbox and clearing the Android WebView/app data.

2. **iPhone physical-device automation initially stalled at the Appium/XCUITest device layer**
   Problem: The iPhone app was installed and launchable as version `1.1.1`, but the first Appium attempt could not create a usable XCUITest session for the connected physical device. The standard UDID failed with `Unknown device or simulator UDID`, while the CoreDevice identifier moved into a WebDriverAgent `xcodebuild` wait with no progress.
   Fix: Rechecked the device through `xctrace`, `devicectl`, and `idevice_id`, then reran the physical-device suite with the standard UDID once the device state returned to `connected`. The runner now waits for the stamped native history forward state and falls back to the same WebView history-forward path when Appium's synthetic iOS edge-swipe preview does not commit on the physical device.
   Status: Resolved on 2026-04-17. iOS real-device QA passed 9/9 against version `1.1.1`.

3. **The language selector accessibility contract had drifted from the current UI shape**
   Problem: The top-right language control now opens the full language selector surface, but one QA contract still treated it as a dropdown menu and expected `aria-haspopup="menu"`. That made the iOS chrome check fail even though the rendered selector is dialog-like and the visible affordance was intact.
   Fix: The shared chrome contract and mobile QA now expect the selector dialog contract while keeping the same visible chevron, border, and height affordance checks.
   Status: Resolved on 2026-04-17. The iOS real-device chrome case passed in the 9/9 QA run.

4. **Android devbox AdMob could show only the fallback `AD` badge**
   Problem: The Android device build and local version-policy server could inherit production AdMob values from vault during `--device-app-env dev`. The production Android banner unit returned `no-fill` during local QA, so the native fallback surface stayed visible as a lone `AD` badge instead of a real creative.
   Fix: Devbox now forces Google's official sample AdMob app IDs and banner unit IDs for non-production device app envs, and the Next/Metro devbox runtime receives the same sample values after sourcing vault env files. The RN banner also removes the production fallback badge after a no-fill failure instead of leaving `AD` on screen.
   Status: Resolved on 2026-04-17. Android should request the sample banner unit during local devbox verification.

5. **Native STT remount fallback could reopen a stale active room before status arrived**
   Problem: The remount recovery path treated a missing native STT status as a delayed live status and reopened the first active conversation. If RN later reported `idle`, the opened room could bypass the stale-active reconciliation path and keep a non-live room looking active.
   Fix: The list now restores a room only from an explicit remount marker or a live native STT status. A `null` status waits for RN's first status event instead of reopening an active room by inference.
   Status: Fixed in-thread on 2026-04-18 before merging the 1.1.1 QA branch.

## 2026-04-12 iPhone Real-Device QA Follow-Up

### `2026-04-12-iphone-real-device-ui-qa` | UI/UX issues found

1. **The in-room top-banner toggle still fails to move the native iPhone banner out of the bottom slot**
   Problem: During the connected physical iPhone regression pass, the QA bridge could flip the live-demo preference to `top`, but the native banner layout stayed pinned to `bottom` and the real screen still rendered the bottom banner above the orange start control. This reopens the old in-room top-banner placement family around `019d4cae#13`: instead of merely sitting too low below the room header, the iPhone conversation surface can now fail to switch into the top-banner mode at all.
   Attempted fix: The iPhone QA path itself was repaired first so the physical-device runner now reaches the conversations surface through the same QA bridge/bootstrap path as Android, exports the QA bridge runtime flag from native config, and auto-infers WDA signing defaults from `scripts/devbox qa`. That removed the earlier session/bootstrap failures and isolated the remaining failure to the actual banner-position regression.
   Status: Reproduced on 2026-04-12 during the connected iPhone physical-device pass. Not resolved in-thread.

## 2026-04-12 Android Real-Device QA Follow-Up

### `2026-04-12-android-real-device-ui-qa` | UI/UX issues found

1. **Android native/WebView remount can still fall back to the orange idle/play state while native STT is supposed to remain running**
   Problem: On the connected physical Android device, the live-demo WebView still comes back in the idle visual state (`Tap play to start`, orange mic/play control) after a native-driven WebView remount, even when the native QA status injector keeps the underlying STT status pinned to `running`. That matches the old state-split regression where Android could show a stopped/orange button while STT was still effectively active underneath.
   Attempted fix: The Android regression suite now has both contract coverage for the native-to-WebView reconcile rules and a physical-device remount case that only checks the post-remount recovery path. Narrowing the test removed earlier bridge flakiness, but the real-device remount case still reproduces the idle-state fallback.
   Status: Reproduced on 2026-04-12 during the connected Android physical-device pass. Not resolved in-thread.

## 2026-04-11 Real-Device QA Follow-Up

### `2026-04-11-real-device-ui-qa-automation` | UI/UX issues found

1. **The iPhone WebView could load the ngrok root page but still fail to hydrate into the real UI**
   Problem: On a physical iPhone, the RN WebView could open the main `ngrok` URL and expose a `WEBVIEW_*` context, but Next.js client chunks under `/_next/static/...` were still being replaced by `ERR_NGROK_6024` HTML. That left the page title intact while the visible body stayed on the server-rendered loading shell, so the `window.__MINGLE_QA__` bridge never attached and the automated UI regression suite could not assert real UI state.
   Attempted fix: The native app now appends `ngrok-skip-browser-warning=1` to the initial WebView URL and sends the `ngrok-skip-browser-warning: 1` header on the first WebView request so the root page itself stops landing on the ngrok warning interstitial.
   Status: Partially resolved in-thread. The root page now loads as the real app, but subresource requests still do not inherit the bypass header, so full hydration on real-device ngrok remains blocked until the WebView can propagate the header to same-origin asset requests or the tunnel/provider path changes.

2. **Cloudflare removed the tunnel hydration issue, but iOS 26 real-device WebView automation still lost the JavaScript runtime**
   Problem: After switching the physical iPhone build from `ngrok` to the named `cloudflare` tunnel, the WebView finally opened the real `mingle-app-devbox.photo-for-passport.com` page. However, Appium could no longer run `title`, `execute`, or any QA bridge JavaScript inside that `WEBVIEW_*` context because WebKit returned `code=-32601, "'Runtime' domain was not found"`. The page rendered in the accessibility tree, but the automation layer could not evaluate `window.__MINGLE_QA__` or any DOM script, so real-device regression assertions still stalled at session start.
   Attempted fix: The QA runner was traced down to an outdated automation stack (`Appium 2.19.0` with `xcuitest 8.4.3`) that matches the upstream iOS 26 WebKit failure mode. The in-thread remediation is to move the local QA stack to `Appium 3.x` with a current `xcuitest` driver so real-device WebView commands can speak the newer WebKit target/runtime protocol.
   Status: Root cause identified in-thread. Tunnel hydration is resolved on Cloudflare, but real-device iPhone QA remains blocked until the Appium/XCUITest stack is upgraded and revalidated.

## 2026-04-11 Ongoing Dev Validation Notes

- **In-room language selection was too cramped to scan or control across the full language catalog**
  Problem: The room header still opened a tiny tooltip-style selector. Flags were much smaller than the conversation-list avatar reference, there was no search, names only reflected the current UI locale, and users had no way to switch between locale-sorted and alphabetical browsing.
  Fix: The room language selector was promoted to a full-screen overlay with avatar-sized flags, language search, dual-language labels (`localized / English / native` as needed), and a visible sort toggle for user-locale order vs. alphabetical order.
  Status: Resolved in-thread.

- **The full-screen in-room language selector could render invisibly behind the room overlay**
  Problem: The selector itself was portaled to `document.body`, but the active room is also rendered as a full-screen body portal from the conversation list. The selector shipped with a lower stacking order than the room container, and the follow-up `z-[140]` Tailwind utility still resolved to `z-index: auto` at runtime, so tapping the language button updated state but the overlay stayed hidden underneath the room.
  Fix: Raised the language-selector overlay above the room container and pinned the `z-index` with an inline style instead of relying on the missing utility class, so the full-screen selector reliably appears on top in both current and legacy room runtimes.
  Status: Resolved in-thread.

- **The full-screen language selector still behaved like a detached modal instead of a first-class room subpage**
  Problem: Even after the selector became visible, its top controls did not match the app's existing top-tab pattern, the selected-language area had no fast re-toggle strip, and closing it relied on local state only. That meant iOS edge-swipe / browser back could not dismiss it like a real screen, Android/native banner behavior did not mirror the hamburger drawer, and history replay risked a brief reopen flash right after a back gesture.
  Fix: Rebuilt the selector header around the app's standard 56px top chrome and tab-style sort toggles, added a horizontal recent-language flag strip with active/inactive re-selection states, pushed a dedicated selector history entry for real back navigation, and hid the native banner while the selector is open so it behaves like the room drawer instead of a floating modal.
  Status: Resolved in-thread.

- **Opening the full-screen language selector immediately forced the search field and mobile keyboard open**
  Problem: The selector auto-focused the search input on mount with repeated timers. On mobile this meant the keyboard jumped up every time the screen opened, even when the user only wanted to scan or tap recent flags first.
  Fix: Removed the automatic search focus path so the selector opens in a neutral browsing state and only raises the keyboard when the user explicitly taps search.
  Status: Resolved in-thread.

- **The full-screen language selector header still looked like a modal instead of the app's normal top tab**
  Problem: The selector header kept a right-side close affordance and left-aligned title, so it read like a dismissible popup instead of a room subpage. The expected chrome was a left chevron with the `언어 선택` title visually centered.
  Fix: Replaced the close icon with a left chevron back button and centered the selector title within the 56px top bar, keeping the right side as spacing only so the title stays visually centered.
  Status: Resolved in-thread.

- **Deselected recent-language flags did not look inactive enough**
  Problem: In the horizontal recent-language strip, deselected flags only lost some saturation on the emoji itself. The circular chip still read too close to the active state, so users could miss that the language was currently off.
  Fix: Shifted the entire deselected chip into a stronger gray treatment by darkening the chip background and border and lowering the flag opacity further, so the whole circular control reads as clearly inactive.
  Status: Resolved in-thread.

- **Recent-language chips were ordered by raw recency instead of by active state**
  Problem: The horizontal chip strip mixed active and inactive languages together based on the last interaction. That made it harder to scan the currently enabled set, because a recently deselected chip could sit ahead of still-active languages.
  Fix: Reordered the chip strip into two groups: active languages always render first in their original selection order (oldest selected on the left, newest selected on the right), and deselected languages render after them in deselection-recency order (most recently turned off first).
  Status: Resolved in-thread.

- **Changing room languages could trigger a cross-component React update warning**
  Problem: The room runtime notified `ConversationList` about selected-language changes from inside the `setSelectedLanguages` updater function. React can execute that updater while reconciling `LivePhoneDemo`, which produced the warning about updating `ConversationList` while rendering a different component.
  Fix: Kept the local language toggle synchronous, but deferred the parent callback into a follow-up effect that runs after `selectedLanguages` commits. That preserves the same UI behavior without issuing parent state updates from the child render path.
  Status: Resolved in-thread.

- **The search field and sort toggle row regressed into a boxy, cramped treatment**
  Problem: The 60/40 search-and-sort row met the structural requirement, but the controls lost the softer rounded treatment and inner padding from the original design language. The row read too angular, too short, and the Korean alphabetical label surfaced as `EN A-Z`, which felt unnecessarily technical in UI copy.
  Fix: Restored a taller rounded search field, converted the sort control back into a padded pill-style segmented toggle with rounded inner buttons, increased header-body spacing, and simplified the Korean alphabetical label to `A-Z`.
  Status: Resolved in-thread.

- **Language-card secondary labels sat too far below the localized title and read too small**
  Problem: In the language list cards, the gap between the localized language name and the `English / native` secondary label was slightly too loose, and the secondary line read smaller than intended for quick scanning.
  Fix: Tightened the vertical gap between the two lines and increased the secondary-label font size while keeping its weight unchanged.
  Status: Resolved in-thread.

- **Inactive recent-language chips became so gray that the underlying flag was hard to recognize**
  Problem: The first inactive-chip pass pushed the whole circular chip too far into gray, to the point where the flag identity was harder to read than the intended lightweight disabled treatment.
  Fix: Softened the inactive chip back toward the normal surface by using a lighter gray background and border and by dropping the full grayscale filter on the flag, leaving only a gentler opacity reduction similar to other disabled controls in the room UI.
  Status: Resolved in-thread.

- **The language-selector title sat too high instead of sharing the back button's row**
  Problem: The `언어 선택` title was absolutely centered inside a container that also mixed the safe-area inset into the same box. That made the title read like it was pinned toward the ceiling instead of sitting on the same visual baseline as the left chevron button.
  Fix: Split the safe-area inset into its own spacer and rebuilt the header as a normal 56px row, so the title and back button are vertically aligned within the same chrome line.
  Status: Resolved in-thread.

- **The recent-language horizontal strip showed a visible scrollbar under the flags**
  Problem: On mobile especially, horizontally scrolling the recent-language flag strip exposed a long native scrollbar under the chips, which made the compact selector header feel noisier than intended.
  Fix: Reused the app's existing `no-scrollbar` utility on the recent-language strip so horizontal swipe scrolling still works while the visible scrollbar stays hidden.
  Status: Resolved in-thread.

- **The language search and sort controls drifted into oversized pill shapes**
  Problem: After the earlier control pass, the search field and sort toggle became taller than intended, looked like full pills instead of lightly rounded rectangles, and still gave the search side more width than the sort side. The Korean locale-order label was also longer than necessary for the available space.
  Fix: Reduced both controls to a shorter rounded-rectangle treatment, changed the row split from 60/40 to 50/50, matched the inner sort buttons to the same smaller-corner shape, and shortened the Korean/Japanese/Chinese locale-order labels to `가나다`, `あいう`, `拼音`, and `注音`.
  Status: Resolved in-thread.

- **The language-selector back chevron still did not match the room header exactly**
  Problem: Even after the header row alignment was fixed, the selector's back button still used a different hit box, icon size, and hover treatment from the main conversation header chevron, so the mismatch was visible side by side.
  Fix: Reused the same `38px/40px` button box, `24px` chevron icon sizing, and focus/interaction treatment as the room header back button so the selector chrome now matches it exactly.
  Status: Resolved in-thread.

- **The selected-language count disappeared from the language-selector top bar**
  Problem: The header no longer showed the active selection count like `2/5`, so users lost the quick confirmation of how many languages were currently enabled while browsing the selector.
  Fix: Restored the count in the top-right header slot and aligned it to the same row as the back chevron and centered title, keeping the title visually centered while the count remains visible.
  Status: Resolved in-thread.

- **Alphabet-script locales still showed a redundant sort toggle beside search**
  Problem: For locales whose native ordering label was already `A-Z`, the selector still rendered a second `EN A-Z` toggle even though the UI cost outweighed the value for these users, making the search row feel cramped for little gain.
  Fix: When the locale-order label is `A-Z`, the sort toggle is hidden entirely and the search field expands to the full row width. In that state the selector also resets to its default sort mode so a previously chosen alternate mode does not leak into the hidden-toggle layout.
  Status: Resolved in-thread.

- **Selected languages still blended in slightly too much against nearby unselected items**
  Problem: The selected recent-language chips and selected list cards already used amber accents, but the emphasis was still a touch too subtle when scanning quickly. The user specifically wanted the selected state to read a little more clearly without becoming heavy-handed.
  Fix: Strengthened the selected treatment one small step by thickening the recent-chip amber border to `2px`, nudging the amber tone slightly deeper, and giving both the recent chips and selected cards a slightly stronger warm shadow while keeping the overall palette the same.
  Status: Resolved in-thread.

- **Scrolling the language list did not dismiss the focused search field or mobile keyboard**
  Problem: Once the search field was focused, users could start scrolling the language selector without making a selection, but the input stayed focused and the mobile keyboard remained open. That made simple browsing after a search feel cramped.
  Fix: The selector now blurs the search input as soon as a pointer interaction begins outside the search field, so starting a scroll gesture on the recent chips or the language list dismisses the keyboard immediately.
  Status: Resolved in-thread.

- **Touch selection styling and recent-strip visibility were fighting each other in the language selector**
  Problem: The shared selector applied the same neutral hover border to both selected and unselected buttons. On touch WebViews, a sticky `:hover` state could survive a tap and override the selected amber border, which made selected chips/cards look gray even though their other selected styles updated correctly. Separately, the selector was deciding whether a tap meant “select” or “deselect” from the last rendered `selectedLanguages` prop. During quick retoggles, that prop could be one render behind the user's latest tap, so deselecting a just-reselected language could miss re-registering it in the recent list and make the chip appear to disappear. The recent-language strip also intentionally reorders chips between the active-left and inactive-right groups, but it did not preserve visibility for the chip that had just moved, so the toggled flag could appear to “disappear” when it simply jumped outside the current horizontal scroll window.
  Fix: The selector now keeps selected hover styling separate from unselected hover styling so a selected item never reverts to the neutral gray hover border. It also tracks the latest intended selected-language set locally while processing taps, so rapid reselect/deselect sequences use the up-to-date state instead of a stale prop snapshot, and it preserves visibility of the just-toggled recent chip by scrolling the horizontal strip enough to keep that chip in view after each reorder.
  Status: Resolved in-thread.

- **Chinese locale sort labels overstated the actual sort implementation, and sort-toggle visibility depended on copy text**
  Problem: The selector labeled the locale-order option as `拼音` / `注音`, but the actual implementation only used locale-aware string comparison on localized names rather than explicit pinyin/zhuyin sort keys. Separately, the decision to hide the sort toggle for Latin-script locales was keyed off whether the translated label literally equaled `A-Z`, so a copy-only change could silently change layout behavior.
  Fix: Lowered the Chinese locale labels to the more neutral `中文顺序` / `中文順序`, and moved sort-toggle visibility into explicit locale metadata inside the selector logic so UI behavior no longer depends on translated strings.
  Status: Resolved in-thread.

- **Legacy bottom mic could render in the tiny composer size after hydration**
  Problem: On Android `1.0.11` WebView validation, the legacy translator occasionally rendered the default bottom bar with the composer-sized microphone. This was not a simple viewport scale issue; the actual mic shell was collapsing into the `2.3rem` composer layout while the rest of the bar stayed on the default layout.
  Cause: `LivePhoneDemoLegacy.tsx` and the `1.1.0` room runtime both reused the same Framer Motion `layoutId` values for the composer mic shell and the default bottom-bar mic shell. `isComposerOpen` hydrates from persisted input-mode state after first render, so the shared-layout transition could mix the two subtrees during hydration.
  Fix: Removed the shared `layoutId` bridge between the composer/default mic shell and keyboard toggle in both legacy `1.0.11` and `1.1.0` web runtimes. This keeps the hydration swap discrete instead of animating between incompatible layouts.
  Status: Resolved in-thread.

- **Ngrok interstitial can masquerade as a layout regression on mobile WebView**
  Problem: When device builds pointed at a free ngrok tunnel, the RN WebView could render ngrok's anti-abuse warning page instead of the app. On Android this looked like the 1.0.11 microphone/footer UI had suddenly shrunk or changed, even though the app screen was never reached.
  Fix: Native WebView requests now add `ngrok-skip-browser-warning: true` for `*.ngrok-free.dev` and `*.ngrok-free.app` URLs so local mobile validation reaches the actual app surface.
  Status: Resolved in-thread.

- **Android conversation list could get stuck because RN treated total history length as active back availability**
  Problem: The RN WebView bridge reported `canGoBack` from `window.history.length > 1`, which is not the same as “the current entry has a backward target.” After opening a room and returning to the list with `history.back()`, Android hardware back could still be consumed by the WebView even though web history was already at the first entry, leaving the user stuck on the conversation list.
  Fix: The native navigation bridge now stamps a synthetic per-entry history index into `history.state` and derives `canGoBack` from the current index instead of total history length.
  Status: Resolved in-thread.

- **Conversation-list search initially ignored Android OS back and iOS edge-swipe history**
  Problem: The search UI in the conversation list was only a local `showSearch` state with no dedicated history entry. On Android, pressing OS back while search was open could fall through to app exit instead of closing just the search drawer. On iOS, the same search surface had no real edge-swipe back/forward path and risked reproducing the room-menu replay glitches if a multi-depth history stack was copied over too literally.
  Fix: Search now uses a single dedicated history state (`list <-> search`) instead of a local-only flag. Android native back consumes that entry and closes only the search drawer, while iOS popstate synchronization restores or dismisses search instantly to match native history snapshots without reusing the room menu's deeper stack logic.
  Status: Resolved in-thread.

## Scope

- This pass is organized by session ID, not by merged issue theme.
- It covers 277 unique Codex sessions whose `cwd` matched `mingle`, including archived sessions.
- Source split in this rescan: 29 live sessions and 248 archived sessions.
- Sessions with standalone UI/UX issues: 33.
- Total standalone UI/UX issue atoms documented under standalone session headings in this file: 127.
- Additional ongoing validation-note UI/UX atoms documented in this file: 4.
- Total documented UI/UX issue atoms in this file: 131.
- Sessions with UI/UX feature/polish requests only: 15.
- Sessions where a UI/UX issue was only mentioned or handed off: 8.
- Sessions with no UI/UX issue found: 221.
- `019d4cae-5142-7be2-9c74-30f95bfb5787` is listed first, exactly as requested.
- If a session had no UI/UX issue, the entry says only `No UI/UX issue found.`

## Detailed First Thread

### `019d4cae-5142-7be2-9c74-30f95bfb5787` | UI/UX issues found

- Thread focus: Phase 1 multi-conversation rooms on web/API/DB first, followed by a long chain of multi-room UI/UX fixes.
- High-level verdict: this thread absolutely contained many separate UI/UX issues. It should not have been collapsed into one line item.
- Issue atoms currently listed for this thread: 78.

1. **The conversation-list header box was taller than the intended reference**
   Problem: `nativeTopInsetPx` was being added to the header box itself, so the list header looked larger than the older `bottom-tabs` chrome it was supposed to match.
   Attempted fix: The header was reset to a fixed `56px + safe-area` structure and native banner clearance was moved out of the header box.
   Status: Resolved in-thread.

2. **The `Start Conversation!` CTA had an unwanted orange glow**
   Problem: The CTA shadow read like a pale orange haze behind the button, making the bottom bar look washed out.
   Attempted fix: The orange glow shadow was removed and replaced with a neutral shadow while keeping the gradient.
   Status: Resolved in-thread.

3. **The top gap above the list was over-expanded by fallback spacer math**
   Problem: Even after the header size was corrected, the page was still pushed down because a fallback banner estimate and a header-adjacent spacer were both being applied.
   Attempted fix: The explicit native inset was trusted when present, the guessed `50px` fallback was demoted to old cases only, and the header-front spacer was removed. During later QA-automation work, the same symptom briefly reappeared only in the QA branch because failed test runs could leave the QA-only banner-position override persisted in local storage; the harness was then changed to reset QA demo state after every case instead of touching product layout again.
   Status: Resolved in-thread.

4. **Android hardware back initially did not return from a room to the list**
   Problem: The web overlay pushed history, but Android OS back was not bridged into the WebView history, so room navigation did not behave like native back.
   Attempted fix: A native back bridge was added on the RN side so hardware back could drive the same room-close history path.
   Status: Resolved in-thread.

5. **iOS swipe-back was initially unavailable**
   Problem: The WebView had back/forward gestures disabled, so iOS users could not use the normal left-edge history gesture.
   Attempted fix: `allowsBackForwardNavigationGestures` was enabled for the iOS path during the 1.1.0 RN work.
   Status: Resolved in-thread.

6. **The bottom launch area was still a button inside a footer instead of a full CTA bar**
   Problem: The requested UX was “the whole bottom area is the CTA,” but the implementation still looked like a white footer containing a smaller button.
   Attempted fix: The footer chrome was removed and the full bottom area was turned into one wide CTA surface.
   Status: Resolved in-thread.

7. **The in-room header was visually too tall and heavy**
   Problem: The room header read denser and larger than the list header, so entering a room felt like switching to a different chrome system.
   Attempted fix: Header height and padding were tightened to match the list chrome more closely.
   Status: Resolved in-thread.

8. **A legacy iOS tap-to-top fallback still sat above the room header**
   Problem: Old top-padding/tap behavior survived in the room view and made the upper chrome feel padded and inconsistent.
   Attempted fix: The fallback tap-to-top behavior and its extra padding path were removed.
   Status: Resolved in-thread.

9. **The in-room bottom control bar was bulkier than the list CTA bar**
   Problem: The room’s bottom control bar had more outer height and spacing than the list’s bottom CTA, so the two screens did not feel part of the same UI system.
   Attempted fix: Padding, min-height, and safe-area handling were repeatedly tightened.
   Status: Resolved in-thread after multiple passes.

10. **The in-room play/mic controls had too much chrome**
   Problem: Shadows and gray hover/background treatments around the main control made the room bar look noisy.
   Attempted fix: Extra shadows and adjacent gray chrome were stripped back.
   Status: Resolved in-thread.

11. **The iOS `/conversations` bottom safe area showed the wrong fill color**
   Problem: The native iOS safe-area fill stayed white under the conversation list instead of letting the web footer gradient continue downward.
   Attempted fix: RN palette handling was changed so `/conversations` does not paint the iOS bottom safe area with the native white fill.
   Status: Resolved in-thread.

12. **The list top banner sat too low below the header**
   Problem: The top ad/banner spacing for the list screen had too much clearance and did not visually lock to the header.
   Attempted fix: The list banner offset was tightened separately from the in-room banner offsets. Later QA-branch validation on real devices found two extra contributors: the pull-to-refresh chip was still rendered as a sticky flex child with `opacity: 0`, so it occupied about `50px` between the native top banner and the first conversation row even while idle, and RN was reserving the list top inset as soon as the list zone became active instead of waiting until the native banner was actually render-ready. The follow-up fixes moved the pull chip to an absolutely positioned overlay, gated the list inset reservation on banner readiness, and added a small empty-state-only top cushion so the placeholder does not kiss the banner edge.
   Status: Resolved in-thread.

13. **The in-room top banner sat too far below the room header**
   Problem: The room banner spacing still looked loose after the first banner pass because the list and room were sharing one clearance model.
   Attempted fix: Room top offsets were tuned independently from the list offsets.
   Status: Resolved in-thread.

14. **The in-room bottom banner sat too far above the control bar**
   Problem: The bottom banner clearance in a room did not feel anchored to the actual visible control area.
   Attempted fix: The bottom offset was recalculated against the visible control bar height rather than a looser container estimate.
   Status: Resolved in-thread.

15. **iOS still had a tiny bottom-banner hover gap after the main banner tightening**
   Problem: After the broad banner-offset fix, iOS alone still showed a small floating gap above the bottom controls.
   Attempted fix: An iOS-only bottom nudge was added.
   Status: Resolved in-thread.

16. **Banner transitions lagged during list/room history changes**
   Problem: The old banner could remain visible while the next screen was already animating because the app switched directly between zones without a neutral state.
   Attempted fix: A `hidden` banner zone was introduced so transitions pre-hide before the next zone asserts itself.
   Status: Resolved in-thread.

17. **Room swipe-back on iOS flickered by reopening the room during close**
   Problem: On gesture back, history close and route-sync reopen fought each other, producing a `room -> list -> room` flash.
   Attempted fix: History-driven closes were split into `instant` closes while app-driven closes kept animation.
   Status: Resolved in-thread.

18. **iOS forward-swipe failed to restore the room cleanly**
   Problem: After swiping back to the list, swiping forward could leave the list visible or replay a new room-open instead of restoring the prior room state.
   Attempted fix: Route sync was made to subscribe directly to the `conversation` query and reopen through the history-specific path. Later QA-branch validation found that RN still turned off `allowsBackForwardNavigationGestures` as soon as the current stamped history index hit `0`, even though a forward target still existed. The follow-up fix now keeps iOS back/forward gestures enabled whenever stamped history still has either a backward or forward entry.
   Status: Resolved in-thread.

19. **The drawer had its own swipe-back flicker on iOS**
   Problem: When swiping back out of the drawer, the drawer could briefly reappear and then disappear again because it replayed an exit animation after the native transition.
   Attempted fix: The drawer was given the same `animate / instant` split that the room overlay received.
   Status: Resolved in-thread.

20. **Room swipe-back felt too edge-dependent**
   Problem: Leaving a room required starting at the far-left edge, which felt too brittle for the new full-screen room UI.
   Attempted fix: A web-side whole-body right-swipe helper was added on top of the native edge gesture, excluding buttons, drawers, dialogs, and inputs.
   Status: Resolved in-thread.

21. **The visible CTA label was hardcoded in English**
   Problem: `Start Conversation!` was rendered as raw English text instead of using the conversations dictionary.
   Attempted fix: The visible CTA label was switched to dictionary-backed copy.
   Status: Resolved in-thread.

22. **Seven shipping locales were missing the new conversations copy**
   Problem: `zh-CN`, `zh-TW`, `ru`, `ar`, `hi`, `th`, and `vi` still fell back to English for the conversation-list experience.
   Attempted fix: All missing locale blocks were added to the `conversations` dictionary.
   Status: Resolved in-thread.

23. **The app did not restore the last viewed room/list state on full reopen**
   Problem: Re-entering `/[locale]/conversations` after a full reopen could dump the user at the generic list rather than the exact room/list view they had been using.
   Attempted fix: The last viewed conversations URL was stored per locale and tracking user, then replayed on the next conversations entry.
   Status: Resolved in-thread.

24. **`Start Conversation!` could create a room but fail to auto-start STT because the flag was consumed too early**
   Problem: The parent cleared the auto-start marker before the room had actually reached `running/connecting`.
   Attempted fix: The auto-start marker was only consumed after real running/connecting confirmation.
   Status: Resolved in-thread.

25. **Auto-start broke again because the start path depended too much on child mount timing**
   Problem: Relying on the child room effect alone meant the room could mount and still miss the auto-start action.
   Attempted fix: The parent was changed to trigger start after the room ref became ready.
   Status: Resolved in-thread.

26. **One auto-start fix introduced a ref-callback update loop**
   Problem: A ref callback wrote state during ref attachment and produced a `Maximum update depth exceeded` loop.
   Attempted fix: The ref-callback state update was removed and replaced with a one-time polling/wait strategy.
   Status: Resolved in-thread.

27. **Conversation rows initially lacked recent-message context**
   Problem: The list showed room labels/status but not the latest spoken content, making the new multi-room list hard to scan.
   Attempted fix: The list summary API was extended to include a recent finalized-message preview.
   Status: Resolved in-thread.

28. **Recent-message previews disappeared after some PATCH calls**
   Problem: Pausing a room or changing room languages could blank the newly added preview line until the next full refetch.
   Attempted fix: Single-row summary responses were changed to carry `latestMessagePreview`, and client replacement logic was tightened.
   Status: Resolved in-thread.

29. **The state model tied `live/paused` too closely to room open/close instead of real STT activity**
   Problem: Simply opening or closing rooms could make status appear live/paused in ways that did not match actual STT ownership.
   Attempted fix: Visible-room state was separated from live-STT ownership and room status was recalculated from STT activity.
   Status: Resolved in-thread.

30. **Closing a live room could kill the live session instead of backgrounding it**
   Problem: Unmounting the visible room also tore down STT, even when the intended UX was “close the room UI but keep STT running.”
   Attempted fix: Live rooms were kept mounted in the background when necessary instead of being immediately destroyed on close.
   Status: Resolved in-thread.

31. **Re-entering the same live room did not reliably restore the same live instance**
   Problem: Returning to a still-live room could fail to restore its red/live button state and current instance cleanly.
   Attempted fix: The hidden background instance was preserved and re-shown instead of creating a fresh visual state.
   Status: Resolved in-thread.

32. **Paused rooms could reopen without finalized history or usage after relaunch**
   Problem: After app relaunch, paused rooms could look empty or lose `usageSec` even though persisted finalized data existed.
   Attempted fix: A room-level GET and server fallback hydration path were added to merge persisted finalized state back into the client.
   Status: Resolved in-thread.

33. **Hidden non-owner rooms kept consuming global native STT events**
   Problem: Background-mounted rooms still listened to the same native STT event stream, so room 2 could ingest room 1 text.
   Attempted fix: Native STT event ownership was forced to a single room and non-owners ignored the events.
   Status: Resolved in-thread.

34. **Restored list rows could keep stale `active` badges**
   Problem: After restore/reopen flows, the list’s displayed room state could stay `active` even when the room was no longer the real live owner.
   Attempted fix: Running-state fallback was seeded from restored summaries and cleaned whenever conversation summaries refreshed.
   Status: Resolved in-thread.

35. **Stop actions could update `paused` state and row ordering too late**
   Problem: Stopping a live room could leave delayed list flicker because the parent list did not hear `paused` early enough.
   Attempted fix: `paused` was pushed to the parent list immediately on stop request.
   Status: Resolved in-thread.

36. **List ordering was using the wrong signal**
   Problem: Rooms could move based on stale status/updated metadata instead of the most recent finalized utterance time, so ordering felt wrong.
   Attempted fix: `latestMessageAt` was added and ordering/time display were moved to the latest finalized message signal.
   Status: Resolved in-thread.

37. **A non-owner room could look live just by being opened**
   Problem: Merely entering room 2 or room 3 while room 1 owned STT could make the newly opened room look like it was running.
   Attempted fix: Running UI was gated by real STT ownership instead of generic connection-ready state.
   Status: Resolved in-thread.

38. **Room-to-room handoff could try to start the new room before native stop ack**
   Problem: `room1 stop -> room2 start` could overlap, so room 2 received the start intent before room 1 had fully gone idle.
   Attempted fix: Handoff was changed to wait for native stop ack or timeout before allowing the next start.
   Status: Resolved in-thread.

39. **The old live room could unmount too early during handoff and lose its stop listener**
   Problem: The parent sometimes marked the first room non-live so early that its listener disappeared before the native stop ack arrived.
   Attempted fix: During handoff only, the previous live room stayed mounted until stop completion.
   Status: Resolved in-thread.

40. **The running button still showed a play icon**
   Problem: While STT was already running, the main red control still showed a play triangle instead of a stop square.
   Attempted fix: The running state icon was switched to a stop square while preserving the loading spinner for connecting.
   Status: Resolved in-thread.

41. **iOS mic-permission denial could trap the room in retry/error UI**
   Problem: Denying mic permission left the room stuck in a retry/error-looking state and the button path could become effectively dead.
   Attempted fix: Permission denial was reset back to `idle`, the control was kept re-clickable, and native cached status stopped restoring denial as persistent error.
   Status: Resolved in-thread.

42. **The first permission-denial recovery was too aggressive about opening Settings**
   Problem: One recovery pass jumped to iOS Settings immediately on denial, which was later judged too aggressive for the intended UX.
   Attempted fix: The flow was adjusted so denial returns to idle first and Settings opens only on the next explicit retry tap.
   Status: Resolved in-thread.

43. **iOS swipe-back regressed again later because gesture enablement became tied to menu-open state**
   Problem: After later merges, swipe-back silently became available only when the native menu overlay was open.
   Attempted fix: `allowsBackForwardNavigationGestures` was first restored to unconditional iOS enablement instead of `isNativeMenuOverlayOpen`, but later validation showed that QA-automation work must still preserve the original `canGoBack` gating so iOS forward-history behavior matches `main`.
   Status: Resolved in-thread.

44. **A later room-state pass hit an `isLikelyIOSPlatform` runtime error**
   Problem: The thread explicitly called out a runtime `Can't find variable: isLikelyIOSPlatform` during the multi-room state/ordering cleanup phase.
   Attempted fix: The missing runtime reference was repaired alongside the ownership/list-ordering patch set.
   Status: Resolved in-thread.

45. **iOS interactive swipe could still keep the old banner visible during the gesture**
   Problem: Even after pre-hide work, the banner could linger during the active interactive swipe because RN/WebView did not receive the gesture-start timing early enough.
   Attempted fix: The app already pre-hid as early as available and RN tried to infer the target zone from URL changes.
   Status: Not clearly solvable in-thread. Marked as unresolved structural limitation in the captured session.

46. **iOS `/conversations` could enter a “nothing responds” state because WebView touch handling was internally deadlocked**
   Problem: Later in the thread, the room/list surface could stop responding to taps entirely on iPhone. In the worst case, the user could tap conversation rows and other controls and nothing at all would happen. This was eventually traced to an RN-side WKWebView interaction rather than a web button-state issue.
   Attempted fix: The real regression was that `allowsBackForwardNavigationGestures` had been changed to unconditional iOS enablement at the same time that `/conversations` pages were still using `scrollEnabled={false}`. On iOS WKWebView, that combination let the underlying `UIScrollView` pan recognizer steal interaction in a way that made the web content feel untouchable. The thread later corrected this by gating `allowsBackForwardNavigationGestures` behind `!shouldDisableIosScroll` for those routes, while also fixing a cleanup omission in the legacy-import path.
   Status: Resolved in-thread once the RN gesture/scroll conflict was documented and reversed.

47. **Conversation rows could still log a route change without actually showing the room UI**
   Problem: Separate from the full touch-deadlock case, there was also a softer failure mode where tapping a room clearly triggered navigation work — server logs showed `/[locale]/conversations?...&conversation=<id>` requests and room GET calls returning `200` — but the visible screen never changed. The user described this as “touch logs appear but the screen does not move.”
   Attempted fix: Multiple hypotheses were tried in-thread because the failure looked like a presentation-layer regression rather than an API failure. These included: allowing room-open even while room status PATCHes were pending, forcing room entry to `instant`, reverting the move of auto-start logic from `mingle-home` into `LivePhoneDemo`, restoring query-based room open on first render, removing/reverting cold-start last-view restoration, and switching between `document.body` portal rendering and inline overlay rendering for the room surface. None of those attempts was treated as a final, clearly verified root-cause fix in the captured session.
   Status: Not conclusively resolved in-thread. The issue was important enough that the thread explicitly requested it be written down as a separate class of room-open regression, distinct from the pure iOS touch-deadlock above.

48. **iOS permission denial on `Start Conversation!` could still create a room and immediately strand it in `Connecting...`**
   Problem: The desired UX became “create the room, but do not auto-start STT if the initial iOS mic request was denied.” Instead, the room could still enter a visible `Connecting...` state and just sit there until the user manually backed out.
   Attempted fix: The create-room flow was changed so iOS native mic denial short-circuits auto-start, letting the room be created without pretending STT is actively connecting.
   Status: Resolved in-thread after follow-up permission-flow passes.

49. **After an iOS denial, the first explicit `Start` retry did not reliably open Settings**
   Problem: Once the user had denied microphone permission, re-entering the room and pressing `Start` was supposed to jump directly to the iOS Settings screen on the first retry. Instead, one pass left the room flashing or entering `Connecting...` once, and Settings opened only on a later interaction.
   Attempted fix: The thread cached the last native mic-permission outcome and reused it when re-entering rooms, so an already-denied state could trigger the Settings redirect immediately instead of burning the first retry tap.
   Status: Resolved in-thread after native permission caching was added and then refined.

50. **A hidden WebView site-level mic prompt appeared inside the native app**
   Problem: Even though the native app already owned microphone permission, `Start Conversation!` could still trigger a web-origin mic prompt (`Allow "...photo-for-passport.com" to use your microphone?`) from the embedded WebView. This was confusing and wrong for the intended native UX.
   Attempted fix: The room-creation warm-up path stopped calling `getUserMedia()` for native iOS/Android runtimes, so native permission stayed the only source of truth and the site-origin prompt stopped appearing.
   Status: Resolved in-thread.

51. **Web warm-up denial state and native denial state could drift apart**
   Problem: When denial happened through the warm-up path before the room UI was visible, the room-level `Start` logic did not always inherit that denial. This created a split-brain state where the room thought it should connect, while the earlier create-room flow had already learned that mic permission was denied.
   Attempted fix: The denial result from the create-room warm-up path was explicitly written into the same last-known native permission channel consumed by the room STT hook.
   Status: Resolved in-thread.

52. **STT could be truly running while the room UI stayed stuck in `Connecting...`**
   Problem: Later in the thread, the user found that `Connecting...` could remain on-screen even when STT was actually active. Evidence included server-side STT connection logs and, after navigating away and back, a red running button and working transcript ingestion.
   Attempted fix: Multiple state-reconciliation passes were added so the current room could recover native STT ownership on remount, re-read cached native status while connecting, and promote itself out of `connecting` when the native/runtime state proved STT was already alive.
   Status: Resolved in-thread after several iterations.

53. **The first STT server connection could be blocked until an unrelated user gesture**
   Problem: In one particularly confusing version of the bug, the STT server did not log a client connection until the user hit back or otherwise interacted again. This made it look like “the room is stuck,” even though the actual cause was a blocked async step in the front-end start pipeline.
   Attempted fix: The thread found that `primeAudioPlayback()` was being awaited before STT start, and on iOS/WebView that promise could stall waiting for a user gesture. The fix moved TTS priming to the background so the STT websocket start could happen immediately.
   Status: Resolved in-thread.

54. **Leaving a still-running room did not immediately update the list badge to `대화중`**
   Problem: The list badge for the live room sometimes remained stale after backing out of a room. The user could see that STT was active only after re-entering the room, at which point the red running button appeared and only then did the list eventually update to `대화중`.
   Attempted fix: Parent summary updates were made more eager, and the room/list ownership recovery path was expanded so the list could learn about the live owner even if the visible room UI had just unmounted.
   Status: Resolved in-thread after the later state-sync passes.

55. **The `Connecting...` overlay oscillated rapidly even while transcript text was already arriving**
   Problem: One later regression produced especially bad UX: the room would show `Connecting...`, words would begin arriving, and the overlay would flash on and off many times over the first few seconds. The user described it as the overlay appearing and disappearing more than twenty times while speech was already being recognized.
   Attempted fix: The native `running/silenced` statuses were kept in `connecting` only until the first real server-ready or transcript activity, and once the room reached `ready`, later repeated native running statuses were prevented from downgrading it back to `connecting`.
   Status: Resolved in-thread.

56. **The room-rename dialog sat too low and could be covered by the keyboard**
   Problem: Both the in-room rename dialog and the conversation-list rename dialog initially rendered around the vertical center of the screen. On iPhone, opening the keyboard could partially cover the field and action buttons.
   Attempted fix: The dialogs were moved to a safe-area-aware top offset instead of center alignment, and both implementations were normalized to use the same upper placement model.
   Status: Resolved in-thread after multiple follow-up passes.

57. **The first rename-dialog positioning fix was misleading because only one of the two dialogs actually moved**
   Problem: One pass moved the in-room dialog but left the list-side dialog centered, so the user kept reporting “the rename modal is still too low” even though one implementation had changed.
   Attempted fix: The list rename modal and the room rename modal were both audited and then moved together so they shared the same top anchoring behavior.
   Status: Resolved in-thread.

58. **Long-pressing a conversation row selected text instead of cleanly showing the room-actions tooltip**
   Problem: On the conversation list, a long press could trigger iOS-style text selection on the preview/time labels, producing blue text-selection affordances that fought the intended room-action menu.
   Attempted fix: User-select and touch-callout behavior were disabled on the room rows so long press opens the room-actions tooltip without text-selection chrome.
   Status: Resolved in-thread.

59. **Long-pressing a room avatar could open image-preview behavior instead of room actions**
   Problem: The avatar image on a conversation row still behaved like a draggable/previewable image on iOS, so long-pressing it could surface image preview behavior rather than the intended room-action tooltip.
   Attempted fix: Drag/image-preview behavior was disabled on the list avatars so long press remains dedicated to room actions.
   Status: Resolved in-thread.

60. **The room-delete action from the conversation list initially failed with `405 Method Not Allowed`**
   Problem: The UI exposed room deletion from the list, but versioned `/api/ios/.../conversations/:id` and `/api/android/.../conversations/:id` routes were not exporting `DELETE`, so the visible action failed immediately for users.
   Attempted fix: `DELETE` was added to the versioned iOS/Android conversation-detail routes and controllers so room deletion used the same soft-delete API through namespace-specific endpoints.
   Status: Resolved in-thread.

61. **Freshly created rooms could immediately 404 on follow-up GET/PATCH calls**
   Problem: A newly created room could appear to exist for one moment and then fail hydration/status requests because `is_deleted = NULL` rows were being filtered out as if they were deleted. This created visible “room not found” behavior right after room creation.
   Attempted fix: Conversation queries were changed to treat `is_deleted = NULL` the same as `false`, so newly created rooms remain queryable until explicitly soft-deleted.
   Status: Resolved in-thread.

62. **Deleting a live room from the list could revive the room or leave behind an empty shell**
   Problem: When STT was still active or just winding down, room deletion could race against live-state PATCHes and room-summary upserts. The user could see the room disappear and then reappear as a blank/initial-looking room, often accompanied by 404s.
   Attempted fix: Deleting-room IDs were tracked explicitly, running-state PATCHes were suppressed for deleting rooms, and delete success removed the room from all live/list state immediately instead of allowing later upserts to resurrect it.
   Status: Resolved in-thread after several passes.

63. **Pending STT finalization after delete could still write into a deleted room**
   Problem: Even after STT stopped, a pending finalization/translation turn could land after deletion and touch the just-deleted room again. This produced confusing server 404s and visible “why is this room still here?” moments.
   Attempted fix: A dedicated `prepareForDeletion()` path was added so pending turns and in-flight finalization work are discarded before the delete completes.
   Status: Resolved in-thread.

64. **Live-room deletion could surface a failure alert even when the room was already gone**
   Problem: The room visually disappeared, but a late `PATCH 404` or `DELETE 404` could still bubble up as `대화방을 삭제하지 못했습니다`, making the user think the delete had failed even though the room was already removed.
   Attempted fix: Late 404s that happen during or after confirmed deletion were treated as benign and no longer surfaced as a user-facing failure.
   Status: Resolved in-thread.

65. **The room-management menu briefly flashed the feedback screen while opening**
   Problem: The submenu carousel was implemented as `root -> feedback -> room management` on a shared three-panel strip. Jumping from the root menu to room management animated across the middle panel, making the feedback page flash by for a frame.
   Attempted fix: Direct root-to-room-management navigation now uses an instant screen transition instead of visibly sliding through the feedback panel.
   Status: Resolved in-thread.

66. **Global success/error toasts appeared too low and did not match the in-room toast style**
   Problem: Several user-facing messages such as room-delete success/failure and STT failure surfaced through a bottom-edge toast style that sat much lower than the in-room `Connecting...` or `Copied` toasts, making the feedback feel visually inconsistent.
   Attempted fix: The global toast stack was moved into the same visual lane and design language as the in-room toast treatment.
   Status: Resolved in-thread.

67. **Conversation-list action tooltips chose the wrong vertical direction near the top of the screen**
   Problem: Only the very first row opened its tooltip downward. Rows slightly lower in the upper part of the list still opened upward, which felt wrong and cramped near the top header area.
   Attempted fix: The positioning rule was expanded so conversation rows in roughly the top 40% of the list viewport also open their tooltip downward.
   Status: Resolved in-thread.

68. **Android OS back skipped the menu subpage stack and closed the room**
   Problem: When the hamburger menu was on `Feedback` or `Conversation Management`, Android hardware back did not close the submenu first. It fell through to the room-close handler, so the user was dumped back to the conversation list instead of stepping back inside the menu.
   Attempted fix: A higher-priority native back handler was registered inside the room menu so submenu/modals/dropdowns consume Android back before the room overlay does.
   Status: Resolved in-thread.

69. **Opening feedback from Android 1.1.0 hit a 404**
   Problem: The UI exposed the feedback page from the hamburger menu, but `/api/android/v1.1.0/feedback` and `/api/ios/v1.1.0/feedback` were missing, so entering the page could immediately fail with a 404 and an apparently broken empty state.
   Attempted fix: Versioned `feedback` route aliases were added for API `v1.1.0` on both Android and iOS, and the namespace routing contract test was expanded.
   Status: Resolved in-thread.

70. **iOS submenu transitions became unnaturally fast and snap-like**
   Problem: After the menu tree refactor, entering and especially leaving `Feedback`/`Conversation Management` felt too fast, with the close transition appearing half-smooth and then disappearing abruptly.
   Attempted fix: Menu subpage timing and back-direction animation handling were retuned so open/close transitions use the same smoother content transition path.
   Status: Resolved in-thread.

71. **iOS edge-swipe back from a submenu replayed the closed page and flashed it away**
   Problem: Swiping from the left edge did return from `Feedback`/`Conversation Management` to the root menu, but roughly half a second later the just-closed submenu could flash back in and then vanish. The user perceived this as a severe flicker/regression in the back gesture.
   Attempted fix: Natural iOS history-gesture `popstate` is now treated separately from app-requested back steps, so the system swipe no longer replays a second JS-side submenu animation after the native transition already completed.
   Status: Resolved in-thread.

72. **An iOS submenu back-gesture fix accidentally removed menu swipe-dismiss**
   Problem: To stop edge-swipe flicker, the menu’s own swipe-dismiss was briefly disabled on iOS, which regressed the expected ability to dismiss the menu by swiping inside the panel.
   Attempted fix: The gesture model was split by start region: the left-edge gutter is reserved for native iOS history swipe, while swipes starting farther inside the panel still trigger the custom menu dismiss.
   Status: Resolved in-thread.

73. **iOS forward-swipe could preview the menu and then let the room snap back over it**
   Problem: After returning from a menu/subpage to the room via iOS edge-swipe back, using the forward gesture could momentarily show the previous menu state and then abruptly let the room reclaim the screen. The system gesture preview looked correct, but the JS state refused to restore the menu.
   Attempted fix: The menu `popstate` handler was changed to accept forward restoration from depth `0 -> 1/2` instead of bailing out whenever the current menu depth was already zero.
   Status: Resolved in-thread.

74. **iOS forward-swipe still replayed a delayed room/menu double transition**
   Problem: Even after forward restoration was enabled, the system could show the menu correctly and then, about a second later, replay a `menu -> room -> menu` sequence. The UI looked like it had recovered, then the room suddenly covered it, then the menu slid back in.
   Attempted fix: Menu history restoration now reads the latest `window.history.state` instead of trusting a stale `popstate` payload, and it no longer invents fallback depths by decrementing the current depth. This avoids delayed second transitions from stale history snapshots.
   Status: Resolved in-thread.

75. **iOS natural history gestures could still emit one delayed room/menu replay across the room boundary**
   Problem: Even after stale-state handling was tightened, a completed iOS back/forward gesture could still be followed by one late `menu <-> room` reversal. Users saw the correct destination first, then a brief return to the opposite screen, then the intended screen again.
   Attempted fix: A short iOS gesture-settle guard now ignores delayed natural `popstate` replays that would bounce only between room depth `0` and menu depth `1/2`, while still allowing normal in-menu depth changes.
   Status: Resolved in-thread.

76. **iOS menu swipe history required one final stabilization pass before it stopped flickering**
   Problem: The earlier back/forward fixes each removed one layer of the glitch, but the room/menu boundary remained fragile enough that users still saw intermediate regressions while testing real gestures. The practical UX issue was not just one bug but a chain of related history/gesture mismatches that had to be iterated on until the same back/forward flow finally behaved consistently.
   Attempted fix: The thread ultimately converged on a stable combination of native edge-swipe handling, in-panel swipe-dismiss routing, forward restoration, stale-state avoidance, and delayed-replay suppression. Once those pieces were in place together, the user confirmed that the duplicate swipe replay issue appeared to be behaving correctly.
   Status: Resolved in-thread after multiple follow-up passes.

77. **Forward history after custom menu swipe-dismiss could restore a partially dragged menu snapshot**
   Problem: If the user closed the hamburger menu with the custom in-panel swipe-dismiss gesture instead of native edge-swipe back, a later iOS forward-swipe could restore an in-between frame rather than a clean full menu. The left side of the room stayed visible because iOS appeared to snapshot the menu at the exact drag offset where the finger was released, then React finished a second internal slide into the real destination.
   Attempted fix: The thread narrowed the cause to the custom swipe-dismiss path firing history navigation while the panel still visually reflected a partial drag offset. The likely remediation identified in-thread was to force the menu back to a clean fully-open frame before navigating history, but that final code fix had not been landed yet at the time of documentation.
   Status: Still open at thread end.

78. **Android create-room auto-start could misread cached mic denial as an iOS Settings recovery**
   Problem: On Android 1.1.0, denying microphone permission and then pressing `Start Conversation!` again could jump straight to app settings instead of showing the normal in-app permission prompt. Manual `Start` inside the room still behaved correctly, so the regression was isolated to the auto-start path used by newly created rooms.
   Attempted fix: The thread found that cached native mic-permission state was always being rehydrated as if it belonged to iOS, which converted any cached `denied` value into the `open_ios_settings` recovery path. The fix resolved the cached recovery action against the current API namespace platform so Android denial stays on the in-app retry path while iOS denial still routes to Settings.
   Status: Resolved in-thread.

## Other Issue Sessions

### `019c5304-b4b1-7bf0-b768-81ea87605468` | UI/UX issues found

1. **The app shell exceeded the intended 480px maximum width**
   Problem: The mobile-web shell had drifted beyond the intended 480px cap, so the centered service area looked too wide and lost the phone-frame feel the user expected.
   Attempted fix: The max width was reset from the larger rem-based cap back to a 480px-equivalent constraint.
   Status: Resolved in-thread.

### `019c5c43-c3ae-76f1-bfbf-a3be7fd105f3` | UI/UX issues found

1. **Thread-level UI/UX issue**
   Problem: intermittent favicon load crash on first activation/refresh.
   Attempted fix: serve favicon as a static public asset.
   Status: resolved.

### `019c6f40-5ed2-7933-9acd-9302b505584e` | UI/UX issues found

1. **Initial and refresh entry could settle at the wrong scroll position**
   Problem: When the conversation view hydrated, the newest content was not reliably anchored at the bottom, so users could land mid-history instead of on the live edge.
   Attempted fix: The bottom-anchor timing was reworked so the list waits for the right hydration point before doing its one-time bottom snap.
   Status: Resolved in-thread.

2. **Top pagination could trigger before bottom anchoring finished**
   Problem: The top-edge loading logic could wake up too early, fighting the intended bottom-follow behavior and making the initial scroll position feel unstable.
   Attempted fix: The top-pagination trigger was tightened so it no longer races the first bottom-settle pass.
   Status: Resolved in-thread.

3. **Translation bubble confirmation UI was tied to STT final instead of translation final**
   Problem: The translation bubble visually looked finalized as soon as STT finalized, even when the translation itself was still pending, which made the UI state misleading.
   Attempted fix: The translation bubble styling was split so the emphasized/final state only appears after translation finalization.
   Status: Resolved in-thread.

4. **Stopping STT during TTS playback could leave playback state stuck**
   Problem: If STT was stopped while TTS audio was already playing, playback could stop mid-stream, the playing effect could remain on screen, and later TTS playback could stop working until app restart.
   Attempted fix: This thread reached root-cause analysis and identified a stuck TTS state / missing completion path, but the captured session ended at investigation.
   Status: Unresolved in this session.

### `019c756e-8522-7eb0-ab7a-f3032bcd29ee` | UI/UX issues found

1. **The overlay disappeared too early during inertial scrolling**
   Problem: On mobile inertial scroll, the app dropped out of its user-scrolling state too early, so the overlay vanished while the screen was still visibly moving.
   Attempted fix: The scroll-state logic was changed to keep the overlay visible until scrolling had actually stopped.
   Status: Resolved in-thread.

### `019c95e8-00df-7180-8366-54a76bd59ccc` | UI/UX issues found

1. **Hamburger menu surfaces used the wrong background color**
   Problem: The hamburger panel and then the hamburger button itself did not match the navbar surface, so the top-right chrome looked visually inconsistent.
   Attempted fix: The menu panel and trigger button were restyled to use the same surface treatment as the navbar.
   Status: Resolved in-thread after multiple passes.

2. **Menu and login copy were not fully internationalized**
   Problem: Menu items and login-related text still leaked hardcoded English instead of following the 15-locale i18n system.
   Attempted fix: Missing translation keys and locale coverage were added for the menu and login flows.
   Status: Resolved in-thread.

3. **UI locale sources disagreed with each other**
   Problem: `Sign in`/`Sign out` could stay English while the language selector showed Korean, because page locale and selector locale were being derived from different sources.
   Attempted fix: The selector locale was unified with the page locale so the visible UI no longer split between two locale sources.
   Status: Resolved in-thread.

4. **Borders and depth around the hamburger menu were still wrong after the first styling pass**
   Problem: Even after the color fix, the menu still showed leftover borders or the wrong amount of chrome, so it did not match the requested flatter look.
   Attempted fix: The trigger and panel styling were iterated again, removing the extra border/depth where inappropriate and preserving only the container border that the user wanted.
   Status: Resolved in-thread after several corrections.

5. **Dropdown positioning regressed during the flattening passes**
   Problem: At one point the menu overlapped the navbar and even obscured the hamburger trigger, which was a direct positioning bug introduced during the flattening iteration.
   Attempted fix: The panel was moved back below the navbar and its border restored.
   Status: Resolved in-thread.

### `019c992c-911f-7b23-8a18-3a0e4d5007df` | UI/UX issues found

1. **Live message rows flickered as text updated**
   Problem: During diarization work, each incremental transcript update caused the whole visible message UI to flash, including the translation rows, which made the conversation feel unstable.
   Attempted fix: The partial-key / rerender path was tightened so existing bubbles no longer unnecessarily re-animate on every transcript update.
   Status: Resolved in-thread.

2. **Multi-speaker overlap still failed to finalize per speaker**
   Problem: A second overlapping utterance could appear, but the first speaker's utterance could stay stuck without finalizing because activity/finalize logic was not truly separated per speaker.
   Attempted fix: Speaker-specific idle/finalize handling was added end-to-end so each speaker can finalize independently.
   Status: Resolved in-thread.

### `019ca08b-fcff-7ba3-b22f-d4a11d6203a8` | UI/UX issues found

1. **Login screen safe areas showed ugly white bands**
   Problem: The RN iOS login screen rendered white safe-area strips above and below the content instead of extending the intended top and bottom colors, which made the shell look unfinished.
   Attempted fix: The iOS shell safe-area fill was reworked so login routes extend their intended colors into the top and bottom safe areas.
   Status: Resolved in-thread.

2. **The login flow initially lacked the requested swipe-to-terms step**
   Problem: The requested UX was social-login button -> slide to terms acceptance -> continue, but that intermediary terms panel did not exist at first.
   Attempted fix: The login UI was restructured to slide into a terms-consent step before continuing into provider auth.
   Status: Resolved in-thread.

3. **Apple and Google auth flows did not match the requested native UX**
   Problem: Apple needed a native Face ID-backed flow, and Google needed the system confirmation sheet plus bottom-sheet browser auth flow, but the earlier implementation did not provide that experience.
   Attempted fix: A native iOS auth module was introduced so Apple and Google could follow the requested native/auth-session flows.
   Status: Resolved in-thread.

4. **The login flow could stall on `Checking your session` and fail when `.env.local` expectations drifted**
   Problem: Users saw a long spinner before Google sign-in and sometimes hit `Try signing in with a different account`, exposing a fragile dependency on runtime env plumbing.
   Attempted fix: The branch was rebased with the mainline auth/env changes and devbox was rerun so the login flow used the newer env handling.
   Status: Resolved in-thread.

5. **Menu background and i18n regressions resurfaced after rebasing the login branch**
   Problem: After merging main and rerunning devbox, the hamburger surface and localized copy still looked unchanged, so the earlier menu/i18n fixes had effectively regressed from the user's perspective.
   Attempted fix: The menu surface, locale resolution, and auth/menu copy were patched again on top of the rebased branch.
   Status: Resolved in-thread.

6. **Visible locale cues disagreed across the same login UI**
   Problem: `Sign in`/`Sign out` stayed English while the language dropdown looked Korean, meaning the auth copy and selector were not reading the same locale state.
   Attempted fix: Locale resolution was unified so both the page UI and the selector derive from the same locale source.
   Status: Resolved in-thread.

7. **Hamburger flattening passes repeatedly regressed border and placement behavior**
   Problem: The menu went through several incorrect intermediate states: leftover borders, panel covering the trigger, and then loss of the container border the user still wanted.
   Attempted fix: The panel was iterated until it sat below the navbar with the requested flat treatment and restored outer border.
   Status: Resolved in-thread after multiple passes.

### `019d0514-065c-7493-9eb9-ce8c137a0a98` | UI/UX issues found

1. **Thread-level UI/UX issue**
   Problem: users did not recognize the top-right language control as a dropdown.
   Attempted fix: add a minimal visual cue.
   Status: likely resolved; this captured session later focused on cleanup.

### `019d09c4-4bbb-7712-bfff-af784ff51f88` | UI/UX issues found

1. **Thread-level UI/UX issue**
   Problem: translation bubble meta rows made bubbles too thick.
   Attempted fix: move flags/time outside the bubble.
   Status: likely resolved earlier; this captured session later focused on cleanup.

### `019d10e1-9693-7a92-bb87-c25a4907c539` | UI/UX issues found

1. **Thread-level UI/UX issue**
   Problem: splash logo yellow did not match the splash background.
   Attempted fix: replace the launch image asset so its background color matches the runtime splash color.
   Status: resolved.

### `019d162b-4b15-7763-88f2-7571532d1ed6` | UI/UX issues found

1. **Thread-level UI/UX issue**
   Problem: animal avatar SVGs had too much whitespace and one asset looked bad.
   Attempted fix: asset-trim/polish request.
   Status: likely resolved on its feature branch; this entry is design-polish rather than a runtime bug.

### `019d18f0-c3d8-71c3-b1cb-f3b6a8c94e21` | UI/UX issues found

1. **Thread-level UI/UX issue**
   Problem: iOS resume showed a brief white flash.
   Attempted fix: investigation only in this thread.
   Status: unresolved in this session.

### `019d18f2-8f47-7c43-b52f-b08ce0ae78b8` | UI/UX issues found

1. **Thread-level UI/UX issue**
   Problem: auto-scroll triggered too often and fought manual scrolling.
   Attempted fix: throttle/recheck bottom-follow logic.
   Status: resolved.

### `019d19a3-df70-7a42-bd7b-ff6ac157d4a3` | UI/UX issues found

1. **Thread-level UI/UX issue**
   Problem: Android background translations did not visibly update until foreground.
   Attempted fix: investigation only.
   Status: unresolved in this session.

### `019d29d5-7bbe-7660-a135-078eb1403e45` | UI/UX issues found

1. **Thread-level UI/UX issue**
   Problem: the onboarding overlay showed a ghost play icon that misled users into tapping the wrong target.
   Attempted fix: remove the misleading icon and rely on copy/arrow guidance.
   Status: resolved.

### `019d2a13-5d6c-7892-9f2b-9143113463b0` | UI/UX issues found

1. **Thread-level UI/UX issue**
   Problem: initial room landing with existing history did not snap to bottom.
   Attempted fix: wait for hydration readiness before the one-time bottom anchor.
   Status: resolved.

### `019d2a3f-2705-7810-a0e0-a2281881a606` | UI/UX issues found

1. **Thread-level UI/UX issue**
   Problem: relaunch auto-scroll happened only once instead of on every fresh open.
   Attempted fix: several approaches explored.
   Status: no clearly landed final fix in this thread.

### `019d2f95-6e34-7013-8961-35857fe8f51d` | UI/UX issues found

1. **Opening the redesigned drawer could shake the main screen underneath**
   Problem: After the drawer redesign work and parent-branch merge, opening the panel caused the main screen to jolt instead of feeling like a stable overlay.
   Attempted fix: Focus transfer and panel transition behavior were adjusted so the drawer slides in without disturbing the underlying screen.
   Status: Resolved in-thread.

2. **The flattening pass briefly put the menu in the wrong place and removed the wrong border**
   Problem: In follow-up adjustments, the dropdown/panel styling regressed into overlapping the navbar or losing the container border the user expected to keep.
   Attempted fix: The panel placement was reset below the navbar and only the intended outer border was restored.
   Status: Resolved in-thread.

3. **The drawer thread mixed a large UX redesign with follow-up visual corrections**
   Problem: What started as a feature thread became a real UI bug-fix thread once the first redesign introduced open-state and chrome regressions.
   Attempted fix: The redesign stayed in place, but the visible regressions were corrected in subsequent passes.
   Status: Resolved in-thread.

### `019d43a0-d5ec-7fd1-94b1-884dcea6de65` | UI/UX issues found

1. **Thread-level UI/UX issue**
   Problem: iOS banner/runtime debugging exposed a wider live-demo hydration mismatch family. Server-rendered markup could disagree with the client once localStorage-backed preferences, native inset query params, and timestamp `Date`/`Intl` formatting were applied on the browser side, which produced hydration warnings and sometimes first-paint UI drift.
   Attempted fix: the thread mainly diagnosed the mismatch class and pointed at client-only initialization paths. Follow-up work later moved storage-backed initialization behind client hydration, stabilized native inset reads, suppressed timestamp hydration drift, and briefly disabled SSR for the live demo during one mitigation pass.
   Status: diagnosed in-thread; follow-up commits later resolved the underlying hydration mismatch paths.

### `019d43a3-c1e7-7600-858d-64964413a683` | UI/UX issues found

1. **Thread-level UI/UX issue**
   Problem: tab/body chrome tuning also exposed My Page scroll-chain bugs and spacing issues.
   Attempted fix: confine scrolling to internal content and contain overscroll.
   Status: resolved.

### `019d43ae-bb58-7202-80ff-dfaa9ef50e68` | UI/UX issues found

1. **Thread-level UI/UX issue**
   Problem: branch-level bottom-tabs work continued banner/layout/ad polish.
   Attempted fix: this session is mostly a meta/summary handoff, not a standalone fix thread.
   Status: no independent verdict beyond the linked implementation threads.

### `019d4caf-4787-77f2-9e97-a7695630b6d2` | UI/UX issues found

1. **Thread-level UI/UX issue**
   Problem: mic-permission denial recovery felt bad and could strand users in a failed state.
   Attempted fix: reset back toward retryable/idle behavior.
   Status: later resolved across follow-up permission-retry threads.

### `019d4d16-3c07-7c91-b787-66f177fbfc1f` | UI/UX issues found

1. **Thread-level UI/UX issue**
   Problem: banner/ad placement and scene transitions broke across room/list/drawer/menu states.
   Attempted fix: explicit banner zones and runtime-param preservation.
   Status: resolved.

### `019d4eba-14af-7523-ad3c-0f5a5b3a810b` | UI/UX issues found

1. **Thread-level UI/UX issue**
   Problem: after a forced WebView reload/flicker, native STT could still be running while the reloaded React state fell back toward idle. In practice that meant the UI could show the orange play/start control instead of the red stop/running control, and related room metadata could look reset or stale even though audio capture was still active.
   Attempted fix: native/WebView state-reconcile work taught the reloaded WebView to restore native STT status and promote the UI back into its ready/running state when native status or transcript activity resumed.
   Status: issue clearly existed in-thread; follow-up reconcile commits later targeted the state-restore path directly.

### `019d4f37-af30-7872-bc3a-4f68be0fabd6` | UI/UX issues found

1. **Thread-level UI/UX issue**
   Problem: Android could show a stopped/orange run button while STT was still actually running.
   Attempted fix: diagnosis of native/WebView state split only.
   Status: unresolved in this thread.

### `019d5714-6710-7343-b2a8-b4faa797c702` | UI/UX issues found

1. **Thread-level UI/UX issue**
   Problem: per-bubble copy buttons made the conversation UI visually noisy.
   Attempted fix: keep only whole-utterance copy and use selection/long-press plus toast for the rest.
   Status: resolved.

### `019d6d6d-cd79-71b0-99e5-c0296b0adeae` | UI/UX issues found

1. **Thread-level UI/UX issue**
   Problem: keyboard-mode composer could grow but not shrink back.
   Attempted fix: immediate remeasurement/shrink synchronization plus tests.
   Status: resolved.

### `019d6d99-14df-7910-827a-26d32cc47d39` | UI/UX issues found

1. **Thread-level UI/UX issue**
   Problem: keyboard mode added too much bottom margin when the banner position was bottom.
   Attempted fix: subtract non-covering clearance and later fix native inset reporting.
   Status: resolved.

### `019d6f86-9cff-73a1-b425-1b407e9f82d5` | UI/UX issues found

1. **Thread-level UI/UX issue**
   Problem: voice-to-keyboard transition stuttered.
   Attempted fix: unify clearance/composer settling so the layout drops in one smooth pass.
   Status: resolved.

### `2026-04-12-android-bottom-banner-safe-area` | UI/UX issues found

1. **Thread-level UI/UX issue**
   Problem: in-room transcript content on Android could still be covered by the bottom native banner even though the same bottom-banner path was correct on iOS and the top-banner path was correct on both platforms.
   Root cause: the banner position itself was acceptable, but Android WebView still reported a smaller bottom inset to the web transcript than the banner effectively covered. RN added Android native bottom safe-area to the physical banner placement, while the web transcript only reserved the banner content height. That mismatch left the transcript under-padded only on Android bottom-banner rooms.
   Attempted fix: keep the native banner placement unchanged, but report `banner height + Android native bottom safe-area` back to web content as the effective bottom inset. iOS continues to report just the banner content height.
   Status: resolved.

## Feature Or Mention-Only Sessions

### `019c52c6-0c6b-7ba0-b8fd-a566d5a6f8b0` | UI/UX feature/polish request only

Focus: initial mingle-app mobile-web shell, four-tab layout, and visual redesign build-out; this was a feature construction thread, not a pre-existing bug thread.

### `019c90fd-30d5-7643-8462-853738eb5975` | UI/UX feature/polish request only

Focus: RN iOS login gate, social sign-in entry screen, hamburger menu, account actions, and locale plumbing. This was a substantial feature build thread, not a pre-existing UI bug thread.

### `019c9f66-dff3-7612-94f5-52ab7df0303c` | UI/UX feature/polish request only

Focus: login-screen redesign planning only. The session was about visual direction and worktree setup, not a pre-existing UI bug fix.

### `019ca44a-10f9-7ba1-a03a-324fec2a8941` | UI/UX feature/polish request only

Focus: add a delete-account confirmation modal with i18n; not a pre-existing UI bug thread.

### `019ca451-b5bf-7101-ac73-32363c8c017c` | UI/UX feature/polish request only

Focus: add a share button to the hamburger menu; not a bug thread.

### `019caad5-6bb0-7d92-bea8-5037f761994d` | UI/UX feature/polish request only

Focus: email-login flow, swipe panels, and bottom-sheet auth UX; not a pre-existing bug thread.

### `019d0a14-c17f-7fd3-af01-e02b23765d6d` | UI/UX feature/polish request only

Focus: add random speaker animal avatars; not a bug thread.

### `019d1faf-7c71-7c53-9025-6f825575d813` | UI/UX feature/polish request only

Focus: revive the hamburger drawer with a right-side full-height panel and swipe/overlay close UX.

### `019d4785-e9ae-7251-901a-522eb61b1b1b` | UI/UX feature/polish request only

Focus: planning how to split the large social-style UIUX branch into a smaller release train.

### `019d482b-5732-7533-b684-9a706ecd36a3` | UI/UX feature/polish request only

Focus: review/planning of the multi-conversation branch structure; no standalone bug fix in this thread.

### `019d56dd-4efc-7131-84f3-fb54707d0fdd` | UI/UX feature/polish request only

Focus: add per-bubble copy buttons and narrower bubbles. This later got reversed by thread 019d5714 because the result felt too noisy.

### `019d6737-7b85-7080-bce8-dccb05377c6e` | UI/UX feature/polish request only

Focus: messenger-style keyboard input bar with animated mode toggle; not a bug thread.

### `019d6d79-cfda-70d2-b96c-19522f7edfbc` | UI/UX feature/polish request only

Focus: translation-model dropdown badges and wider opened menu layout.

### `019d6dc3-9387-7781-af63-4fb1286d9670` | UI/UX feature/polish request only

Focus: add a full-delete action and confirm modal inside the drawer menu.

### `019d7003-dbb6-7801-a8d9-649857671dbc` | UI/UX feature/polish request only

Focus: add a drawer-level full-delete action with confirm modal and localized copy. This was a feature request thread, not a pre-existing UI bug thread.

### `019c7ebf-5768-7991-b324-4587f5a62297` | UI/UX issue mentioned but no standalone fix recorded here

UI/UX issue mentioned, but this thread was planning-only: the existing iOS notch tap-to-top problem was discussed and scoped, with no standalone fix landed here.

### `019d391d-4b31-7ad1-91f2-03a3dcb90001` | UI/UX issue mentioned but no standalone fix recorded here

UI/UX issue mentioned, but this thread is only a shadow summary of another conversation. No standalone fix was performed here.

### `019d3989-cd8b-75d3-b8da-c60918a4ba01` | UI/UX issue mentioned but no standalone fix recorded here

UI/UX issue mentioned, but this thread is only a Telegram summary/handoff. No standalone UI/UX fix was completed in this session.

### `019d4398-a433-7652-a450-2704223b9242` | UI/UX issue mentioned but no standalone fix recorded here

UI/UX issue mentioned only indirectly. The captured action here was mainly auth/config cleanup (disable noisy web Apple OAuth wiring); no standalone UI bug was resolved here.

### `019d6f81-c484-7ca3-8d8e-35eda0d82a5b` | UI/UX issue mentioned but no standalone fix recorded here

UI/UX issue mentioned in the opener, but this captured session ended as worktree cleanup only. No standalone UI/UX fix recorded here.

### `019d6f82-c1a0-7d70-8577-894e00b96f24` | UI/UX issue mentioned but no standalone fix recorded here

UI/UX issue mentioned in the opener, but this captured session ended as worktree cleanup only. No standalone UI/UX fix recorded here.

### `019d6f83-3566-78f1-bfea-c78a915dca28` | UI/UX issue mentioned but no standalone fix recorded here

UI/UX issue mentioned in the opener, but this captured session ended as worktree cleanup only. No standalone UI/UX fix recorded here.

### `019d6f83-810e-7573-ae59-bae9a403a787` | UI/UX issue mentioned but no standalone fix recorded here

UI/UX issue mentioned in planning only: the opener explicitly called out fragmented i18n coverage and missing locales across surfaces, but this captured session stayed at planning/review and did not land a standalone UI/UX fix here.

## Sessions With No UI/UX Issue

- `019c52c6-d0f5-7c20-bf10-60abd034b1ea` | No UI/UX issue found.
- `019c52c7-dd99-7d41-bf04-c337e06f352a` | No UI/UX issue found.
- `019c52cf-6e60-75b1-a47b-521a4b9c6d25` | No UI/UX issue found.
- `019c5302-fb6b-7393-a71c-ded42accc3a6` | No UI/UX issue found.
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
- `019c7529-aa7d-79d1-a945-0f38ddc9fda8` | No UI/UX issue found.
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
- `019c9464-4a46-7ee0-bb8c-717fced42eeb` | No UI/UX issue found.
- `019c94d3-528e-75e1-a95e-f646bb6096f5` | No UI/UX issue found.
- `019c9515-4c61-7310-acfb-23632cb2fc6a` | No UI/UX issue found.
- `019c9528-172a-7513-a92c-f8febcc5a33f` | No UI/UX issue found.
- `019c9596-73a5-7ea0-9591-ea1af260b6a7` | No UI/UX issue found.
- `019c95be-6f61-7a73-9728-c1f017a1e7ca` | No UI/UX issue found.
- `019c981a-90c3-7ea1-852a-d72ba6d40e40` | No UI/UX issue found.
- `019c9828-433f-7792-895f-939387497143` | No UI/UX issue found.
- `019c9911-aa7c-7f43-8108-348dbbda5e17` | No UI/UX issue found.
- `019c9930-1391-7582-9e8a-35fae3ae2bc1` | No UI/UX issue found.
- `019c9932-22f5-7870-9de6-557e8a16593b` | No UI/UX issue found.
- `019c9987-d5df-7772-b6cf-6995e5f201c7` | No UI/UX issue found.
- `019c99d8-4af9-76d3-a343-09a335801a17` | No UI/UX issue found.
- `019c9a3a-9b1b-7f13-aa0e-6abdc5366692` | No UI/UX issue found.
- `019c9a60-fdce-73d3-8dbc-983cf8aeb628` | No UI/UX issue found.
- `019c9ee2-e8f9-7ed3-8603-0dd4f09895af` | No UI/UX issue found.
- `019ca08e-1177-7141-a848-a157a080e450` | No UI/UX issue found.
- `019ca267-86fd-73d3-b635-7608423be358` | No UI/UX issue found.
- `019ca36e-8c7b-7b61-ac9b-d8a424c5a08d` | No UI/UX issue found.
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
- `019d0528-958b-7e20-b478-0a507b194f84` | No UI/UX issue found.
- `019d0532-cea8-7930-8b2b-f4a087d98987` | No UI/UX issue found.
- `019d075f-2b45-7f33-8cf3-267e79c6f503` | No UI/UX issue found.
- `019d09ba-95de-7443-a031-9d2516c5425e` | No UI/UX issue found.
- `019d09bb-8a9d-72c3-b709-b80d4cf6b65f` | No UI/UX issue found.
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
- `019d117a-0b87-7552-b5bb-1277eb9d2fc8` | No UI/UX issue found.
- `019d1447-5bd5-7d43-84cf-ec956c87cb15` | No UI/UX issue found.
- `019d144c-f526-7380-991d-988ef57ed3c6` | No UI/UX issue found.
- `019d1503-a483-73b3-8d98-133e7ed456c8` | No UI/UX issue found.
- `019d16e6-cba0-7db2-8227-56ec4b9b464d` | No UI/UX issue found.
- `019d16e8-8c5b-73f3-8660-e4f72666236b` | No UI/UX issue found.
- `019d18f1-d54f-75f2-b893-1ffb6ef5ccf0` | No UI/UX issue found.
- `019d191f-7488-73d1-a772-f694c9faa9d5` | No UI/UX issue found.
- `019d1998-e85c-75f3-ad64-e67eadf8d75f` | No UI/UX issue found.
- `019d199b-d514-7891-99d1-f261a7feb213` | No UI/UX issue found.
- `019d1a31-81a9-7233-86c4-c0d89045632b` | No UI/UX issue found.
- `019d1a3a-5621-7443-bc5d-5b9da3eaa864` | No UI/UX issue found.
- `019d1a4e-f254-7c42-a901-58d2d8ac9f10` | No UI/UX issue found.
- `019d1ac6-5b92-74d2-9519-53b8df36731d` | No UI/UX issue found.
- `019d1acc-de1c-78d3-bfdc-6682552af25b` | No UI/UX issue found.
- `019d1f5b-6d3c-7393-aecf-fc0fcd3e7951` | No UI/UX issue found.
- `019d1f82-8255-7c20-a4c5-0203ec657330` | No UI/UX issue found.
- `019d1fb4-12fb-7443-ba29-2a156d635e93` | No UI/UX issue found.
- `019d1ff5-41d8-7801-83ec-6f0984eabb56` | No UI/UX issue found.
- `019d2488-db3d-7820-951d-ae9c7bb2676c` | No UI/UX issue found.
- `019d2653-9139-7143-96cf-90dc54e2a88d` | No UI/UX issue found.
- `019d29c8-ffd0-7c40-9200-d7d7501f835c` | No UI/UX issue found.
- `019d29d6-477e-74c1-aa18-d07e4823e3ec` | No UI/UX issue found.
- `019d29e2-1298-7300-8b06-4a5abb0e978d` | No UI/UX issue found.
- `019d29f1-a463-7c70-a3ad-626b04046182` | No UI/UX issue found.
- `019d29fb-3dda-7680-a598-4cfac587cd4c` | No UI/UX issue found.
- `019d2a18-e89c-7402-a092-ea24306a0b30` | No UI/UX issue found.
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
- `019d2ff6-1b7a-7441-9d56-992703b1d40f` | No UI/UX issue found.
- `019d303e-8684-7980-9772-221f9bb459c8` | No UI/UX issue found.
- `019d306f-3d86-7671-90c4-a569ee988857` | No UI/UX issue found.
- `019d3706-7b91-7241-9c9f-bbb6a1fa5b1c` | No UI/UX issue found.
- `019d3709-051d-7301-b2a0-02c38a0e0985` | No UI/UX issue found.
- `019d3726-7648-7163-9172-856e52a90fae` | No UI/UX issue found.
- `019d389c-fdd9-7361-be90-b54449317e69` | No UI/UX issue found.
- `019d3d5d-7670-79a3-98fb-4aa6c0e1367b` | No UI/UX issue found.
- `019d3d66-33ad-7563-b95c-43a4cebb7018` | No UI/UX issue found.
- `019d3d66-a204-7531-8218-7d9f34ba5e6b` | No UI/UX issue found.
- `019d3d67-0539-73d2-8ccc-2830c27de92b` | No UI/UX issue found.
- `019d3e77-4298-7e60-b031-2cb46546bafd` | No UI/UX issue found.
- `019d4364-53e0-7df3-8573-c108b28db591` | No UI/UX issue found.
- `019d4369-1572-77f2-ab69-44b4a7348af1` | No UI/UX issue found.
- `019d4388-488a-78d3-9cc3-046fa784890c` | No UI/UX issue found.
- `019d43a0-9cba-7df0-afc4-91103077efe8` | No UI/UX issue found.
- `019d4868-b7ff-7743-8246-76ea234a0773` | No UI/UX issue found.
- `019d4d1e-bf31-7550-8116-f2654014ec7c` | No UI/UX issue found.
- `019d4dc4-914e-7912-aae5-b8021b4973cf` | No UI/UX issue found.
- `019d4e35-c559-7232-ae76-6b5ab334f0b8` | No UI/UX issue found.
- `019d4eb1-8d6b-7192-8ffb-22deeead662c` | No UI/UX issue found.
- `019d4f51-c903-7e73-a4f0-f1d1d42bcbba` | No UI/UX issue found.
- `019d5430-7b59-78a2-8ced-f6488ba97e7e` | No UI/UX issue found.
- `019d5706-019e-7aa2-af37-3a7c53eb31b1` | No UI/UX issue found.
- `019d636a-628d-7f60-8936-e9e2637a026c` | No UI/UX issue found.
- `019d6713-37ce-7720-9faa-73c92e919e97` | No UI/UX issue found.
- `019d6724-7531-79e1-8f01-d5009d91318f` | No UI/UX issue found.
- `019d6c60-8f36-74e0-9be6-c4af43d77204` | No UI/UX issue found.
- `019d6c8e-0f4b-7742-a086-9fdb21cc62d7` | No UI/UX issue found.
- `019d6d01-77d8-7ed1-b8d3-b512139ecd15` | No UI/UX issue found.
- `019d6d47-cbeb-7a01-9349-8ad7b520919b` | No UI/UX issue found.
- `019d6d6f-b9c2-7343-b4f8-aeaa753c3f1c` | No UI/UX issue found.
- `019d6d85-612d-7622-909b-b22f7a04681b` | No UI/UX issue found.
- `019d6da8-8dde-7f32-be86-7f473baf85ba` | No UI/UX issue found.
- `019d6db1-d0e3-7722-bd33-27c2ec279816` | No UI/UX issue found.
- `019d6dbd-f288-74e1-9afa-f98dbd8c74fa` | No UI/UX issue found.
- `019d6f80-a10d-7b10-ac88-4dd9ad89e780` | No UI/UX issue found.
- `019d7151-fed2-75a1-8efe-69fc947979f4` | No UI/UX issue found.
- `2026-04-15-zh-cn-zh-tw-selector-split` | Language selector now presents `zh-CN` and `zh-TW` as separate user-facing targets with distinct flags (`🇨🇳` Simplified, `🇹🇼` Traditional) while preserving Soniox STT hints as generic `zh`. This avoids misleading the user into thinking the translation target is a single generic Chinese option and keeps script-variant intent intact through translation, chip history, and bubble rendering.
- `2026-04-15-soniox-zh-source-normalization` | Incoming generic Soniox `zh` source-language tags are normalized to `zh-CN` at the client STT boundary unless the transcript text clearly contains traditional-only Han characters. This prevents `zh-CN` from remaining in the target list for the same utterance, which previously made a single Chinese utterance render an unnecessary extra translation bubble and visually thicken the chat row.
- `2026-04-15-soniox-zh-cn-default-source` | Chinese source-language normalization was simplified so every generic Soniox `zh` transcript is rendered as `zh-CN` without script heuristics, while explicit `zh-TW` inputs remain `zh-TW`. Matching and manual-input paths were aligned to the same rule so a Chinese utterance never grows an extra same-language `zh-CN` bubble just because some code paths kept generic `zh` and others promoted it differently.
- `2026-04-16-language-selector-speech-translation-tabs` | The language selector now separates speech-recognition hint languages from translation target languages with two segmented tabs placed between the selected/recent flag strip and the search/sort controls. The previous single selector made a hidden Soniox hint setting look identical to the visible translation output setting, so users could not intentionally tune recognition hints without also changing translated bubble targets. Each tab keeps its own selected state and recent deselection history while the header button continues to foreground translation targets, preserving the existing user-facing meaning of the compact flag control.
- `2026-04-16-linked-translation-language-default` | The translation tab now starts with `Use the same language list for translation` checked, so the visible translation targets follow the speech-recognition language list by default. Without this linkage, splitting the tabs made the first-run state feel like two independent decisions even though the product default should keep speech hints and translation targets aligned. Users can uncheck the box inside the translation tab to unlock separate translation-language selection for that conversation.
- `2026-04-16-speech-language-stt-restart-control` | The speech-recognition language tab now explains that speech-language changes require an STT restart before Soniox hints are reflected, and it exposes the same compact start/stop control used in text-composer mode. The split selector previously let users change speech hint languages while the active WebSocket session was still visually controlled only from the bottom bar, which made the restart requirement easy to miss when the selector covered the conversation. Reusing the same button state, colors, loading spinner, and click handlers keeps the selector control synchronized with the underlying STT session rather than creating a second independent toggle.
- `2026-04-16-language-button-speech-translation-union` | The conversation header language button now displays the union of speech-recognition and translation languages, ordered by speech languages first and capped at five flags. After splitting the selector into two tabs, the header still reflected only translation targets, so a user could add a speech hint language and see no header feedback unless translation was linked. Showing the speech-first union keeps the compact header summary aligned with both configuration surfaces without overcrowding the header.
- `2026-04-16-manual-speech-language-restart` | Speech-recognition language changes no longer auto-restart the active STT session. The prior automatic restart made the new restart hint and compact start/stop button misleading because the WebSocket could reconnect while the user was still editing languages. Leaving the current STT session running with its existing Soniox hints until the user explicitly stops and starts recording makes the visible control the single source of truth for when speech-language changes take effect.
- `2026-04-16-language-setting-response-order` | Speech-language, translation-language, and linked-language updates now share one optimistic sync sequence in the conversation list. With independent response guards, a slower checkbox response could overwrite a newer translation selection after the user quickly unlocked and edited the translation tab. Treating the three controls as one language settings surface keeps the visible selector state stable even when PATCH responses resolve out of order.
- `2026-04-16-android-empty-banner-hitbox` | Android native AdMob banners could remain visually blank while the native banner slot still sat above the WebView and intercepted that screen area. Because the slot looked transparent instead of reserved, users could interpret the dead area as a touch regression. The RN banner now renders a shared visible fallback surface with an `AD` badge whenever the creative has not finished loading and remounts the banner after foreground resumes, so the reserved banner space remains legible even if AdMob fails or stalls.
- `2026-04-17-language-selector-diacritics` | New language selector copy for extended Latin locales now keeps native diacritics in French, German, Spanish, Portuguese, and Vietnamese. The review called out that the new speech/translation tab labels and restart/link messages looked lower quality than existing localized strings when they were ASCII-only. Aligning the new copy with the existing localized style avoids making the selector tabs feel like fallback text.
- `2026-04-17-versioned-stt-restart-coverage` | The manual speech-language restart behavior now covers both the current `1.1.0` conversation runtime and the legacy `1.0.11` translator runtime path. The versioned web/STT split means a fix can look correct in the latest shared component while an older release line still carries automatic Soniox hint restarts. Keeping the legacy hook free of language-change auto-restart and adding explicit `1.1.1+` routing coverage prevents users on older or future client namespaces from seeing a different restart UX.
- `2026-04-18-xr-mingle-solution-layout-class` | The XR deck's "Mingle" solution slide now has a dedicated layout hook for the four-card feature list (`slide-side-media--mingle-solution-proof` and `slide-tool-items--mingle-solution-proof`). The nearby AI feasibility slide uses the same generic `slide-side-media--ai-solution-proof` pattern, so sharing only the generic class made it too easy to adjust the wrong block when tuning position and width. Keeping the Mingle solution card stack on a dedicated class lets the deck adjust that slide independently while preserving the existing AI feasibility slide layout.
- `2026-04-18-xr-page-11-short-video` | The XR deck now inserts a video-only slide at page 11, centered with no visible supporting copy, using the YouTube Shorts embed for `GCg3FG4PdaA`. Adding this slide before the customer section shifts all later section anchors, so the deck table of contents was updated to point to the new customer, strategy, vision, team, and appendix page numbers. The video uses a 9:16 centered iframe sizing rule so the short reads as the primary content instead of being framed as a side-media element.
- `2026-04-18-xr-youtube-embed-referrer` | The page 11 YouTube embed showed Error 153 when YouTube could not identify the embedding page through referrer/origin metadata. The XR deck now declares `strict-origin-when-cross-origin` at the document level, passes the production origin into the YouTube embed URL, and the legal Vercel deployment sends the same `Referrer-Policy` header. This keeps the centered video slide usable in production instead of rendering a large gray player error state.
- `2026-04-18-xr-page-10-side-video` | The standalone page 11 video slide was removed and the same YouTube embed was moved into the right-side media slot of page 10, replacing the four feature cards. This keeps the "Mingle" solution message and the supporting video on one slide, while restoring the customer section to page 11 and the rest of the table-of-contents anchors to their pre-video positions. The referrer/origin metadata remains in place so the embedded video can still identify the production page to YouTube.
- `2026-04-18-xr-hellotalk-customer-slide-anchor-update` | A new HelloTalk customer context slide was added after the customer section opener, using `hellotalk-voiceroom-list.png` as the foreground phone screenshot. This pushes the later strategy, vision, team, and appendix section starts by one slide, so the table-of-contents anchors and page counter were updated to match the actual 61-slide deck. Without this anchor update, clicking the table of contents would land one page early for all sections after customer.
- `2026-04-18-xr-network-effect-cloud` | The XR deck's page 36 differentiation slide now shows the same messenger and social service logos used later in the deck, but arranged as a separate network-effect composition instead of a random competitor cloud. Five logos sit in a loose upper band and four in a loose lower band, leaving a deliberate central gap for the `네트워크 효과` label. This makes the slide communicate messenger network effects directly while avoiding a duplicated look from the later randomly scattered competitor slide.
- `2026-04-18-xr-network-effect-cloud-tighten` | The page 36 network-effect logo cloud was tightened after visual review because the first version spread the service logos too far apart. The logo coordinates now keep the upper and lower groups closer to the center while preserving the two-band scatter pattern, and the whole media cluster is shifted further right to better balance the slide copy.
- `2026-04-18-xr-user-reaction-card-height` | The XR deck's page 15 and page 16 user reaction cards were restored to a consistent two-line baseline height after the one-line quotes became visually shorter than the two-line quotes. The user-reaction card grid now uses a larger minimum row height, increasing the card height by roughly 20% so each message has more internal breathing room while preserving the existing layout and typography.
- `2026-04-18-xr-network-effect-title` | The XR deck's page 36 title was updated from a narrower UX-focused statement to `반면, 저희는 소셜 네트워크 경험까지 직접 만듭니다`. This aligns the title with the network-effect logo cloud on the same slide and makes the slide's message explicitly about owning the broader social network experience.
- `2026-04-18-xr-strategy-step-title-scale` | The strategy chapter's three-stage cards now use the same title scale as the customer hurdle cards, matching the `첫째, 의사소통이 어렵다` visual weight. The second-stage label was also updated from `실시간 통번역 + 보이스 챗` to `실시간 통번역 + 음성 메신저` so the strategy language matches the deck's broader messenger positioning.
- `2026-04-18-xr-strategy-step-title-nowrap` | The enlarged strategy step titles were wrapping after the title scale change because the separate step-number badge consumed too much horizontal space. The strategy cards now fold the step label into the title text, such as `1단계 - 혼자 쓰는 실시간 번역기`, remove the badge column for those slides only, widen the card group modestly, and keep the titles on one line.
- `2026-04-18-xr-strategy-step-width-retune` | The strategy step cards were retuned after the widened version visually invaded the left slide copy area. The strategy step container width is now reduced to `clamp(410px, 27vw, 420px)`, and the inline step labels use a colon format such as `1단계: 혼자 쓰는 실시간 번역기` to keep the label compact while preserving the larger title scale.
- `2026-04-18-xr-network-effect-title-refine` | The XR deck's page 36 differentiation title was refined to `반면, 저희는 소셜링에 집중해 메신저 경험까지 제공합니다`. The updated wording narrows the claim from building the broader social network experience to focusing on socializing and delivering the messenger experience, matching the current slide positioning more closely.
- `2026-04-18-mingle-1-1-1-conversation-list-bottom-cta-inset` | The `1.1.1` native app started sending a generic `nativeBannerPosition=bottom` and `nativeBottomInsetPx` fallback in the initial WebView URL. The conversation list interpreted that room-only bottom banner fallback as list footer clearance, making the new-conversation CTA much taller than the `1.1.0` layout while conversation rooms still looked correct. The native/web banner contract is now split by zone: list screens receive only `nativeListTopInsetPx`, conversation rooms receive `nativeConversationBannerPosition` plus conversation-specific top/bottom inset fallbacks, and the list CTA keeps a fixed safe-area bottom padding so room banner clearance cannot leak into the list view.
- `2026-04-26-conversation-room-hydration-latency` | Entering a conversation room could feel blank for too long once a room accumulated history because the client read namespaced room history from localStorage but persisted subsequent room snapshots to the legacy unscoped key. That cache miss forced every room open to wait for server hydration, and the server hydration endpoint returned the full message history for the session. The fix scopes persisted room snapshots to the conversation namespace, keeps room localStorage as a latest-100-message warm cache, preserves already rendered/paged utterances in React state, limits initial server hydration to the latest 100 visible messages, adds cursor-based server pagination for older room history, and adds database indexes for latest-message and latest-usage lookups.
- `2026-04-27-conversation-local-stats-density` | Conversation rooms now show the locally stored message count directly under the existing STT usage duration in the bottom voice bar. Conversation list rows also show compact local duration plus saved message count under the existing timestamp, preserving the title, language flags, timestamp, preview, and active status chip without increasing row height. The list label intentionally omits a redundant `STT` prefix so values such as `1m 2s · 3 msgs` stay short enough for the fixed-height row. The stats use the same localStorage-backed, per-conversation namespace as STT usage rather than introducing a stricter server count, so the UI stays lightweight and tolerant of offline or delayed server hydration.
- `2026-04-27-conversation-bottom-stat-type-size` | The conversation-room bottom voice bar now renders the saved message count at the same text size as the STT usage duration. To avoid moving the mic, keyboard, or surrounding bottom-bar controls, the stats stack keeps the same fixed 33px footprint as the prior smaller-label layout and removes the inter-line gap by tightening line-height instead of changing the bottom-bar container.
- `2026-04-27-conversation-message-count-stat-cache-split` | The conversation-room message count stat briefly showed the latest localStorage cache length after room history persistence was reduced to a latest-100 warm cache. That made high-history rooms display `100 msgs` even when their total message history was larger, unlike STT usage which was already stored as an independent cumulative scalar. Message count is now persisted under its own per-conversation localStorage key, hydrated from the server's total visible message count, and only falls back to counting the utterance snapshot for legacy rooms without the new scalar.
- `2026-04-27-native-stt-background-resume-room-loss` | Native STT sessions could return from background or a WebView remount through the conversation list before reopening the active room because the RN shell always seeded WebView from the locale home URL and relied on client effects to restore the room later. The native shell now persists the last conversation URL in platform storage, rebuilds the initial WebView source from the current runtime URL plus that `conversation` id, clears the restore hint when the user reaches the list, and removes stale room query hints when the conversation no longer exists. Conversation history hydration also renders the recent local batch first and defers full localStorage normalization so long rooms do not show an empty room while older history is parsed.
- `2026-04-30-conversation-create-double-tap` | First-run users could double-tap the conversation start button before React rendered the disabled/loading state, creating two rooms and two conversation history entries. On iOS this could leave the first room behind the second one, then back navigation reopened the earlier room and surfaced a start failure alert instead of returning cleanly to the list. The create path now uses a synchronous ref lock shared by the visible button and QA room creation helper, so the second tap is ignored before any second POST or overlay history push can start.
- `2026-08-07-ios-conversation-forward-gesture-diagnostics` | Repeated iOS back/forward edge swipes can return to the conversation-list shell after a conversation is expected to be restored, leaving the browser history position and the rendered overlay out of sync. A physical-device trace confirmed the sequence: the forward `popstate` moves to the room entry, but the route-sync subscriber runs before the popstate open handler has recorded its explicit target; because the close guard still contains that room id, the route-sync suppression branch calls `replaceState` with a list URL. The room history entry is therefore mutated into a second list entry, and the later open handler resolves no room from the now-overwritten current state. The fix now captures the history destination in the capture phase, lets route-sync own an explicit forward restore before applying native-STT suppression, and removes the fallback that could replace a room entry with a list URL. Physical-device verification is pending after the clean reinstall; the QA-only diagnostics remain in place and record WebView `pushState`, `replaceState`, `popstate`, route-resolution, suppression-guard, and overlay open/close events with URL, history length, native navigation index, route marker, and conversation id.
- `2026-08-13-railway-native-tab-transition-latency` | On the Railway 2.0.0 runtime, switching from My Page to the conversations tab could appear slow or remain on the previous screen because the native tab route was waiting for the server-rendered conversation list. That render performed session lookup, identity lookup, conversation-channel lookup, latest-message summaries, and message counts, after which the client performed another identity-aware list refresh on native mount. The fix treats an explicit `nativeUi=1&nativeTabRoot=1` conversations route as a lightweight tab shell: it skips the blocking server-side conversation query, displays a recent per-identity `sessionStorage` list cache immediately when available, and performs one background refresh through `view=native-list`. The native API path reads channels directly by the authenticated session id or stable external tracking id, avoiding the extra resolve/create-user database round trip while keeping the existing fallback path for requests without a known identity. Initial conversation-room and history-forward routes retain server hydration and are not treated as tab-root navigations, so room restoration and back/forward behavior remain separate from the tab performance optimization.
- `2026-08-13-profile-edit-panel` | The My Page `프로필 변경` control was only a visual placeholder after the messenger-tab draft was restored, so users could not change the name, introduction, or nationality shown on their profile. The control now opens the same right-to-left sliding surface used by the other in-app screens, supports a right-edge swipe to close, and saves the three editable fields through the authenticated `/api/profile` endpoint. Profile values are stored on `app_users`, loaded when My Page opens, and reused by the profile-share screen for the shared display name. Photo upload remains intentionally excluded because it was removed from the earlier PR#92 implementation and is not part of this feature scope.
- `2026-08-13-mypage-profile-actions-inline` | The My Page `프로필 변경` and `프로필 공유` actions were stacked as two full-width rows, making the profile header unnecessarily tall for two short actions. They now sit side by side in equal-width, equal-height buttons with a compact gap, preserving the existing actions while keeping the profile controls visually grouped and easier to scan.
- `2026-08-13-social-login-reactivation` | The 2.0.0 conversation list retained guest access, but its room authentication gate had been disabled and the Apple OAuth provider/button had been intentionally commented out, so the existing Apple/Google login surface could not be reached. The room authentication gate is restored, Apple OAuth credentials are resolved from the existing Vault-backed configuration, and the shared conversation entry now passes live Apple and Google configuration flags to the existing login surface. The list remains accessible before authentication; entering a conversation presents the established sign-in UI.
- `2026-08-13-discover-tab-user-search` | The two-tab messenger shell had no dedicated place to find people before following them, so users had to rely on an unspecified future entry point. A centered Explore tab now opens a deliberately empty surface with the ID/name search field focused at the top. Search results are fetched only after the user types, show the matched display name and user ID, and leave follow actions out of this iteration. The tab is a replace-based native tab root and preserves the existing STT continuity rule when users return to the conversation list.
- `2026-08-13-discover-user-follow` | Search results were visible but could not be acted on, so finding a friend did not lead to a relationship action. Each result now has a Follow/Following toggle backed by a unique user-to-user relation, with optimistic UI, rollback on failure, self-follow protection, and live follower/following counts on My Page. The follow action is deliberately limited to one-way following; mutual chat permissions and unfollow confirmation remain outside this iteration.
- `2026-08-13-user-safety-controls` | Search results now open a right-to-left sliding public profile surface, where a user can follow, block, or report another account. Blocking immediately removes both follow directions and hides the blocked relationship from future search results; the block can be reversed from My Page > Menu and settings. Reports are stored independently from feedback as user-report threads with a reason, optional details, status, and team replies. My Page exposes the reporter's own report history and replies, while the admin report inbox supports filtering, replying, and status changes. The interaction keeps the existing app pattern: a left back arrow, horizontal swipe-to-dismiss, explicit confirmation for block/unblock, and a bottom-sheet form for report submission.
- `2026-08-13-mypage-profile-edit-button-surface` | The inline `프로필 변경` action used a gray fill while the adjacent `프로필 공유` action used a white fill, making the two same-priority profile actions look visually inconsistent. The profile-edit action now uses the same white surface, border, size, and active-state treatment as profile sharing.
- `2026-08-15-follow-notification-panel` | The first conversation tab had no lightweight way to notice new followers, and moving the conversation-search affordance toward the right edge left no room for a social notification entry point. The header now keeps search on the left and adds a bell button on the right with an unread-count badge. Tapping it opens a right-to-left panel above the tab content, so the notification surface does not become a new bottom tab or disrupt the conversation list. Follow notifications are grouped into unread and read sections; each horizontal row opens the actor's public profile when tapped, while a separate row action follows the actor directly without leaving the panel. The action stays disabled and reads `Following` once the relationship already exists. Notifications are persisted per user, individual rows are marked read when opened or followed, and the overlay supports the existing safe-area, Escape, native-back, and backdrop-dismiss patterns.
- `2026-08-16-notification-banner-inset-and-auto-read` | The notification drawer could place its first rows underneath the native AdMob banner area, and users had to tap each notification before the unread badge cleared. The drawer now reuses the conversation list's measured native top-banner inset as scroll-content padding, and opening the drawer marks all of the viewer's unread follow notifications as read in one authenticated request while updating the visible rows and badge optimistically.
- `2026-08-16-profile-image-and-language-preview` | Profile photos and the small nationality flag did not provide a clear way to inspect the full image, and the language identity was not consistently visible on the public profile. Both My Page and public profiles now make the avatar/flag and the language row tappable, open a shared full-screen image preview with the saved crop state, and show the flag plus canonical language code beneath the profile photo.
- `2026-08-16-notification-profile-stack` | Tapping a follow notification closed the notification drawer before opening the actor's profile, so returning from the profile lost the notification context. The public profile now stacks above the still-open notification drawer when launched from a notification, and its header back action, edge swipe, and native back action remove only the profile layer so the notification list is immediately visible again.
- `2026-08-16-profile-language-preview-label` | The profile surface showed a persistent flag-and-language-code row below the avatar, which added visual noise before the user opened the image preview, and the preview repeated a technical code such as `ko`. The persistent row is now removed while the avatar's flag affordance remains available, and the enlarged preview shows the flag with the localized full language name instead.
- `2026-08-16-notification-profile-history-stack` | The notification profile overlay could preserve the drawer in React state but did not add its own browser/WebView history entry, allowing an iOS edge-back gesture to target an older screen instead of only dismissing the profile. Notification profile entry now pushes a dedicated same-URL history state while explicitly keeping the drawer open; header back, profile edge swipe, native back, and WebView popstate consume that profile layer and reveal the unchanged notification drawer underneath.
- `2026-08-15-discover-search-tab-cache` | Explore search state was kept in the current browser history entry, which preserved the query when opening a result profile and returning but lost it when a bottom-tab route replacement remounted the Explore screen. The search query and resolved result rows now use a short-lived `sessionStorage` snapshot keyed by authenticated user and API namespace, with an in-memory fallback for restricted storage. Returning to Explore restores the cached rows immediately and still refreshes the matching query in the background; entering a new query records a pending snapshot, and clearing the field removes it. This keeps account-specific follow state isolated while preserving the existing profile-return history behavior.
- `2026-08-17-profile-and-default-language-order` | Conversation language buttons could start with English even when the user's profile language was Japanese or Korean, and profile language selection supported only one language. New conversations now preserve the user's saved default-language order, with the profile's first primary language leading the initial three-language fallback. My Page separates profile primary languages from app UI language, allows one to five primary languages in selection order, and adds a dedicated default conversation-language settings surface. Both surfaces show selected flags above search, keep selection order stable, and persist their independent settings on the user profile.
- `2026-08-20-notification-drawer-native-webview-entry` | The authenticated native WebView could open profile-edit and My Page menu surfaces while the conversation notification drawer remained visually absent. Server traces showed successful `GET /notifications` responses, so the failure was on the drawer entrance path rather than notification data loading. The final fix moved notifications out of the `ConversationList` state overlay into a dedicated `/notifications` route whose screen root is a fixed right-to-left motion surface, matching the working follow-list and profile-share route screens. The conversation list now fetches only the unread count for its badge, while the route owns notification loading, read state, swipe-back, and profile navigation. Status: Resolved in-thread.
- `2026-08-21-public-profile-native-webview-entry` | Tapping a conversation avatar could successfully request the public profile while the profile overlay remained visually absent on the local native WebView. Server traces returned `200` for both the authenticated profile and counterpart profile endpoints, and device logs confirmed the tap and same-document navigation. The final fix now routes conversation-avatar and notification-row profile opens through the existing `/users/[userId]` page instead of conditionally mounting `PublicUserProfileScreen` inside `ConversationList`, so the profile uses the same fixed right-to-left route surface as profile sharing and follow-list entries. The `requestAnimationFrame` entrance guard remains as a defensive fallback for other native profile-link overlay callers. Status: Resolved in-thread.
- `2026-08-21-native-social-surface-route-entry` | Notification and conversation-profile entry originally mixed browser history bookkeeping with parent-owned React state (`showNotifications`, `notificationProfileId`, and `conversationProfileId`). That made the visible result depend on a conditional overlay remaining mounted and differed from the already-working route-backed social screens. The bell now pushes a native-query-preserving `/notifications` route, avatar taps push `/users/[userId]`, browser/native back returns through actual history, and the route screens own their slide-in motion and banner-zone state. Status: Resolved in-thread.
- `2026-08-20-first-install-discovery-source-onboarding` | The first-install onboarding collected the app language and private birth date, then immediately opened the authentication screen, leaving no way to understand how a new user found Mingle. The flow now adds a localized discovery-source step after the age check and before authentication, using compact selectable cards for friend/family referral, social media or online advertising, search, the App Store or Google Play, online community/school/workplace, and other. The selected value is kept in a dedicated localStorage pending key while the user is unauthenticated, survives the login transition, and is patched to the authenticated profile together with the existing pending language and birth-date values. The server validates a fixed source code list and stores it in the private `discovery_source` field without adding it to public profile responses. The existing first-install confirmation marker remains unchanged, so returning users are not unexpectedly shown a new survey.
- `2026-08-20-discovery-source-order-and-categories` | The discovery survey originally grouped several acquisition channels together, which made the first option overly likely to be selected and left analytics too coarse. The visible choices are now split into ten concrete options: friend/family referral, HelloTalk, Threads, Instagram/TikTok/YouTube/X, online advertising, Google Search, ChatGPT or another AI, App Store/Google Play search, online community/school/workplace, and other. The first nine choices are shuffled each time the survey opens while `Other` stays last, reducing first-option bias without making the fallback choice harder to find. Legacy stored source codes remain accepted by the API for previously completed surveys.
- `2026-08-20-discovery-source-random-order-label` | Because discovery choices are shuffled, a relative label such as `Other social media` could appear before HelloTalk or Threads and read as if it depended on the order below it. The grouped social-media choice now uses an order-independent label, `Instagram·TikTok·YouTube·X 등`, while keeping the same ten-choice count and randomized ordering.
- `2026-08-20-private-birth-date-profile-edit` | Birth date was collected during onboarding and stored privately, but the profile edit surface did not let a user correct it later. Profile editing now includes the existing modern birth-date picker, displays the privacy explanation, and keeps Save disabled for an under-12 date. The authenticated profile endpoint returns the birth date only through the private `/profile` response, while public profile serialization remains unchanged. Discovery source remains absent from the edit draft and cannot be changed from the UI.
- `2026-08-20-email-auth-keyboard-scroll` | The email login and signup sheets allowed the password keyboard to cover the submit button, while the login and password-confirmation panels had no independent scroll container. Each email-auth panel now scrolls within the sheet with safe-area padding and overscroll containment, so focusing a password field no longer requires dismissing the keyboard before the action button can be reached. The legacy auth surface receives the same behavior for parity.
- `2026-08-20-profile-edit-primary-language-description` | The profile edit surface showed the primary-language picker without explaining that the selected order is also the order shown on the hamburger-menu language settings surface directly under the picker legend, keeping both editing paths consistent.
- `2026-09-02-ios-physical-regression-observation` | A physical iPhone 11 Pro on iOS 18.6 was tested against the local Devbox server using the production database. Native navigation, two conversation open/back cycles, menu and language-selector surfaces, composer open/close, bottom tabs, and native STT start/stop/restart all completed without data-mutating actions. STT also remained in the running state after an iOS background/foreground cycle and returned to the idle `Start` state after stopping. Two follow-up UX risks remain: immediately after a cold app relaunch, XCUITest reported the WebView controls as `visible=false` and tab commands took roughly 22 seconds, matching the long non-interactive fit/settling symptom; and a right-edge forward swipe did not restore the room after a left-edge back swipe in the native-only path. The regular QA runner could not expose a `WEBVIEW` context on this device, so DOM-level inset, hydration, and history assertions remain pending after Web Inspector/remote automation is enabled. No speech was spoken and no message was sent during this observation.
- `2026-09-09-discover-follow-loading-control` | Tapping Follow/Following in Explore search temporarily replaced a content-sized, right-aligned button label with a single ellipsis. Because the action width was allowed to shrink during the transition, the old action surface could remain visibly exposed beside the short loading label, producing a clipped duplicate-looking control like the attached iOS screenshots. The search result action now keeps a stable minimum width and height, centers the loading label, marks the control busy, and limits the transition to colors so the previous button width cannot animate or peek through while the follow request is pending.
- `2026-09-09-discover-load-more-loading-control` | The Explore search pagination action had the same content-width transition bug: changing `더 보기` to `불러오는 중...` while adding a spinner caused the old and new button widths to overlap, so the loading action looked like two stacked buttons at the bottom of the result list. The pagination control now reserves a stable minimum width, keeps both labels on one line with centered alignment, marks the control busy, and transitions colors only so the previous `더 보기` surface cannot remain visible during loading.
- `2026-09-18-keyboard-composer-attachment-touch` | In an authenticated conversation's text-input mode, the plus button must open the attachment menu so a user can choose the existing `Hide keyboard` action and return to voice mode. The trigger originally prevented pointer-down's default behavior to keep the textarea and software keyboard stable, but iOS WKWebView can suppress the synthetic click that the implementation relied on. A pointer-up workaround was deployed, then a TestFlight iPhone confirmed that it still did not activate despite loading the new Railway deployment. The final path uses the ordinary button click again, explicitly blurs the active keyboard control, and then opens the menu; it contains no custom pointer-down or pointer-up suppression. The control exposes its expanded state. Automated interaction-contract coverage verifies that normal click is retained and custom pointer handling cannot return. Physical-device confirmation of this final revision remains pending.
- `2026-09-18-keyboard-composer-attachment-diagnostic` | The ordinary-click revision still needs physical iOS evidence, so the composer now has a temporary gated diagnostic mode. It can be activated by a two-second long press in keyboard mode, `?diag=1`, or the native/Web Inspector `window.__mingle_toggle_diag__()` hook. The overlay records touch/pointer/cancel sequences, relative timing, composer state changes, trigger and menu rectangles, and three menu measurements across the viewport settling interval. Long-press movement/cancellation and trailing-click suppression are handled without changing the normal short-tap path. This is a diagnostic deployment only; the final fix remains pending physical TestFlight results.
- `2026-09-18-keyboard-composer-attachment-portal-layer` | The attachment menu was portaled to `document.body` at z-index 99/100 while the active conversation `SlideSurface` occupied z-index 101. The trigger could therefore run its click handler while the full-screen conversation surface painted above the backdrop and menu, making the attachment choices invisible or untappable on the iOS WebView. The portal now uses z-index 110/111, above the active room surface while remaining below higher-priority application dialogs. Physical TestFlight verification remains pending after the redeploy.
- `2026-09-18-keyboard-composer-mode-copy-and-tooltip` | The composer now names the two input states as keyboard mode and voice mode: the keyboard-mode attachment menu offers `Switch to voice mode`, while the voice-mode keyboard control offers `Switch to keyboard mode`. The labels and image-attachment copy use the existing 15-primary-locale resolver pattern instead of the previous Korean/Japanese/English-only helper. Tapping `+` prevents focus transfer and opens the menu from pointer-up, so the software keyboard stays visible like the send button. The attachment menu now reuses the message long-press tooltip's fixed portal, dimensions, rounded card, separators, typography, icons, shadow, and outside-dismiss behavior. Physical TestFlight verification remains pending after this redeploy.
