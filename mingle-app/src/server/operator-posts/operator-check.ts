import {
  OperatorAccountRequiredError,
  requireOperatorAccount,
  type OperatorAccountRecord,
} from '@/server/operators/operator-guard'
import { isAccountRestricted } from '@/server/reports/account-restriction'

export type OperatorPostingCheck =
  | { ok: true; account: OperatorAccountRecord }
  | { ok: false; reason: 'not_operator' | 'operator_inactive' | 'account_restricted' }

/**
 * Whether the admin may post as `operatorUserId` right now: it must be an
 * operator account (`requireOperatorAccount`, contract §0 "never act as any
 * user"), active (not retired), and not moderation-restricted — the same gate
 * the app's own post routes apply to every author. Database errors propagate.
 */
export async function checkOperatorForPosting(operatorUserId: string): Promise<OperatorPostingCheck> {
  let account: OperatorAccountRecord
  try {
    account = await requireOperatorAccount(operatorUserId)
  } catch (error) {
    if (error instanceof OperatorAccountRequiredError) return { ok: false, reason: 'not_operator' }
    throw error
  }
  if (!account.isActive) return { ok: false, reason: 'operator_inactive' }
  if (await isAccountRestricted(account.id)) return { ok: false, reason: 'account_restricted' }
  return { ok: true, account }
}

/**
 * The persona language of an operator: `primaryLanguages[0]`, or null when
 * the account has none. Contract §5: posts and replies are written in it.
 */
export function personaLanguageOf(account: Pick<OperatorAccountRecord, 'primaryLanguages'>): string | null {
  const first = account.primaryLanguages[0]
  return typeof first === 'string' && first.trim() ? first.trim() : null
}
