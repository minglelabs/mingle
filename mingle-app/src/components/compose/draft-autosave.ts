'use client'

import { buildClientApiPath } from '@/lib/api-contract'
import { isAccountRestrictedResponse } from '@/lib/account-restriction'

/**
 * Serialized, flushable draft autosave for ONE post being composed.
 *
 * - Saves are debounced, then run strictly one after another: a save reads the
 *   draft id when it RUNS, so the second save after the first POST PATCHes the
 *   draft that POST created instead of creating a duplicate.
 * - `flush()` runs a pending debounced save now (leaving the screen, the page
 *   going to the background), with `keepalive` so it survives a page teardown.
 * - `drain()` drops a pending save and waits for the one in flight, returning
 *   the settled draft id — publish uses it so a draft whose first POST was
 *   still in flight is known (and deleted) once the post succeeds.
 *
 * One autosaver belongs to one post: starting a new post or opening another
 * draft creates a new one, so ids never leak between posts.
 */

export type DraftImageFields = {
  imageObjectKey?: string | null
  imageWidth?: number | null
  imageHeight?: number | null
}

export type DraftSnapshot = {
  sourceText: string
  backgroundKey: string | null
  image: DraftImageFields
}

export type DraftSaveState = {
  saving: boolean
  draftId: string | null
  /** Last save outcome: restricted account (403), other failure, or fine. */
  error: 'restricted' | 'failed' | null
}

export type DraftAutosaver = {
  schedule: (snapshot: DraftSnapshot) => void
  flush: () => Promise<void>
  drain: () => Promise<string | null>
  getDraftId: () => string | null
  /** Stop saving for good (the post was published); pending work is dropped. */
  close: () => void
}

function isEmpty(snapshot: DraftSnapshot): boolean {
  return snapshot.sourceText.trim().length === 0 && !snapshot.image.imageObjectKey
}

export function createDraftAutosaver(options: {
  initialDraftId: string | null
  debounceMs: number
  onState?: (state: DraftSaveState) => void
}): DraftAutosaver {
  let draftId = options.initialDraftId
  let pending: DraftSnapshot | null = null
  let timer: ReturnType<typeof setTimeout> | null = null
  let chain: Promise<void> = Promise.resolve()
  let inFlight = 0
  let error: DraftSaveState['error'] = null
  let closed = false

  const report = () => options.onState?.({ saving: inFlight > 0, draftId, error })

  async function save(snapshot: DraftSnapshot) {
    // Nothing worth keeping for a post that has no draft yet.
    if (!draftId && isEmpty(snapshot)) return
    const payload = { sourceText: snapshot.sourceText, backgroundKey: snapshot.backgroundKey, ...snapshot.image }
    inFlight += 1
    report()
    try {
      const res = await fetch(buildClientApiPath('/posts/drafts'), {
        method: draftId ? 'PATCH' : 'POST',
        cache: 'no-store',
        keepalive: true,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draftId ? { draftId, ...payload } : payload),
      })
      if (!res.ok) {
        error = (await isAccountRestrictedResponse(res)) ? 'restricted' : 'failed'
        return
      }
      if (!draftId) {
        const body = (await res.json()) as { draft?: { id?: unknown } }
        if (typeof body.draft?.id === 'string') draftId = body.draft.id
      }
      error = null
    } catch {
      error = 'failed'
    } finally {
      inFlight -= 1
      report()
    }
  }

  function enqueue(snapshot: DraftSnapshot): Promise<void> {
    chain = chain.then(() => (closed ? undefined : save(snapshot)))
    return chain
  }

  function clearTimer() {
    if (timer) clearTimeout(timer)
    timer = null
  }

  return {
    schedule(snapshot) {
      if (closed) return
      pending = snapshot
      clearTimer()
      timer = setTimeout(() => {
        timer = null
        const next = pending
        pending = null
        if (next) void enqueue(next)
      }, options.debounceMs)
    },
    async flush() {
      clearTimer()
      const next = pending
      pending = null
      if (next && !closed) await enqueue(next)
      else await chain
    },
    async drain() {
      clearTimer()
      pending = null
      await chain
      return draftId
    },
    getDraftId: () => draftId,
    close() {
      closed = true
      clearTimer()
      pending = null
    },
  }
}
