import { resolveSupportedLocaleTag } from '@/i18n/config'

export type OperatorInboxPushCopyInput = {
  /** The staff recipient's language tag (any app language; unknown -> English). */
  recipientLanguage: string
  /** Label of the member who wrote, as built by the sender of the push. */
  actorLabel: string
  messagePreview?: string
}

/**
 * Title and body of the `operator_inbox_message` push, which tells staff (on
 * their OWN Mingle accounts, see AdminNotifyTarget) that a user wrote to an
 * operator account. `resolvePushCopy` in `@/server/push-notifications`
 * delegates here for that type.
 *
 * Phase 0 placeholder; W6 owns the final copy.
 */
export function resolveOperatorInboxPushCopy(input: OperatorInboxPushCopyInput): { title: string; body: string } {
  const label = input.actorLabel || 'Someone'
  const preview = (input.messagePreview ?? '').replace(/\s+/g, ' ').trim() || '…'
  const korean = resolveSupportedLocaleTag(input.recipientLanguage.trim()) === 'ko'
  return {
    title: korean ? '운영 계정 새 메시지' : 'New message for a Mingle-run account',
    body: `${label}: ${preview}`,
  }
}
