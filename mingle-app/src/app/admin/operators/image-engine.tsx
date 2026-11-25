'use client'

import { useCallback, useSyncExternalStore } from 'react'

/**
 * Who draws the photos staff ask for in the admin (ChatGPT pool or Seedream
 * 5.5), remembered on this device and shared by the review cards and the
 * reference library's 계정 만들기. Never a default: staff switch it on.
 */
export type ImageEngine = 'pool' | 'seedream'
const IMAGE_ENGINE_KEY = 'admin.review.imageEngine'
const IMAGE_ENGINE_EVENT = 'admin-image-engine'

export function readImageEngine(): ImageEngine {
  try {
    return window.localStorage.getItem(IMAGE_ENGINE_KEY) === 'seedream' ? 'seedream' : 'pool'
  } catch {
    return 'pool'
  }
}

function subscribeImageEngine(onChange: () => void): () => void {
  window.addEventListener(IMAGE_ENGINE_EVENT, onChange)
  return () => window.removeEventListener(IMAGE_ENGINE_EVENT, onChange)
}

/** Who draws the post photos staff ask for here (ChatGPT pool or Seedream 5.5), remembered on this device and shared by every card. */
export function useImageEngine(): [ImageEngine, (engine: ImageEngine) => void] {
  const engine = useSyncExternalStore(subscribeImageEngine, readImageEngine, () => 'pool' as const)
  const change = useCallback((next: ImageEngine) => {
    try { window.localStorage.setItem(IMAGE_ENGINE_KEY, next) } catch { /* not remembered then */ }
    window.dispatchEvent(new Event(IMAGE_ENGINE_EVENT))
  }, [])
  return [engine, change]
}

/** ChatGPT ↔ Seedream switch for the photo buttons. */
export function ImageEngineToggle({ dark }: { dark?: boolean }) {
  const [engine, setEngine] = useImageEngine()
  const on = engine === 'seedream'
  return (
    <button
      type="button"
      onClick={() => setEngine(on ? 'pool' : 'seedream')}
      aria-pressed={on}
      title="사진을 누가 그릴지: ChatGPT(기본) / Seedream 5.5"
      className={dark
        ? `inline-flex h-9 items-center rounded-full px-3 text-xs font-semibold backdrop-blur ${on ? 'bg-violet-600 text-white' : 'bg-black/60 text-white/80'}`
        : `inline-flex h-8 items-center rounded-full border px-3 text-xs font-semibold ${on ? 'border-violet-600 bg-violet-600 text-white' : 'border-slate-300 bg-white text-slate-600'}`}
    >
      {on ? 'Seedream' : 'ChatGPT'}
    </button>
  )
}

