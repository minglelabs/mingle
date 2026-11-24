'use client'

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { Loader2, Trash2, UserPlus, X } from 'lucide-react'
import type { ReferenceGender, ReferenceKind } from '@/server/reference-library/library'
import type { ReferencePhotoView } from '@/server/reference-library/view'
import { adminProfileHref } from '../../_lib/profile-href'
import { reviewImageUrl } from '../review/review-image-url'

/** How the page asks about a photo: how many people first, then (for one person) face and gender. */
type People = 'none' | 'one' | 'many'
type GenderChoice = ReferenceGender | 'unknown'
type Tags = { gender?: ReferenceGender | null; kind?: ReferenceKind; note?: string | null }
type Filter = 'unused' | 'used' | 'all'

const PEOPLE_LABEL: Record<People, string> = { none: '사람 없음', one: '1명', many: '2명 이상' }
const GENDER_LABEL: Record<GenderChoice, string> = { female: '여', male: '남', unknown: '모름' }
const KIND_LABEL: Record<ReferenceKind, string> = { thing: '사람 없음', face: '1명 · 얼굴 보임', person: '1명 · 얼굴 안 보임', group: '2명 이상' }
const KIND_ORDER: readonly ReferenceKind[] = ['thing', 'face', 'person', 'group']

function peopleOf(kind: ReferenceKind): People {
  return kind === 'thing' ? 'none' : kind === 'group' ? 'many' : 'one'
}

function kindFrom(people: People, faceShown: boolean): ReferenceKind {
  return people === 'none' ? 'thing' : people === 'many' ? 'group' : faceShown ? 'face' : 'person'
}

function isImage(file: File): boolean {
  return file.type.startsWith('image/')
}

function Choice<T extends string>({ options, value, onChange, label }: { options: readonly T[]; value: T; onChange: (value: T) => void; label: (value: T) => string }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => onChange(option)}
          aria-pressed={value === option}
          className={`min-h-9 rounded-full px-3 text-sm font-semibold ${value === option ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'}`}
        >
          {label(option)}
        </button>
      ))}
    </div>
  )
}

function Row({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
      <span className="w-14 shrink-0 text-sm font-semibold text-slate-700">{title}</span>
      {children}
    </div>
  )
}

export function ReferenceLibrary({ initialItems, canDraw, autoTag }: { initialItems: ReferencePhotoView[]; canDraw: boolean; autoTag: boolean }) {
  const [items, setItems] = useState(initialItems)
  // Through 2026-12-12 the AI can tag uploads ("자동"); after that staff pick for every upload.
  const [people, setPeople] = useState<People | 'auto'>(autoTag ? 'auto' : 'one')
  const [faceShown, setFaceShown] = useState(true)
  const [gender, setGender] = useState<GenderChoice>('unknown')
  const [note, setNote] = useState('')
  const [uploading, setUploading] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>('unused')
  const [editingId, setEditingId] = useState<string | null>(null)
  const choiceRef = useRef({ people, faceShown, gender, note })
  choiceRef.current = { people, faceShown, gender, note }

  const upload = useCallback(async (files: File[]) => {
    const images = files.filter(isImage)
    if (images.length === 0) return
    setStatus(null)
    setUploading((count) => count + images.length)
    const choice = choiceRef.current
    let added = 0
    let rejected = 0
    // A few at a time, so a big drop does not hit the request size limit.
    for (let index = 0; index < images.length; index += 5) {
      const batch = images.slice(index, index + 5)
      const form = new FormData()
      for (const file of batch) form.append('file', file)
      if (choice.people === 'auto') {
        form.set('kind', 'auto')
        form.set('gender', 'auto')
      } else {
        form.set('kind', kindFrom(choice.people, choice.faceShown))
        form.set('gender', choice.people === 'one' && choice.gender !== 'unknown' ? choice.gender : 'none')
      }
      if (choice.note.trim()) form.set('note', choice.note.trim())
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
      if (editingId) return
      const target = event.target as HTMLElement | null
      if (target?.closest('textarea, input, [contenteditable="true"]')) return
      const files = Array.from(event.clipboardData?.files ?? []).filter(isImage)
      if (!files.length) return
      event.preventDefault()
      void upload(files)
    }
    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
  }, [editingId, upload])

  const saveTags = useCallback(async (id: string, tags: Tags): Promise<boolean> => {
    const response = await fetch(`/admin/operators/api/references/${encodeURIComponent(id)}`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(tags),
    }).catch(() => null)
    if (!response?.ok) return false
    setItems((current) => current.map((item) => (item.id === id ? { ...item, ...tags, note: tags.note !== undefined ? tags.note : item.note } : item)))
    return true
  }, [])

  const remove = useCallback(async (id: string): Promise<boolean> => {
    const response = await fetch(`/admin/operators/api/references/${encodeURIComponent(id)}`, { method: 'DELETE' }).catch(() => null)
    if (!response?.ok) return false
    setItems((current) => current.filter((item) => item.id !== id))
    return true
  }, [])

  const unused = items.filter((item) => !item.usedBy).length
  const shown = items.filter((item) => (filter === 'all' ? true : filter === 'used' ? Boolean(item.usedBy) : !item.usedBy))
  const editing = editingId ? items.find((item) => item.id === editingId) ?? null : null

  return (
    <div>
      <div
        className={`rounded-2xl border-2 border-dashed p-4 ${dragging ? 'border-sky-500 bg-sky-50' : 'border-slate-300 bg-white'}`}
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
        <div className="flex flex-col gap-2.5">
          <Row title="사람 수">
            <Choice
              options={autoTag ? ['auto', 'none', 'one', 'many'] as const : ['none', 'one', 'many'] as const}
              value={people}
              onChange={setPeople}
              label={(value) => (value === 'auto' ? '자동 (AI)' : PEOPLE_LABEL[value])}
            />
          </Row>
          {people === 'one' ? (
            <>
              <Row title="얼굴">
                <Choice options={['shown', 'hidden'] as const} value={faceShown ? 'shown' : 'hidden'} onChange={(value) => setFaceShown(value === 'shown')} label={(value) => (value === 'shown' ? '보임' : '안 보임')} />
              </Row>
              <Row title="성별">
                <Choice options={['female', 'male', 'unknown'] as const} value={gender} onChange={setGender} label={(value) => GENDER_LABEL[value]} />
              </Row>
            </>
          ) : null}
          <input
            type="text"
            value={note}
            onChange={(event) => setNote(event.target.value.slice(0, 200))}
            placeholder="한 줄 설명 (선택) — 이번에 올리는 사진 모두에 붙어요"
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-base text-slate-900 outline-none focus:border-slate-400 sm:text-sm"
          />
          <label className="inline-flex min-h-11 cursor-pointer items-center justify-center self-center rounded-xl bg-sky-600 px-4 text-sm font-semibold text-white active:bg-sky-700">
            {uploading ? <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" />올리는 중 {uploading}</> : '사진 고르기'}
            <input type="file" accept="image/*" multiple className="sr-only" onChange={(event) => { void upload(Array.from(event.target.files ?? [])); event.target.value = '' }} />
          </label>
          <p className="text-center text-xs text-slate-500">
            여러 장을 끌어다 놓거나 ⌘V로 붙여넣어도 됩니다. {people === 'auto' ? 'AI가 사진마다 사람 수·얼굴·성별을 붙여요(12월 12일까지). ' : ''}올린 뒤 사진을 눌러 고칠 수 있어요.
          </p>
          {status ? <p role="status" className="text-center text-xs font-semibold text-slate-700">{status}</p> : null}
        </div>
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
      <p className="mt-2 text-xs leading-5 text-slate-500">
        안 쓴 사진은 오래된 순서로 씁니다. 새 계정 프사는 아무 사진이나 한 장(1명 사진이면 그 성별로 계정 생성). 글 사진은 셀카 ← 1명·얼굴 보임, 얼굴 없는 셀카·뒷모습 ← 1명·얼굴 안 보임, 친구 사진 ← 2명 이상, 일상 사진 ← 사람 없음. 한 장은 한 계정만 씁니다.
        {' '}남은 사진: {KIND_ORDER.map((kind) => `${KIND_LABEL[kind]} ${items.filter((item) => !item.usedBy && (item.kind ?? 'face') === kind).length}`).join(' · ')}
      </p>

      {shown.length === 0 ? (
        <p className="py-10 text-center text-sm text-slate-500">{items.length ? '해당하는 사진이 없습니다.' : '아직 올린 사진이 없습니다.'}</p>
      ) : (
        <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {shown.map((item) => (
            <li key={item.id}>
              <button type="button" onClick={() => setEditingId(item.id)} className="block w-full overflow-hidden rounded-xl border border-slate-200 bg-white text-left active:opacity-80">
                <span className="relative block aspect-[3/4] bg-slate-100">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={reviewImageUrl(item.objectKey)} alt="" loading="lazy" className="h-full w-full object-cover" />
                  {item.usedBy ? (
                    <span className="absolute left-1.5 top-1.5 rounded-full bg-black/70 px-2 py-0.5 text-[11px] font-semibold text-white">
                      {item.usedBy.kind === 'avatar' ? '프사에 씀' : '글에 씀'}
                    </span>
                  ) : null}
                </span>
                <span className="block space-y-0.5 p-2">
                  <span className="block text-xs font-semibold text-slate-800">
                    {KIND_LABEL[item.kind ?? 'face']}{item.gender && (item.kind ?? 'face') !== 'thing' && item.kind !== 'group' ? ` · ${GENDER_LABEL[item.gender]}` : ''}
                  </span>
                  <span className={`line-clamp-2 block text-[11px] leading-4 ${item.note ? 'text-slate-600' : 'text-slate-400'}`}>
                    {item.note ?? (item.summary ? `AI: ${item.summary}` : '설명 없음 · 눌러서 쓰기')}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {editing ? (
        <ReferenceEditor
          key={editing.id}
          item={editing}
          canDraw={canDraw}
          onSave={saveTags}
          onRemove={remove}
          onItems={setItems}
          onClose={() => setEditingId(null)}
        />
      ) : null}
    </div>
  )
}

/** The sheet a photo opens: its tags and note to change, plus 계정 만들기 and 지우기. */
function ReferenceEditor({ item, canDraw, onSave, onRemove, onItems, onClose }: {
  item: ReferencePhotoView
  canDraw: boolean
  onSave: (id: string, tags: Tags) => Promise<boolean>
  onRemove: (id: string) => Promise<boolean>
  onItems: (items: ReferencePhotoView[]) => void
  onClose: () => void
}) {
  const kind = item.kind ?? 'face'
  const [people, setPeople] = useState<People>(peopleOf(kind))
  const [faceShown, setFaceShown] = useState(kind !== 'person')
  const [gender, setGender] = useState<GenderChoice>(item.gender ?? 'unknown')
  const [note, setNote] = useState(item.note ?? '')
  const [busy, setBusy] = useState<'save' | 'remove' | 'create' | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  async function save() {
    setBusy('save')
    setMessage(null)
    const nextKind = kindFrom(people, faceShown)
    const ok = await onSave(item.id, {
      kind: nextKind,
      gender: people === 'one' && gender !== 'unknown' ? gender : null,
      note: note.trim() || null,
    })
    setBusy(null)
    if (ok) onClose()
    else setMessage('저장하지 못했어요.')
  }

  async function remove() {
    if (!window.confirm('이 사진을 저장소에서 지울까요?')) return
    setBusy('remove')
    const ok = await onRemove(item.id)
    setBusy(null)
    if (ok) onClose()
    else setMessage('지우지 못했어요.')
  }

  async function createAccount() {
    if (!window.confirm('이 사진으로 새 운영 계정을 만들까요? 계정은 검토 탭에 들어가고, 프사를 그리는 데 몇 분 걸려요.')) return
    setBusy('create')
    setMessage(null)
    try {
      // Tags first, so the account is made from what is on screen.
      await onSave(item.id, { kind: kindFrom(people, faceShown), gender: people === 'one' && gender !== 'unknown' ? gender : null, note: note.trim() || null })
      const response = await fetch(`/admin/operators/api/references/${encodeURIComponent(item.id)}/create-account`, { method: 'POST' })
      const body = await response.json().catch(() => ({})) as { error?: string; referenceUsed?: boolean }
      if (!response.ok) throw new Error(body.error === 'reference_unavailable' ? '이미 쓴 사진이에요.' : '계정을 만들지 못했어요.')
      setMessage(body.referenceUsed ? '계정을 만들었어요. 검토 탭에서 확인하세요.' : '계정은 만들었지만 프사를 그리지 못했어요. 사진은 그대로 남아 있어요.')
      const list = await fetch('/admin/operators/api/references', { cache: 'no-store' }).then((response) => response.json()).catch(() => null) as { items?: ReferencePhotoView[] } | null
      if (list?.items) onItems(list.items)
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : '계정을 만들지 못했어요.')
    } finally {
      setBusy(null)
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[140] flex items-end justify-center bg-black/50 sm:items-center" onClick={onClose}>
      <section
        role="dialog"
        aria-modal="true"
        aria-label="레퍼런스 사진 수정"
        onClick={(event) => event.stopPropagation()}
        className="max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white px-4 pb-[max(env(safe-area-inset-bottom),16px)] pt-3 sm:rounded-3xl"
      >
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-900">사진 정보</h2>
          <button type="button" onClick={onClose} aria-label="닫기" className="rounded-full p-2 text-slate-500 active:bg-slate-100">
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={reviewImageUrl(item.objectKey)} alt="" className="mx-auto max-h-[42dvh] w-auto max-w-full rounded-xl bg-slate-100 object-contain" />
        {item.summary ? <p className="mt-2 text-xs text-slate-400">AI: {item.summary}</p> : null}
        {item.usedBy ? (
          <p className="mt-2 text-xs font-semibold text-slate-600">
            {item.usedBy.kind === 'avatar' ? '프사에 씀' : '글 사진에 씀'}
            {item.usedByAccount ? (
              <> · <Link href={adminProfileHref(item.usedByAccount.userId, '/admin/operators/references')} className="text-sky-700">{item.usedByAccount.name ?? `@${item.usedByAccount.handle}`} @{item.usedByAccount.handle}</Link></>
            ) : null}
          </p>
        ) : null}

        <div className="mt-3 flex flex-col gap-2.5">
          <Row title="사람 수">
            <Choice options={['none', 'one', 'many'] as const} value={people} onChange={setPeople} label={(value) => PEOPLE_LABEL[value]} />
          </Row>
          {people === 'one' ? (
            <>
              <Row title="얼굴">
                <Choice options={['shown', 'hidden'] as const} value={faceShown ? 'shown' : 'hidden'} onChange={(value) => setFaceShown(value === 'shown')} label={(value) => (value === 'shown' ? '보임' : '안 보임')} />
              </Row>
              <Row title="성별">
                <Choice options={['female', 'male', 'unknown'] as const} value={gender} onChange={setGender} label={(value) => GENDER_LABEL[value]} />
              </Row>
            </>
          ) : null}
          <label className="flex flex-col gap-1">
            <span className="text-sm font-semibold text-slate-700">한 줄 설명</span>
            <input
              type="text"
              value={note}
              onChange={(event) => setNote(event.target.value.slice(0, 200))}
              placeholder="그릴 때 따를 설명 (예: 라멘 말고 우동으로)"
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-base text-slate-900 outline-none focus:border-slate-400"
            />
          </label>
        </div>

        {message ? <p role="status" className="mt-2 text-center text-xs font-semibold text-slate-700">{message}</p> : null}

        <div className="mt-3 grid grid-cols-2 gap-2 text-sm font-semibold">
          <button type="button" onClick={() => void remove()} disabled={busy !== null} className="flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-rose-200 text-rose-700 active:bg-rose-50 disabled:opacity-50">
            {busy === 'remove' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Trash2 className="h-4 w-4" aria-hidden="true" />}지우기
          </button>
          <button type="button" onClick={() => void save()} disabled={busy !== null} className="flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-slate-900 text-white active:bg-slate-700 disabled:opacity-50">
            {busy === 'save' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}저장
          </button>
        </div>
        {!item.usedBy && canDraw ? (
          <button
            type="button"
            onClick={() => void createAccount()}
            disabled={busy !== null}
            className="mt-2 flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl border border-sky-200 text-sm font-semibold text-sky-700 active:bg-sky-50 disabled:opacity-50"
          >
            {busy === 'create' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <UserPlus className="h-4 w-4" aria-hidden="true" />}
            {busy === 'create' ? '계정 만드는 중…' : '이 사진으로 계정 만들기'}
          </button>
        ) : null}
      </section>
    </div>,
    document.body,
  )
}
