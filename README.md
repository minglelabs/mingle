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

## Worktree Local Test Automation (mingle-app + mingle-stt)

To automatically isolate local test environments per branch and worktree:

```bash
scripts/devbox init
scripts/devbox bootstrap
# Reboot recovery: start local Vault and seed missing dev paths from .env.local
scripts/devbox vault-up --seed
# Optional if you use Vault
# scripts/devbox bootstrap --vault-app-path secret/mingle-app/dev --vault-stt-path secret/mingle-stt/dev
# Optional if you want to upload `.env.local` values to Vault
# scripts/devbox bootstrap --vault-push
scripts/devbox up --profile local
scripts/devbox up --profile device
scripts/devbox up --profile device --tunnel-provider cloudflare
# cloudflare named tunnel (fixed hostname) - requires token+hostnames env
# export DEVBOX_CLOUDFLARE_TUNNEL_TOKEN="<token>"
# export DEVBOX_CLOUDFLARE_WEB_HOSTNAME="web-dev.example.com"
# export DEVBOX_CLOUDFLARE_STT_HOSTNAME="stt-dev.example.com"
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
- `scripts/devbox bootstrap` is read-only and does not modify `.env.local`.
  It only installs dependencies and runs validation checks.
  (If `@prisma/client` artifacts are missing, it automatically runs `db:generate`, and it also checks RN/Pods.)
- `scripts/devbox vault-up --seed` starts the local Homebrew Vault service and safely seeds
  missing Vault KV paths from `mingle-app/.env.local` and `mingle-stt/.env.local`.
- When using Vault, you can save `--vault-app-path` and `--vault-stt-path` for later reuse.
- `scripts/devbox bootstrap --vault-push` uploads unmanaged keys from
  `mingle-app/.env.local` and `mingle-stt/.env.local` to Vault.
  If the target path does not exist yet, devbox creates it once with `kv put`.
  If the path already exists, devbox keeps using `kv patch` and refuses destructive overwrite fallback.
- If Vault CLI environment variables (`VAULT_ADDR`, `VAULT_NAMESPACE`) exist in your shell (`.zshrc`) or in
  `mingle-app/.env.local` / `mingle-stt/.env.local`, devbox automatically picks them up.
- `scripts/devbox gateway --mode dev|run` integrates gateway execution from `/Users/nam/openclaw` into devbox commands.
- Devbox keeps worktree-local runtime settings in `.devbox.env` while leaving `.env.local` user-managed.
- Frontend and app build entrypoints also read `.devbox.env`, so `pnpm dev`, `pnpm build`, `pnpm start`,
  React Native Android builds, and RN iOS flows all resolve the current worktree URLs and namespaces.
- `scripts/devbox up`, `init`, `mobile`, and `bootstrap` do not auto-sync `.env.local`.
- If a saved Vault path exists, `scripts/devbox up` injects unmanaged keys (such as API keys)
  into the server process environment at runtime without writing them to files.
- `--profile device` automatically applies real-device test URLs, including ngrok (`devbox_web` / `devbox_stt`).
- `--tunnel-provider cloudflare` configures HTTPS/WSS through a Cloudflare tunnel instead of ngrok.
  - If `DEVBOX_CLOUDFLARE_TUNNEL_TOKEN`, `DEVBOX_CLOUDFLARE_WEB_HOSTNAME`, and `DEVBOX_CLOUDFLARE_STT_HOSTNAME` are set, it runs in **named tunnel (fixed host)** mode.
  - Without those settings, it falls back to the existing Quick Tunnel (`*.trycloudflare.com`) mode.
- With `--profile device`, `--device-app-env dev|prod` reads mobile app build URLs from
  `secret/mingle-app/dev` or `secret/mingle-app/prod` and injects them.
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
  To pin the Team ID, add `export DEVBOX_IOS_TEAM_ID=3RFBMN8TKZ` to `.zshrc` (or your shell),
  or set the same key in `.devbox.env`.
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
