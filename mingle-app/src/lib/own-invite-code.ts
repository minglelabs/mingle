import { useEffect, useState } from 'react'
import { buildClientApiPath } from '@/lib/api-contract'

let pending: Promise<string | null> | null = null

/**
 * The signed-in user's invite code, read once per page and shared by every
 * place that pastes a link (profile share, room share). null when signed out
 * or offline; a failed read is tried again next time.
 */
export function fetchOwnInviteCode(): Promise<string | null> {
  if (!pending) {
    pending = (async () => {
      try {
        const response = await fetch(buildClientApiPath('/referral'), { cache: 'no-store' })
        if (!response.ok) return null
        const body = await response.json() as { code?: unknown }
        return typeof body.code === 'string' && body.code.trim() ? body.code.trim() : null
      } catch {
        return null
      }
    })()
    void pending.then((code) => {
      if (!code) pending = null
    })
  }
  return pending
}

/**
 * The invite code, read ahead so a copy button can write it synchronously
 * (a clipboard write after an await is refused in WKWebView). null until read.
 */
export function useOwnInviteCode(enabled = true): string | null {
  const [code, setCode] = useState<string | null>(null)
  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    void fetchOwnInviteCode().then((value) => {
      if (!cancelled) setCode(value)
    })
    return () => {
      cancelled = true
    }
  }, [enabled])
  return code
}
