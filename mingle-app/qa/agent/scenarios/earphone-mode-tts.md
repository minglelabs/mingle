---
id: earphone-mode-tts
title: Earphone mode reads translations aloud briskly without breaking STT
priority: P2
environment: real-device
tags: [tts, earphone, audio-route, stt]
taste: [T23, T2, T5]
paths:
  - mingle-app/src/components/LivePhoneDemo/live-phone-demo.earphone-*.ts
  - mingle-app/src/components/LivePhoneDemo/EarphoneModeNotice.tsx
  - mingle-app/src/components/LivePhoneDemo/MessageTtsButton.tsx
  - mingle-app/src/components/LivePhoneDemo/live-phone-demo.tts-actions.ts
  - mingle-app/src/components/LivePhoneDemo/live-phone-demo.native-tts-events.ts
  - mingle-app/rn/src/nativeTts.ts
  - mingle-app/rn/src/nativeAudioRoute.ts
history:
  - 2026-09-30 — 이어폰 모드: 세션마다 한 언어(L)의 번역만 읽고, 켤 때 안내창에서 그 언어를 고른다
  - 2026-09-30 - Earphone auto-read route refresh and revised-translation playback
  - 2026-09-30 — Gemini TTS asked to speak fast in every language; new Korean male voice
---

## Simulator part

1. Open the menu and toggle earphone mode (`live-demo-earphone-mode-toggle`). Screenshot the notice (`live-demo-earphone-mode-notice`).
2. Pick a language in the notice and confirm. Screenshot the room header or indicator.
3. Tap a message's TTS button. Note whether playback starts. The simulator plays through the Mac, so judge only that it starts and that the button state changes.
4. Toggle earphone mode off.

Oracle on the simulator: the notice is clear and fits (T16). The selected language is saved. The toggle state is
obvious (T18). Starting playback does not change the mic state (T2).

## Real-device part (manual checklist)

- With AirPods connected, start STT and have the counterpart speak. Only the chosen language's translation is read aloud, at a brisk pace (T23).
- When a translation is revised mid-playback, the old audio is dropped, not queued.
- Stopping STT during playback lets the current clip finish with no pop, and the TTS button does not stick (T23, [tts-stt-regression-checklist.md](../../../docs/tts-stt-regression-checklist.md)).
- Disconnect the AirPods mid-session: the route falls back to the speaker and STT keeps running (T2).
