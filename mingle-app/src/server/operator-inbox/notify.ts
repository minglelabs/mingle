/**
 * Operator-inbox notify seam (contract §4). Called once per new message in a
 * room: next to the message push in the text path (never on a
 * translationUpdate), inside the photo path's `after()`, and by the admin
 * send path for operator replies.
 *
 * Phase 0 stub: does nothing. W6 implements it: when the room has an active
 * operator member, publish the admin realtime key; when the sender is NOT an
 * operator, also push `operator_inbox_message` to every AdminNotifyTarget.
 * It must never throw, and every call site still wraps it so a failure can
 * never affect the send.
 */
export type OperatorInboxActivity = {
  sessionKey: string
  /** Channel id when the caller knows it (the photo path does, the text path does not). */
  conversationId?: string | null
  senderUserId: string | null
  /** Room members at send time, sender included. */
  memberUserIds: string[]
  messageId: string
  /** The message's source text; null for a photo. */
  preview: string | null
  kind: 'text' | 'photo'
}

export async function notifyOperatorInboxActivity(activity: OperatorInboxActivity): Promise<void> {
  void activity
}
