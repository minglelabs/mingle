# ChatGPT pool handoff (2026-10-30)

## Goal

Colleagues (or their code) call an OpenAI-compatible API from outside, and the
answer is produced by **ChatGPT running in Nam's Chrome profiles** (11 accounts),
for both text and images.

## Hard rules (the user's, non-negotiable)

1. **Never generate images through any image API.** Images come only from
   ChatGPT web in the user's Chrome profiles.
2. **Never launch a separate Chrome / Chrome for Testing / Playwright browser.**
   Only the user's real Chrome profiles with the extension.
3. **Never kill processes by name or pattern** (`pkill`, `killall`, `pkill -n`).
   Only exact PIDs you looked up. A `pkill` once took Chrome renderers down with it.
4. **Never print the API key** (`~/.mingle/chatgpt-pool/api-key`). Read it into
   a shell variable only.
5. Never enter passwords; don't touch the user's ChatGPT/Google sign-ins.
6. Reply to the user in Korean, concisely. When the user has to do something,
   give **one step at a time**.
7. `~/mingle` stays on `main`; work in a worktree. Commit, push, open a PR and
   merge it without asking. No attribution lines in commits/PRs.
8. Don't start the app dev servers automatically.

## How it works

```
external client ──HTTPS──> ngrok ──> 127.0.0.1:10321  (public port, key required, /v1/* only)
                                         │ same process
Chrome extension (×11 profiles) ──> 127.0.0.1:10320  (loopback, keyless; /agent/* + /v1/*)
   long-polls /agent/poll, runs the job in a pinned chatgpt.com tab,
   posts /agent/progress steps and /agent/result
```

- **Server**: `scripts/chatgpt-pool.mjs` (repo) → deployed copy
  `~/.mingle/chatgpt-pool/chatgpt-pool.mjs`.
  - launchd label `app.mingle.chatgpt-pool`.
  - Env: `CHATGPT_POOL_KEY`, `CHATGPT_POOL_PUBLIC_PORT=10321`.
  - Log: `~/Library/Logs/app.mingle.chatgpt-pool.log`. Lines are
    `agent`, `chat`/`image`, `step <email> <job8> <step>`, `done`, `fail`.
  - Restart: `launchctl kickstart -k gui/$(id -u)/app.mingle.chatgpt-pool`.
    This kills in-flight jobs, and the agents reconnect within about 10s.
- **Fixed URL (use this)**: `https://chatgpt-pool.minglelabs.app`, a Cloudflare
  named tunnel `chatgpt-pool` (id `a5309179-…`) on the minglelabs.app zone,
  separate from devbox's `minglelabs` tunnel.
  - Config: `~/.mingle/chatgpt-pool/cloudflared.yml`. It points only at the
    keyed public port 10321 and returns 404 for anything else.
  - launchd label `app.mingle.chatgpt-pool-cf`
    (`~/Library/LaunchAgents/app.mingle.chatgpt-pool-cf.plist`).
    Log: `~/Library/Logs/app.mingle.chatgpt-pool-cf.log`.
  - The agent sandbox cannot `launchctl bootstrap` a new service (I/O error 5).
    The user loads it once from their own terminal.
  - Cloudflare answers 524 after about 100s, so image calls must use
    `"async": true`.
- **Old tunnel**: ngrok, launchd label `app.mingle.chatgpt-pool-tunnel`.
  - The URL is random and changes when ngrok restarts. Read it from
    `curl -s http://127.0.0.1:4040/api/tunnels`.
  - Last URL: `https://dae9-58-233-211-182.ngrok-free.app`.
  - Send the header `ngrok-skip-browser-warning: 1`.
- **Extension** (MV3, unpacked): `scripts/chatgpt-pool-extension/` (repo).
  - Deployed copy: `~/.mingle/chatgpt-pool/extension/`, which is the folder
    Chrome loads in all 11 profiles.
  - `background.js` holds the job runner and the in-page script
    (`inPage(tabId, op)`, which runs in the MAIN world).
  - Self-update: each poll reply carries `extensionVersion` (read from the
    deployed `manifest.json`). An outdated extension calls
    `chrome.runtime.reload()`.
  - Bump `manifest.json` `version` with every extension change, or the
    profiles keep running the old code.
- **Deploy** after editing the repo copies:

  ```bash
  cp scripts/chatgpt-pool-extension/* ~/.mingle/chatgpt-pool/extension/
  cp scripts/chatgpt-pool.mjs ~/.mingle/chatgpt-pool/chatgpt-pool.mjs
  launchctl kickstart -k gui/$(id -u)/app.mingle.chatgpt-pool
  ```

  Wait about 40s. `step` lines in the log confirm the profiles run the new code.

## API

- `POST /v1/chat/completions`:
  - Body: `{"model":"chatgpt-web","messages":[...],"account"?}`.
  - Returns an OpenAI-shaped `choices[0].message.content` plus `account`.
- `POST /v1/images/generations`:
  - Body: `{"prompt":"…","reference"?: dataURL,"account"?}`.
  - Returns `data[0].b64_json` plus `account`.
- Auth on the public port: `Authorization: Bearer <key>`.
- CLI on this Mac (loopback port):

  ```bash
  node ~/.mingle/chatgpt-pool/chatgpt-pool.mjs chat "..."
  node ~/.mingle/chatgpt-pool/chatgpt-pool.mjs image "..."
  ```

Test through the tunnel without echoing the key:

```bash
U=$(curl -s http://127.0.0.1:4040/api/tunnels | python3 -c "import sys,json;print(json.load(sys.stdin)['tunnels'][0]['public_url'])")
K="$(cat ~/.mingle/chatgpt-pool/api-key)"
curl -s "$U/v1/chat/completions" -H "authorization: Bearer $K" -H 'content-type: application/json' \
  -H 'ngrok-skip-browser-warning: 1' -d '{"model":"chatgpt-web","messages":[{"role":"user","content":"한 문장으로: 가마쿠라 산책 코스"}]}'
```

## Current state

- All 11 profiles have the extension and connect. Expected `agent` lines in
  the log:
  - namhk5741
  - matchingplanet24
  - minglelabs.dev
  - hyeongkeol@minglelabs.xyz
  - chicshow.ai
  - startupducks
  - kachitto.biz
  - likeyoureyes@snu.ac.kr
  - talentcommitter
  - grey_pastor@naver.com
  - public.royce.ai
- ✅ **Text works end to end through the tunnel**: about 12s, verified 11:09 UTC
  on public.royce.ai. Fixes so far (extension 1.1.2 → 1.1.4):
  - ChatGPT dropped `data-message-author-role`. Assistant turns are now
    `[data-chatgpt-search-unit-key$=":assistant"]`, and the text lives in
    `[data-markdown-text-style="assistant-message"]`.
  - Source chips ("일본 관광청 +1") are
    `[data-d-component="popover-trigger"]:has([data-d-component="badge"])`.
    `answerText()` hides them while reading `innerText`.
  - A text turn appears before its words do, so the wait loop no longer
    accepts empty text for text jobs.
- ✅ **Images work end to end through the tunnel** (extension 1.2.0): about
  34s, verified 11:31 UTC on likeyoureyes@snu.ac.kr, a 1086x1448 PNG.

## Image fixes (2026-10-30, extension 1.2.0)

- An image reply has no `…:assistant` element, so the runner records the
  picture count before sending and treats `images > imagesBefore` as the
  answer once the picture's `src` stays the same for two checks.
- The turn carries `data-talvt-turn-state`: `in_progress` while drawing,
  `complete` when done. Image jobs wait while it is anything but `complete`.
- `generated()` also accepts any `<img>` inside
  `[data-testid=generated-image-gallery]` / `[data-web-image-tile]`.
- The `image` op reads the widest picture in the newest gallery (the first
  one when there are two candidates) and fails with `ui_changed` if it reads
  nothing.
- While waiting, the runner logs a `wait turns=… images=… turnState=…` step
  every 15s, so a future DOM change shows up in the log.

## Async jobs (for the 300s tunnel cut)

- ngrok cut blocking image requests at 301s (`ERR_NGROK_3004`).
- Add `"async": true` to `POST /v1/images/generations` or
  `POST /v1/chat/completions`. The server answers `202 {id, status:"pending"}`
  at once.
- Poll `GET /v1/jobs/:id` (same key). It returns `status` `pending`,
  `done` with `result` (the normal response body), or `error` with
  `error {status, code, message}`. Finished jobs are kept for an hour.
- The blocking form still works for short calls.

## Other notes

- Each free account has a daily image limit. The server marks an account
  limited when ChatGPT says so (`image_limit` + reset delay) and moves to the
  next account.
- The first image message often gets a blank reply or "생성이 완료되지 않았어요".
  The runner retries once with "다시 시도해서 위 설명대로 이미지 1장 생성해줘".
- Chrome blocks repeated automatic downloads, and chatgpt.com's CSP blocks
  POSTs to localhost. The extension avoids both: the background worker owns
  the network, and the page only returns base64.
- An MV3 worker dies after 30s idle, so a `setInterval(getPlatformInfo, 20s)`
  keepalive is in `background.js`. Don't remove it.
- A stray agent `probe-x (signed out)` in the log was a manual probe. It is
  harmless and expires on its own.
- Later ideas (not started):
  - Moving the pool to the user's home Windows PC.
- History: PRs #351 (pool), #356 (public port), #357 (lost jobs, keepalive,
  self-reload), and this branch (progress steps, new ChatGPT DOM, citation
  chips).

## Done when

1. An image call through the tunnel returns a real PNG (`data[0].b64_json`),
   and you have opened the picture to check it.
2. The text call still works.
3. The PR is merged, `~/.mingle/chatgpt-pool/` is deployed, and the user gets
   a Korean summary plus the current tunnel URL. Never include the key.
