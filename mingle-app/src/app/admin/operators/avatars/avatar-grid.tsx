'use client'

import Link from 'next/link'
import { useState } from 'react'
import { ImageOff, Loader2, RefreshCw, Send } from 'lucide-react'

export type AvatarGridItem = {
  id: string
  name: string | null
  handle: string
  image: string | null
  /** Korean summary of the spec the current AI photo was made from; null for an uploaded or missing photo. */
  label: string | null
  country: string | null
}

const ERROR_COPY: Record<string, string> = {
  image_unavailable: 'AI 키가 설정되지 않았습니다.',
  image_refused: '모델이 거절했습니다. 다시 누르면 다른 유형을 뽑습니다.',
  image_timeout: '시간이 초과되었습니다.',
  image_request_failed: '생성 요청에 실패했습니다.',
  image_storage_failed: '저장에 실패했습니다.',
  reserve_empty: '대기 중인 잠재 글이 없습니다.',
  publish_failed: '글을 올리지 못했습니다.',
}

type Filter = 'all' | 'missing' | 'generated'

function Card({ item, onChange }: { item: AvatarGridItem; onChange: (next: AvatarGridItem) => void }) {
  const [busy, setBusy] = useState<'avatar' | 'post' | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const call = async (kind: 'avatar' | 'post') => {
    if (busy) return
    setBusy(kind)
    setMessage(null)
    try {
      const path = kind === 'avatar' ? 'avatar/generate' : 'reserve/publish'
      const response = await fetch(`/admin/operators/api/${encodeURIComponent(item.id)}/${path}`, { method: 'POST', credentials: 'same-origin' })
      if (response.status === 401) {
        window.location.assign(`/admin?next=${encodeURIComponent(window.location.pathname)}`)
        return
      }
      const payload = await response.json().catch(() => null) as { image?: string; label?: string; error?: string } | null
      if (!response.ok) {
        setMessage(ERROR_COPY[payload?.error ?? ''] ?? '실패했습니다.')
        return
      }
      if (kind === 'avatar' && payload?.image) onChange({ ...item, image: payload.image, label: payload.label ?? null })
      else setMessage('글 1개를 올렸습니다.')
    } catch {
      setMessage('네트워크 오류입니다.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <li className="flex min-w-0 flex-col rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
      <div className="relative aspect-square w-full overflow-hidden rounded-xl bg-slate-100">
        {item.image ? (
          // Profile photos are external/signed URLs; next/image optimization is not configured for them.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.image} alt={`${item.name ?? item.handle} 프로필 사진`} loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-slate-400">
            <ImageOff size={28} aria-label="사진 없음" />
          </span>
        )}
        {busy === 'avatar' ? (
          <span className="absolute inset-0 flex items-center justify-center bg-white/70" role="status">
            <Loader2 size={24} className="animate-spin text-slate-700" aria-label="생성 중" />
          </span>
        ) : null}
      </div>
      <Link href={`/admin/operators/${encodeURIComponent(item.id)}`} className="mt-2 min-w-0 px-1">
        <span className="block truncate text-sm font-semibold text-slate-900">{item.name || '이름 없음'}</span>
        <span className="block truncate text-xs text-slate-500">@{item.handle}{item.country ? ` · ${item.country}` : ''}</span>
      </Link>
      <p className="mt-1 min-h-8 break-words px-1 text-xs leading-4 text-slate-500">{item.label ?? (item.image ? '직접 올린 사진' : '사진 없음')}</p>
      <div className="mt-1 flex gap-1.5">
        <button
          type="button"
          onClick={() => void call('avatar')}
          disabled={busy !== null}
          className="inline-flex min-h-11 flex-1 items-center justify-center gap-1 rounded-lg border border-slate-300 bg-white px-2 text-xs font-semibold text-slate-700 active:bg-slate-100 disabled:opacity-50"
        >
          <RefreshCw size={13} aria-hidden="true" />
          {item.image ? '다시 만들기' : '사진 만들기'}
        </button>
        <button
          type="button"
          onClick={() => void call('post')}
          disabled={busy !== null}
          aria-label="잠재 글 1개 지금 올리기"
          title="잠재 글 1개 지금 올리기"
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700 active:bg-slate-100 disabled:opacity-50"
        >
          {busy === 'post' ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <Send size={14} aria-hidden="true" />}
        </button>
      </div>
      {message ? <p role="status" className="mt-1 break-words px-1 text-xs text-slate-600">{message}</p> : null}
    </li>
  )
}

/** Every operator account's photo in a grid, to spot odd ones and redo them one by one. */
export function AvatarGrid({ initialItems }: { initialItems: AvatarGridItem[] }) {
  const [items, setItems] = useState(initialItems)
  const [filter, setFilter] = useState<Filter>('all')
  const missing = items.filter((item) => !item.image).length
  const generated = items.filter((item) => item.image && item.label).length
  const visible = items.filter((item) => (
    filter === 'all' ? true : filter === 'missing' ? !item.image : Boolean(item.image && item.label)
  ))
  const chips: Array<{ key: Filter; label: string }> = [
    { key: 'all', label: `전체 ${items.length}` },
    { key: 'missing', label: `사진 없음 ${missing}` },
    { key: 'generated', label: `AI 사진 ${generated}` },
  ]

  return (
    <div className="mt-4">
      <div className="flex flex-wrap gap-2">
        {chips.map((chip) => (
          <button
            key={chip.key}
            type="button"
            aria-pressed={filter === chip.key}
            onClick={() => setFilter(chip.key)}
            className={`min-h-11 rounded-full border px-4 text-sm font-medium ${
              filter === chip.key ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-700 active:bg-slate-100'
            }`}
          >
            {chip.label}
          </button>
        ))}
      </div>
      {visible.length === 0 ? (
        <p className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-10 text-center text-sm text-slate-500">
          해당하는 계정이 없습니다.
        </p>
      ) : (
        <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {visible.map((item) => (
            <Card key={item.id} item={item} onChange={(next) => setItems((current) => current.map((entry) => (entry.id === next.id ? next : entry)))} />
          ))}
        </ul>
      )}
    </div>
  )
}
