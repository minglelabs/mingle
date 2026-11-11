# PostHog analytics

Mingle uses the official `posthog-node` SDK on the server and `posthog-js` in
the WebView. Server events are forwarded only after the existing app event log
is persisted. The browser SDK captures navigation and interaction behavior
without requiring a native iOS or Android SDK.

## Configuration

`POSTHOG_TOKEN` must be the public PostHog project token from Project Settings.
It is not a personal API key. PostHog Cloud project tokens with the `phc_`
prefix are also passed to the browser SDK. A self-hosted project with another
token format must set `POSTHOG_PUBLIC_TOKEN` explicitly. `POSTHOG_HOST` is
optional and defaults to the US cloud endpoint. Set it to
`https://eu.i.posthog.com` for an EU project.

For local Devbox, patch the existing Vault record instead of replacing it:

```bash
cd /Users/nam/.codex/worktrees/mingle/messenger-tabs-device-test
export VAULT_ADDR=http://127.0.0.1:8200
vault login
vault kv patch secret/mingle/dev POSTHOG_TOKEN='paste-project-token-here'
vault kv patch secret/mingle/dev POSTHOG_HOST='https://us.i.posthog.com'
```

The token is read into the app runtime by `scripts/devbox up`. Do not commit it
to `.env.local`, print it in logs, or use a personal API key. The public project
token is expected to be visible to browsers; account and personal API keys are
not.

## Event scope and privacy

Existing server analytics events are sent only after the corresponding
`AppEventLog` write succeeds. They include existing STT/TTS and hydration
events plus explicit message-sent and conversation-created/reused product
events. Browser events
include app open, safe screen names, email signup completion, pageview,
pageleave, click/change/submit autocapture, heatmaps, rage/dead clicks, Web
Vitals, and session replay.

Connect diagnostics also record debounced search requests and completions,
Connect follow clicks and completions, and server-side search/follow API
actions. These events include result counts, timing, input shape, and a
SHA-256 digest of the normalized search query. A single Latin, Hangul, kana, or
CJK character is included only as a one-character diagnostic token so repeated
letter searches can be identified. Account and target user IDs are sent only
as SHA-256 digests.

### Invite ticket funnel

Main metric: weekly active cross-language conversation pairs. The invite
funnel, in order (`inviter_digest` is a SHA-256 of the inviter's account id;
no name, code or link is sent):

| Step | Event | Sent by | Properties |
| --- | --- | --- | --- |
| Ticket made | `mingle_invite_ticket_created` | browser, on copy or share | `method` (`copy`/`share`) |
| Link opened | `mingle_invite_link_opened` | browser, `/i/{code}` page | `platform`, `valid` |
| Install pressed | `mingle_invite_install_clicked` | browser, `/i/{code}` page | `platform`, `store` |
| Invite reached the app | `mingle_invite_received` | browser (WebView) | `source` (`link`/`install_referrer`) |
| Signed up through it | `mingle_invite_accepted` | server | `invite_source` (`link`/`install_referrer`/`code`), `reward_coins`, `inviter_digest` |
| Room opened | `mingle_invite_room_opened` | browser (WebView) | `source`, `rewarded` |
| First chat in one room | `mingle_invite_first_chat` | server | `inviter_digest`, `bonus_coins` |
| Talked again within 7 days | `mingle_invite_rechat_7d` | server | `inviter_digest`, `hours_since_first_chat` |

An install is only seen directly on Android (`mingle_invite_received` with
`source: install_referrer`); iOS has no install referrer, so there the install
step is read from `mingle_invite_install_clicked` followed by
`mingle_invite_accepted`. "First chat" means both people have sent a message in
the same room; "talked again" is a message 12 hours to 7 days after that. Link
previews fetched by messengers do not run the page script, so they do not
count as opens.

It deliberately excludes source text, translated text, full URLs and query
parameters, IP addresses, user-agent strings, session keys, access tokens, and
arbitrary client metadata. It does not send raw search text, names, or handles.
Server GeoIP enrichment is disabled. Browser
autocapture masks all text and element attributes. Session replay masks all
text, inputs, and element attributes; disables console, request/response body,
header, and canvas capture; and strips query strings and URL fragments before
data leaves the device.

The PostHog distinct ID is the existing pseudonymous Mingle tracking ID. No
name, handle, email, or message text is sent to PostHog by this integration.

## Release impact

This integration does not require a new iOS or Android binary because the
existing native apps load the deployed WebView application. A Railway web
deployment with the project token set is required. The app version and API
namespace reported by 2.0.0 clients are attached as event properties.

A future React Native SDK integration would be separate and would require a
new native build.
