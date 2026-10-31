# Claude Instructions

## Development Server
- DO NOT run development server automatically
- User will run the server manually when needed

### mingle-landing (port 4000)
```bash
cd mingle-landing && pnpm dev
```

### mingle-model-test (port 3000 + STT server on 3001)
```bash
cd mingle-model-test && pnpm dev
```

## Devbox: several sessions at once
Several agent sessions may run devbox at the same time, each in its own worktree.
Full rules: `docs/worktree-devbox.md` (section "동시 세션").
- Each session runs its OWN tunnel. `scripts/devbox up --profile device --tunnel-provider cloudflare`
  claims a free tunnel slot with its own hostnames. Never stop, restart, or reuse another
  session's servers, tunnel, bridges, or ports (`scripts/devbox down` only in your own worktree).
- Tunnel provider: always Cloudflare (the default). Do not use ngrok unless the user asks for it.
- Phones: the user assigns phones per session ("use this phone"). Install only on the assigned
  phone with `--ios-udid` / `--android-serial`.
- If the user did not assign a phone, install on every connected phone. If devbox reports
  `ACTION REQUIRED: skipped ... phone` (another session is using it), ask the user before using
  that phone. Do not take it on your own.
- Do not hold a phone with an Appium session that another session is using.
