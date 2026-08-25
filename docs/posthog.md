# PostHog analytics

Mingle uses the official `posthog-node` SDK on the server. The integration
forwards the existing server-side app event log after it is persisted, so the
2.0.0 clients can be measured without putting a PostHog credential in the
WebView or native app.

## Configuration

`POSTHOG_TOKEN` must be the PostHog project token from Project Settings. It is
not a personal API key. `POSTHOG_HOST` is optional and defaults to the US cloud
endpoint. Set it to `https://eu.i.posthog.com` for an EU project.

For local Devbox, patch the existing Vault record instead of replacing it:

```bash
cd /Users/nam/.codex/worktrees/mingle/messenger-tabs-device-test
export VAULT_ADDR=http://127.0.0.1:8200
vault login
vault kv patch secret/mingle/dev POSTHOG_TOKEN='paste-project-token-here'
vault kv patch secret/mingle/dev POSTHOG_HOST='https://us.i.posthog.com'
```

The token is read into the app runtime by `scripts/devbox up`. Do not commit it
to `.env.local`, print it in logs, or expose it as a `NEXT_PUBLIC_*` variable.

## Event scope and privacy

Events are sent only after the corresponding `AppEventLog` write succeeds.
The initial integration captures the existing tracked STT/TTS and hydration
events. It includes release metadata such as app version, API namespace,
platform, locale, pathname, provider/model, duration, and translation counts.

It deliberately excludes source text, translated text, full URLs and query
parameters, IP addresses, user-agent strings, session keys, access tokens, and
arbitrary client metadata. GeoIP enrichment is disabled in the SDK.

The PostHog distinct ID is the existing pseudonymous Mingle tracking ID. No
name, handle, email, or message text is sent to PostHog by this integration.

## Release impact

This server-side integration does not require a new iOS or Android binary. A
Railway app deployment with `POSTHOG_TOKEN` set is required before events are
sent. The app version and API namespace reported by existing 2.0.0 clients are
used as event properties, so the first collected release can be filtered to
2.0.0.

If client-side PostHog JS or the React Native SDK is added later for automatic
screen/session capture, that is a separate integration. A WebView web bundle
redeploy is required for PostHog JS; a React Native SDK would require a new
native build. The server token must never be used in either client bundle.
