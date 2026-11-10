---
id: voice-talk-room-controls
title: Voice talk lives in the room's own controls and opens its panel before joining
priority: P0
environment: device
tags: [voice-talk, bottom-bar, composer, menu, layout]
taste: [T5, T8, T10, T16, T17, T19, T21]
paths:
  - mingle-app/src/components/LivePhoneDemo/VoiceTalkPanel.tsx
  - mingle-app/src/components/LivePhoneDemo/LivePhoneDemo.tsx
  - mingle-app/src/components/LivePhoneDemo/ConversationImageComposer.tsx
  - mingle-app/src/components/LivePhoneDemo/live-phone-demo.room-management-copy.ts
  - mingle-app/src/components/LivePhoneDemo/live-phone-demo.usage-format.ts
history:
  - 2026-11-10 — 보이스톡: 패널 먼저, 참여는 패널에서 / 키보드 + 메뉴 / 시작 알림 / 목록 표시
  - 2026-11-10 — 보이스톡 버튼을 하단 바 왼쪽으로, 사용량은 메뉴로
  - 2026-10-31 — 그룹 보이스톡 UI를 채팅방 안 판으로 변경, Hash Rush 채팅방 시트
---

Voice talk is a feature of an existing chat room, not a screen of its own. This scenario checks where its entry
points sit and that pressing them only shows the panel. Joining and the audio are covered by
`voice-talk-stt-unified`.

## Preconditions

- Signed in, in room `QA A`. Nobody is in a voice talk call in that room (`GET /api/<namespace>/conversations/<id>/voice` returns `call: null`).
- The room is in voice mode (bottom bar with Start), not keyboard mode.

## Steps

Bottom bar (voice mode):
1. Screenshot the bottom bar. Read the frames of `live-demo-voice-talk-button`, the earphone toggle (when shown),
   `live-demo-mic-button`, the photo button and `live-demo-keyboard-open` from the accessibility tree.
2. Check that the room header has no phone button (only back, title, languages, PiP, menu).
3. Tap `live-demo-voice-talk-button` once. Screenshot every ~300 ms for 1.5 s.
4. Check the panel (`voice-talk-panel`): title "보이스톡 · 아무도 없어요" (or the English copy), 8 empty seats, and two
   buttons, `voice-talk-dismiss` ("닫기") and `voice-talk-join` ("참여"). Confirm with the voice API that no call was
   created and with a QA snapshot that STT did not start.
5. Fold the panel by dragging it up, unfold it with the chevron, then tap `voice-talk-dismiss`. The panel goes away.

Keyboard mode:
6. Tap `live-demo-keyboard-open`, type `voice test`, tap `+` (`live-demo-attachment-open`). Screenshot the menu.
7. Check the row order: photo, earphone mode (when shown), `live-demo-voice-talk-menu-item` ("보이스톡"), switch to
   voice mode.
8. Tap the voice talk row. The menu closes, the keyboard stays up with `voice test` in the field, and the same panel
   appears. Close it.

Menu usage row:
9. Open the room menu (`live-demo-menu-button`). Find `live-demo-menu-usage` ("사용량") and read it: STT time and
   message count, separated by `·`. Compare the count with the room's messages.
10. Switch the app language to English and to Japanese (or use the locale sweep's method) and repeat steps 4, 7 and
    9 once each for the labels.

## Oracle (pass when)

- Bottom bar: the phone button sits where the usage counters used to be, left of Start. The left pair (phone,
  earphone) mirrors the right pair (photo, keyboard): the outer buttons are the same distance from their screen
  edges and the inner gaps match, within 2 pt (T19, T21). No usage text is left in the bar.
- No phone button in the header.
- One tap shows the panel at once, without joining, starting a call or starting STT (T5, T8). Nothing else moves.
- The panel sits under the top bar and does not cover the bottom bar or the newest message once folded (T10).
- Keyboard mode: the voice talk row is in the `+` menu in the stated order, and choosing it keeps the keyboard and
  the typed text (T1 via T19: same pattern as the photo row).
- Usage row: both values are present, match the room, and fit on one line in ko, en and ja (T16, T17).

## Signals

- Accessibility frames for the bottom-bar buttons (`snapshot` / page source).
- `GET .../voice` before and after step 3: `call` stays `null`.
- QA snapshot `micVisualState` stays `idle`.

## Manual follow-up

- On a small phone (SE size) the bottom bar still fits: phone, earphone, Start, photo, keyboard.
