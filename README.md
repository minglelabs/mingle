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

## Worktree Local Test Automation (mingle-app + mingle-stt + mingle-messaging)

To automatically isolate local test environments per branch and worktree:

```bash
scripts/devbox init
# Bootstrap shared root values and service env values into Vault, then install deps
scripts/devbox bootstrap
# Reboot recovery: start local Vault and seed the main root/service env values
scripts/devbox vault-up --seed
# Optional: override the shared Vault path used by bootstrap
# scripts/devbox bootstrap --vault-path secret/mingle/dev
scripts/devbox up --profile local
scripts/devbox up --profile device
scripts/devbox up --profile device --tunnel-provider cloudflare
# cloudflare named tunnel (fixed hostname) - reads shared values from the
# main worktree root .env.local or Vault
# scripts/devbox up --profile device --tunnel-provider cloudflare
scripts/devbox up --profile device --device-app-env dev
scripts/devbox up --profile device --device-app-env prod --with-ios-install --with-ios-clean-install --ios-configuration Release
# Build and install mobile apps too when a connected test phone is available
# scripts/devbox up --profile device --with-mobile-install
# Install only iOS
# scripts/devbox up --profile device --with-ios-install
# Archive/export an RN iOS IPA for App Store or TestFlight
# scripts/devbox ios-rn-ipa --device-app-env prod
# scripts/devbox ios-rn-ipa-prod
# Write full logs to a file
# scripts/devbox --log-file auto up --profile device --with-ios-install
# Tests
scripts/devbox test --target app
# Live STT integration tests require an explicit flag
# scripts/devbox test --target app --with-live
scripts/devbox status
```

- Detailed guide: `docs/worktree-devbox.md`
- Railway single-service deployment guide: `docs/railway-single-service.md`
- `scripts/devbox bootstrap` does not modify `.env.local`, but it uploads shared values
  from the MAIN worktree root `.env.local` and service-specific values from
  `mingle-app/.env.local` / `mingle-stt/.env.local` / `mingle-messaging/.env.local`
  to the shared Vault record before installing dependencies.
  The `--vault-push` option is retained as a backward-compatible no-op.
- `scripts/devbox vault-up --seed` starts the local Homebrew Vault service and safely
  seeds/patches the same MAIN root/service env values into `secret/mingle/dev`.
- The three local services share one development Vault record: `secret/mingle/dev`.
  Production mobile URL overrides remain separate in `secret/mingle/prod`.
- If a target path does not exist yet, devbox creates it once with `kv put`.
  If the path already exists, devbox keeps using `kv patch` and refuses destructive overwrite fallback.
- If Vault CLI environment variables (`VAULT_ADDR`, `VAULT_NAMESPACE`) exist in the MAIN
  worktree root `.env.local` (or the service env files), devbox automatically picks them up.
- `scripts/devbox gateway --mode dev|run` integrates gateway execution from `/Users/nam/openclaw` into devbox commands.
- Devbox keeps only worktree-local runtime settings in `.devbox.env`; persistent shared settings
  (Cloudflare token/hostnames, fallback URLs, AdMob IDs, the shared Vault path, Team ID, and machine-wide
  paths) belong in the MAIN worktree root `.env.local` and Vault. Service `.env.local` files
  remain for service-specific values and are only legacy fallbacks for shared keys.
- Frontend and app build entrypoints read the main root `.env.local` for shared values and `.devbox.env`
  for worktree URLs/ports, so `pnpm dev`, `pnpm build`, `pnpm start`, React Native Android builds,
  and RN iOS flows resolve the current worktree runtime without duplicating shared settings.
- `scripts/devbox up`, `init`, and `mobile` do not upload or synchronize `.env.local`; `bootstrap`
  is the explicit main-root/service-env-to-Vault synchronization step.
- If a saved Vault path exists, `scripts/devbox up` injects unmanaged keys (such as API keys)
  into the server process environment at runtime without writing them to files.
- `--profile device` automatically applies real-device test URLs, including ngrok (`devbox_web` / `devbox_stt` / `devbox_messaging`).
- `--tunnel-provider cloudflare` configures HTTPS/WSS through a Cloudflare tunnel instead of ngrok.
  - If `DEVBOX_CLOUDFLARE_TUNNEL_TOKEN`, `DEVBOX_CLOUDFLARE_WEB_HOSTNAME`, `DEVBOX_CLOUDFLARE_STT_HOSTNAME`, and `DEVBOX_CLOUDFLARE_MESSAGING_HOSTNAME` are present in the main root `.env.local` or Vault, it runs in **named tunnel (fixed host)** mode.
  - Without those settings, it falls back to the existing Quick Tunnel (`*.trycloudflare.com`) mode.
- With `--profile device`, `--device-app-env dev|prod` reads mobile app build URLs from
  `secret/mingle/dev` or `secret/mingle/prod` and injects them.
  This supports the current RN mobile URL keys.
  `--device-app-env prod` skips ngrok and local server startup during `up`.
- Each worktree uses a separate ngrok inspector port (`DEVBOX_NGROK_API_PORT`) to reduce collisions during concurrent runs.
- `--profile device` only allows `https` / `wss` tunnels that match the current worktree ports.
- `scripts/devbox up` automatically runs `init` if `.devbox.env` does not exist.
- `scripts/devbox up --profile device` runs ngrok in a separate terminal tab or panel when possible,
  and automatically falls back to inline execution when that is not possible.
- `scripts/devbox --log-file PATH up ...` writes full devbox stdout/stderr to a file.
  If `PATH` is relative, it is resolved from the repository root.
  If you pass `auto`, it creates a timestamped file under `.devbox-logs/`.
  When ngrok runs in a separate terminal, check ngrok logs there.
  The `.devbox-logs/` directory is gitignored so logs are not committed.
- `scripts/devbox mobile --platform ios|android|all` automates RN app build and installation when a device is connected.
- `scripts/devbox ios-rn-ipa --device-app-env prod` or `scripts/devbox ios-rn-ipa-prod`
  creates RN iOS `.xcarchive` / `.ipa` artifacts for App Store upload.
  These commands also work without `.devbox.env` (recommended: `--device-app-env`, `--site-url`, `--ws-url`),
  and URLs can be read from Vault, `.env.local`, or shell environment variables.
  To pin the Team ID, set `DEVBOX_IOS_TEAM_ID=3RFBMN8TKZ` in the MAIN worktree root `.env.local`
  and let `scripts/devbox bootstrap` synchronize it to Vault.
- `scripts/devbox up --profile device --with-mobile-install` prepares the server and installs the mobile app in one run.
- For `scripts/devbox test --target app`, the `app` target runs unit tests only by default.
  Live tests run only when `--with-live` is provided.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## License

This repository is licensed under the GNU General Public License v3.0 (GPL-3.0-only). See `LICENSE`.
