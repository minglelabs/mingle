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
- **Tunnel**: ngrok, launchd label `app.mingle.chatgpt-pool-tunnel`.
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
- ❌ **Images don't work yet.** There are two separate problems.

## Open problem 1: the image answer is never detected (fix this first)

Every image job ends in `fail … timeout no answer in time`.

**Cause:** an image reply has **no** `data-chatgpt-search-unit-key=…:assistant`
element. As a result:

- `state.turns` stays 0.
- `answer()` (`background.js`, the `state.turns <= before` check) waits forever.

What a finished image reply looks like (seen 2026-10-30 in chicshow.ai's
profile), from the image outward:

```
button[data-testid=generated-image-preview][aria-label="생성된 이미지 1"]   ← the <img alt="생성된 이미지 1"> (naturalWidth 1086) is inside
 div[data-web-image-tile=true]
  div[data-testid=generated-image-gallery]
   div[data-chatgpt-search-message-ids=<message id>]
    div[data-talvt-turn-state=complete]          ← probably "finished" (check its value while still drawing)
     div[data-content-search-turn-key=fallback-turn-0]
      div[data-turn-key=<uuid>]                  ← likely the general turn container for every turn
```

Suggested fix in the in-page `turns()` / `state`:

- Count turns by `[data-turn-key]` (or the user/assistant split inside it)
  instead of only `…:assistant`. Keep the legacy selectors as fallbacks.
- Or, for image jobs, record `images` before sending and treat
  `generated().length > imagesBefore` as the answer.
- `generated()` already matches `alt` starting with `생성된 이미지`, requiring
  `naturalWidth > 400`. Note the alt is now `생성된 이미지 1` (numbered).
- Check `creating` while drawing. It matches `Creating image|이미지 생성 중|…`
  in `main` text and may also have changed. `data-talvt-turn-state` may be a
  better signal.
- When ChatGPT shows two candidates ("1번/2번 이미지 선택"), click one first.
  `generated().at(-1)` may otherwise pick the wrong one.
- Reading the image: the code does `fetch(img.src)` → base64 in the page. This
  worked before, but verify it with the new DOM.

How to inspect safely:

- Use the Claude in Chrome tools in a tab of their own tab group.
- Don't use the pool's pinned tabs. They are in another group, and the
  extension drives them.
- One finished image conversation exists in chicshow.ai's profile:
  `chatgpt.com/c/6ae47ca5-2464-83ee-b417-cb8f0d7f3f5b`.

## Open problem 2: the tunnel cuts long requests at 300s

- The image request through ngrok returned `ERR_NGROK_3004` ("invalid or
  incomplete HTTP response") after exactly **301s**.
- This happened even after setting `createServer({ requestTimeout: 0 })`.
- Find out whether the cut comes from the ngrok free plan or from Node:
  1. Run the same image call against `http://127.0.0.1:10321` with the key.
  2. If it survives past 300s locally, ngrok is the limit.
- Images usually take 1–4 minutes, and a retry can double that. Robust options:
  - **Async jobs (recommended):** `POST /v1/images/generations` with
    `"async": true` returns `{id}` at once, and `GET /v1/jobs/:id` returns
    `pending | done (+b64) | error`. Keep the blocking form for short calls.
  - Or stream a 200 status early and send whitespace heartbeats before the
    JSON. The downside is that errors can no longer use HTTP status codes.

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
  - A fixed tunnel URL via `cloudflared tunnel login`, which needs the user to
    log in.
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
