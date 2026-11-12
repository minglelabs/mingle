---
id: voice-talk-stt-unified
title: A call takes over the room's speech-to-text; Start and speaker mode are locked, the mic is the call's
priority: P0
environment: assisted
tags: [voice-talk, stt, mic, livekit, audio-session]
taste: [T2, T3, T4, T5, T20]
paths:
  - mingle-app/src/components/LivePhoneDemo/VoiceTalkPanel.tsx
  - mingle-app/src/components/LivePhoneDemo/LivePhoneDemo.tsx
  - mingle-app/rn/src/voice/**
  - mingle-app/rn/src/nativeVoice.ts
  - mingle-app/rn/src/nativeStt.ts
  - mingle-app/rn/ios/mingle/NativeSTTModule.swift
  - mingle-app/rn/ios/mingle/NativeSTTModuleBridge.m
  - mingle-app/src/server/voice/**
  - mingle-app/src/app/api/webhooks/livekit/**
  - mingle-app/src/server/api/controllers/shared/voice-call-controller.ts
  - mingle-app/src/app/api/conversations/*/voice/**
  - mingle-app/src/app/api/ios/*/conversations/*/voice/**
  - mingle-app/src/app/api/android/*/conversations/*/voice/**
  - mingle-app/rn/ios/mingle/AppDelegate.swift
  - mingle-app/rn/ios/mingle/Info.plist
history:
  - 2026-11-11 — 보이스톡 통역을 서버 통역봇으로
  - 2026-11-11 — 보이스톡 패널: 아이콘 버튼 네 개, 읽어 주기 분리
  - 2026-11-10 — 보이스톡과 STT 통합: 마이크 하나, 글은 대화방 메시지로
  - 2026-11-10 — 보이스톡: 패널 먼저, 참여는 패널에서 / 키보드 + 메뉴 / 시작 알림 / 목록 표시
  - 2026-10-31 — 그룹 보이스룸 RN UI (Phase 3)
---

In a call this phone runs no speech-to-text of its own. The room's Start/Stop and speaker (earphone) buttons are
locked while the phone is in the call, a session that was running stops on joining, and both come back as they
were after leaving. What people say is written down by the server's interpreter, only while someone has
interpretation on (see `voice-talk-interpretation`). This replaces the 2026-11-10 rule "joining turns STT on".

## Second participant

Audio checks need a second participant in room `QA A`. Use the first that is available and say which in the report:

1. **QA simulator** signed in as a second QA account (`qa-agent-2+<worktree-name>@mingle.test`, created like the
   first and added to `QA A` through an invite link). Ask the owner to wear earphones on one side.
2. **The owner's second phone**, signed in to another account in the same room.
3. **None**: run the solo steps (1–6) and put the two-party checks on the manual list.

The devbox must have LiveKit configured (`POST .../voice/token` answers 200, not `voice_unavailable`). If it does
not, the scenario is `blocked`.

## Steps

Solo (phone only):
1. In `QA A`, voice mode, tap Start (`live-demo-mic-button`): STT runs.
2. Tap `live-demo-voice-talk-button`, confirm with `voice-talk-start-confirm-button`. Screenshot every ~300 ms for
   5 s: the panel goes "연결 중…" → "보이스톡 · 1/8", my seat ("나") and one open seat (dashed, `+`).
3. QA snapshot: `micVisualState` is `idle` (the running session stopped on joining). `live-demo-mic-button` and
   `live-demo-earphone-mode-toggle` are disabled; tapping them does nothing.
4. The panel's bottom row: four round icon buttons, no words: `voice-talk-mic-toggle` (red), `voice-talk-interpret-toggle`
   (gray), `voice-talk-listen-toggle` (dimmed while interpret is off), `voice-talk-leave` (gray). Read their
   accessibility labels ("내 목소리 켜짐", "통역 꺼짐", ...).
5. Tap `voice-talk-mic-toggle`: it turns gray with a slashed mic, my seat shows the mute icon; tap again.
6. Tap `voice-talk-leave`. The panel closes; Start and the speaker button work again; STT is not started by itself.

Two parties (assisted):
7. The second participant joins. Each side speaks one fixture sentence with interpretation off on both sides:
   - each hears the other; the speaking ring follows whoever talks;
   - no room message appears for either sentence (nobody reads it).
8. Lock the phone for 10 s and unlock it: the call is still running, the mic state is unchanged (T2, T5).
9. Open the room list and come back: still in the call, the buttons show the same states (T5).

## Oracle (pass when)

- In a call, Start/Stop and the speaker button are locked and nothing starts speech-to-text on the phone (T5, T20).
- A running session stops on joining; after leaving both buttons work again and nothing starts by itself.
- The four panel buttons are icons only, at least 48 pt tall, with clear gaps (T21), and say their state in color.
- With two parties: voice is heard both ways, no echo, and nothing is written into the room unless someone has
  interpretation on.
- No audio route change (speaker ↔ receiver) when joining or leaving.

## Signals

- Device log: `[NativeSTTModule] setVoiceCallActive`, `configureAudioSession ... mode=AVAudioSessionModeVoiceChat`.
- `app_event_logs`: a `stt_session_stopped` on joining when STT was on, no `stt_session_started` during the call.
- `GET .../voice`: participants before and after leaving.

## Manual follow-up

- AirPods during a call: both directions.
- A network drop mid-call (airplane mode for 5 s): the call recovers, or ends cleanly.
