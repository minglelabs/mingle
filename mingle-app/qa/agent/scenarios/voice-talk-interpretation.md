---
id: voice-talk-interpretation
title: Interpretation in a call; captions stream for the readers only, read-aloud is its own switch, no flicker
priority: P0
environment: assisted
tags: [voice-talk, interpretation, captions, tts, livekit, interpreter]
taste: [T3, T4, T5, T15, T19, T23]
paths:
  - mingle-app/src/components/LivePhoneDemo/VoiceTalkPanel.tsx
  - mingle-app/src/components/LivePhoneDemo/LivePhoneDemo.tsx
  - mingle-app/src/components/LivePhoneDemo/ChatBubble.tsx
  - mingle-app/src/components/LivePhoneDemo/use-realtime-stt.ts
  - mingle-app/src/lib/voice-caption.ts
  - mingle-app/src/lib/app-conversations.ts
  - mingle-app/src/server/voice/**
  - mingle-app/src/server/api/controllers/shared/voice-interpreter-controller.ts
  - mingle-app/src/server/api/controllers/shared/voice-call-controller.ts
  - mingle-app/src/app/api/internal/voice/**
  - mingle-app/src/i18n/voice-talk-copy.ts
  - mingle-app/rn/src/nativeVoice.ts
  - mingle-app/rn/src/voice/**
  - mingle-app/rn/android/app/src/main/java/com/minglelabs/mingle/rn/NativeTTSModule.kt
  - mingle-voice-agent/**
history:
  - 2026-11-12 — 보이스톡 자막: 일반 버블과 같은 모양, 실시간 스트리밍, 버튼 깜빡임 제거
  - 2026-11-11 — 보이스톡 패널: 아이콘 버튼 네 개, 읽어 주기 분리
  - 2026-11-11 — 보이스톡 통역을 서버 통역봇으로
  - 2026-11-11 — 보이스톡 통역 버튼과 켠 사람만 보는 자막
---

Interpretation runs on the server. While someone in the call has `통역` on, the interpreter (`mingle-voice-agent`)
writes each person down from the call audio, translates each line for the people with it on, and reads the
translation on a per-language call track that only they hear. Each line streams as a live bubble for the readers and
becomes a room message only they (and the speaker) see: the room's ordinary bubble in sky blue. Read-aloud
(`voice-talk-listen-toggle`) is a separate switch; off means captions only.

## Second participant and a third member

Needs a second participant in the call (see `voice-talk-stt-unified`), speaking a different language from the phone
(ko on the phone, en on the other side), and, for the privacy check, a third member of `QA A` who is not in the call
(the owner's other device or a second QA account in a browser). The devbox must run the interpreter (`scripts/devbox
up` starts it; `GET :<web port + 40>/health` answers `ok`). Without it, the scenario is `blocked`.

## Steps

1. Both join the call. Interpret off on both. The other side speaks a fixture sentence: nothing appears in the room.
2. On the phone tap `voice-talk-interpret-toggle`. Screenshot every ~150 ms for 1.5 s: it turns green once and stays
   green; `voice-talk-listen-toggle` turns from dim to on (amber) once. No off-on flash (T5).
3. The other side speaks a longer fixture sentence (3–4 s). Screenshot every ~300 ms while they speak:
   - a sky blue live bubble from the other side appears within ~1 s and its words grow while they speak (T3);
   - when they stop, the same bubble gets its Korean translation in place, not a second bubble (T4, T13);
   - within a few seconds the translation is heard on the phone; the other voice drops while it plays (T23).
4. Look at that bubble against an ordinary message from the same person: same shape, corner, name spacing,
   read/time column; only the background color differs (T15, T19). Repeat with a sentence in the phone's own
   language (no translation row): the bubble still sits right under the name.
5. Tap `voice-talk-listen-toggle` off. The next sentence still streams and gets its translation, but nothing is read
   aloud and the other voice is not ducked.
6. The phone speaks a sentence. With the other side's interpret off, nothing is written. With theirs on, the phone
   sees its own line too (as its own bubble, sky blue).
7. Privacy: on the third member's device (not in the call) the room shows none of these lines, no unread count from
   them, no push, and the room list preview does not change.
8. Leave and come back to the room screen while still in the call: the interpret and read-aloud buttons show what the
   app has (no reset to off).
9. In a room whose languages include one nobody in the call speaks (e.g. ko/en with two Korean speakers), a caption
   still carries that language's translation. Say a long line with a few clauses: the live bubble's translation grows
   clause by clause, and with read-aloud on, each clause is heard before the line ends, with no clause read twice.

## Oracle (pass when)

- One press of 통역 or read-aloud shows once and stays (no flash) (T5).
- Captions stream for readers and settle in place with the translation; one bubble per line (T3, T4, T13).
- A caption bubble is the ordinary bubble in another color, with no gap under the name even without a translation row (T15, T19).
- Captions are translated into every room language, clause by clause while said; read-aloud follows the clauses (step 9).
- Read-aloud plays only while its switch is on, is not heard back by the speaker, and leaves no echo (T23).
- People not reading (interpret off, or not in the call) never see the lines anywhere (list, unread, push).

## Signals

- Interpreter log (`.devbox-logs/voice-agent.log` or the Railway `[mingle-voice-agent]` lines): `listening to`,
  `-> ko "..."`, `echo suppressed` (should be rare).
- App log: `POST /api/internal/voice/caption 200` and `/playback 200` per line.
- DB: the caption rows have `metadata.voiceCaption.viewers` = readers + speaker.

## Manual follow-up

- Speaker phone at high volume on the Galaxy S9: the read-aloud is not picked up and re-sent (the other side never
  hears their own words translated back).
- Three people in the call, two languages: each reader hears only their own language's track.
- Coins: the speech-to-text is charged to the speaker when they read, else to the first reader; read-aloud to each
  listener (`/admin/coins` usage).
