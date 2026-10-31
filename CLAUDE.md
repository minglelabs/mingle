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

## Agent gate (before merging an agent PR)
Run `node scripts/agent-gate.mjs --pr <number> --markdown` and paste the output into the PR.
Design: `docs/agent-loop-graph-design.md`.
- `merge: auto` (L0 docs, L1 contained UI / admin / devbox with CI green): the agent may merge.
- `merge: approve` (L2 wide, L3 closed lane: migrations, env, deploy config, `rn/**`, coins/IAP,
  production data scripts, CI and the gate itself): ask Nam. Never merge L3 on your own.
- `verdict: red` or `pending`: do not merge. A skipped or missing CI run is not green.
- With `--plan .agent/plan.json --unit <id>`, files outside the unit's `allowed` globs make it red.
  Add `--return` to write `.agent/returns/<unit>.json`; send only that unit back. Exit 4 = third
  failed return: stop and re-plan instead of retrying.
- Before splitting work: `node scripts/agent-plan.mjs validate|waves|brief .agent/plan.json`.
  Put the `brief` output into each worker's instructions. It includes `docs/agent-constraints.md`.
- After an accepted result with a confirmed cause, add a constraint to `docs/agent-constraints.md`
  (source commit or PR required).
- The gate does not check real devices. Say so when reporting.
