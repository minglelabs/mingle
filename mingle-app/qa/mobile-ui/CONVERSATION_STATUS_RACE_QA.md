# Conversation Status Race QA — iOS Devbox

Manual smoke checklist for the conversation list status mutation fix on the
`codex/chat-scroll-performance-plan` branch. Cross-reference:
[`docs/ui-ux-codex-thread-history.md`](../../../docs/ui-ux-codex-thread-history.md)
entry dated `2026-05-04`.

## Why This Checklist Exists

The devbox PATCH `/conversations/:id` (status) round-trip takes ~4s on this
branch (vs. <1s on App Store). Without the fix, an in-flight `active` response
could land after a newer `paused` response, retriggering room re-entry and
producing fake `대화방을 열지 못했습니다` / `대화방을 정지하지 못했습니다`
alerts. The fix (per-conversation monotonic status version + AbortController +
suppressed language-PATCH alerts) must be validated end-to-end on a real iOS
WebView build because the original symptom only reproduced there.

## Build And Install

```bash
scripts/devbox up                       # if not running already
scripts/devbox mobile --platform ios    # install the branch build on the device
```

The diagnostics logger is gated on `NODE_ENV !== "production"`. When iterating
locally use the dev build (default for `scripts/devbox`); release builds will
silently no-op. Watch the WebView console via Safari Web Inspector to see the
`[mingle][conversation-list] mutation failure` log lines.

## Smoke Steps

For each step, the expected outcome is "no toast pops up" unless explicitly
noted. If a toast appears, capture the Safari console diagnostics line and
share before continuing.

### 1. Open / Create Room

- [ ] Tap an existing conversation row → room opens once. No alert toast.
- [ ] Tap "create new conversation" → new room opens. No alert toast.
- [ ] Background the app, foreground it. Room remains open. No alert toast.

### 2. Start / Stop STT (single)

- [ ] Tap mic to start STT. Status pill flips to active. Wait for the PATCH
      to settle (Web Inspector shows the response). No alert toast.
- [ ] Tap mic to stop STT. Status pill flips to paused. Wait for the PATCH.
      No alert toast.

### 3. Rapid Start / Stop (race trigger)

This is the failure mode the fix targets. Expected: only the latest mutation
applies; intermediate stale responses are silently dropped.

- [ ] Tap mic on, then immediately tap mic off (within 1s). Repeat 3-5 times.
- [ ] Final state must reflect the **last** tap (paused if you ended on stop,
      active if you ended on start).
- [ ] No `대화방을 열지 못했습니다` or `대화방을 정지하지 못했습니다` toast
      should fire during or after the burst.
- [ ] Web Inspector should show one or more diagnostic warnings tagged
      `stale: true` for the superseded PATCH responses (this is expected —
      they confirm the guard worked; no user-facing alert was shown).

### 4. Background / Foreground During Pending Mutation

- [ ] Tap mic on. Within 1s (before the PATCH resolves), background the app.
- [ ] After 5-10s, foreground the app.
- [ ] No alert toast. Final state matches whatever the user expects from the
      tap; if iOS aborted the request, diagnostics show `aborted: true` and
      the UI does not surface an alert.

### 5. Language Setting Sync (no false open alerts)

- [ ] Open a room. Change the speech language. Wait for the PATCH.
- [ ] Even if the PATCH fails (try with airplane mode briefly), no
      `Failed to open` toast appears. The languages should optimistically
      revert to the previous values when the request fails.
- [ ] Repeat for translation-linked toggle and selected-language change.
- [ ] All three must produce diagnostics warnings labelled
      `selected-languages` / `speech-languages` / `translation-linked` — never
      a user-facing open/pause toast.

### 6. Final List State Sanity

- [ ] Return to the conversation list. The status indicator on each row must
      match the actual mic / native STT state for that room (no row stuck on
      "active" when STT is not running).

## Diagnostics Logging Reference

The dev-only logger emits a single `console.warn` per failure, payload shape:

```text
[mingle][conversation-list] mutation failure {
  label: "status-change" | "selected-languages" | "speech-languages"
       | "translation-linked" | "route-open" | "popstate-open" | "create",
  conversationId: "<id>",
  method: "PATCH",
  path: "/api/.../conversations/<id>",
  responseStatus?: <number>,
  responseBody?: <string preview>,
  error: { name?, message? } | null,
  stale: boolean,
  aborted: boolean,
}
```

- `stale: true` — a newer mutation already supersedes this one. **Expected**
  during rapid start/stop bursts. No user alert was shown.
- `aborted: true` — the previous AbortController fired. **Expected** when a
  newer mutation cancels the in-flight one. No user alert was shown.
- `stale: false, aborted: false` for `status-change` — a real failure that
  did roll back local state and showed the alert. Capture and share.

## Capturing Logs For The Issue

If a real failure (not stale, not aborted) reproduces, copy the full warn
payload from Safari Web Inspector and attach it along with:

- iOS device model and OS version.
- devbox tunnel mode (local 127.0.0.1 vs Cloudflare).
- Approximate timing between taps that triggered the burst.
- Whether the conversation already existed or was just created.

This is enough context for follow-up without re-running the full repro.
