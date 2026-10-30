import { HANDLE_MAX_LENGTH } from '@/lib/handles'

/**
 * Handle collisions for operator accounts: like `createWithDefaultHandle`
 * (`src/lib/handles.ts`), a unique-constraint error on the handle moves on to
 * the next candidate, here the chosen handle with a short numeric suffix
 * (`yuki.tnk` -> `yuki.tnk27`, `minjun_0412` -> `minjun_0412_7`).
 */

const SUFFIX_DIGITS = [2, 2, 3, 3, 4] as const

export class OperatorHandleUnavailableError extends Error {
  constructor(options?: { cause?: unknown }) {
    super('operator_handle_unavailable', options)
    this.name = 'OperatorHandleUnavailableError'
  }
}

function randomNumber(digits: number, random: () => number): string {
  const min = 10 ** (digits - 1)
  return String(min + Math.floor(random() * (9 * min)))
}

/** `base` + `number` within 30 characters (`_` before the number when `base` ends in a digit). */
export function withHandleSuffix(base: string, number: string): string {
  const suffix = /\d$/.test(base) ? `_${number}` : number
  const stem = base.slice(0, HANDLE_MAX_LENGTH - suffix.length).replace(/[._]+$/, '')
  return `${stem}${suffix}`
}

/** `base` first, then suffixed variants that still fit the 30-character handle limit. */
export function operatorHandleCandidates(base: string, random: () => number = Math.random): string[] {
  const candidates = [base]
  for (const digits of SUFFIX_DIGITS) candidates.push(withHandleSuffix(base, randomNumber(digits, random)))
  return [...new Set(candidates)]
}

/** P2002 on `app_users.handle` (a missing target is treated as the handle, as the profile PATCH does). */
export function isHandleConflictError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('code' in error) || error.code !== 'P2002') return false
  const meta = 'meta' in error && typeof error.meta === 'object' && error.meta !== null ? error.meta as { target?: unknown } : null
  const target = meta?.target
  if (target === undefined || target === null) return true
  if (typeof target === 'string') return target.includes('handle')
  return Array.isArray(target) && target.some(value => typeof value === 'string' && value.includes('handle'))
}

export async function createWithOperatorHandle<T>(
  base: string,
  create: (handle: string) => Promise<T>,
  random: () => number = Math.random,
): Promise<T> {
  let lastError: unknown = null
  for (const handle of operatorHandleCandidates(base, random)) {
    try {
      return await create(handle)
    } catch (error) {
      if (!isHandleConflictError(error)) throw error
      lastError = error
    }
  }
  throw new OperatorHandleUnavailableError({ cause: lastError })
}
