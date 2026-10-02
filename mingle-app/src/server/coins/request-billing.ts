import { createHash } from 'node:crypto'
import { getServerSession } from 'next-auth'
import { getAuthOptions } from '@/lib/auth-options'
import { estimateTtsAudioDurationMs } from '@/lib/tts-audio-duration'
import { resolveCoinBillingMode } from './config'

/**
 * The signed-in user who pays for this request, or '' when billing is off or
 * the request has no account (legacy anonymous 1.x clients are not billed).
 */
export async function resolveCoinBillingUserId(): Promise<string> {
  if (resolveCoinBillingMode() === 'off') return ''
  try {
    const session = await getServerSession(getAuthOptions()) as { user?: { id?: unknown } } | null
    return typeof session?.user?.id === 'string' ? session.user.id.trim() : ''
  } catch {
    return ''
  }
}

/** Short stable digest for idempotency keys built from request content. */
export function coinKeyDigest(...parts: Array<string | number | boolean | null | undefined>): string {
  return createHash('sha256').update(parts.map(part => String(part ?? '')).join('\u0000')).digest('hex').slice(0, 32)
}

/** Whole seconds of a synthesized clip (0 when the header cannot be read). */
export function estimateTtsAudioSeconds(audio: Uint8Array, mime: string): number {
  const durationMs = estimateTtsAudioDurationMs(audio, mime)
  return durationMs && durationMs > 0 ? Math.ceil(durationMs / 1000) : 0
}
