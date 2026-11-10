---
id: voice-talk-stt-unified
title: Joining voice talk turns on the room's speech-to-text; one mic, text only as room messages
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
  - 2026-11-10 — 보이스톡과 STT 통합: 마이크 하나, 글은 대화방 메시지로
  - 2026-11-10 — 보이스톡: 패널 먼저, 참여는 패널에서 / 키보드 + 메뉴 / 시작 알림 / 목록 표시
  - 2026-10-31 — 그룹 보이스룸 RN UI (Phase 3)
---

Voice talk and the room's STT are one microphone. STT alone sends speech as messages; with voice talk on, the
voice is sent as well. The call panel has no captions and no mic button; what people say appears as the room's
messages.

## Second participant

Audio checks need a second participant in room `QA A`. Use the first that is available and say which in the report:

1. **QA simulator** signed in as a second QA account (`qa-agent-2+<worktree-name>@mingle.test`, created like the
   first and added to `QA A` through an invite link). The simulator uses the Mac's microphone and speakers, so
   ask the owner to wear earphones on one side to avoid feedback.
2. **The owner's second phone**, signed in to another account in the same room.
3. **None**: run the solo steps (1–6, 9–10) and put the two-party checks on the manual list.

The devbox must have LiveKit configured (`POST .../voice/token` answers 200, not `voice_unavailable`). If it does
not, the scenario is `blocked`.

## Steps

Solo (phone only):
1. In `QA A`, voice mode, STT idle. Tap `live-demo-voice-talk-button`, then `voice-talk-join`.
2. Screenshot every ~300 ms for 5 s. Panel: "연결 중…" → "보이스톡 · 1/8", my seat filled ("나").
3. QA snapshot: `micVisualState` becomes `running` without anyone tapping Start. Start shows Stop.
4. Check the panel's controls: only 통역 (interpret) and 나가기 (leave). No caption lines, no mic button.
5. Tap Stop. STT stops; the panel stays connected. Device log (`logs --grep "setVoiceCallActive\|voice"`) shows the
   call mic muted (`native_voice_set` mic false). Tap Start again: STT runs and the call mic is back on.
6. Tap 나가기. The panel closes and STT stops (the call started it).
7. Start STT first by hand (Start), then join voice talk. Leave the call: STT keeps running (it was on before).
   Stop STT.

Two parties (assisted):
8. The second participant joins. Each side speaks one fixture sentence (ko on the phone, en on the other side).
   - The phone hears the other voice; the panel's speaking ring follows whoever talks.
   - Each sentence appears once as a room message with its translations, on both sides (T3, T4).
9. Lock the phone for 10 s and unlock it: the call and STT are both still running (T2).
10. Open the room list and come back: still running (T2).

## Oracle (pass when)

- Joining turns STT on by itself; leaving turns it off only when the call turned it on (T5).
- During a call, Stop/Start mutes and unmutes the call mic with the STT session; the mic button never shows a
  state that differs from the call (T5).
- The panel shows no text of its own and no duplicate mic control (T20).
- With two parties: voice is heard both ways, there is no echo or double audio from STT playback, and each spoken
  sentence becomes exactly one message per side (T4).
- No audio route change (speaker ↔ receiver) when STT starts or stops during the call.

## Signals

- Device log: `[NativeSTTModule] setVoiceCallActive`, `configureAudioSession ... mode=AVAudioSessionModeVoiceChat`,
  `[MingleAudioSessionCoordinator] skip deactivate ... ` while the call is on.
- `app_event_logs`: `stt_session_started` / `stt_session_stopped` around join and leave.
- `GET .../voice`: participants before and after leaving.

## Manual follow-up

- AirPods during a call: both directions, and STT still transcribes.
- Interpretation voice (통역) once the interpretation agent runs on the devbox.
- A network drop mid-call (airplane mode for 5 s): STT and the call recover, or the call ends cleanly.
