# Admin operator accounts

Staff use `/admin` to manage clearly labeled Mingle-run accounts from a phone or desktop. Inbox, notifications, account creation, posts, and alert settings are available in the navigation: a bottom tab bar on a phone, a left rail on a wide screen (1024 px and up). Operator accounts have no login credentials or push tokens; staff keep their own admin session and app account.

## Access and setup

- Configure `MINGLE_ADMIN_USERNAME` and `MINGLE_ADMIN_PASSWORD` through the existing secret configuration.
- Apply the checked-in migrations, including `20260930190000_add_admin_operator_accounts`, to the intended database before deploying this branch. Always inspect the database hostname first. Development uses the local `mingle` database and `app` schema.
- Admin sessions last 30 days. Logging out revokes the session immediately. Old admin cookies require a fresh login after this release.
- The default successful login opens `/admin/inbox`. A notification can instead return to the selected inbox conversation after login.
- AI persona drafts use `GEMINI_API_KEY`. Message, post, and profile translations use the existing translation configuration.
- Profile photos and post photos use the existing image storage configuration. Each upload is a separate request; JPEG, PNG, and WebP are supported. HEIC files must be converted before uploading.

## Create and edit accounts

Open **Accounts**, then create a batch of profile drafts. Choose the countries, age range, and count. Review and edit the generated name, handle, city, primary language, and bio before creating the accounts. Upload profile photos individually or assign a selected set to the created accounts.

Every account is marked as run by Mingle. Public profiles show the age calculated from the saved birth date, without exposing the birth date itself. Location coordinates come from the country/city catalog. Account creation does not send welcome messages or manufacture follows, likes, or views.

Approved source bios are saved when accounts are created. Bio versioning and translation run with concurrency two; if a process restart interrupts that queue, save the bio again to retry its translation.

## Read and reply

Open **Inbox** to see conversations with operator accounts, optionally filtered by account. Open a conversation and choose the operator when more than one is present. The conversation reuses the application's message bubbles and photo rendering. Staff can request an admin-only Korean translation; that translation does not become part of the user-facing conversation.

Replies are sent as the selected operator while the staff member retains their own session. The source text is converted into the operator's primary language, with other conversation languages translated separately. A failed primary-language translation must be retried rather than publishing the staff draft as the operator's source.

The inbox refreshes through the messaging service when configured, with a polling fallback. Its unread count appears on the bottom tab. Rooms with operator members include a disclosure notice, and account labels appear throughout public profiles, feed, comments, notifications, and conversation surfaces.

## Notifications and comment replies

Open **알림** to see every operator account's notifications in one list: follows, post likes, comments, replies, and comment likes from real users, newest first. Filter by account with the chips; each chip and the tab show the unread count. Activity between two operator accounts is left out. **모두 읽음** marks the listed notifications read (for the filtered account, or all).

Selecting a comment or like opens the post's thread as the operator that received it. Opening a thread marks that operator's notifications for the post read. Staff can comment on the post or reply to any comment as that operator; when several operator accounts are in the thread, choose which one answers. The draft is converted into the operator's primary language before it is posted (a failed conversion posts nothing), then goes through the application's own comment path, including translations and the notification to the user. Comments are limited to 500 characters after conversion. Photos cannot be attached or viewed from this screen; a comment with a photo is marked as such.

A comment or reply from a real user to an operator account also sends a push to registered staff accounts, at most one per post every 20 seconds. Tapping it opens `/admin/activity/posts/<postId>`. Likes and follows only update the list.

## Wide-screen layout

From 1024 px, **인박스** and **알림** show the list on the left and the open conversation or thread on the right, each scrolling on its own; the list keeps its filter while conversations are opened. Below that width the same screens are a single column. The other screens are single-column at every width.

These two sections were added on 2026-10-02 with unit and server-render tests only; they have not been exercised in a browser or on a device.

## AI auto-reply

Open **More → AI 자동 답장** to let the AI answer inbox conversations staff did not get to. Turn it on and set the wait in minutes (N, 1 to 1440; default 5). It is off until staff turn it on, and it needs migration `20261002150000_add_admin_settings` (table `app_admin_settings`).

A one-to-one conversation whose latest message is from a real user and has waited N minutes gets one reply as its operator account. The model (`gemini-3.5-flash-lite`, overridable with `OPERATOR_AUTO_REPLY_MODEL`, key `GEMINI_API_KEY`) receives only that account's profile, up to 20 of its posts, and the conversation's last 30 messages. It writes in the operator's primary language; the reply then goes through the same send path as a staff reply, including translations.

Only messages that arrive after auto-reply was turned on are answered, never ones older than 24 hours, and never group or blocked conversations. A staff reply before the wait ends cancels the AI reply. The model is told not to exchange contact details or agree to meet, and to leave harassment, sexual content and anything needing a human unanswered; those stay for staff. A message that fails three times is also left for staff. The conversation stays unread in the inbox after an AI reply, and each AI reply is written to the audit log as `inbox.auto_reply`.

The worker runs in the Node server process every 30 seconds (`MINGLE_OPERATOR_AUTO_REPLY_WORKER=off` keeps it from starting), so a reply goes out up to 30 seconds after the wait ends. Added on 2026-10-02 with unit tests only: the candidate query has not run against a database and no real model call was made.

## Seeding accounts and the post reserve

Open **More → 계정 대량 생성** to create many accounts from a per-country plan. The default is 100 accounts centered on Korea and Japan (22 each) with the rest spread over the other persona countries; every count is editable. It calls the same draft and create endpoints as the wizard, ten accounts at a time, without the review step, and runs in the open tab. Profile photos are not created.

Open **More → 잠재 글** to keep each account posting on its own. It is off until staff turn it on, and needs migrations `20261002150000_add_admin_settings` and `20261003090000_add_operator_post_reserve`. Settings: posts kept waiting per account (default 200) and the share released per day (default 1%, i.e. two posts per account per day).

While on, a worker in the Node server process runs every 60 seconds (`MINGLE_OPERATOR_POST_RESERVE_WORKER=off` keeps it from starting):

- Refill: up to three accounts below the target each get 20 new text posts per run, written by the model (`gemini-3.8-flash`, override with `OPERATOR_POST_RESERVE_MODEL`) from the account's profile in its primary language. The server assigns each post a topic and a shape (fragment, one-liner, outburst, bare question, a few lines, short story, list) and each account a fixed voice (register, laughter, emoji, punctuation), because the model left alone writes every post as the same tidy sentence; posts with links, contact details, hashtags or the app name are dropped, as are repeats. The model is told to avoid anything date-dependent because a post may go out months later. Filling 100 accounts to 200 takes roughly five to six hours.
- Release: each account's next post gets a time one jittered gap after its previous post (24 h divided by posts per day, 60-140%), moved out of the persona country's night (00:00-08:00 local). Due posts go through the application's own publish path and are audited as `operator_post.reserve_published`. A released post is replaced by the next refill, so posting continues indefinitely.

These posts are separate from the staff queue in **Posts** and do not count against its 500-item cap. Added on 2026-10-03 with unit tests only: the SQL has not run against a database and no real model call was made.

## Automatic generation and AI profile photos

Open **More → 자동 생성** for every automatic rule and its manual counterpart. Both rules are off until staff turn them on and need migration `20261003120000_add_operator_avatar_spec` in addition to the settings table. A worker in the Node server process applies them every 60 seconds (`MINGLE_OPERATOR_AUTOMATION_WORKER=off` keeps it from starting).

- Profile photos: one AI photo every N minutes (default 10) for the oldest active account without a photo.
- Accounts: N new accounts per day (default 5), evenly spaced, until the number of active operator accounts reaches the target (default 100). Each new account comes from the country furthest below its share of the default seed plan and is created without review.
- Latent posts keep their own rule under **잠재 글**.

The manual buttons on the same page run one unit at a time from the open tab, whether or not the rule is on: photos for accounts without one, new accounts, and a refill of latent posts. **More → 사진 검수** shows every account's photo in a grid with a regenerate button, and a button that publishes one of the account's latent posts immediately.

A photo is drawn from a spec the server picks (`src/server/operator-avatars/taxonomy.ts`); the image model (`gpt-image-2` at `low` quality, about $0.006 a photo, key `OPENAI_API_KEY`; override with `OPERATOR_AVATAR_IMAGE_MODEL` and `OPERATOR_AVATAR_IMAGE_QUALITY`; a `gemini-*` model name switches to Gemini with `GEMINI_API_KEY`) only renders it. The spec fixes the kind of photo (face 27, partly hidden face 14, from behind 11, body without face 13, hands or feet 5, several people 5, object 12, animal 8, scenery 4, other 1; East Asian accounts hide the face more, Western and Latin American ones less; bio keywords such as a cat or the gym shift it), then appearance, build, outfit, pose, how it was shot, light and place, all consistent with the account's gender, age, country and city. People are always adults in everyday or sports clothing. The spec is stored on the account (`avatar_spec`), and the image goes through the same re-encode and audit as a staff upload. A refused or failed image leaves the account without a photo; after three failures in one process the automatic rule skips that account.

New accounts store the persona gender (`persona_gender`); for older accounts it is read from the creation audit row, and when unknown the prompt lets the name decide.

Added on 2026-10-03 with unit tests only: no image was generated, and the default image model name has not been checked against the API.

## Staff alerts

Open **More → Notification settings** and add the handle of your own Mingle account. Sign into that account on the phone and allow notifications. Operator accounts cannot be alert targets.

Incoming messages trigger an inbox update and a push to registered staff accounts. Pushes are coalesced to at most one per conversation every 20 seconds. Tapping a staff alert opens `/admin/inbox/<conversationId>` inside the app; its separate admin login may be required.

## Bulk posts and schedules

Open **Posts**, choose an operator for each item, and add text or a photo. Review the primary-language conversion before submitting. The default schedule spreads the batch over six hours, keeping at least 30 minutes between an operator's posts. Immediate publication and a specified time are explicit choices.

Scheduling creates jobs rather than posts with future publication dates. The background worker claims due jobs and calls the same publication service as the app. Batch detail pages show progress and errors, link to published posts, and allow cancellation of queued items.

The worker runs in the Node server process at 60-second intervals. Set `MINGLE_OPERATOR_POST_WORKER=off` to disable it; do not disable it when scheduled publication is required. The host must keep a Node instance running for due jobs to publish. Failed jobs retry with backoff and eventually surface as failed for staff review.

## Validation before release

Run the web unit/script suites, React Native tests, messaging tests, and type checks on the integrated branch. Verify the migration state on the local database. Code tests do not establish device push delivery, iOS keyboard/photo behavior, image storage, or real AI output quality.

The integrated branch was checked on 2026-09-30:

- Web: 3,832 unit tests and six script tests passed; TypeScript and the production Next.js build passed.
- React Native: 133 tests passed. Messaging service: 27 tests passed.
- Real local PostgreSQL: four inbox tests and five post-job tests passed against an isolated schema-only copy of the local database. They cover membership and unread queries, due-job claims, concurrent claims, queue-cap reservations, per-operator scheduling, and cancellation. The fixture database was removed after validation.
- Local migration `20260930190000_add_admin_operator_accounts` is already applied. No devbox server, remote database migration, deployment, or main-branch merge was performed.

The PostgreSQL checks caught a batch-creation failure that mocked unit tests missed: Prisma cannot deserialize the advisory lock's `void` result. The lock query now casts that result to text while retaining its transaction-scoped lock.

Device acceptance requires two app accounts and a clearly labeled operator account: create/edit its profile, inspect public age and badge disclosures, send text and photos to it, read/reply from admin, verify staff push navigation, publish a batch, cancel a queued item, and check feed/profile ordering. Run this against a development environment before merging and deployment.
