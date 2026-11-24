'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Loader2 } from 'lucide-react'

/**
 * Appends the next page below the list instead of opening a new page: when
 * the end comes into view (or the button is tapped), `load(cursor)` runs and
 * its result is added, until there is no next cursor.
 */
export function InfiniteMore<T>({ initialCursor, load, render, label = '다음 글 보기' }: {
  initialCursor: string | null
  load: (cursor: string) => Promise<{ value: T; nextCursor: string | null }>
  render: (value: T, index: number) => ReactNode
  label?: string
}) {
  const [pages, setPages] = useState<T[]>([])
  const [cursor, setCursor] = useState(initialCursor)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const sentinel = useRef<HTMLDivElement>(null)
  const busy = useRef(false)
  const loadRef = useRef(load)
  useEffect(() => { loadRef.current = load }, [load])

  const more = useRef(async (next: string) => {
    if (busy.current) return
    busy.current = true
    setLoading(true)
    setError(false)
    try {
      const result = await loadRef.current(next)
      setPages((current) => [...current, result.value])
      setCursor(result.nextCursor)
    } catch {
      setError(true)
    } finally {
      busy.current = false
      setLoading(false)
    }
  })

  useEffect(() => {
    const element = sentinel.current
    if (!element || !cursor || error) return
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) void more.current(cursor)
    }, { rootMargin: '800px 0px' })
    observer.observe(element)
    return () => observer.disconnect()
  }, [cursor, error])

  return (
    <>
      {pages.map((page, index) => render(page, index))}
      {cursor ? (
        <div ref={sentinel} className="mt-3">
          <button
            type="button"
            onClick={() => void more.current(cursor)}
            disabled={loading}
            className="flex h-11 w-full items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-700 active:bg-slate-100 disabled:opacity-70"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
            {loading ? '불러오는 중' : error ? '다시 불러오기' : label}
          </button>
        </div>
      ) : null}
    </>
  )
}
