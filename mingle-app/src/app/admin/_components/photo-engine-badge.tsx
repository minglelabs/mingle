'use client'

import { useEffect, useSyncExternalStore } from 'react'

/**
 * Which engine drew a photo (ChatGPT pool or Seedream 5.5), as a small chip on
 * the photo for staff. The list of Seedream photos is fetched once per page
 * and again when a photo it has not seen turns up (a photo just drawn).
 */
const ENDPOINT = '/admin/api/photo-engines'
const REFETCH_GAP_MS = 5000

type Store = { ids: Set<string> | null; loadedAt: number; loading: boolean; listeners: Set<() => void> }
const store: Store = { ids: null, loadedAt: 0, loading: false, listeners: new Set() }

function load(): void {
  if (store.loading || Date.now() - store.loadedAt < REFETCH_GAP_MS) return
  store.loading = true
  void fetch(ENDPOINT, { cache: 'no-store' })
    .then((response) => (response.ok ? response.json() : null))
    .then((body: { seedream?: string[] } | null) => {
      if (body?.seedream) store.ids = new Set(body.seedream)
    })
    .catch(() => {})
    .finally(() => {
      store.loading = false
      store.loadedAt = Date.now()
      for (const listener of store.listeners) listener()
    })
}

function subscribe(listener: () => void): () => void {
  store.listeners.add(listener)
  return () => { store.listeners.delete(listener) }
}

const seen = new Set<string>()

/** `id`: a post photo's object key or a profile photo's URL. */
export function PhotoEngineBadge({ id, className = 'absolute left-2 top-2 z-[1]' }: { id: string | null | undefined; className?: string }) {
  const ids = useSyncExternalStore(subscribe, () => store.ids, () => null)
  useEffect(() => {
    if (!id) return
    // A photo first seen here may be one Seedream just drew: ask again (at most every 5 s).
    if (!seen.has(id)) { seen.add(id); load() }
  }, [id])
  if (!id || !ids) return null
  const seedream = ids.has(id)
  return (
    <span className={`${className} pointer-events-none rounded-full px-2 py-0.5 text-[11px] font-semibold text-white backdrop-blur ${seedream ? 'bg-violet-600/85' : 'bg-black/55'}`}>
      {seedream ? 'Seedream' : 'ChatGPT'}
    </span>
  )
}
