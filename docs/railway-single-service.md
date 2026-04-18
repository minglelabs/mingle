# Railway Single-Service Deployment

This document describes the new Railway path for running `mingle-app` and
`mingle-stt` inside one Railway service. It does not replace or modify the
current Vercel and Fly deployments.

## Architecture

- Railway builds from the repository root with `railway.json`.
- `Dockerfile.railway` installs, builds, and packages `mingle-app` and
  `mingle-stt`.
- `railway/start-single-service.mjs` starts both servers on internal ports:
  - `mingle-app`: `3000`
  - `mingle-stt`: `3001`
- The Railway-facing process listens on `$PORT`.
- HTTP traffic is proxied to `mingle-app`.
- WebSocket traffic under `/stt` is proxied to `mingle-stt`.
- `/railway/health` returns `200` only when both internal ports are accepting
  connections.

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

Leave `NEXT_PUBLIC_WS_URL` unset for this single-service deployment. The web
client uses `NEXT_PUBLIC_WS_PATH=/stt`, so the browser connects to the same
Railway domain with `wss://<domain>/stt`.

## Database Migration

This change does not add a Prisma migration. When the Railway database is ready,
apply the existing migrations to the Railway database before production traffic
is switched:

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
