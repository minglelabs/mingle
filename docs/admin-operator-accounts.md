# Admin operator accounts

Staff use `/admin` to manage clearly labeled Mingle-run accounts from a phone or desktop. Account creation, posts, replies, and alert settings are available in the bottom navigation. Operator accounts have no login credentials or push tokens; staff keep their own admin session and app account.

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
