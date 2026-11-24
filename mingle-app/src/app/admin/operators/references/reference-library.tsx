'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Loader2, Trash2, UserPlus } from 'lucide-react'
import type { ReferenceGender, ReferenceKind } from '@/server/reference-library/library'
import type { ReferencePhotoView } from '@/server/reference-library/view'
import { adminProfileHref } from '../../_lib/profile-href'
import { reviewImageUrl } from '../review/review-image-url'

const GENDER_LABEL: Record<ReferenceGender, string> = { female: '여', male: '남' }
const KIND_LABEL: Record<ReferenceKind, string> = { face: '얼굴 나옴', person: '얼굴 없는 사람', thing: '음식·풍경·물건' }
const KINDS: readonly ReferenceKind[] = ['face', 'person', 'thing']
type UploadGender = ReferenceGender | 'none' | 'auto'
type UploadKind = ReferenceKind | 'auto'
type Filter = 'unused' | 'used' | 'all'

function isImage(file: File): boolean {
  return file.type.startsWith('image/')
}

export function ReferenceLibrary({ initialItems, canDraw }: { initialItems: ReferencePhotoView[]; canDraw: boolean }) {
  const [items, setItems] = useState(initialItems)
  const [gender, setGender] = useState<UploadGender>('auto')
  const [kind, setKind] = useState<UploadKind>('auto')
  const [uploading, setUploading] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>('unused')
  const genderRef = useRef(gender)
  genderRef.current = gender
  const kindRef = useRef(kind)
  kindRef.current = kind
  const [note, setNote] = useState('')
  const noteRef = useRef(note)
  noteRef.current = note

  const upload = useCallback(async (files: File[]) => {
    const images = files.filter(isImage)
    if (images.length === 0) return
    setStatus(null)
    setUploading((count) => count + images.length)
    let added = 0
    let rejected = 0
    // A few at a time, so a big drop does not hit the request size limit.
    for (let index = 0; index < images.length; index += 5) {
      const batch = images.slice(index, index + 5)
      const form = new FormData()
      for (const file of batch) form.append('file', file)
      form.set('gender', genderRef.current)
      form.set('kind', kindRef.current)
      if (noteRef.current.trim()) form.set('note', noteRef.current.trim())
      try {
        const response = await fetch('/admin/operators/api/references', { method: 'POST', body: form })
        const body = await response.json().catch(() => ({})) as { added?: number; rejected?: number; items?: ReferencePhotoView[] }
        added += body.added ?? 0
        rejected += body.rejected ?? (response.ok ? 0 : batch.length)
        if (body.items) setItems(body.items)
      } catch {
        rejected += batch.length
      } finally {
        setUploading((count) => count - batch.length)
      }
    }
    setStatus(`${added}장 추가${rejected ? ` · ${rejected}장 실패` : ''}`)
    if (added) setNote('')
  }, [])

  useEffect(() => {
    function onPaste(event: ClipboardEvent) {
      const target = event.target as HTMLElement | null
      if (target?.closest('textarea, input, [contenteditable="true"]')) return
      const files = Array.from(event.clipboardData?.files ?? []).filter(isImage)
      if (!files.length) return
      event.preventDefault()
      void upload(files)
    }
    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
  }, [upload])

  const setItemTags = useCallback(async (id: string, tags: { gender?: ReferenceGender | null; kind?: ReferenceKind; note?: string | null }) => {
    setItems((current) => current.map((item) => (item.id === id ? { ...item, ...tags } : item)))
    await fetch(`/admin/operators/api/references/${encodeURIComponent(id)}`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(tags),
    }).catch(() => {})
  }, [])

  const remove = useCallback(async (id: string) => {
    if (!window.confirm('이 사진을 저장소에서 지울까요?')) return
    const response = await fetch(`/admin/operators/api/references/${encodeURIComponent(id)}`, { method: 'DELETE' }).catch(() => null)
    if (response?.ok) setItems((current) => current.filter((item) => item.id !== id))
    else setStatus('지우지 못했어요.')
  }, [])

  const unused = items.filter((item) => !item.usedBy).length
  const shown = items.filter((item) => (filter === 'all' ? true : filter === 'used' ? Boolean(item.usedBy) : !item.usedBy))

  return (
    <div>
      <div
        className={`rounded-2xl border-2 border-dashed p-4 text-center ${dragging ? 'border-sky-500 bg-sky-50' : 'border-slate-300 bg-white'}`}
        onDragOver={(event) => {
          if (!Array.from(event.dataTransfer.types).includes('Files')) return
          event.preventDefault()
          event.dataTransfer.dropEffect = 'copy'
          setDragging(true)
        }}
        onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false) }}
        onDrop={(event) => {
          if (!event.dataTransfer.files.length) return
          event.preventDefault()
          setDragging(false)
          void upload(Array.from(event.dataTransfer.files))
        }}
      >
        <div className="flex flex-wrap items-center justify-center gap-1.5 text-sm">
          <span className="w-full font-semibold text-slate-700 sm:w-auto">종류</span>
          {(['auto', ...KINDS] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setKind(value)}
              className={`min-h-9 rounded-full px-3 font-semibold ${kind === value ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'}`}
            >
              {value === 'auto' ? '자동' : KIND_LABEL[value]}
            </button>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-center gap-1.5 text-sm">
          <span className="w-full font-semibold text-slate-700 sm:w-auto">성별</span>
          {(['auto', 'female', 'male', 'none'] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setGender(value)}
              className={`min-h-9 rounded-full px-3 font-semibold ${gender === value ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'}`}
            >
              {value === 'auto' ? '자동' : value === 'none' ? '구분 없음' : GENDER_LABEL[value]}
            </button>
          ))}
        </div>
        <input
          type="text"
          value={note}
          onChange={(event) => setNote(event.target.value.slice(0, 200))}
          placeholder="한 줄 설명 (선택) — 이번에 올리는 사진 모두에 붙어요"
          className="mt-3 w-full rounded-xl border border-slate-200 px-3 py-2 text-base text-slate-900 outline-none focus:border-slate-400 sm:text-sm"
        />
        <label className="mt-3 inline-flex min-h-11 cursor-pointer items-center justify-center rounded-xl bg-sky-600 px-4 text-sm font-semibold text-white active:bg-sky-700">
          {uploading ? <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" />올리는 중 {uploading}</> : '사진 고르기'}
          <input type="file" accept="image/*" multiple className="sr-only" onChange={(event) => { void upload(Array.from(event.target.files ?? [])); event.target.value = '' }} />
        </label>
        <p className="mt-2 text-xs text-slate-500">여러 장을 끌어다 놓거나 ⌘V로 붙여넣어도 됩니다. “자동”이면 AI가 사진마다 종류와 성별을 붙이고, 나중에 사진마다 고칠 수 있어요.</p>
        {status ? <p role="status" className="mt-1 text-xs font-semibold text-slate-700">{status}</p> : null}
      </div>

      {!canDraw ? (
        <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800 ring-1 ring-amber-200">이 서버는 사진을 그릴 수 없어 계정 만들기를 쓸 수 없습니다.</p>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
        {([['unused', `안 쓴 사진 ${unused}`], ['used', `쓴 사진 ${items.length - unused}`], ['all', `전체 ${items.length}`]] as const).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setFilter(value)}
            className={`min-h-9 rounded-full px-3 font-semibold ${filter === value ? 'bg-slate-900 text-white' : 'bg-white text-slate-700 ring-1 ring-slate-200'}`}
          >
            {label}
          </button>
        ))}
      </div>
      <p className="mt-2 text-xs text-slate-500">
        안 쓴 사진은 오래된 순서로 씁니다. 새 계정 프사는 종류 상관없이 한 장(사람 사진이면 그 성별로 계정 생성), 글 사진은 셀카 ← 얼굴 나옴, 얼굴 없는 셀카·뒷모습 ← 얼굴 없는 사람, 일상 사진 ← 음식·풍경·물건. 한 장은 한 계정만 씁니다.
        {' '}남은 사진: {KINDS.map((value) => `${KIND_LABEL[value]} ${items.filter((item) => !item.usedBy && (item.kind ?? 'face') === value).length}`).join(' · ')}
      </p>

      {shown.length === 0 ? (
        <p className="py-10 text-center text-sm text-slate-500">{items.length ? '해당하는 사진이 없습니다.' : '아직 올린 사진이 없습니다.'}</p>
      ) : (
        <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {shown.map((item) => (
            <ReferenceCard key={item.id} item={item} canDraw={canDraw} onTags={setItemTags} onRemove={remove} onUsed={(next) => setItems(next)} />
          ))}
        </ul>
      )}
    </div>
  )
}

function ReferenceCard({ item, canDraw, onTags, onRemove, onUsed }: {
  item: ReferencePhotoView
  canDraw: boolean
  onTags: (id: string, tags: { gender?: ReferenceGender | null; kind?: ReferenceKind; note?: string | null }) => void
  onRemove: (id: string) => void
  onUsed: (items: ReferencePhotoView[]) => void
}) {
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [noteDraft, setNoteDraft] = useState(item.note ?? '')
  const saveNote = () => {
    const next = noteDraft.trim()
    if (next !== (item.note ?? '')) onTags(item.id, { note: next || null })
  }

  async function createAccount() {
    if (!window.confirm('이 사진으로 새 운영 계정을 만들까요? 계정은 검토 탭에 들어가고, 프사를 그리는 데 몇 분 걸려요.')) return
    setCreating(true)
    setError(null)
    try {
      const response = await fetch(`/admin/operators/api/references/${encodeURIComponent(item.id)}/create-account`, { method: 'POST' })
      const body = await response.json().catch(() => ({})) as { error?: string; referenceUsed?: boolean }
      if (!response.ok) throw new Error(body.error === 'reference_unavailable' ? '이미 쓴 사진이에요.' : '계정을 만들지 못했어요.')
      if (!body.referenceUsed) setError('계정은 만들었지만 프사를 그리지 못했어요. 사진은 그대로 남아 있어요.')
      const list = await fetch('/admin/operators/api/references', { cache: 'no-store' }).then((r) => r.json()).catch(() => null) as { items?: ReferencePhotoView[] } | null
      if (list?.items) onUsed(list.items)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '계정을 만들지 못했어요.')
    } finally {
      setCreating(false)
    }
  }

  return (
    <li className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="relative aspect-[3/4] bg-slate-100">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={reviewImageUrl(item.objectKey)} alt="" loading="lazy" className="h-full w-full object-cover" />
        {item.usedBy ? (
          <span className="absolute left-1.5 top-1.5 rounded-full bg-black/70 px-2 py-0.5 text-[11px] font-semibold text-white">
            {item.usedBy.kind === 'avatar' ? '프사에 씀' : '첫 글에 씀'}
          </span>
        ) : null}
        <button
          type="button"
          onClick={() => onRemove(item.id)}
          aria-label="사진 지우기"
          className="absolute right-1.5 top-1.5 flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white"
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      <div className="space-y-2 p-2">
        <select
          value={item.kind ?? 'face'}
          onChange={(event) => onTags(item.id, { kind: event.target.value as ReferenceKind, ...(event.target.value === 'thing' ? { gender: null } : {}) })}
          aria-label="사진 종류"
          className="min-h-8 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700"
        >
          {KINDS.map((value) => <option key={value} value={value}>{KIND_LABEL[value]}</option>)}
        </select>
        {(item.kind ?? 'face') !== 'thing' ? (
          <div className="flex gap-1 text-xs">
            {(['female', 'male'] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => onTags(item.id, { gender: item.gender === value ? null : value })}
                className={`min-h-8 flex-1 rounded-lg font-semibold ${item.gender === value ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'}`}
              >
                {GENDER_LABEL[value]}
              </button>
            ))}
          </div>
        ) : null}
        <input
          type="text"
          value={noteDraft}
          onChange={(event) => setNoteDraft(event.target.value.slice(0, 200))}
          onBlur={saveNote}
          onKeyDown={(event) => { if (event.key === 'Enter') (event.target as HTMLInputElement).blur() }}
          placeholder="한 줄 설명"
          aria-label="한 줄 설명"
          className="min-h-8 w-full rounded-lg border border-slate-200 px-2 text-base text-slate-800 outline-none focus:border-slate-400 sm:text-xs"
        />
        {item.summary ? <p className="line-clamp-2 text-[11px] leading-4 text-slate-400">AI: {item.summary}</p> : null}
        {item.usedByAccount ? (
          <Link href={adminProfileHref(item.usedByAccount.userId, '/admin/operators/references')} className="block truncate text-xs font-semibold text-sky-700">
            {item.usedByAccount.name ?? `@${item.usedByAccount.handle}`} @{item.usedByAccount.handle}
          </Link>
        ) : !item.usedBy && canDraw ? (
          <button
            type="button"
            onClick={() => void createAccount()}
            disabled={creating}
            className="flex min-h-9 w-full items-center justify-center gap-1 rounded-lg border border-sky-200 text-xs font-semibold text-sky-700 active:bg-sky-50 disabled:opacity-60"
          >
            {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <UserPlus className="h-3.5 w-3.5" aria-hidden="true" />}
            {creating ? '계정 만드는 중…' : '이 사진으로 계정 만들기'}
          </button>
        ) : null}
        {error ? <p className="text-[11px] text-rose-600">{error}</p> : null}
      </div>
    </li>
  )
}
