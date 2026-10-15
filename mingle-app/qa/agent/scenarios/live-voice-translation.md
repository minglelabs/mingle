---
id: live-voice-translation
title: Live speech shows partial text, accurate recognition and quick translation
priority: P0
environment: real-device
tags: [stt, translation, live, bubbles]
taste: [T3, T4, T5, T23]
paths:
  - mingle-app/src/components/LivePhoneDemo/use-realtime-stt*.ts
  - mingle-app/src/components/LivePhoneDemo/useRealtimeSTT.ts
  - mingle-app/src/components/LivePhoneDemo/durable-message-finalization.ts
  - mingle-app/src/components/LivePhoneDemo/utterance-order.ts
  - mingle-app/src/components/LivePhoneDemo/voice-order-reservation.ts
  - mingle-app/src/components/LivePhoneDemo/conversation-live.ts
  - mingle-app/src/app/api/translate/**
  - mingle-app/rn/src/nativeStt*.ts
  - mingle-app/rn/ios/mingle/NativeSTTModule.swift
  - mingle-stt/**
history:
  - 2026-09-17 — Bound Soniox startup and propagate terminal STT failures
  - 2026-09-30 — Same-language row of mixed-language speech disappeared after finalization
  - 2026-05-25 - Native STT Stop Button Flicker
  - 2026-09-08 - Stream counterpart speech before finalization
---

## Speech source

The simulator listens to the Mac's default input device, and the agent cannot speak. Use the first source that is
available, and say which one in the report:

1. **Injected audio**: the QA-only audio injection hook (`qaInjectAudio`), with fixtures that carry ground-truth
   transcripts. This gives a CER score.
2. **Played audio**: only when the owner agreed to it for this run. Play a fixture through the Mac speakers with
   `afplay` while the Mac microphone is the input. Recognition accuracy is then "not scored".
3. **None**: run steps 1, 2 and 6 for the state checks, and put the speech checks on the real-device list.

## Preconditions

- Signed in, in a room with Korean, English and Japanese set.

## Steps

1. Tap Start (`live-demo-mic-button`). Screenshot every ~300 ms until the mic shows running (5 frames at most).
2. Take a QA snapshot: `micVisualState` should be `running`.
3. Feed one short utterance per language (ko, en, ja), then one mixed ko+en utterance. While each one plays, screenshot every second.
4. After each utterance ends, keep taking screenshots until the translation rows settle (10 s at most).
5. Let the room run idle for 10 s and check that nothing new appears.
6. Tap Stop. Screenshot every ~300 ms for 2 s.

## Oracle (pass when)

- Start: the mic goes idle → connecting → running with no bounce, and Connecting does not stay up once text is arriving (T5).
- Partial text appears while the utterance is still playing (T3).
- Every utterance keeps its words. Mixed speech keeps both parts after finalization. No empty or duplicate rows (T4).
- Translation rows score average ≥ 4.0 on the rubric. Latency is ≤ 2 s from source finalization to visible translation.
- With injected audio: CER ≤ 5 % per utterance.
- Stop: the mic goes to idle once and stays there (T5).

## Signals

- `app_event_logs` for the run: `stt_session_started`, `stt_turn_started`, `stt_turn_finalized` (count must equal the number of utterances) and `stt_session_stopped`.
- Device log: `xcrun simctl spawn <udid> log show --last 5m --predicate 'process == "mingle"'`, filtered to `STT`.
- QA snapshots at start, running and stop.

## Real-device follow-up

- Real microphone in a quiet room and in a noisy café-like room.
- AirPods / Bluetooth input (see the 2026-09-30 Bluetooth investigation entry).
- TTS auto-read pace and the absence of a pop when STT stops during playback (T23).
