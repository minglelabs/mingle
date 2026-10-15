---
id: message-unsend
title: Unsend is offered only on your own messages and leaves a clean placeholder
priority: P1
environment: sim
tags: [recall, bubbles, long-press]
taste: [T20, T22, T13]
paths:
  - mingle-app/src/components/LivePhoneDemo/MessageRecall.tsx
  - mingle-app/src/components/LivePhoneDemo/CopyableBubbleSurface.tsx
  - mingle-app/src/lib/message-recall*.ts
  - mingle-app/src/app/api/conversations/[conversationId]/recall/**
history:
  - No history entry yet. Feature from PR #278 (commits 323eddad, 0965ed13, 79ed23af, 2026-10-13)
---

## Preconditions

- Signed in, in a room where the viewer has sent at least two text messages. A second simulator signed in as another QA member of the same room is optional and gives the recipient's view.

## Steps

1. Long-press one of the viewer's own messages. Screenshot the action menu.
2. Long-press a message from another member (or a seeded one). Screenshot the action menu.
3. On the viewer's message, choose Unsend and confirm. Screenshot right away and again after 2 s.
4. Leave the room, come back, and screenshot the same spot.
5. If a second simulator is available, screenshot the recipient's view of the same message.

## Oracle (pass when)

- Unsend appears for the viewer's own delivered messages only (T20).
- After unsending, a deleted-message placeholder replaces the bubble in place. The thread does not jump, and the
  placeholder has no translation rows, flags or TTS button left behind (T13).
- No error toast when the unsend succeeds (T22). The placeholder persists after re-entry, and on the recipient's side.

## Signals

- `app_event_logs` and the recall API response (status 200), through the WebView network log or the server log.
- Screenshots.

## Real-device follow-up

- The long-press timing and haptics on a real iPhone.
