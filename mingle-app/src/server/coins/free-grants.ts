import type { Prisma } from '@prisma/client/index'
import { prisma } from '@/lib/prisma'

// Free Hash (the sign-up bonus and invite rewards) is paid only to accounts
// signed in with Apple or Google. An email-and-password account needs no
// verification, so one person could make any number of them and collect the
// bonus, or invite themselves, without limit.
const FREE_GRANT_PROVIDERS = ['apple', 'google']

/** COIN_FREE_GRANTS_ALLOW_EMAIL=1 (devbox, QA): email accounts get free Hash too. */
export function areEmailAccountsFreeGrantEligible(raw: string | undefined = process.env.COIN_FREE_GRANTS_ALLOW_EMAIL): boolean {
  return (raw || '').trim() === '1'
}

export async function isFreeCoinGrantEligible(
  userId: string,
  client: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<boolean> {
  if (!userId) return false
  if (areEmailAccountsFreeGrantEligible()) return true
  const account = await client.account.findFirst({
    where: { userId, provider: { in: FREE_GRANT_PROVIDERS } },
    select: { id: true },
  })
  return Boolean(account)
}
