---
id: stt-survives-navigation
title: Leaving and re-entering a live room keeps STT running without loops or false alerts
priority: P0
environment: device
tags: [stt, navigation, conversation-list, back]
taste: [T2, T5, T6, T22]
paths:
  - mingle-app/src/components/conversation-list*.ts*
  - mingle-app/src/components/bottom-tab-bar.tsx
  - mingle-app/src/components/LivePhoneDemo/native-stop-intent.ts
  - mingle-app/src/components/LivePhoneDemo/use-realtime-stt*.ts
  - mingle-app/rn/src/nativeNavigationBridge.ts
  - mingle-app/rn/src/nativeStt*.ts
  - mingle-app/rn/src/webViewRestore.ts
  - mingle-app/rn/App.tsx
history:
  - 2026-05-08 - Native STT Manual Back Re-entry Loop
  - 2026-05-07 - Conversation List URL Store Desync And Auto-Reentry Loop
  - 2026-09-01 — Keep live STT running on the conversation list
  - P2 2026-08-08 Native STT continuity across the My Page tab
---

## Preconditions

- Signed in, with at least two rooms (A and B). Microphone permission granted.

## Steps

1. Open room A and start STT. Wait for running.
2. Go back to the list with an iOS edge swipe from the left edge. Screenshot during and after the swipe.
3. On the list, check room A's row: live badge and live preview. Take a list QA snapshot.
4. Tap the My Page tab, then the Conversations tab. Screenshot each.
5. Open room A again. Screenshot and take a QA snapshot.
6. Go back to the list with the in-page back button. Wait 3 s and screenshot (the old bug reopened the room here).
7. Open room B, then go back. Room A must still be live.
8. Open room A and press Stop. Go back to the list and check that the row shows paused, not live.

## Oracle (pass when)

- STT stays `running` through steps 2–7, in both snapshots and the visible mic state (T2).
- Every back action lands on the list and stays there. No re-entry, no second back needed (T6).
- No "대화방을 열지 못했습니다" / "Failed to open" / "Failed to pause" toast at any point (T22).
- The list row reflects reality: live while running, paused after Stop, with no stale active badge (T5).
- No white or black flash during the transitions (T12).

## Signals

- List snapshot: `activeConversationId`, `nativeSttStatus`.
- Room snapshot: `micVisualState`.
- `app_event_logs`: no `stt_session_stopped` before step 8.
- Screenshots during each transition.

## Manual follow-up

- Android system back for the same path (the agent drives the iPhone only).
