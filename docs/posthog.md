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

Server events are sent only after the corresponding `AppEventLog` write
succeeds. They include existing STT/TTS and hydration events plus explicit
message-sent and conversation-created/reused product events. Browser events
include app open, safe screen names, email signup completion, pageview,
pageleave, click/change/submit autocapture, heatmaps, rage/dead clicks, Web
Vitals, and session replay.

It deliberately excludes source text, translated text, full URLs and query
parameters, IP addresses, user-agent strings, session keys, access tokens, and
arbitrary client metadata. Server GeoIP enrichment is disabled. Browser
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
