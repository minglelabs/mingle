# Group Voice Room — Design & Implementation Plan

Phase 1 planning document. **Nothing in Phases 2–4 below is implemented yet.**
Feature: real-time group voice talk inside an existing chat room (대화방), with a
hidden server interpreter agent providing live interpretation. Architecture is
**SFU (self-hosted LiveKit) + server interpreter agent**, not P2P. Max 8 people.

Reference handoff: `codex/voicetalk-hash-rush-planning-1db1e3` →
`docs/voicetalk-hashrush-handoff.md` (sections 2.1/2.2/2.5/3/7/8) and the POC in
`mingle-voice-agent/`. This doc is the Phase-2+ execution plan derived from them.

---

## 0. Decisions locked (from handoff §2.5)

- **SFU = self-hosted LiveKit**, already running and verified at
  `wss://voice.minglelabs.app` (Caddy TLS → LiveKit 1.13.11 on the dev PC). The
  POC proved STT→translate→TTS at ~2.4 s median end-to-end on a LAN dev server.
- **MVP scope:** group room, **max 8** participants. UI/UX modeled on
  Clubhouse / HelloTalk voice rooms.
- **RN voice UI uses native `@livekit/react-native`, NOT WebView.** This is a
  deliberate departure from the rest of the app, which is a WebView host with
  native bridges (`rn/src/nativeStt.ts`, `nativeTts.ts`, `nativeAudioRoute.ts`,
  `nativePip.ts`). WebRTC needs lock-screen/background audio, the audio route,
  AEC and CallKit/ConnectionService — only reachable from a native module.
- **Interpreter is a hidden LiveKit participant** (`role=interpreter`) that joins
  the room, runs Soniox STT → GPT/Gemini translation → Gemini TTS, and publishes
  one translated audio track **per target language** (`tr:ja`, `tr:en`, …). It is
  reused directly from the POC (`mingle-voice-agent/`), deployed as its own
  Railway service (outbound WebRTC only, so no public UDP ingress needed).
- **Billing (later phase):** no per-call fee. Interpretation minutes are charged
  with the existing coin system — **8 coins/min** voice (translation incl.),
  **13 coins/min** when TTS is on. `COIN_BILLING_ENABLED=shadow` in prod today.
- **CallKit:** in MVP, use a Live Activity ("번역 중" indicator), not a full
  CallKit call (App Store risk if it is not a real phone call).

---

## 1. Where this lives in the repo (conventions observed)

- **DB / Prisma:** `mingle-app/prisma/schema.prisma`, `schema=app`. Models use
  `@@map("app_*")` snake_case table names, cuid ids, `@map` snake_case columns,
  `created_at`/`updated_at` timestamps. Chat rooms are
  `AppConversationChannel` (`app_conversation_channels`) with
  `AppConversationChannelMember` (`app_conversation_channel_members`,
  role `owner|member`, soft-leave via `leftAt`). A room is keyed by
  `sessionKey` and already enforces membership-gated reads/writes.
- **API routes:** thin files in `src/app/api/<route>/route.ts` that delegate to a
  controller `@/server/api/controllers/shared/<x>-controller.ts`. Example:
  `conversations/list-realtime-token/route.ts` →
  `getConversationListRealtimeTokenResponse` → `mintConversationListRealtimeToken`.
  The voice-room token endpoint follows this exact shape.
- **Versioned API namespace:** each mobile release gets
  `src/app/api/{ios,android}/vX.Y.Z/<route>/route.ts` that re-exports the base
  route handler. Parity is enforced by `*.namespace-routing.test.ts` and
  `namespace-reexport.*.guard.test.ts`. The **current dev namespace is `v2.3.0`**
  (see `mingle-app/package.json` `rn:ios` / `rn:android`).
- **Version policy (project rule):** the **mobile app version and the API
  namespace version must always match**. Shipping the voice room in app `v2.3.0`
  means every new voice route must also exist under `ios/v2.3.0` and
  `android/v2.3.0` (re-exports), and the parity guard tests must pass. You cannot
  deploy with app version and API namespace mismatched.
- **RN app:** `mingle-app/rn/` (React Native, `App.tsx` + `rn/src/*`). It is a
  WebView host; native features are bridges in `rn/src/native*.ts`. The voice
  room is the first screen that must be **native React Native**, not web.
- **Existing building blocks to reuse** (handoff §7):
  - `mingle-stt/stt-server.ts`, `mingle-stt/segmentation-strategy.ts` — Soniox.
  - `mingle-app/src/server/translation/translate-texts.ts` — GPT-6-luna, priority tier.
  - `mingle-app/src/server/api/shared/tts-provider.ts` — Gemini Interactions TTS.
  - `mingle-app/src/lib/tts-models.ts`, `translation-models.ts`.
  - conversation-limits (max 10 members today; voice caps at 8).

---

## 2. RN screen proposal

UX language: Clubhouse / HelloTalk voice rooms. All screens are native RN.

### 2.1 Room banner inside the chat room (entry point)
A sticky banner at the top of the 대화방 message list when a voice room is live.

```
┌──────────────────────────────────────────────┐
│ 🎙  Voice talk · 3/8   [🔵🟢🟣]      ┌────────┐ │
│     Mia, Ken, +1 speaking            │  Join  │ │
└──────────────────────────────────────┴────────┘
```
- Shows live count `N/8`, up to ~3 speaker avatars, a "Join" button.
- When no room is live, the chat composer / header shows a **"Start voice talk"**
  affordance (room owner or any member, per open question Q3).

### 2.2 Room screen (full screen)
Speaker grid, Clubhouse-style, max 8 tiles.

```
┌──────────────────────────────────────────────┐
│  ← 대화방 title                 🌐 Interpret ●  │
│                                                │
│     ╭─────╮     ╭─────╮     ╭─────╮            │
│     │ ((A))│     │  B  │     │ ((C))│   speaking│
│     ╰─────╯     ╰─────╯     ╰─────╯   = glowing │
│      Mia         Ken         Sora      ring     │
│     ╭─────╮     ╭─────╮                         │
│     │  D  │     │  +  │                         │
│     ╰─────╯     ╰─────╯                         │
│      You        invite                          │
│                                                │
│  ┌──────────────────────────────────────────┐ │
│  │ 🌐 Sora: 안녕하세요 → Hello everyone        │ │  live captions
│  │ 🌐 Ken: how is the weather → 날씨 어때요    │ │  (orig → your lang)
│  └──────────────────────────────────────────┘ │
│                                                │
│   🎤 Mute   🔊 Speaker   🌐 Interpret   ⟳ Vol  │   ⎋ Leave
└──────────────────────────────────────────────┘
```
- **Speaking ring:** animated glow around a tile driven by LiveKit
  `ActiveSpeakersChanged` / audio levels.
- **Avatars:** `User.image` / `imageObjectKey`, same source as chat.
- **Controls bar:** Mute (mic), Speaker (audio route toggle, reuse
  `nativeAudioRoute` concept), **Interpret toggle** (sets LiveKit participant
  attribute `interpret=on|off` — the POC's `setAttributes({interpret})` model),
  Volume mix (original-vs-interpreted balance, POC's 2-stage fader), Leave.
- **Live captions:** subscribe to the interpreter's data channel (POC topic
  `interpreter`, event types `partial|final|translation|play|lane`), render
  original → your-language lines.

### 2.3 Mini floating bar (while browsing chat)
When the user leaves the room screen but stays in the room, a draggable pill
overlays the chat (like a PiP), reusing the `nativePip` concept.

```
┌───────────────────────────────┐
│ 🎙 12:34 · 3 speaking   ⬜ ⎋   │   tap = reopen room, ⎋ = leave
└───────────────────────────────┘
```

### 2.4 End-of-call system message
On room end, a system message is posted into the 대화방 timeline, same pattern as
the existing "X invited Y" / "X left" notices (handoff §2.2):

```
🎙 Voice talk · 12:34
3 participants · transcript ▸
```
- Tapping "transcript" opens the saved caption/transcript (original + translation),
  reusing the existing message-detail route.

---

## 3. Data model (Prisma, `schema=app`)

New models (names follow `AppConversation*` conventions). Additive only.

```prisma
model AppVoiceCall {
  id            String    @id @default(cuid())
  channelId     String    @map("channel_id")          // -> AppConversationChannel
  // LiveKit room name. Deterministic from the channel so re-joins hit one room.
  livekitRoom   String    @unique @map("livekit_room") // e.g. "voice-<channelId>"
  status        String    @default("live")             // "live" | "ended"
  startedByUserId String  @map("started_by_user_id")
  maxParticipants Int     @default(8) @map("max_participants")
  startedAt     DateTime  @default(now()) @map("started_at")
  endedAt       DateTime? @map("ended_at")
  // Billing window + aggregate (coins) once Phase-4 billing lands.
  interpretedMs Int       @default(0) @map("interpreted_ms")
  createdAt     DateTime  @default(now()) @map("created_at")
  updatedAt     DateTime  @updatedAt @map("updated_at")

  channel      AppConversationChannel      @relation(fields: [channelId], references: [id], onDelete: Cascade)
  participants AppVoiceCallParticipant[]

  @@index([channelId, status], map: "app_voice_calls_channel_status_idx")
  @@index([status, startedAt], map: "app_voice_calls_status_started_at_idx")
  @@map("app_voice_calls")
}

model AppVoiceCallParticipant {
  id            String    @id @default(cuid())
  callId        String    @map("call_id")
  userId        String    @map("user_id")
  role          String    @default("speaker")  // "speaker" (MVP: all speakers; "listener" reserved)
  interpretOn   Boolean   @default(true) @map("interpret_on")
  speechLanguage String?  @map("speech_language") // language this user speaks
  joinedAt      DateTime  @default(now()) @map("joined_at")
  leftAt        DateTime? @map("left_at")
  // Billable interpreted seconds attributed to this participant (Phase 4).
  interpretedMs Int       @default(0) @map("interpreted_ms")

  call AppVoiceCall @relation(fields: [callId], references: [id], onDelete: Cascade)
  user User         @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([callId, userId], map: "app_voice_call_participants_call_user_uidx")
  @@index([userId, joinedAt], map: "app_voice_call_participants_user_joined_idx")
  @@map("app_voice_call_participants")
}
```
- `AppConversationChannel` gains `voiceCalls AppVoiceCall[]`; `User` gains
  `voiceCallParticipations AppVoiceCallParticipant[]` (back-relations).
- Optional transcript persistence: either reuse `AppMessage` with a
  `metadata.kind = "voice_transcript"` (no new table), or add
  `AppVoiceCallTranscript` later. **Decide in Phase 2 (Q6).**
- **Migration authoring note (IMPORTANT, matches repo reality):** the repo's
  history contains `20260803150000_add_app_event_log_message_event_type_unique`
  which mixes a `DELETE` with `CREATE INDEX CONCURRENTLY`, so
  `prisma migrate dev --create-only` cannot build a shadow DB from scratch
  (P3006). Follow the pattern already used by
  `20260926091500_add_conversation_share_title_snapshot`: generate the SQL with
  `prisma migrate diff --from-schema-datamodel … --to-schema-datamodel … --script`
  (in-memory diff, no shadow replay) and hand-place it as the migration body.

---

## 4. API endpoints

All new routes follow the thin-route → controller pattern and must be mirrored
into the current namespace (`ios/v2.3.0`, `android/v2.3.0`) as re-exports.

### 4.1 `POST /api/conversations/{conversationId}/voice/token`  (join token)
- Base route: `src/app/api/conversations/[conversationId]/voice/token/route.ts`
  → `postVoiceCallTokenResponse` in
  `src/server/api/controllers/shared/voice-calls-controller.ts`.
- Behavior:
  1. Resolve the authenticated user (same `requireUser` path the conversations
     controller uses).
  2. **Room-member check:** verify the user is an active member of the channel
     (`AppConversationChannelMember` with `leftAt: null`). Non-members → 403.
  3. Create or fetch the live `AppVoiceCall` for the channel; enforce the
     **8-participant cap**; upsert the `AppVoiceCallParticipant` row.
  4. Mint a LiveKit access token (server-side, `livekit-server-sdk`) with the
     participant identity = userId, `name` = handle, and attributes
     `{lang, interpret, role}` — the POC's `createJoinToken` in
     `mingle-voice-agent/token.ts` is the reference.
  5. Return `{ url: LIVEKIT_URL, token, room, call: {...} }`.
- Token signing uses server env `LIVEKIT_URL` / `LIVEKIT_API_KEY` /
  `LIVEKIT_API_SECRET` (Railway vars; devbox Vault locally). **Never shipped to
  the client except as the minted JWT.**

### 4.2 `POST /api/conversations/{conversationId}/voice/leave`  (optional)
- Marks the participant `leftAt`, and if the room is empty, flips the call to
  `ended` and posts the end-of-call system message. (The webhook below is the
  authoritative end signal; this is a fast-path for a clean leave.)

### 4.3 `POST /api/webhooks/livekit`  (LiveKit server webhook)
- Base route: `src/app/api/webhooks/livekit/route.ts` (sibling of the existing
  `webhooks/polar`, `webhooks/googleplay`).
- Verifies LiveKit's webhook signature (`WebhookReceiver` from
  `livekit-server-sdk`, HMAC with the API key/secret).
- Handles `room_started`, `participant_joined/left`, `room_finished` →
  updates `AppVoiceCall` / `AppVoiceCallParticipant`, computes the call
  duration, posts the end-of-call system message, and (Phase 4) finalizes coin
  charges from `interpretedMs`.

### 4.4 Namespace + version policy impact
- Add re-export routes under `ios/v2.3.0/**` and `android/v2.3.0/**` for every
  new base route, and extend the parity guard tests. Because **app version ≡ API
  namespace version**, the voice room ships in app `v2.3.0` only; a later app
  bump (`v2.4.0`) requires the routes copied forward to that namespace too.

---

## 5. Interpreter agent plan

- **Reuse the POC as-is.** `mingle-voice-agent/` is a standalone package
  (own `package.json`/lockfile) and is **not** wired into the `mingle-app`
  workspace. Keep it a separate service; do not fold it into `mingle-app`.
  - Decision: **keep `mingle-voice-agent/` where it is** (repo root). It already
    has `interpreter.ts` (the 388-line core agent), `token.ts`, `poc-server.ts`,
    `soniox-stream.ts`, `translate.ts`, `tts.ts`, `audio.ts`, `chunk-queue.ts`,
    `agent.ts` (standalone CLI). Only `poc-server.ts` + `public/index.html` are
    POC-only test scaffolding and can be dropped from the production deploy.
- **Where it runs:** its own **Railway service** (handoff §2.5/§8). The agent
  only makes an **outbound** WebRTC connection to `wss://voice.minglelabs.app`,
  so Railway's lack of public UDP ingress does not matter.
- **How it joins:** on `room_started` (or lazily when the first human joins), the
  app signals the agent to join (or the agent subscribes to LiveKit room events
  and auto-joins rooms matching `voice-*`). The agent joins with identity
  `interpreter-<room>`, `role=interpreter` (hidden from the human grid via the
  `role` attribute). `ensureInterpreter(room)` keeps exactly one agent per room
  and auto-leaves 30 s after the last human (`IDLE_LEAVE_MS`).
- **Pipeline (unchanged from POC):** per-speaker `AudioStream` (16 kHz) →
  `SonioxStream` → on `final`, translate per target language
  (`translateUtterance`) → `synthesizeStream` (Gemini TTS) → publish into the
  per-language track `tr:<lang>`; emit `partial/final/translation/play/lane`
  data messages on topic `interpreter` for live captions.
- **Cost control (later):** only run a speaker's STT when at least one listener
  needs a different language; MVP runs STT for all speakers (POC behavior).

---

## 6. Phased implementation

### Phase 2 — Backend (app server + DB)
Files to create/modify:
- `mingle-app/prisma/schema.prisma` — add `AppVoiceCall`,
  `AppVoiceCallParticipant`, back-relations.
- `mingle-app/prisma/migrations/<ts>_add_voice_calls/migration.sql` — authored
  via `prisma migrate diff --script` (see §3 note).
- `mingle-app/src/server/api/controllers/shared/voice-calls-controller.ts` —
  `postVoiceCallTokenResponse`, `postVoiceCallLeaveResponse`.
- `mingle-app/src/server/voice/livekit-token.ts` — wraps `livekit-server-sdk`
  `AccessToken` (identity, attributes, grants). Add `livekit-server-sdk` to
  `mingle-app` deps.
- `mingle-app/src/server/voice/livekit-webhook.ts` — `WebhookReceiver` verify +
  event handlers.
- Base routes: `conversations/[conversationId]/voice/token/route.ts`,
  `conversations/[conversationId]/voice/leave/route.ts`,
  `webhooks/livekit/route.ts`.
- Namespace re-exports under `ios/v2.3.0/**` and `android/v2.3.0/**`.
- Tests: `voice-calls-controller.test.ts`, `webhooks/livekit` verify test,
  namespace parity tests extended.

**Acceptance criteria**
- A room member gets a valid LiveKit join token; a non-member gets 403.
- The 8-participant cap is enforced (9th join → 409/403).
- LiveKit `room_finished` webhook flips the call to `ended`, stamps duration,
  posts the end-of-call system message.
- `pnpm test:unit` + namespace parity/guard tests green.
- Migration applies cleanly on a fresh local DB with `prisma migrate deploy`.

### Phase 3 — RN UI + native LiveKit module
Files to create/modify:
- `mingle-app/rn/package.json` — add `@livekit/react-native` +
  `@livekit/react-native-webrtc`; iOS pods + Android gradle wiring; mic +
  background-audio permissions (`NSMicrophoneUsageDescription`, iOS background
  audio mode, Android `RECORD_AUDIO` + foreground service).
- `mingle-app/rn/src/voice/` — native RN screens: `VoiceRoomScreen`,
  `VoiceRoomBanner`, `VoiceMiniBar`, speaker grid + speaking-ring component,
  captions view, controls bar.
- `mingle-app/rn/src/nativeVoice.ts` — bridge/state: token fetch from the API,
  LiveKit connect, `autoSubscribe:false` + per-language subscription and the
  original/interpreted volume mix (POC `syncSubscriptions`/`applyVolumes`),
  `setAttributes({interpret})`, data-channel caption parsing.
- Wire the banner/mini-bar into the existing chat WebView host (a native overlay
  above the WebView, communicating via the existing RN↔WebView bridge).
- iOS Live Activity ("번역 중") instead of CallKit for MVP.

**Acceptance criteria**
- Two real devices join one room over `wss://voice.minglelabs.app`, hear each
  other, and see speaking rings update live.
- Interpret toggle subscribes/unsubscribes the `tr:<lang>` track and shifts the
  volume mix; captions render original → user language.
- Mini-bar persists while browsing chat; Leave tears the room down and (last
  leaver) triggers the end-of-call message.
- Audio keeps playing on lock screen / app background (native module confirmed).

### Phase 4 — Interpreter agent deploy + billing
Files to create/modify:
- `mingle-voice-agent/` — strip POC-only `poc-server.ts` + `public/` from the
  production entry; add a Railway service config; auto-join on `voice-*` rooms.
- `mingle-app` — webhook/agent handshake to ensure the interpreter is present;
  attribute the interpreter's `interpretedMs` back to the call/participants.
- Billing: integrate `interpretedMs` with the coin charge path
  (`POST /api/internal/coins/charge`, `COIN_INTERNAL_SECRET`), honoring
  **8 coins/min** (voice) / **13 coins/min** (voice + TTS), under
  `COIN_BILLING_ENABLED` (shadow → enforce). Specs:
  `docs/coin-iap-spec.md`, `docs/coin-iap-implementation.md`.
- "Only run STT when a listener needs another language" optimization.

**Acceptance criteria**
- Interpreter auto-joins a live room, publishes `tr:<lang>` tracks, emits
  captions; auto-leaves 30 s after the last human.
- Coin charges in shadow mode match the pricing table and deduct correctly once
  enforced.

---

## 7. Local dev DB (Phase-1 result — already done)

- PostgreSQL 12 runs in **WSL2 Ubuntu** (the Windows host has no Postgres/Docker;
  devbox is macOS/bash-only so it cannot run here — this is the Windows
  equivalent). Role `mingle`, database `mingle_app`, schema `app`.
- All **98 migrations applied** with `prisma migrate deploy`; schema up to date.
- The app server runs on **Windows** (`pnpm dev`) and connects to the WSL DB via
  `127.0.0.1:5432` (WSL2 localhost forwarding). Verified end-to-end (md5 auth +
  query from a Windows Node process; 58 tables in `app`).
- Two PG-12 compatibility fixes were needed on this fresh DB (prod/Railway
  already has them): (1) the mixed-DML `CONCURRENTLY` migration
  `20260803150000` was applied with a plain unique index; (2) `pgcrypto` was
  installed **into the `app` schema** so `gen_random_uuid()` resolves under
  `search_path=app` (PG 12 has no built-in `gen_random_uuid`).
- **Never touched Railway prod.** Local only.

Restart commands are in the final report / README of this branch.

---

## 8. Open questions for the user

1. **LiveKit for production:** stay on the self-hosted `voice.minglelabs.app`
   box for the MVP launch, or move to LiveKit Cloud / a dedicated VM before
   real users? (Self-host is one PC today — single point of failure.)
2. **Translation provider in the agent:** OpenAI (`gpt-6-luna`) key is currently
   401 in local/dev env; the POC falls back to Gemini. Ship MVP on Gemini
   translation, or provision a working OpenAI key first?
3. **Who can start a room:** room owner only, or any member? Any member for MVP?
4. **Listener role / non-speakers:** MVP treats all 8 as speakers. Do we need a
   Clubhouse-style "audience + raise hand" split, or is 8 speakers enough for v1?
5. **Transcript persistence:** reuse `AppMessage.metadata` (no new table) or add
   a dedicated `AppVoiceCallTranscript`? Affects how the end-of-call "transcript"
   link is stored and retrieved.
6. **Interpreter trigger:** app-driven (webhook tells the agent to join) or
   agent-driven (agent watches LiveKit for `voice-*` rooms and self-joins)?
7. **Target namespace:** ship voice in app `v2.3.0` (current dev namespace), or a
   fresh `v2.4.0`? Determines which `ios/android/vX.Y.Z` tree the routes go in.
