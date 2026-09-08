# Railway Single-Service Deployment

This document describes the new Railway path for running `mingle-app`,
`mingle-stt`, and `mingle-messaging` inside one Railway service. It does not
replace or modify the current Vercel and Fly deployments.

## Architecture

- Railway builds from the repository root with `railway.json`.
- `Dockerfile.railway` installs, builds, and packages `mingle-app`,
  `mingle-stt`, and `mingle-messaging`.
- `railway/start-single-service.mjs` starts all three servers on internal ports:
  - `mingle-app`: `3000`
  - `mingle-stt`: `3001`
  - `mingle-messaging`: `3002`
- The Railway-facing process listens on `$PORT`.
- HTTP traffic is proxied to `mingle-app`.
- WebSocket traffic under `/stt` is proxied to `mingle-stt`.
- WebSocket traffic under `/conversation-events` and the matching publish
  endpoint are proxied to `mingle-messaging`.
- `/railway/health` returns `200` only when all three internal ports are
  accepting connections.

## Railway Service Setup

Create a new Railway service from the GitHub repository and keep the service
root at the repository root. Railway will read the root `railway.json`, use the
non-standard Dockerfile path `Dockerfile.railway`, and start
`node railway/start-single-service.mjs`.

Do not point the existing Vercel or Fly projects at this branch while testing
the Railway migration.

## Required Variables

Set these variables on the new Railway service before promoting it:

```text
DATABASE_URL=
AUTH_SECRET=
NEXTAUTH_URL=https://${{RAILWAY_PUBLIC_DOMAIN}}
NEXT_PUBLIC_SITE_URL=https://${{RAILWAY_PUBLIC_DOMAIN}}
NEXT_PUBLIC_WS_PATH=/stt
MINGLE_STT_WS_PATH=/stt
MINGLE_MESSAGING_WS_PATH=/conversation-events
MINGLE_MESSAGING_PUBLISH_PATH=/conversation-events/publish
MINGLE_MESSAGING_URL=http://127.0.0.1:3002
MINGLE_REALTIME_SECRET=
SONIOX_API_KEY=
TRANSLATE_PROVIDER=gemini
```

Add the OAuth, email, translation, and client version policy variables that
match the current production environment:

```text
AUTH_GOOGLE_ID=
AUTH_GOOGLE_SECRET=
AUTH_APPLE_ID=
AUTH_APPLE_SECRET=
AUTH_APPLE_TEAM_ID=
AUTH_APPLE_KEY_ID=
AUTH_APPLE_PRIVATE_KEY=
AUTH_APPLE_NATIVE_AUDIENCES=
RESEND_API_KEY=
RESEND_FROM_EMAIL=
OPENROUTER_API_KEY=
TOGETHER_API_KEY=
DASHSCOPE_API_KEY=
IOS_CLIENT_MIN_SUPPORTED_VERSION=
IOS_CLIENT_RECOMMENDED_BELOW_VERSION=
IOS_CLIENT_LATEST_VERSION=
ANDROID_CLIENT_MIN_SUPPORTED_VERSION=
ANDROID_CLIENT_RECOMMENDED_BELOW_VERSION=
ANDROID_CLIENT_LATEST_VERSION=
RN_ADMOB_BANNER_UNIT_ID_IOS=
RN_ADMOB_BANNER_UNIT_ID_ANDROID=
```

Leave `NEXT_PUBLIC_WS_URL` and `NEXT_PUBLIC_MESSAGING_WS_URL` unset for this
single-service deployment. The web client uses `NEXT_PUBLIC_WS_PATH=/stt` for
STT and derives the messaging WebSocket from the same Railway domain at
`wss://<domain>/conversation-events`.

## Database Migration

The admin dashboard daily snapshot cache adds the
`20260816120000_add_admin_dashboard_daily_metrics` Prisma migration. Apply all
pending migrations to the Railway database before production traffic is switched:

```bash
railway run pnpm --dir mingle-app db:migrate:deploy
```

The `db:migrate:deploy` script wraps Prisma with the existing local environment
loader, which preserves the app schema parameter behavior.

## Release Namespace Policy

The web deployment can keep `NEXT_PUBLIC_API_NAMESPACE` empty. For mobile
release builds, keep the mobile app version and API namespace aligned. For
example, app version `1.1.2` must use `ios/v1.1.2` and `android/v1.1.2`.

## Smoke Checks

After Railway deploys the service and a public domain is generated:

```bash
curl -fsS https://<railway-domain>/railway/health
```

Then verify the browser app can open an STT session. The expected WebSocket
endpoint is:

```text
wss://<railway-domain>/stt
```

The conversation realtime endpoint is:

```text
wss://<railway-domain>/conversation-events
```

## PR 219: Conversation Photos and Biography Translation

Before merging the feature branch into the automatically deployed branch:

1. Create a dedicated R2 bucket for conversation photos in the existing R2 account.
   Keep **Public Development URL (r2.dev) disabled**, attach **no custom domains**,
   and do not expose this bucket through a public Worker. Do not disable the public
   profile bucket; profile photos still use its public URLs.
2. Set `CLOUDFLARE_R2_CONVERSATION_BUCKET_NAME` on the web server and the selected
   devbox Vault record when testing locally. `R2_CONVERSATION_BUCKET_NAME` is an
   accepted alias. The bucket must differ from both public profile bucket settings.
   Existing `CLOUDFLARE_R2_ACCOUNT_ID`, `CLOUDFLARE_R2_ACCESS_KEY_ID`, and
   `CLOUDFLARE_R2_SECRET_ACCESS_KEY` (or their `R2_*` aliases) are reused. Ensure the
   credential grants object read/write/delete access to the new bucket. A credential
   scoped only to the profile bucket must be updated before photo testing.
3. Confirm the existing `GEMINI_API_KEY` is configured for biography translations.
   Apply the pending Prisma migrations to the target database before web deployment:
   `20260908135150_add_message_reactions` and
   `20260908144017_add_profile_bio_translations`. The build generates Prisma Client
   but does not apply migrations. Use the production `db:migrate:deploy` procedure
   above; do not replay SQL already applied manually without reconciling migration
   history. These review fixes add no third migration.
4. Upload a generated test photo through the authenticated app. Verify a second
   room member can view it, outsiders/anonymous app requests cannot, and the new
   bucket has no anonymous object-serving endpoint. Verify photo arrival generates
   a notification on a backgrounded device with existing APNs/FCM configuration.
   Retrying the same client message ID must not generate another notification.
5. Include the iOS photo-library usage description in the next native build and
   test the actual picker on iOS and Android. Any mobile marketing-version change
   must retain the matching platform API namespace.

Conversation photo reads, writes, and deletes use only the private bucket. There
is no public-bucket fallback or client-visible storage URL. Missing private
configuration, or selecting the known public bucket, fails closed with HTTP 503.
The application cannot infer all Cloudflare public routes from S3 credentials;
private bucket access settings must be verified as part of provisioning. If an
earlier experimental build stored persistent conversation images in the public
bucket, copy those exact object keys into the private bucket, verify authenticated
reads, and remove the public originals (and any cached copies) before exposure.
Changing an environment variable alone does not make old public objects private.

Photo push delivery uses the existing conversation-message APNs/FCM helper after
the response, so provider delays/failures do not change a saved photo into a failed
send. Only the request that inserted the message schedules notification; matching
retries and concurrent losing requests do not send it again. As with existing
notifications, this is best-effort delivery, not a durable notification outbox.
