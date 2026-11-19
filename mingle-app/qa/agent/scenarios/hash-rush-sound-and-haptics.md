---
id: hash-rush-sound-and-haptics
title: Hash Rush sound; one on/off toggle, music rotates, effects and chat ping, silent when hidden or in a call
priority: P2
environment: assisted
tags: [hash-rush, sound, music, haptics, voice-talk]
taste: [T5, T18, T22, T23]
paths:
  - mingle-app/src/features/hash-rush/engine/client/audio.js
  - mingle-app/src/features/hash-rush/engine/client/music.js
  - mingle-app/src/features/hash-rush/engine/client/haptics.js
  - mingle-app/src/features/hash-rush/client.ts
  - mingle-app/src/features/hash-rush/HashRushGame.tsx
history:
  - 2026-11-01 — Hash Rush 네이티브 이식 1단계: iframe 없이 대화방 안에서 직접 실행
  - 2026-10-31 — 그룹 보이스톡 UI를 채팅방 안 판으로 변경, Hash Rush 채팅방 시트
---

The agent never plays sound on the phone by itself: the phone stays on silent with the volume down, and the agent
checks the game's audio state, not the speaker. Listening is on the manual list, done by the owner. Web sources:
`docs/UIUX-ISSUES.md` #49, #64, #81, #84, #121, #227, #228 and "남의 채팅에 작은 알림음".

## Steps

1. The sound button in the game bar shows `🔊` or `🔇` and toggles between exactly two states (web #64). The choice
   is kept after leaving and re-entering the game (`client.soundOff()` via `eval`).
2. With sound on, the music player is running after the first touch in the game (web #121), and the next track after
   a song ends is a different one of the six (web #81, #84): read the track index twice, two minutes apart.
3. Background the app: the audio context is suspended or muted while the round goes on (web #227, #228). Return: it
   resumes in the state the toggle says.
4. Lower the game to the room: music stops. Reopen: it resumes if sound is on.
5. Voice talk connected in the room (assisted): the music is held, effects stay; the back pill shows the green dot.
6. A chat line from someone else while the game is visible schedules the chat ping; my own lines and lines while the
   game is hidden do not (client.ts `audio.play.chat` only for fresh lines from others).
7. Bonk hit and being bonked trigger the buzz when the phone allows haptics (`hash-rush-buzz` setting).

## Oracle (pass when)

- One two-state toggle that sticks; nothing sounds while hidden or lowered (T5, T18, T22).
- Music rotates; voice talk silences music but not effects (T23).

## Manual follow-up (owner, phone not on silent)

- Alarm, seed pickup and overtime effects sound distinct (web #49). The chat ping is soft.
- Music volume next to a voice talk and next to read-aloud translation.
- The champion fanfare is not too loud.
