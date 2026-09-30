# Photo translation verification

Verified on 2026-09-30 in `feat/photo-translation-overlay`, using this worktree's devbox at `http://localhost:15998`. Only local fixtures and the local PostgreSQL database were used. Production was not deployed or modified.

## Automated checks

- `pnpm test`: 215 Vitest files, 2,299 tests and 6 script tests passed after applying mockup B.
- `pnpm exec tsc --noEmit`: passed.
- ESLint for changed TypeScript files and `git diff --check`: passed.
- iOS and Android app/API namespaces remain aligned at 2.1.0. Photo-text routes also support the existing 2.0.0 namespaces.

## Live results

The fixture room had two active members and Japanese, Korean and English room languages. Its test viewer completed normal onboarding before opening the room. Photos were sent through the authenticated application endpoint, stored in private conversation image storage, processed by real Gemini requests, and viewed in Chrome at a mobile viewport.

| Scenario | Result | Evidence |
| --- | --- | --- |
| Japanese photo upload and translation | PASS | POST 201; OCR ready with six blocks; Korean and English each ready with six translations in about 7.3 seconds. OCR used Gemini 3.8 Flash and translation used Gemini 3.5 Flash Lite. |
| API parity and access | PASS | Unversioned, iOS 2.1.0 and Android 2.0.0 GETs returned identical bodies and `Cache-Control: private, no-store`. Invalid language returned 400; a non-member returned 404. |
| Mockup B | PASS | White translated text on dark translucent labels; centered bottom control and cycle dots. |
| Cycle and hold menu | PASS | Korean → English → Original → Korean. Japanese disabled as matching the original; hold and drag-release selected English. |
| Remember selection | PASS | English remained selected after closing and reopening the photo. |
| Zoom and dismissal | PASS | Translated labels stayed aligned during double-click zoom; downward swipe closed the viewer. |
| Fresh photo, viewer kept open | PASS | At 1.6 seconds no control/blocks; at 6.2 seconds the Korean control showed a spinner; at 7.7 seconds eight translated blocks appeared and the spinner stopped. |
| Text-free photo | PASS | OCR returned `empty` in 3.6 seconds; no translation control or overlay. |
| Existing photo, lazy OCR | PASS | Removing only its fixture OCR row and reopening triggered GET-based OCR; six blocks appeared by 4.7 seconds. |
| Rotated text | PASS | Real photo POST 201; Korean ready in about 6 seconds. Five translated labels followed the rotated blocks; a Korean-source block remained unpainted. |
| Browser errors | PASS | No browser exceptions or errors; unrelated development warnings were excluded. |
| Kill switch | UNIT ONLY | Covered by unit tests; the live server was not restarted solely to exercise it. |
| Physical devices | NOT RUN | Chrome viewport results do not establish native touch or device acceptance. |

## Visual follow-up

The first English rendering of a narrow Japanese vertical banner split “Today's Special” into short fragments. Non-CJK translations of unrotated vertical blocks now use compact horizontal labels, bounded by photo edges and sibling OCR boxes. An exact-box regression and the relevant geometry/UI tests passed (53 tests); browser recapture confirmed intact “Today's” / “Special” words without overlap. CJK vertical text is unchanged.

## Self-review corrections (2026-09-30 follow-up)

- The viewer's polling budget is now 240 seconds, longer than the server's 90-second image-text job lease. The 12-second request timeout remains separate. This gives an abandoned claim time to expire and be reclaimed; it does not guarantee that the server queue finishes within the client polling window. When polling ends, local pending work becomes failed while already-ready OCR blocks and translations stay available. Reopening retries pending or failed cached work; a fully settled response still skips another request.
- Response and selection snapshots are keyed by API namespace, viewer account, conversation and message. A render that switches from account A to B now resolves B's cache synchronously, or `null` when B has no cached response, so A's photo text or selection cannot flash. Regression coverage uses distinct A and B response objects and translated text, checks `A !== B`, verifies the uncached-B and same-key snapshot cases, and confirms no extra cache read for the matching key.
- The six targeted photo-translation test files passed (103 tests); ESLint on the changed regression test and `pnpm exec tsc --noEmit` passed. This follow-up ran no new live API, browser harness, or physical-device tests. The live and visual results above are from the earlier verification run.

## Local environment and migration

The original devbox process lacked the private conversation image storage settings and returned `image_upload_failed`. A temporary ignored, mode-0600 `mingle-app/.env.local` supplied selected local runtime settings; its database target was checked as `127.0.0.1:5432/mingle`, schema `app`. Devbox was restarted through `scripts/devbox`; no Vault record was changed.

After verification, `scripts/devbox down` stopped this worktree's services. Ports 15998, 17998 and 19998 had no listeners, and the temporary environment file was removed. Fixture data and screenshots remain outside the cleanup of runtime settings.

Local `prisma migrate status` reported all 73 migrations applied, including `20260930085059_add_message_image_texts`.

The feature migration was originally generated with `migrate diff` because historical shadow replay fails on `CREATE INDEX CONCURRENTLY`. This continuation independently used a squashed pre-feature baseline in two newly created loopback scratch databases and successfully ran `prisma migrate dev --name add_photo_text_translation`. The generated delta matched the checked-in SQL after removing comments, schema qualification and whitespace. Both scratch databases were dropped; the shared database's migration checksum and checked-in migration were preserved. This verifies the feature delta, not replay of the entire historical migration directory.

## Deployment

Apply `20260930085059_add_message_image_texts` before deploying the application. It adds two tables, one index and two cascading foreign keys. Configure private conversation image storage and the Gemini key in the application runtime. Set `CONVERSATION_IMAGE_TEXT_ENABLED=false` to disable processing.

The privacy policy now explains transmission of photos and recognized text to Gemini, storage of extracted blocks and translations, and the current retention behavior when history is cleared or an account is closed. There is no claim that hiding a message deletes its stored photo or translation records.

## Local evidence

Screenshots and fixture scripts are kept outside Git under `/Users/nam/mingle/.kiro/tmp/photo-translate/e2e/`. Representative screenshots: `photo-translation-ko.png`, `photo-translation-menu.png`, `photo-translation-zoom-en.png`, `fresh-poster-pending.png`, `fresh-poster-ready.png`, `empty-photo-no-pill.png`, `rotated-photo-translation.png`, and `lazy-photo-ready.png`.

The isolated migration report and generated SQL are under `/Users/nam/.kiro/tmp/photo-translate/migrate-dev-repro-20260930/`.
