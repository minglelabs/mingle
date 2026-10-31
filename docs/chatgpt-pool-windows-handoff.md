# ChatGPT pool: move from the Mac to the Windows PC (handoff, 2026-10-31)

Read this whole file first, then `docs/chatgpt-pool-handoff.md` (how the pool
works, the ChatGPT DOM it depends on, the API). This file is only about moving
it to Windows.

## Status (2026-10-31)

- Done: code works on both macOS and Windows; deployed copy, key, 11 profiles
  with the extension, log-on task, sleep off on AC, Caddy route on the test
  hostname `chatgpt-pool-win.minglelabs.app` (tested from Windows and the Mac).
- Decided: the Windows PC is reached directly (fixed public IP + router port
  forwarding + Caddy). **No Cloudflare tunnel on Windows.** Step 7 describes
  this; don't create a tunnel there.
- Cutover done 2026-10-31: `chatgpt-pool.minglelabs.app` is a DNS-only A
  record to `183.96.5.234`, served by Caddy on the PC. Text and async image
  verified through it.
- Left: stop the Mac's three launchd jobs (the user does this, step 8.4), a
  reboot test, and making the 11 Chrome profiles open at log-on (Chrome does
  not reopen them by itself, and the pool has 0 accounts until they are open).

## Goal

Run the whole ChatGPT pool on Nam's Windows PC instead of the MacBook:

- Same public URL: `https://chatgpt-pool.minglelabs.app`.
- Same API and the same API key, so colleagues change nothing.
- ChatGPT runs in the Windows Chrome profiles (one ChatGPT account per profile).
- When done, the Mac runs none of it.

## Hard rules (the user's, non-negotiable)

1. **Never generate images through any image API.** Images come only from
   ChatGPT web in the user's real Chrome profiles.
2. **Never launch a separate Chrome, Chrome for Testing, Playwright or
   puppeteer browser.** Only the user's real Chrome profiles with the extension.
3. **Never kill processes by name or pattern** (`taskkill /IM`, `Stop-Process -Name`,
   `pkill`). Only an exact PID you looked up and checked (its path or command line).
   A by-name kill once took the Chrome renderers down.
4. **Never print the API key**, in output, logs, commits or replies. Read it into
   a variable only.
5. Never type passwords and never touch the user's Google or ChatGPT sign-ins.
   Signing in is the user's job; ask them, one step at a time.
6. Reply to the user in Korean, briefly. When the user has to do something,
   give **one step at a time**.
7. Repo work happens in a worktree on a new branch. Commit, push, open a PR named
   after the branch and merge it without asking. Commits in English, no
   attribution lines.
8. Don't install tools the user does not need. Check what is installed first;
   if something is missing, say what, why and how big, and ask.
9. The Mac pool stays up until Windows passes every check below. The cutover
   is the last step, not the first.

## What runs today (on the Mac)

| Part | Mac today | Windows target |
|---|---|---|
| Pool server | `node ~/.mingle/chatgpt-pool/chatgpt-pool.mjs serve`, launchd `app.mingle.chatgpt-pool` | same script under `%USERPROFILE%\.mingle\chatgpt-pool\`, started at log-on |
| Ports | 10320 loopback, keyless (extensions + local CLI); 10321 loopback, key required (public) | same; both bound to `127.0.0.1` only |
| Env | `CHATGPT_POOL_KEY` (from `~/.mingle/chatgpt-pool/api-key`), `CHATGPT_POOL_PUBLIC_PORT=10321` | same |
| Extension | MV3 unpacked, loaded from `~/.mingle/chatgpt-pool/extension/` in 11 profiles, version **1.2.1** | loaded from `%USERPROFILE%\.mingle\chatgpt-pool\extension\` in every Windows profile |
| Public route | Cloudflare named tunnel `chatgpt-pool` (id `a5309179-…`), config `~/.mingle/chatgpt-pool/cloudflared.yml`, launchd `app.mingle.chatgpt-pool-cf` | no tunnel: DNS-only A record → home IP → router 443 → Caddy → `127.0.0.1:10321` (step 7) |
| Old tunnel | ngrok, launchd `app.mingle.chatgpt-pool-tunnel` | not moved; turned off at cutover |
| Log | `~/Library/Logs/app.mingle.chatgpt-pool.log` | `%USERPROFILE%\.mingle\chatgpt-pool\pool.log` |

The 11 ChatGPT accounts (one per Chrome profile on the Mac):

- namhk5741@gmail.com
- grey_pastor@naver.com
- matchingplanet24@gmail.com
- hyeongkeol@minglelabs.xyz
- public.royce.ai@gmail.com
- talentcommitter@gmail.com
- startupducks@gmail.com
- minglelabs.dev@gmail.com
- chicshow.ai@gmail.com
- kachitto.biz@gmail.com
- likeyoureyes@snu.ac.kr

## Code that is Mac-only (fix these first, in the repo)

Work in a worktree on a new branch, for example `feat/chatgpt-pool-windows`.
Keep the Mac behaviour working; branch on `process.platform === 'win32'`.

1. **Chrome profile lookup.** `scripts/chatgpt-pool.mjs` has
   `const CHROME_DIR = join(homedir(), 'Library/Application Support/Google/Chrome')`.
   - On Windows it is `%LOCALAPPDATA%\Google\Chrome\User Data`
     (`process.env.LOCALAPPDATA`).
   - `chromeProfileOf()` reads each profile's
     `Local Extension Settings/<ext id>/*.log|*.ldb` to find the agentId.
     Chrome holds these files open on Windows, so a read can fail with
     `EBUSY`/`EPERM`. Skip that file and keep going; never crash the server.
     If no profile can be found, the agent just has no profile name.
2. **`install` / `uninstall`** write a launchd plist and call `launchctl`.
   - Add a Windows path that registers a Task Scheduler task running at the
     user's log-on: `node <script> serve`, with `CHATGPT_POOL_KEY` and
     `CHATGPT_POOL_PUBLIC_PORT=10321` in its environment, stdout and stderr
     appended to `pool.log`.
   - Task Scheduler cannot set environment variables directly. Use a small
     `.cmd` wrapper next to the script that reads the key file into the
     variable and starts node. The key must not appear on the task's command
     line, because that is visible to other processes and in Task Scheduler's UI.
   - Restart on failure: the task should restart if node exits.
   - `uninstall` deletes the task.
3. **MCP `chatgpt_image` default output** uses `tmpdir()`. That already works on
   Windows; leave it.
4. Nothing in `scripts/chatgpt-pool-extension/` is Mac-specific. Don't change it
   unless a test shows a reason. If you do change it, bump `manifest.json`
   `version`, or the profiles keep running the old code.

Verify locally with `node --check scripts/chatgpt-pool.mjs`. Then run `serve` in a
terminal and check that the log prints both listeners.

## Steps on Windows

### 0. Check what is installed (don't install yet)

- `node --version`: needs Node 18 or newer (the server uses global `fetch`).
- `git --version`
- Caddy: `C:\caddy\caddy.exe version` (already there for `voice.minglelabs.app`)
- Chrome's version, and how many profiles exist. Read
  `%LOCALAPPDATA%\Google\Chrome\User Data\Local State` (JSON,
  `profile.info_cache`). Read it only; don't edit it.

Tell the user what is missing and ask before installing anything.

### 1. Repo and deployed copy

- Clone or update the mingle repo. Make the code changes above on a branch.
- Deployed copy (same layout as the Mac, because the server reads the extension
  version from `./extension/manifest.json` next to the script):

  ```
  %USERPROFILE%\.mingle\chatgpt-pool\chatgpt-pool.mjs
  %USERPROFILE%\.mingle\chatgpt-pool\extension\   (all files of scripts\chatgpt-pool-extension)
  %USERPROFILE%\.mingle\chatgpt-pool\api-key
  ```

### 2. The API key

Keep the same key, so colleagues change nothing.

- The user copies it from the Mac. On the Mac:
  `pbcopy < ~/.mingle/chatgpt-pool/api-key`.
- They paste it into `%USERPROFILE%\.mingle\chatgpt-pool\api-key` on Windows,
  one line with no trailing spaces.
- Restrict the file to the user:
  `icacls <file> /inheritance:r /grant:r "$env:USERNAME:(R,W)"`.
- Never echo it. To check it, compare only its length.

### 3. Chrome profiles and the extension (the user does the clicking)

Do one profile at a time, and give the user one step at a time.

1. Make sure a Chrome profile exists for each account above. Ask the user which
   ones already exist; don't create profiles yourself.
2. In that profile, the user signs in to chatgpt.com with that account.
3. `chrome://extensions` → turn on Developer mode → **Load unpacked** →
   choose `%USERPROFILE%\.mingle\chatgpt-pool\extension`.
4. Check that the pool log shows `agent <id8> <email>` for it, and later a
   `profile <id8> <email> Profile N (name)` line.

Chrome settings the pool needs:

- `chrome://settings/system` → **Continue running background apps when Google
  Chrome is closed**: on.
- Every profile must stay open, with at least one window. An extension in a
  closed profile does not run. The extension pins its own chatgpt.com tab;
  tell the user not to close it.

### 4. Keep the PC awake

- Power settings: sleep **Never** while plugged in. The display may turn off.
- Turn off automatic restarts for updates during working hours (active hours).
- A sleeping PC means every request hangs.

### 5. Pool server as a log-on task

- Run `node scripts/chatgpt-pool.mjs install` (the new Windows path) from the
  deployed copy, with `CHATGPT_POOL_PUBLIC_PORT=10321` set. It writes
  `chatgpt-pool-serve.cmd` next to the script and registers the task
  `MingleChatGptPool` (log-on trigger, hidden via `conhost --headless`, no
  time limit). The wrapper reads `api-key` into the environment and restarts
  `serve` 5s after it exits. `--no-start` registers without starting.
- Install refuses to run while `api-key` is missing or empty (without a key,
  `serve` skips the public port and Caddy would answer 502).
- Restart after a deploy: stop the node `serve` process by its exact PID (the
  owner of port 10320: `(Get-NetTCPConnection -LocalPort 10320 -State Listen).OwningProcess`,
  check its command line first). The wrapper starts it again within 5s with
  the new code. `schtasks /End` alone leaves the wrapper and node running.
- `node chatgpt-pool.mjs uninstall` deletes the task, stops the wrapper and
  `serve` (matched by their exact command lines), and removes the wrapper.
- `pool.log` is rotated by the wrapper: past 20 MB it becomes `pool.log.1`.
- Check:
  - `curl.exe -s http://127.0.0.1:10320/health` returns `{"ok":true,"accounts":N,...}`.
  - `pool.log` has both lines: `ChatGPT pool on http://127.0.0.1:10320` and
    `public API (key required) on http://127.0.0.1:10321`.
- Restarting the server (stop and start the task) kills in-flight jobs and drops
  the async job store (see "Known limits"). Don't restart while someone is
  testing.

### 6. Local test before the public route

Run these on the Windows PC, with the key in a variable only.

- Text: `POST http://127.0.0.1:10321/v1/chat/completions` with
  `{"model":"chatgpt-web","messages":[{"role":"user","content":"한 문장으로: 서울 산책 코스"}]}`.
  Expect 10–25s, `choices[0].message.content`, `account`, `profile`.
- Image: `POST /v1/images/generations` with `{"prompt":"…","async":true}`. Expect
  202 `{id}`. Poll `GET /v1/jobs/<id>` every 10s until `done`. Decode
  `result.data[0].b64_json` to a PNG and **open the picture** to check it.
- Auth: the public port without the key returns 401.
- `/agent/poll` on the public port returns 404.

PowerShell 5.1 notes (both cost a retry last time):

- Send the body as `[Text.Encoding]::UTF8.GetBytes($json)` straight into `-Body`.
  A byte array returned from a function turns into `Object[]`, and the server
  answers 400 `bad_json`.
- Read responses with `Invoke-WebRequest -UseBasicParsing`. Decode
  `RawContentStream` as UTF-8, then `ConvertFrom-Json`. Otherwise Korean is
  garbled. Or use `curl.exe`, which has neither problem.

### 7. Public route on Windows: fixed IP + port forwarding + Caddy

**No Cloudflare tunnel on Windows.** The user set the PC up to be reached
directly, the same way it serves `voice.minglelabs.app` (LiveKit) to real
users. The pool reuses that path:

```
client -> https://chatgpt-pool[-win].minglelabs.app
       -> DNS A record 183.96.5.234 (DNS only, grey cloud)
       -> home router 443 -> 192.168.0.2 (this PC)
       -> Windows Firewall rule "Caddy HTTP/HTTPS" (TCP 80,443 inbound)
       -> Caddy (C:\caddy) -> 127.0.0.1:10321 (key required)
```

| Part | Value |
|---|---|
| Public IP | `183.96.5.234` (fixed; not CGNAT) |
| PC LAN IP | `192.168.0.2` (DHCP reservation on the router `192.168.0.1`) |
| Router forwards | TCP 80, 443 → `192.168.0.2` (the pool needs only these). TCP 7881 and UDP 50000–60000 are for LiveKit; leave them. |
| Windows Firewall | inbound rule `Caddy HTTP/HTTPS`, TCP 80,443 (made when LiveKit was set up) |
| Caddy | `C:\caddy\caddy.exe`, config `C:\caddy\Caddyfile`, log `C:\caddy\logs\caddy.log`, data `C:\caddy\data` |
| Caddy start | SYSTEM startup task `Caddy (voice.minglelabs.app)` running `C:\caddy\run-caddy.cmd` (no log-on needed) |

Caddyfile blocks (only the keyed port 10321; **never 10320**, which is keyless
and serves `/agent/*`):

```
chatgpt-pool-win.minglelabs.app {
	reverse_proxy 127.0.0.1:10321
}

chatgpt-pool.minglelabs.app {
	reverse_proxy 127.0.0.1:10321
}
```

- Reload after editing (no restart, in-flight requests survive):
  `C:\caddy\caddy.exe validate --config C:\caddy\Caddyfile` then
  `C:\caddy\caddy.exe reload --config C:\caddy\Caddyfile`.
- DNS for each hostname: Cloudflare **A** record → `183.96.5.234`,
  **DNS only** (grey cloud). Orange (proxied) breaks Caddy's certificate
  challenge and adds Cloudflare's ~100s cut.
- Check from the PC without leaving it:
  `curl.exe -s -o NUL -D - --resolve chatgpt-pool-win.minglelabs.app:443:127.0.0.1 https://chatgpt-pool-win.minglelabs.app/health`
  should print `HTTP/1.1 401` and `Via: 1.1 Caddy`.
- From outside, a response has `Via: 1.1 Caddy` and no `server: cloudflare`.
- No time limit on this path, but keep `"async": true` for images so callers
  behave the same everywhere.
- Verified 2026-10-31 through `https://chatgpt-pool-win.minglelabs.app`, from
  the Windows PC and from the Mac: text 12s, async image 30–60s, no key 401.

**Certificates.** Caddy gets Let's Encrypt certificates by itself (HTTP-01 on
port 80 / TLS-ALPN on 443) as soon as DNS points at the home IP, and renews them
about 30 days before expiry. Nothing to schedule. If renewal fails, `caddy.log`
says why; the usual causes are DNS no longer pointing home, the record turned
orange, or port 80/443 forwarding lost.

**If the home IP changes** (ISP change, router reset):

1. Find the new IP: `curl.exe -s https://api.ipify.org`.
2. In Cloudflare DNS, update the A records `chatgpt-pool`, `chatgpt-pool-win`
   and `voice` to the new IP (keep DNS only).
3. Check the router still forwards TCP 80/443 to `192.168.0.2`, and the PC still
   has `192.168.0.2`.
4. Watch `caddy.log`; requests work again once DNS has spread (TTL Auto, ~5 min).
5. Update the IP in this file and in `docs/livekit-windows-selfhost-handoff.md`.
   LiveKit's `node_ip` in `C:\livekit\livekit.yaml` also needs the new IP.

### 8. Cutover (only after steps 1–7 all pass)

1. Tell the user, and make sure nobody is mid-request. Check `GET /health` on the
   Mac: `running` and `queued` should both be 0.
2. Move the hostname (Caddy route):
   - The `chatgpt-pool.minglelabs.app` Caddy block is already in place (step 7).
   - In Cloudflare DNS, replace the `chatgpt-pool` Tunnel record with an
     **A** record to `183.96.5.234`, **DNS only**. The user does this in the
     dashboard (or the agent, with an API token that has Zone:DNS:Edit).
   - Caddy gets the certificate once DNS points home; watch `caddy.log` for
     `certificate obtained successfully`.
3. Test `https://chatgpt-pool.minglelabs.app` (text + async image) and check that
   **Windows'** `pool.log` shows the requests.
4. The Mac side is stopped by the user or the Mac's agent, not by you. Hand them
   these commands:

   ```bash
   launchctl bootout gui/$(id -u)/app.mingle.chatgpt-pool-cf
   launchctl bootout gui/$(id -u)/app.mingle.chatgpt-pool-tunnel
   launchctl bootout gui/$(id -u)/app.mingle.chatgpt-pool
   ```

   Keep the Mac plists and files for a week, in case a rollback is needed.
   - Rollback: in Cloudflare DNS, delete the `chatgpt-pool` A record, then run
     `cloudflared tunnel route dns chatgpt-pool chatgpt-pool.minglelabs.app`
     on the Mac and bootstrap the three plists again.
5. Optional, later: delete the test hostname `chatgpt-pool-win.minglelabs.app`
   from DNS.

## Known limits (carry over, don't be surprised)

- **Async jobs live in memory.** A server restart loses them, and the caller then
  gets 404 on `GET /v1/jobs/<id>`. This happened once: a colleague's image
  vanished when the server restarted mid-job. A worthwhile follow-up is to keep
  the async job index on disk, so a job cut by a restart answers
  `error: server_restarted` and finished results survive a restart.
- Free accounts have a daily image limit. The server marks an account limited
  and moves on to the next.
- The first image message in a chat often comes back empty, and the runner
  retries once.
- When ChatGPT offers two candidate images, the runner takes the first without
  clicking. This hasn't been seen yet.
- The MV3 worker keepalive (`setInterval(getPlatformInfo, 20s)`) must stay.
- Every log line names the account and, once found, the Chrome profile:
  `done <email> [Profile N (name)] <secs>`.

## Done when

1. `https://chatgpt-pool.minglelabs.app` serves text and an async image **from
   Windows**. Windows' `pool.log` shows the jobs, and you have opened the
   picture.
2. All Windows profiles show as `agent` lines, and `GET /health` reports that
   count.
3. The server and Caddy come back on their own after a Windows reboot and log-on.
   Test this once.
4. The Mac's three launchd jobs are stopped. The user or the Mac's agent does this.
5. The code changes are merged to main through a PR. This file and
   `docs/chatgpt-pool-handoff.md` describe the Windows setup.
6. The user gets a short Korean summary. Never include the key.
