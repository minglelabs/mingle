# ChatGPT pool API: how to call it

For anyone calling the pool: a Railway service, a colleague's laptop, or Nam's
Mac. The pool answers with ChatGPT running in Nam's Chrome profiles (11
accounts, rotated). It speaks a small OpenAI-shaped API.

How it is hosted lives in `docs/chatgpt-pool-windows-handoff.md` and
`docs/chatgpt-pool-handoff.md`. You don't need those to call it.

## The basics

| | |
|---|---|
| Base URL | `https://chatgpt-pool.minglelabs.app` |
| Auth | `Authorization: Bearer <key>` on every request |
| Body | JSON, `Content-Type: application/json; charset=utf-8` |
| Text | `POST /v1/chat/completions` — 10–25s |
| Image | `POST /v1/images/generations` with `"async": true` — 30–90s |
| Job status | `GET /v1/jobs/<id>` |
| Health | `GET /health` |

### Getting the key

Ask Nam. Never paste it into code, a commit, a log line, a chat or a ticket.
Keep it in an environment variable named `CHATGPT_POOL_KEY`:

- **Railway:** service → **Variables** → add `CHATGPT_POOL_KEY`. Railway hands
  it to the process as an env var. Mark it sealed if you like.
- **Mac / Linux:** put `export CHATGPT_POOL_KEY=...` in a file only you can
  read (`chmod 600`), or in your shell's secret store, then `source` it.
  Don't add it to a dotfile you commit.
- **Windows:** `setx CHATGPT_POOL_KEY "<key>"` once, then open a new terminal.

If the key leaks, tell Nam. Rotating it means every caller updates the variable.

## Text

```bash
curl -s https://chatgpt-pool.minglelabs.app/v1/chat/completions \
  -H "Authorization: Bearer $CHATGPT_POOL_KEY" \
  -H 'Content-Type: application/json; charset=utf-8' \
  --max-time 120 \
  -d '{"model":"chatgpt-web","messages":[{"role":"user","content":"한 문장으로: 강릉에서 가볍게 산책하기 좋은 곳"}]}'
```

Response:

```json
{
  "object": "chat.completion",
  "model": "chatgpt-web",
  "choices": [{ "index": 0, "message": { "role": "assistant", "content": "…" }, "finish_reason": "stop" }],
  "account": "kachitto.biz@gmail.com",
  "profile": "Profile 7 (kachitto)"
}
```

- `account` / `profile` tell you which ChatGPT account answered. Handy when
  reporting a bad answer.
- Each call is a fresh ChatGPT chat. Send the whole conversation in `messages`
  if you need context: `system` messages and earlier turns are folded into
  one prompt ("Instructions: …", "Conversation so far: …").
- Attach a photo: put an `image_url` part (data URL) in the last user message,
  as in the OpenAI format.
- Long answers can take longer than 25s. Use `"async": true` (below) if your
  HTTP client or platform cuts requests early.

## Image (always async)

Images take 30–90s, so don't wait on one open request. Send with
`"async": true`, get an id, poll.

```bash
# 1) submit -> 202 {"id":"job_…","status":"pending"}
curl -s https://chatgpt-pool.minglelabs.app/v1/images/generations \
  -H "Authorization: Bearer $CHATGPT_POOL_KEY" \
  -H 'Content-Type: application/json; charset=utf-8' \
  -d '{"prompt":"A casual phone photo of a plate of tteokbokki at a street food stall","async":true}'

# 2) poll every 10s until status is done or error
curl -s https://chatgpt-pool.minglelabs.app/v1/jobs/job_xxx \
  -H "Authorization: Bearer $CHATGPT_POOL_KEY"
```

Job status:

| `status` | Meaning | Body |
|---|---|---|
| `pending` | still drawing | — |
| `done` | finished | `result` = `{ data: [{ b64_json }], account, profile }` |
| `error` | failed | `error` = `{ status, code, message }` |

- Decode `result.data[0].b64_json` (base64 PNG). Typical size 1–3 MB,
  1086x1448 or 1254x1254.
- A reference photo: add `"reference": "data:image/jpeg;base64,…"`.
- Pin an account (rarely needed): add `"account": "<email>"`.
- Finished jobs are kept for **1 hour**. Fetch the result before then.
- Give up after about 8 minutes; the server times a job out at 8.

`"async": true` works on `/v1/chat/completions` too, with the same polling.

## Node.js (Railway)

Node 18+ (global `fetch`).

```js
const BASE = process.env.CHATGPT_POOL_URL ?? 'https://chatgpt-pool.minglelabs.app'
const headers = {
  authorization: `Bearer ${process.env.CHATGPT_POOL_KEY}`,
  'content-type': 'application/json; charset=utf-8',
}

export async function chat(content) {
  const r = await fetch(`${BASE}/v1/chat/completions`, {
    method: 'POST', headers, signal: AbortSignal.timeout(120_000),
    body: JSON.stringify({ model: 'chatgpt-web', messages: [{ role: 'user', content }] }),
  })
  const j = await r.json()
  if (!r.ok) throw new Error(`${r.status} ${j.error?.code}: ${j.error?.message ?? ''}`)
  return j.choices[0].message.content
}

export async function image(prompt, { reference } = {}) {
  const r = await fetch(`${BASE}/v1/images/generations`, {
    method: 'POST', headers, body: JSON.stringify({ prompt, reference, async: true }),
  })
  const { id, error } = await r.json()
  if (r.status !== 202) throw new Error(`${r.status} ${error?.code}`)
  const deadline = Date.now() + 8 * 60_000
  while (Date.now() < deadline) {
    await new Promise((ok) => setTimeout(ok, 10_000))
    const job = await (await fetch(`${BASE}/v1/jobs/${id}`, { headers })).json()
    if (job.status === 'done') return Buffer.from(job.result.data[0].b64_json, 'base64') // PNG bytes
    if (job.status === 'error') throw new Error(`${job.error.status} ${job.error.code}: ${job.error.message}`)
  }
  throw new Error('image timed out')
}
```

## Python

```python
import base64, os, time, requests

BASE = "https://chatgpt-pool.minglelabs.app"
H = {"Authorization": f"Bearer {os.environ['CHATGPT_POOL_KEY']}"}

def chat(content):
    r = requests.post(f"{BASE}/v1/chat/completions", headers=H, timeout=120,
                      json={"model": "chatgpt-web", "messages": [{"role": "user", "content": content}]})
    r.raise_for_status()
    return r.json()["choices"][0]["message"]["content"]

def image(prompt):
    r = requests.post(f"{BASE}/v1/images/generations", headers=H, timeout=30,
                      json={"prompt": prompt, "async": True})
    job_id = r.json()["id"]
    for _ in range(48):  # 8 minutes
        time.sleep(10)
        j = requests.get(f"{BASE}/v1/jobs/{job_id}", headers=H, timeout=30).json()
        if j["status"] == "done":
            return base64.b64decode(j["result"]["data"][0]["b64_json"])  # PNG bytes
        if j["status"] == "error":
            raise RuntimeError(j["error"])
    raise TimeoutError("image timed out")
```

## OpenAI SDKs

The text endpoint is close enough to OpenAI's for the official SDKs:

```js
import OpenAI from 'openai'
const client = new OpenAI({ baseURL: 'https://chatgpt-pool.minglelabs.app/v1', apiKey: process.env.CHATGPT_POOL_KEY })
const r = await client.chat.completions.create({ model: 'chatgpt-web', messages: [{ role: 'user', content: '…' }] })
```

For images, use plain HTTP with `"async": true` as above; the SDK's image call
waits on one open request.

## Windows PowerShell 5.1

Use `curl.exe` (not the `curl` alias), or:

- Send the body as `[Text.Encoding]::UTF8.GetBytes($json)` straight into
  `-Body`. A byte array returned from a function becomes `Object[]` and the
  server answers 400 `bad_json`.
- Read with `Invoke-WebRequest -UseBasicParsing`, decode `RawContentStream`
  as UTF-8, then `ConvertFrom-Json`. Otherwise Korean comes back garbled.

## Errors

Errors look like `{"error": {"code": "…", "message": "…"}}`. For async jobs
they sit in the job's `error` with the same `status`.

| HTTP | `code` | What to do |
|---|---|---|
| 400 | `bad_json`, `empty_prompt` | fix the request |
| 401 | `unauthorized` | key missing or wrong |
| 404 | `job_not_found` | job id unknown, older than 1h, or the server restarted mid-job: submit again |
| 404 | `not_found` | wrong path |
| 422 | `image_refused` | ChatGPT refused the prompt (policy): change the prompt |
| 429 | `image_limit` | every account hit its daily image limit; `message` says until when |
| 502 | other codes | ChatGPT failed on that account; retry once |
| 503 | `no_account` | no Chrome profile connected (PC asleep, Chrome closed): tell Nam |
| — | `timeout` | took longer than 5 min (text) / 8 min (image): retry once |

Retry rule of thumb: 502, `timeout` and `job_not_found` once, after a few
seconds. Don't loop on 429 or 503.

## Limits

- Throughput is small: about 11 requests at a time (one per account). More
  wait in a queue.
- Free accounts have a daily image limit. The pool skips limited accounts;
  when all are limited you get 429.
- Answers come from ChatGPT web, so they can vary in wording and quality.
- No streaming. `stream: true` is ignored.
- Every request runs on Nam's home PC. If it is off, asleep or rebooting, calls
  fail with 503 or a connection error. Nothing is stored about you except the
  server's in-memory job list and a log line per request.
- Don't send personal or secret data you wouldn't paste into ChatGPT yourself.

## Quick check

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://chatgpt-pool.minglelabs.app/health          # 401 = up, key needed
curl -s -H "Authorization: Bearer $CHATGPT_POOL_KEY" https://chatgpt-pool.minglelabs.app/health
# {"ok":true,"accounts":11,"queued":0,"running":0}
```

`accounts` is how many ChatGPT accounts are connected right now.
