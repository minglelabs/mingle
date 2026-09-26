/**
 * CONTRACT STUB — the notification center replaces the body; the signature is frozen.
 *
 * The single entry point for every posting-feature notification. The
 * implementation owns: self-notification suppression, same-person dedupe, the
 * recipient's in-app switch (User.inAppNotificationsEnabled), and push delivery
 * (comments and replies push; likes and report results are in-app only).
 *
 * It must never throw into the caller: a failed notification cannot fail the
 * like, comment or report action that triggered it.
 */
export type PostNotificationInput =
  | { type: 'post_like'; recipientId: string; actorId: string; postId: string }
  | { type: 'comment'; recipientId: string; actorId: string; postId: string; commentId: string }
  | { type: 'comment_reply'; recipientId: string; actorId: string; postId: string; commentId: string }
  | { type: 'comment_like'; recipientId: string; actorId: string; postId: string; commentId: string }
  /**
   * Sent to the reporter when an operator closes their report. There is no
   * human actor: pass the reporter as `actorId`. Self-suppression does not
   * apply to this type, and the renderer ignores the actor.
   */
  | { type: 'report_resolved'; recipientId: string; actorId: string }

export async function createPostNotification(input: PostNotificationInput): Promise<void> {
  void input
}
