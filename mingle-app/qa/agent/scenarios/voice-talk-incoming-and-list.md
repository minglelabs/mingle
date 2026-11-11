---
id: voice-talk-incoming-and-list
title: Someone else starts voice talk; push, panel offer (join, decline, just look) and list badges
priority: P1
environment: assisted
tags: [voice-talk, push, conversation-list, incoming]
taste: [T5, T9, T10, T19, T22]
paths:
  - mingle-app/src/components/LivePhoneDemo/VoiceTalkPanel.tsx
  - mingle-app/src/components/conversation-list.tsx
  - mingle-app/src/lib/app-conversations.ts
  - mingle-app/src/server/push-notifications.ts
  - mingle-app/src/server/voice/voice-calls.ts
  - mingle-app/src/server/api/controllers/shared/voice-call-controller.ts
  - mingle-app/rn/src/pushNavigation.ts
history:
  - 2026-11-10 — 보이스톡: 패널 먼저, 참여는 패널에서 / 키보드 + 메뉴 / 시작 알림 / 목록 표시
---

## Second account

The call is started by a second QA account that is a member of `QA A` (see `voice-talk-stt-unified`). The agent can
start the call without a second device: `POST /api/<namespace>/conversations/<QA A id>/voice/token` with the second
account's session (`{ "lang": "en" }`). That records the call and sends the start push, but nobody is connected to
LiveKit, so the server drops the seat after its grace period; do the steps within a minute or call it again.

## Steps

1. The phone is on the room list. The second account starts the call.
2. Push: on the lock screen / banner, "보이스톡 · QA Agent 2님이 보이스톡을 시작했어요". Screenshot it if the device
   shows it (needs APNs configured for the devbox; otherwise `manual`).
3. List: row `QA A` shows the green phone badge with the participant count. Another room where this phone runs STT
   only shows the amber mic "STT" badge instead. Screenshot both.
4. Tap the push (or the row). The room opens and the panel appears by itself with `voice-talk-dismiss` ("거절") and
   `voice-talk-join` ("참여"), the second account in a seat.
5. Fold the panel and read the room for 10 s ("just look"): messages stay readable, nothing covers the bottom bar.
6. Tap 거절. The panel goes away and does not come back while that call is live, also after leaving the room and
   coming back. The bottom-bar phone button shows the green dot; tapping it opens the panel again.
7. Tap 참여. The phone joins (see `voice-talk-stt-unified` for the audio).
8. The second account leaves (`POST .../voice/leave`). Within a few seconds the list badge goes away without a
   manual refresh.

Declined calls stay declined:
- Decline the incoming card, close the app completely, reopen the room while the call is still live: no card for
  that call (the room message still joins). A later new call offers a card again.

## Oracle (pass when)

- The push names the starter, in the recipient's language, and opens that room (T9).
- The list tells a voice talk room (green phone + count) apart from an STT-only room (amber mic), and updates on
  join/leave without pull-to-refresh (T5).
- An incoming call offers join and decline; folding leaves the room usable (T10). Decline is remembered for that
  call only (T22: no repeated prompt).
- The phone button and the `+` menu row show the live state (green) while a call is live (T19).

## Signals

- Server log: `[voice] start_push_failed` must not appear; push delivery rows if APNs is configured.
- `GET /api/<namespace>/conversations`: `voiceCallParticipantCount` on `QA A` while the call is live.

## Manual follow-up

- A push on a real lock screen, in Korean and English, with the app in the background and killed.
- Two calls in a row in the same room: the second one shows the panel again even after a decline.
