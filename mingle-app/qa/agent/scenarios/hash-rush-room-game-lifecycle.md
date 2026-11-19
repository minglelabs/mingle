---
id: hash-rush-room-game-lifecycle
title: Hash Rush room game; defaults, my lobby row, lowering and returning, quitting last, no stutter, sound, lost connection
priority: P1
environment: assisted
tags: [hash-rush, lobby, room, sound, reconnect, performance]
taste: [T5, T6, T8, T9, T10, T12, T13, T18, T22]
paths:
  - mingle-app/src/features/hash-rush/HashRushGame.tsx
  - mingle-app/src/features/hash-rush/HashRushRoomLayer.tsx
  - mingle-app/src/features/hash-rush/HashRushCards.tsx
  - mingle-app/src/features/hash-rush/hash-rush-cards.module.css
  - mingle-app/src/features/hash-rush/client.ts
  - mingle-app/src/components/LivePhoneDemo/HashRushRoomPrompts.tsx
  - mingle-app/src/components/LivePhoneDemo/HashRushStartedBubble.tsx
  - mingle-app/src/components/LivePhoneDemo/hash-rush-room-context.ts
  - mingle-app/src/server/hash-rush/room-game.ts
  - mingle-app/src/server/api/controllers/shared/hash-rush-controller.ts
history:
  - 2026-11-12 — 해시러시 대기실: 설정은 모두에게, 컴퓨터는 빈자리마다
  - 2026-11-11 — 해시러시 방 메시지, 초대 카드, 나가기
  - 2026-11-10 — Hash Rush 네이티브 이식 4단계: iframe 시트와 v2 대화방 배치 코드 삭제
---

Covers what the app added on top of the web game, plus web issues that came back in the app. The 2026-11-19 entries
in the UI/UX history (`2026-11-19-hash-rush-card-back-to-game`, `-lobby-start-sticky`, `-lobby-my-row-team-colour`,
`-last-out-ends-game`, `-stutter-room-poll`) are the app's own; ghost seats (web #220), "which one is me" (web #224),
sound when hidden (web #227, #228) and the lost-room screen (web #137, #138) come from `minglelabs/hash-rush`
`docs/UIUX-ISSUES.md`.

## Steps

Defaults and my row (phone alone):
1. Room menu → Hash Rush → `hash-rush-menu-enter` (`게임 만들기`). The lobby opens in team play
   (`hash-rush-setup-team` selected), the computers' level on `고수`, and two computer rows (`hash-rush-seat-bot`)
   on the other team: all people against two hard computers.
2. My row (`hash-rush-seat-me`) is ringed in my team's colour, not blue, and has the amber, softly pulsing `나`
   badge (`hash-rush-me-badge`). Pick the other team with `hash-rush-pick-team`: the ring follows the new colour at
   once (T5, T18).
3. Scroll the lobby card: `hash-rush-start` stays visible at the bottom the whole time (sticky) (T10).

Lower, return, quit:
4. Start a round, then lower the game with the back pill (`hash-rush-game-back`). In the room, the game's card shows
   `게임으로 돌아가기` (`hash-rush-message-back`) and `나가기` (`hash-rush-message-quit`). Tap `게임으로 돌아가기`: the
   same game comes back in the same state (T9).
5. Play 60 s, watching screenshots every ~500 ms: no freeze or hitch every 3–5 s (the room's 5 s poll used to
   re-render the room under the game). Record the hitch count.
6. Alone in the game, tap `hash-rush-game-quit` → `hash-rush-quit-confirm-button`. Back in the room within ~2 s the
   card no longer offers `참여하기`, and the room menu's Hash Rush page says no game is on (T22). Repeat from the
   lowered card's `나가기`: same result.
7. Leave and re-enter a game three times quickly (back pill → card → back): the lobby never shows a second me
   (`<name>2`) or a stale seat (web #220). After closing the app during a lobby and opening it, I am back in my one
   seat or out of the game, never twice.

Sound and visibility:
8. With the phone on silent and the volume down (the agent never plays sound itself), check the game's audio state
   via `eval`: background the app for 10 s and return; the round went on and the audio was suspended while hidden
   (web #227, #228). Lower the game to the room: music stops. Listening is in `hash-rush-sound-and-haptics`.
9. Assisted: join a voice talk in the room, then open the game: the back pill shows the green dot
   (`hash-rush-voice-dot`) and the background music is off; effects may still play. End the call: music returns if it
   was on.

Lost connection:
10. Turn on airplane mode for 15 s during a round, then off. The game shows a plain lost-connection state
    (`hash-rush-failure` with `hash-rush-retry`), never a blank field or a frozen round, and never offers `새 방 만들기`
    (G3). `hash-rush-retry` rejoins the same room game (T12).

## Oracle (pass when)

- Default is team play against two `고수` computers; my row shows my team's colour with the amber `나` (T18).
- A lowered game comes back from its card in the same state; quitting as the last player ends the room's game at
  once (T8, T9, T22).
- No periodic hitch; no ghost seats after leaving and returning (T13).
- No sound while hidden; music holds during a voice talk; a lost connection offers a retry into the same game (T12).

## Signals

- Device log `--grep "hash-rush"`: `POST …/hash-rush/leave` on quitting alone; no socket error loops.
- App event log or server log: one `hash-rush` heartbeat per 15 s while playing, not more.
- Game server log (`ssh hashchat-win docker logs hashrush --since 10m`): the leave and the room closing.

## Manual follow-up

- Two players: one quits, the game stays for the other; the last one quits, the card goes away for both.
- Voice talk sound mix with the game's effects on the speaker.
