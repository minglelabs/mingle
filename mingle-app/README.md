This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Live STT/API Integration Test (opt-in)

`pnpm test` runs unit tests only by default.
Live integration tests run only when explicitly invoked:

1. Streams an audio fixture to local STT WebSocket server
2. Sends the finalized transcript to `/api/translate/finalize` (or `/api/ios/v1.0.11/translate/finalize`)

Useful commands:

- `pnpm test` (unit only, default)
- `pnpm test:unit` (unit only, excludes live integration)
- `pnpm test:live` (all live `.live.test.ts` only, opt-in)
- `pnpm test:all` (unit + live integration)

Default local endpoints:

- STT WS: `ws://127.0.0.1:3001`
- API: `http://127.0.0.1:3000`

Default audio fixture path:

- `test-fixtures/audio/fixtures/`
- `test-fixtures/audio/local/` (git ignored local fixtures)

You can override paths/endpoints with env vars:

```bash
MINGLE_TEST_AUDIO_FIXTURE=/absolute/path/to/file.wav
MINGLE_TEST_AUDIO_FIXTURE_DIR=/absolute/path/to/fixtures-dir
MINGLE_TEST_WS_URL=ws://127.0.0.1:3001
MINGLE_TEST_API_BASE_URL=http://127.0.0.1:3000
MINGLE_TEST_API_NAMESPACE=
MINGLE_TEST_EXPECTED_PHRASE="hello mingle"
MINGLE_TEST_TARGET_LANGUAGES=ko,en
MINGLE_TEST_TTS_LANGUAGE=ko
MINGLE_TEST_TTS_OUTPUT_DIR=/absolute/path/to/tts-output
```

## API Namespace (Release Routing)

The client determines API routes through `NEXT_PUBLIC_API_NAMESPACE` without runtime branching.

- Default (legacy): empty value (`''`) -> `/api/{existing-path}`
- iOS versioned: `ios/v1.0.11` -> `/api/ios/v1.0.11/{existing-path}`
- Android versioned: `android/v1.0.11` -> `/api/android/v1.0.11/{existing-path}`
- Previous mobile namespaces remain allow-listed for backward compatibility.

Release build commands:

```bash
pnpm build:release:web
pnpm build:release:ios
pnpm build:release:android
```

URL override (optional):

- The browser URL query `apiNamespace` (or `apiNs`) is applied only when it matches the allow-list.
- Allowed values: `''`, `ios/v1.0.0`, `android/v1.0.0`, `ios/v1.0.2`, `android/v1.0.2`, `ios/v1.0.3`, `android/v1.0.3`, `ios/v1.0.4`, `android/v1.0.4`, `ios/v1.0.5`, `android/v1.0.5`, `ios/v1.0.7`, `android/v1.0.7`, `ios/v1.0.8`, `android/v1.0.8`, `ios/v1.0.9`, `android/v1.0.9`, `ios/v1.0.11`, `android/v1.0.11`
- Example: `https://your-app/ko?apiNamespace=android/v1.0.11`
- Unsupported values are ignored, and the env/default value is used instead.

### Client Version Policy

- On app launch, the client calls `POST /api/client/version-policy` or the platform namespace route.
- Namespace examples:
  - iOS: `POST /api/ios/v1.0.11/client/version-policy`
  - Android: `POST /api/android/v1.0.11/client/version-policy`
- Request fields: `clientVersion` (`x.y.z`), `clientBuild`
- Optional request field: `platform` (`ios` | `android`, defaults to `ios` when omitted)
- Server env:
  - iOS: `IOS_CLIENT_MIN_SUPPORTED_VERSION`, `IOS_CLIENT_RECOMMENDED_BELOW_VERSION`, `IOS_CLIENT_LATEST_VERSION`, `IOS_APPSTORE_URL`
  - Android: `ANDROID_CLIENT_MIN_SUPPORTED_VERSION`, `ANDROID_CLIENT_RECOMMENDED_BELOW_VERSION`, `ANDROID_CLIENT_LATEST_VERSION`, `ANDROID_PLAYSTORE_URL`
  - Optional AdMob banner overrides: `RN_ADMOB_BANNER_UNIT_ID_IOS`, `RN_ADMOB_BANNER_UNIT_ID_ANDROID`
- Fallback behavior:
  - If Android env is missing, the API falls back to the iOS env once.
  - If the required min version env is missing or has an invalid semver, the API fails closed with `force_update`.
  - If the AdMob banner env is missing, the RN app keeps its built-in banner unit ID.
- Response `action`:
  - `force_update`: show a mandatory update screen
  - `recommend_update`: show a recommended update prompt
  - `none`: show nothing

Contract test commands:

```bash
# API namespace allow-list + route wiring
pnpm test:unit -- src/lib/api-contract.test.ts src/app/api/namespace-routing.contract.test.ts src/lib/rn-api-namespace.test.ts
```

Fixture scan behavior:

- Filenames inside the folders can be anything.
- `.wav` files (PCM16 / mono) are processed directly.
- Some formats, including `.m4a`, are transcoded with `ffmpeg` (or macOS `afconvert`) before processing.
- Files that fail transcoding or parsing are skipped with a warning, and the next file continues.
- If there are no candidate fixture files, fixture-dependent live suites are skipped automatically.
- If files exist but all of them are invalid, the test fails.
- Default audio streaming runs at realtime speed (`40ms chunk / 40ms delay`).

Translation/TTS behavior:

- If `source` is `en`, the default target is `ko`.
- If `source` is `ko`, the default target is `en`.
- For any other source, the default targets are `ko,en`.
- Test stdout prints the original Soniox transcript and the finalize translation results.
- If the finalize response includes TTS output, the audio file is saved to `test-fixtures/audio/local/tts-output/` (local only, gitignored).

### Translation Provider Configuration

`/api/{namespace}/translate/finalize` supports multiple translation backends through environment variables.

Default configuration:

- `TRANSLATE_PROVIDER=gemini`
- `GEMINI_API_KEY=...`
- optional `TRANSLATE_MODEL=gemini-2.5-flash-lite`

Qwen 3.5 9B via OpenRouter:

```bash
TRANSLATE_PROVIDER=qwen
TRANSLATE_MODEL=qwen/qwen3.5-9b
TRANSLATE_BASE_URL=https://openrouter.ai/api/v1
TRANSLATE_API_KEY=your_openrouter_key
```

Gemma 4 31B via Google Generative AI:

```bash
TRANSLATE_PROVIDER=gemma
TRANSLATE_MODEL=gemma-4-31b-it
GEMINI_API_KEY=your_google_ai_key
```

Qwen 3.5 9B via Together:

```bash
TRANSLATE_PROVIDER=qwen
TRANSLATE_MODEL=Qwen/Qwen3.5-9B
TRANSLATE_BASE_URL=https://api.together.xyz/v1
TRANSLATE_API_KEY=your_together_key
```

Qwen 3.5 9B via DashScope / Model Studio:

```bash
TRANSLATE_PROVIDER=qwen
TRANSLATE_MODEL=Qwen3.5-9B
TRANSLATE_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
TRANSLATE_API_KEY=your_dashscope_key
```

For Singapore / international DashScope, use:

```bash
TRANSLATE_PROVIDER=qwen
TRANSLATE_MODEL=Qwen3.5-9B
TRANSLATE_BASE_URL=https://dashscope-intl.aliyuncs.com/compatible-mode/v1
TRANSLATE_API_KEY=your_dashscope_key
```

Notes:

- When `TRANSLATE_PROVIDER=qwen`, the server automatically disables Qwen thinking mode by default.
- For DashScope, the handler sends `enable_thinking=false`.
- For OpenRouter, Together, vLLM, and SGLang style endpoints, the handler sends `chat_template_kwargs.enable_thinking=false`.
- You can override or extend the OpenAI-compatible request body with `TRANSLATE_EXTRA_BODY` as a JSON object.
- If `TRANSLATE_BASE_URL` and `TRANSLATE_API_KEY` are omitted, the server can infer them from `OPENROUTER_API_KEY`, `TOGETHER_API_KEY`, or `DASHSCOPE_API_KEY`.

### Live E2E suites

Suites executed by `pnpm test:live` (or `pnpm test:all`):

- `src/integration/live/stt-finalize.live.test.ts`
- `src/integration/live/e2e.stop-chain.live.test.ts`
- `src/integration/live/e2e.stop-ack-fallback.live.test.ts`
- `src/integration/live/e2e.finalize-fallback.live.test.ts`
- `src/integration/live/e2e.language-matrix.live.test.ts`
- `src/integration/live/e2e.soniox-endpoint-compat.live.test.ts`
- `src/integration/live/e2e.soniox-segmentation.live.test.ts`
- `src/integration/live/e2e.tts-artifact.live.test.ts`

Device-dependent optional suites (env flag required):

- `MINGLE_TEST_IOS_HEALTHCHECK=1` -> `e2e.ios-launch-healthcheck.live.test.ts`
- `MINGLE_TEST_IOS_TTS_EVENT_E2E=1` -> `e2e.ios-tts-event-order.live.test.ts`

Finalize fault-injection E2E notes:

- Live tests attach the `x-mingle-live-test: 1` header when requesting finalize fault modes.
- The API server allows forced `provider_empty`, `target_miss`, and `provider_error` modes only in non-production environments.

iOS launch healthcheck notes:

- Script: `scripts/e2e-ios-launch-healthcheck.sh`
- Required env: `MINGLE_TEST_IOS_UDID`
- Optional env: `MINGLE_TEST_IOS_BUNDLE_ID`, `MINGLE_TEST_IOS_INSTALL=1`, `MINGLE_TEST_IOS_APP_PATH`

Fixture requirements:

- WAV (RIFF/WAVE)
- PCM 16-bit
- mono (1 channel)

Audio fixture git policy:

- Commit one short sample under `test-fixtures/audio/fixtures/` for team-wide reproducibility.
- Keep personal or sensitive recordings under `test-fixtures/audio/local/` and out of git.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Authentication Setup

1. Copy `.env.example` to `.env.local`.
2. Fill in `AUTH_SECRET`.
3. Configure at least one OAuth provider:

Google OAuth:

- env: `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`
- callback URL:

```text
http://localhost:3000/api/auth/callback/google
```

Apple OAuth:

- env required:
  - `AUTH_APPLE_ID`
  - either `AUTH_APPLE_SECRET` directly
  - or (`AUTH_APPLE_TEAM_ID`, `AUTH_APPLE_KEY_ID`, `AUTH_APPLE_PRIVATE_KEY`)
- callback URL:

```text
http://localhost:3000/api/auth/callback/apple
```

Apple OAuth token issuance references:

- Service ID / client id: <https://developer.apple.com/account/resources/identifiers/list/serviceId>
- Sign in with Apple key (`.p8`) / key id: <https://developer.apple.com/account/resources/authkeys/list>
- Team ID: <https://developer.apple.com/account>
- Token API spec (client secret JWT): <https://developer.apple.com/documentation/signinwithapplerestapi/generate_and_validate_tokens>

Generate `AUTH_APPLE_SECRET` from `.p8` key env values:

```bash
pnpm auth:apple:secret
```

If both Apple and Google OAuth env vars are missing, no social sign-in provider is available.

## Database (Supabase, app schema)

This app is designed to share the same Postgres instance as `mingle-landing`,
but use a separate schema:

- `mingle-landing` -> `public`
- `mingle-app` -> `app`

Set `DATABASE_URL` with `?schema=app`:

```text
postgresql://USER:PASSWORD@HOST:6543/postgres?schema=app
```

If `DATABASE_URL` misses `schema`, app runtime automatically appends `schema=app`.
An explicit schema value (for example `schema=public`) is respected as-is.

Create Prisma artifacts:

```bash
pnpm db:generate
pnpm db:migrate:create
```

Reset local `app` schema via `psql` (drop + recreate + apply migrations):

```bash
pnpm db:reset:local:psql
```

`db:*` Prisma scripts load environment variables from `.env.local`.

Production build runs `prisma generate` first:

```bash
pnpm build
```

If you apply SQL manually to remote, use:

- `prisma/migrations/20260216173000_init_app_schema/migration.sql`
- `prisma/migrations/20260216191500_add_app_users_context_columns/migration.sql`
- `prisma/migrations/20260227204000_add_nextauth_tables_and_app_user_auth_columns/migration.sql`
- `prisma/migrations/20260227211000_add_client_version_policy_history/migration.sql`
- `prisma/migrations/20260227221000_add_native_auth_pending_results/migration.sql`
- `prisma/migrations/20260227232000_add_client_platform_to_version_policy_history/migration.sql`
- `prisma/migrations/20260302051000_add_email_password_auth_and_reset_tokens/migration.sql`

## React Native (mingle-app/rn)

`mingle-app` now also includes a dedicated RN workspace at `rn/`.

```bash
pnpm rn:install
pnpm rn:pods
pnpm rn:start
pnpm rn:ios
```

RN app URLs are never hardcoded and are read only from environment variables.

- `NEXT_PUBLIC_SITE_URL`
- `NEXT_PUBLIC_WS_URL`
- `NEXT_PUBLIC_API_NAMESPACE` (required on iOS: `ios/v1.0.11`)
- On iOS, if `NEXT_PUBLIC_API_NAMESPACE` does not match `ios/v1.0.11`, the app shows an error instead of loading the WebView.
- `RN_CLIENT_VERSION` (optional, fallback: `CFBundleShortVersionString`)
- `RN_CLIENT_BUILD` (optional, fallback: `CFBundleVersion`)

Server client version policy is managed through env values.

- iOS env:
  - `IOS_CLIENT_MIN_SUPPORTED_VERSION`
  - `IOS_CLIENT_RECOMMENDED_BELOW_VERSION`
  - `IOS_CLIENT_LATEST_VERSION`
  - `IOS_APPSTORE_URL`
- Android env:
  - `ANDROID_CLIENT_MIN_SUPPORTED_VERSION`
  - `ANDROID_CLIENT_RECOMMENDED_BELOW_VERSION`
  - `ANDROID_CLIENT_LATEST_VERSION`
  - `ANDROID_PLAYSTORE_URL`
- Safety behavior:
  - If the iOS min version env is missing or has an invalid semver, the API fails closed with `force_update`.
  - If Android env is empty, the API falls back to the iOS env once.
  - If `LATEST_VERSION` is empty or invalid, the API falls back to `RECOMMENDED_BELOW_VERSION`, then to `MIN_SUPPORTED_VERSION`.

Example (`.env.local`):

```bash
IOS_CLIENT_MIN_SUPPORTED_VERSION=1.0.0
IOS_CLIENT_RECOMMENDED_BELOW_VERSION=1.2.0
IOS_CLIENT_LATEST_VERSION=1.3.0
IOS_APPSTORE_URL=https://apps.apple.com/app/id6759795134

ANDROID_CLIENT_MIN_SUPPORTED_VERSION=2.0.0
ANDROID_CLIENT_RECOMMENDED_BELOW_VERSION=2.1.0
ANDROID_CLIENT_LATEST_VERSION=2.2.0
ANDROID_PLAYSTORE_URL=https://play.google.com/store/apps/details?id=com.minglelabs.mingle.rn
```

The root `pnpm rn:start|ios|android` scripts load `.env.local` first and then run the RN CLI.
`pnpm rn:ios` enforces `NEXT_PUBLIC_API_NAMESPACE=ios/v1.0.11` validation before launch.
`pnpm rn:android` enforces `NEXT_PUBLIC_API_NAMESPACE=android/v1.0.11` validation before launch.

- iOS native STT bridge lives in:
  - `rn/ios/mingle/NativeSTTModule.swift`
  - `rn/ios/mingle/NativeSTTModuleBridge.m`
- RN screen for basic STT verification:
  - `rn/App.tsx`

## Seed Data

```bash
pnpm seed:check
pnpm seed:populate
```

- Source file: `data/seed/mingle-seed.json`
- Export target: `public/seed/mingle-seed.json`

## Crawling Pipeline

```bash
pnpm crawl:instagram
```

- Input sample: `data/crawl/instagram-input.sample.json`
- Normalized output: `data/crawl/instagram-normalized.json`
