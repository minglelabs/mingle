'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { InfiniteMore } from '../../_components/infinite-more'
import { loadMoreReview } from './actions'
import { CalendarClock, Clock, ImageIcon, ImagePlus, Loader2, MessageSquarePlus, Pencil, Pin, PinOff, RefreshCw, Send, Sparkles, Trash2, X } from 'lucide-react'
import type { ReviewItem, ReviewPost, ReviewProfile, ReviewReference } from '@/server/operator-review/review'
import { AdminButton, AdminCard, AdminChip, adminTextareaClassName } from '../../_components/ui'
import LanguageFlag from '@/components/language-flag'
import ProfileLanguageLevels, { CompactLanguageLevels } from '@/components/profile-language-levels'
import type { InterestLanguage } from '@/lib/interest-languages'
import PostLanguageChips, { ORIGINAL_CHIP } from '@/components/feed/post-language-chips'
import { withBack } from '../../_lib/back-path'
import { adminProfileHref } from '../../_lib/profile-href'
import { OperatorAvatar } from '../_components/operator-ui'
import { PhotoRedrawPanel } from '../../feed/_components/photo-redraw-panel'
import { buildLanguageOptions, koreanLanguageName } from '../_lib/options'
import { reviewImageUrl } from './review-image-url'
import { pastedImage } from '../_lib/pasted-image'

type Action = 'publish' | 'delete' | 'regenerate' | 'draw' | 'redraw_photo' | 'redraw_reference'

const STAFF_LANGUAGE = 'ko'

// On a phone a card spans the screen edge to edge, like a post in the app, so photos get the full width.
const CARD_CLASS = 'p-3 max-sm:rounded-none max-sm:border-x-0 max-sm:px-4 max-sm:shadow-none'

const ERROR_COPY: Record<string, string> = {
  not_found: '이미 처리된 항목이에요.',
  already_approved: '이미 게시된 계정이에요.',
  busy: '다른 작업이 진행 중이에요. 잠시 후 다시 눌러 주세요.',
  profile_pending: '계정을 먼저 게시해야 글을 올릴 수 있어요.',
  photo_pending: '사진을 아직 그리지 않았어요. 그린 뒤에 게시할 수 있어요.',
  publish_failed: '게시하지 못했어요. 다시 눌러 주세요.',
  regenerate_failed: '다시 만들지 못했어요. 다시 눌러 주세요.',
  draw_failed: '사진을 그리지 못했어요. 다시 눌러 주세요.',
  no_reference: '이 글에 맞는 안 쓴 레퍼런스 짤이 없어요(종류·성별·계절). 레퍼런스 탭에 더 올려 주세요.',
  invalid_image: '사진을 읽지 못했어요. 다른 파일로 해 주세요.',
  file_too_large: '사진이 너무 커요(15MB까지).',
  invalid_photos: '사진 목록이 올바르지 않아요. 새로고침 후 다시 해 주세요.',
  invalid_text: '글은 1~1000자로 써 주세요.',
  invalid_time: '지금보다 늦은 시각으로는 정할 수 없어요.',
  invalid_schedule_time: '예약은 지금부터 1분 뒤 ~ 30일 안으로 정해 주세요.',
  invalid_language: '언어를 다시 골라 주세요.',
}

type ReviewPhoto = { objectKey: string; width: number | null; height: number | null }
const MAX_POST_PHOTOS = 10

/** The account's profile in the admin: its posts in review and published, as on the app's My Page. */
export function profileHref(userId: string, back?: string): string {
  return adminProfileHref(userId, back)
}

/** The review page the reader is on (with its page of the list), for the screens opened from it to return to. */
function useReviewPath(): string {
  const pathname = usePathname()
  const search = useSearchParams().toString()
  return `${pathname}${search ? `?${search}` : ''}`
}


/**
 * Edit a post's photos: add (upload), remove, reorder; the first is the one
 * the feed shows first. Saved as a whole; removing every photo makes a text post.
 */
function PhotoEditor({ postId, language, initial, onSaved, onCancel }: {
  postId: string
  language: string | null
  initial: ReviewPhoto[]
  onSaved: (post: ReviewPost) => void
  onCancel: () => void
}) {
  const [photos, setPhotos] = useState(initial)
  const [uploading, setUploading] = useState(0)
  const [drawing, setDrawing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [dragging, setDragging] = useState(false)

  async function add(files: FileList | File[] | null) {
    const picked = Array.from(files ?? []).filter((file) => file.type.startsWith('image/')).slice(0, MAX_POST_PHOTOS - photos.length)
    if (!picked.length) return
    setError(null)
    setUploading((count) => count + picked.length)
    for (const file of picked) {
      try {
        const form = new FormData()
        form.set('id', postId)
        form.set('file', file)
        const response = await fetch('/admin/operators/api/review/photos', { method: 'POST', body: form })
        const result = await response.json().catch(() => ({})) as { photo?: ReviewPhoto; error?: string }
        if (!response.ok || !result.photo) throw new Error(result.error ?? 'upload_failed')
        setPhotos((current) => current.length < MAX_POST_PHOTOS ? [...current, result.photo!] : current)
      } catch (caught) {
        setError(ERROR_COPY[(caught as Error).message] ?? '사진을 올리지 못했어요.')
      } finally {
        setUploading((count) => count - 1)
      }
    }
  }

  // ⌘V anywhere on the page adds a copied photo while this editor is open
  // (a paste into a text box, e.g. the feedback note, stays there).
  const addRef = useRef(add)
  addRef.current = add
  useEffect(() => {
    if (drawing) return
    function onPaste(event: ClipboardEvent) {
      const target = event.target as HTMLElement | null
      if (target?.closest('textarea, input, [contenteditable="true"]')) return
      const file = pastedImage(event.clipboardData)
      if (!file) return
      event.preventDefault()
      void addRef.current([file])
    }
    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
  }, [drawing])

  function move(index: number, by: -1 | 1) {
    setPhotos((current) => {
      const next = [...current]
      const target = index + by
      if (target < 0 || target >= next.length) return current
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
  }

  async function save() {
    if (photos.length === 0 && !window.confirm('사진을 모두 빼고 글만 남길까요?')) return
    setSaving(true)
    setError(null)
    try {
      const response = await fetch('/admin/operators/api/review/photos', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: postId, photos }),
      })
      const result = await response.json().catch(() => ({})) as { post?: ReviewPost; error?: string }
      if (!response.ok || !result.post) throw new Error(result.error ?? 'save_failed')
      onSaved(result.post)
    } catch (caught) {
      setError(ERROR_COPY[(caught as Error).message] ?? '저장하지 못했어요.')
    } finally {
      setSaving(false)
    }
  }

  const buttonClass = 'flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-sm font-bold text-white disabled:opacity-30'
  return (
    <div
      className={`mt-2 rounded-xl border p-2 ${dragging ? 'border-sky-500 bg-sky-100 ring-2 ring-sky-300' : 'border-sky-200 bg-sky-50/50'}`}
      onDragOver={(event) => {
        if (!Array.from(event.dataTransfer.types).includes('Files')) return
        event.preventDefault()
        event.dataTransfer.dropEffect = 'copy'
        setDragging(true)
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false)
      }}
      onDrop={(event) => {
        if (!event.dataTransfer.files.length) return
        event.preventDefault()
        setDragging(false)
        void add(event.dataTransfer.files)
      }}
    >
      <div className="grid grid-cols-3 gap-2">
        {photos.map((photo, index) => (
          <div key={photo.objectKey} className="relative aspect-square overflow-hidden rounded-lg bg-slate-100">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={reviewImageUrl(photo.objectKey)} alt="" className="h-full w-full object-cover" />
            <span className="absolute left-1 top-1 rounded-full bg-black/60 px-1.5 text-[11px] font-semibold text-white">{index + 1}</span>
            <button type="button" className={`${buttonClass} absolute right-1 top-1`} onClick={() => setPhotos((current) => current.filter((_, at) => at !== index))} aria-label={`${index + 1}번 사진 빼기`}>×</button>
            <div className="absolute bottom-1 left-1 right-1 flex justify-between">
              <button type="button" className={buttonClass} disabled={index === 0} onClick={() => move(index, -1)} aria-label={`${index + 1}번 사진 앞으로`}>‹</button>
              <button type="button" className={buttonClass} disabled={index === photos.length - 1} onClick={() => move(index, 1)} aria-label={`${index + 1}번 사진 뒤로`}>›</button>
            </div>
          </div>
        ))}
        {photos.length + uploading < MAX_POST_PHOTOS ? (
          <label className="flex aspect-square cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white text-xs font-semibold text-slate-500">
            <span className="text-2xl leading-none">+</span>
            <span className="mt-1">{uploading ? `올리는 중 ${uploading}` : '사진 추가'}</span>
            {uploading ? null : <span className="mt-0.5 hidden text-[10px] font-normal text-slate-400 sm:block">⌘V · 끌어다 놓기</span>}
            <input type="file" accept="image/*" multiple className="sr-only" onChange={(event) => { void add(event.target.files); event.target.value = '' }} />
          </label>
        ) : null}
        {photos.length + uploading < MAX_POST_PHOTOS && !drawing ? (
          <button
            type="button"
            onClick={() => setDrawing(true)}
            className="flex aspect-square flex-col items-center justify-center rounded-lg border border-dashed border-sky-300 bg-white text-xs font-semibold text-sky-700"
          >
            <Sparkles className="h-6 w-6" aria-hidden="true" />
            <span className="mt-1 text-center leading-4">AI로 만들기<br />(레퍼런스 가능)</span>
          </button>
        ) : null}
      </div>
      {drawing ? (
        <PhotoRedrawPanel
          postId={postId}
          language={language}
          review
          onClose={() => setDrawing(false)}
          onCandidate={(photo) => setPhotos((current) => current.length < MAX_POST_PHOTOS ? [...current, { objectKey: photo.objectKey, width: photo.width || null, height: photo.height || null }] : current)}
        />
      ) : null}
      {error ? <p className="mt-2 text-sm text-rose-700">{error}</p> : null}
      <div className="mt-2 flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="rounded-lg px-3 py-1.5 text-sm font-semibold text-slate-600">취소</button>
        <button type="button" onClick={() => void save()} disabled={saving || uploading > 0} className="rounded-lg bg-sky-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50">
          {saving ? '저장 중…' : '사진 저장'}
        </button>
      </div>
    </div>
  )
}

const PHOTO_KIND: Record<string, string> = {
  self: '본인 얼굴',
  self_faceless: '본인(얼굴 없음)',
  self_back: '본인 뒷모습',
  friends: '친구와 함께',
  scene: '풍경·사물',
}

const AT_FORMAT = new Intl.DateTimeFormat('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Seoul' })

function formatAt(iso: string): string {
  return AT_FORMAT.format(new Date(iso))
}

/** `<input type="datetime-local">` value for a time, in the reader's own clock. */
function toLocalInput(date: Date): string {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}

/**
 * The time the post is dated at once published: staff pick one (not later
 * than now), or leave it to a random time between writing and 게시.
 */
function PublishAtEditor({ post, writtenAt, onSaved, disabled }: { post: ReviewPost; writtenAt: string; onSaved: (post: ReviewPost) => void; disabled: boolean }) {
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save(publishAt: string | null) {
    setSaving(true)
    setError(null)
    try {
      const response = await fetch('/admin/operators/api/review/time', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: post.id, publishAt }),
      })
      const payload = await response.json().catch(() => ({})) as { post?: ReviewPost; error?: string }
      if (!response.ok || !payload.post) throw new Error(payload.error ?? 'request_failed')
      onSaved(payload.post)
      setOpen(false)
    } catch (caught) {
      setError(ERROR_COPY[(caught as Error).message] ?? '시각을 저장하지 못했어요.')
    } finally {
      setSaving(false)
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={() => { setValue(toLocalInput(post.publishAt ? new Date(post.publishAt) : new Date())); setError(null); setOpen(true) }}
        className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40"
      >
        <Clock className="h-3 w-3" aria-hidden="true" />
        {post.publishAt ? `게시 시각 ${formatAt(post.publishAt)}` : '게시 시각 자동'}
      </button>
    )
  }
  const parsed = value ? new Date(value) : null
  const valid = Boolean(parsed && !Number.isNaN(parsed.getTime()))
  return (
    <div className="mb-2 w-full space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-2">
      <p className="text-xs text-slate-500">게시하면 이 시각에 올린 글로 보여요. 자동이면 글 쓴 때({formatAt(writtenAt)})와 게시한 때 사이에서 무작위로 정해요.</p>
      <input
        type="datetime-local"
        value={value}
        max={toLocalInput(new Date())}
        onChange={(event) => setValue(event.target.value)}
        disabled={saving}
        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
      />
      {error ? <p className="text-xs text-rose-700">{error}</p> : null}
      <div className="flex flex-wrap justify-end gap-2">
        <AdminButton disabled={saving} onClick={() => setOpen(false)}>취소</AdminButton>
        {post.publishAt ? <AdminButton disabled={saving} onClick={() => void save(null)}>자동으로</AdminButton> : null}
        <AdminButton variant="primary" disabled={saving || !valid} onClick={() => parsed && void save(parsed.toISOString())}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
          저장
        </AdminButton>
      </div>
    </div>
  )
}

/** How often and how long a card asks whether the pool has drawn its photo yet. */
/**
 * 예약 게시: a post in review goes out by itself later. 예약 picks a time 2-30
 * hours ahead (server side); a scheduled post shows its time, which staff can
 * change or cancel (back to review).
 */
function ScheduleBox({ post, onSaved, disabledReason, disabled }: {
  post: ReviewPost
  onSaved: (post: ReviewPost) => void
  disabledReason?: string
  disabled: boolean
}) {
  const [value, setValue] = useState(post.scheduledAt ? toLocalInput(new Date(post.scheduledAt)) : '')
  const [saving, setSaving] = useState<'schedule' | 'time' | 'cancel' | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function send(kind: 'schedule' | 'time' | 'cancel') {
    setSaving(kind)
    setError(null)
    try {
      const at = kind === 'time' ? new Date(value).toISOString() : undefined
      const response = await fetch('/admin/operators/api/review/schedule', {
        method: kind === 'cancel' ? 'DELETE' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: post.id, ...(at ? { at } : {}) }),
      })
      const payload = await response.json().catch(() => ({})) as { post?: ReviewPost; error?: string }
      if (!response.ok || !payload.post) throw new Error(payload.error ?? 'request_failed')
      onSaved(payload.post)
      setValue(payload.post.scheduledAt ? toLocalInput(new Date(payload.post.scheduledAt)) : '')
    } catch (caught) {
      const code = (caught as Error).message
      setError(ERROR_COPY[code === 'invalid_time' ? 'invalid_schedule_time' : code] ?? '예약하지 못했어요.')
    } finally {
      setSaving(null)
    }
  }

  if (!post.scheduledAt) {
    return (
      <div className="mt-2">
        <AdminButton block disabled={disabled || Boolean(disabledReason) || saving !== null} title={disabledReason} onClick={() => void send('schedule')}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <CalendarClock className="h-4 w-4" aria-hidden="true" />}
          예약 게시 (시각은 2~30시간 뒤 무작위, 나중에 수정 가능)
        </AdminButton>
        {error ? <p className="mt-1 text-xs text-rose-700">{error}</p> : null}
      </div>
    )
  }
  const parsed = value ? new Date(value) : null
  const changed = Boolean(parsed && !Number.isNaN(parsed.getTime()) && parsed.getTime() !== new Date(post.scheduledAt).getTime())
  return (
    <div className="mt-3 space-y-2 rounded-xl border border-sky-200 bg-sky-50 p-3">
      <p className="inline-flex items-center gap-1 text-sm font-semibold text-sky-900">
        <CalendarClock className="h-4 w-4" aria-hidden="true" />
        {formatAt(post.scheduledAt)}에 게시 예약됨
      </p>
      <div className="flex gap-2">
        <input
          type="datetime-local"
          value={value}
          min={toLocalInput(new Date())}
          onChange={(event) => setValue(event.target.value)}
          disabled={saving !== null}
          className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
        />
        <AdminButton variant="primary" disabled={saving !== null || !changed} onClick={() => void send('time')}>
          {saving === 'time' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
          시각 저장
        </AdminButton>
      </div>
      <div className="flex flex-wrap gap-2">
        <AdminButton disabled={saving !== null} onClick={() => void send('schedule')}>
          {saving === 'schedule' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <RefreshCw className="h-4 w-4" aria-hidden="true" />}
          다른 시각 뽑기
        </AdminButton>
        <AdminButton disabled={saving !== null} onClick={() => void send('cancel')}>
          {saving === 'cancel' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <X className="h-4 w-4" aria-hidden="true" />}
          예약 취소
        </AdminButton>
      </div>
      <p className="text-xs text-sky-800">예약 중에는 글·사진을 고칠 수 없어요. 고치려면 예약을 취소하세요.</p>
      {error ? <p className="text-xs text-rose-700">{error}</p> : null}
    </div>
  )
}

const DRAW_POLL_MS = 10_000
const DRAW_POLL_LIMIT_MS = 15 * 60_000

async function readReview(kind: 'profile' | 'post', id: string) {
  const response = await fetch(`/admin/operators/api/review?kind=${kind}&id=${encodeURIComponent(id)}`, { cache: 'no-store' })
  if (!response.ok) return null
  return await response.json().catch(() => null) as Record<string, unknown> | null
}

/** Calls `check` every 10s while `active`, for up to 15 minutes; `check` returns true when done. */
function useDrawPolling(active: boolean, check: () => Promise<boolean>) {
  useEffect(() => {
    if (!active) return
    let stopped = false
    const started = Date.now()
    const timer = setInterval(async () => {
      if (stopped) return
      const done = await check().catch(() => false)
      if (done || Date.now() - started > DRAW_POLL_LIMIT_MS) {
        stopped = true
        clearInterval(timer)
      }
    }, DRAW_POLL_MS)
    return () => { stopped = true; clearInterval(timer) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active])
}

async function sendReview(kind: 'profile' | 'post', id: string, action: Action, feedback: string, image?: File | null) {
  let init: RequestInit = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind, id, action, feedback }) }
  if (image) {
    const form = new FormData()
    form.set('kind', kind)
    form.set('id', id)
    form.set('action', action)
    form.set('feedback', feedback)
    form.set('image', image)
    init = { method: 'POST', body: form }
  }
  const response = await fetch('/admin/operators/api/review', init)
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>
  if (!response.ok) throw new Error(typeof payload.error === 'string' ? payload.error : 'request_failed')
  return payload
}

/** Opens the account editor (bio, 관심 언어, age, city…); its back arrow returns here. */
function EditLink({ userId }: { userId: string }) {
  const reviewPath = useReviewPath()
  return (
    <Link
      href={withBack(`/admin/operators/${encodeURIComponent(userId)}?from=review`, reviewPath)}
      className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-100"
    >
      <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
      편집
    </Link>
  )
}

/** Moves the card to the front of the queue, or back into the default order; the page then reloads in the new order. */
function PinButton({ kind, id, pinned }: { kind: 'profile' | 'post'; id: string; pinned: boolean }) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  async function toggle() {
    setSaving(true)
    try {
      const response = await fetch('/admin/operators/api/review/order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, id, pinned: !pinned }),
      })
      if (response.ok) router.refresh()
    } finally {
      setSaving(false)
    }
  }
  return (
    <button
      type="button"
      onClick={() => void toggle()}
      disabled={saving}
      className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold transition disabled:opacity-50 ${pinned ? 'bg-sky-50 text-sky-700' : 'text-slate-500 hover:bg-slate-100'}`}
    >
      {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : pinned ? <PinOff className="h-3.5 w-3.5" aria-hidden="true" /> : <Pin className="h-3.5 w-3.5" aria-hidden="true" />}
      {pinned ? '고정 해제' : '맨 앞으로'}
    </button>
  )
}

export { pastedImage }

/** A preview URL for a picked file, revoked when it changes. */
function useObjectUrl(file: File | null): string | null {
  const url = useMemo(() => (file ? URL.createObjectURL(file) : null), [file])
  useEffect(() => () => { if (url) URL.revokeObjectURL(url) }, [url])
  return url
}

/** 게시 · 삭제 · 재제작, with a feedback note (and a reference photo) that opens on demand. */
function ReviewActions({
  busy,
  onAction,
  publishDisabledReason,
  drawAction,
  inProgress,
  labels,
}: {
  busy: Action | null
  /** Button words other than 게시 / 삭제 / 전체 재제작 (a live account's new profile photo). */
  labels?: { publish: string; delete: string; regenerate: string }
  /** A job for this card is running; the answers wait until it is done. */
  inProgress?: boolean
  onAction: (action: Action, feedback: string, image?: File | null) => void
  publishDisabledReason?: string
  /** A post whose photo is not drawn yet: offer to have only the photo drawn (null once it is queued). */
  drawAction?: { requested: boolean; drawing?: boolean }
}) {
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [image, setImage] = useState<File | null>(null)
  const preview = useObjectUrl(image)
  const reset = () => { setFeedback(''); setImage(null); setFeedbackOpen(false) }
  return (
    <div className="mt-3 space-y-2">
      {feedbackOpen ? (
        <div className="space-y-2">
          <textarea
            value={feedback}
            onChange={(event) => setFeedback(event.target.value)}
            onPaste={(event) => {
              const pasted = pastedImage(event.clipboardData)
              if (!pasted) return
              event.preventDefault()
              setImage(pasted)
            }}
            rows={3}
            autoFocus
            placeholder="피드백 — 게시·삭제·재제작 모두 함께 저장돼요 (사진은 붙여넣기도 돼요)"
            className={`${adminTextareaClassName} min-h-0`}
            disabled={busy !== null}
          />
          {image && preview ? (
            <div className="flex items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={preview} alt="첨부한 참고 사진" className="h-16 w-16 rounded-lg border border-slate-200 object-cover" />
              <span className="min-w-0 flex-1 text-xs text-slate-500">재제작·사진 그리기 때 참고 사진으로 같이 보내요.</span>
              <button type="button" onClick={() => setImage(null)} className="rounded-full p-1 text-slate-500 hover:bg-slate-100" aria-label="첨부 사진 빼기">
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          ) : (
            <label className="inline-flex cursor-pointer items-center gap-1 text-sm font-medium text-slate-500 hover:text-slate-800">
              <ImagePlus className="h-4 w-4" aria-hidden="true" />
              참고 사진 첨부 (또는 붙여넣기)
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                disabled={busy !== null}
                onChange={(event) => { setImage(event.target.files?.[0] ?? null); event.target.value = '' }}
              />
            </label>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setFeedbackOpen(true)}
          className="inline-flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-slate-800"
        >
          <MessageSquarePlus className="h-4 w-4" aria-hidden="true" />
          피드백 쓰기
        </button>
      )}
      <div className="grid grid-cols-3 gap-2">
        <AdminButton
          variant="primary"
          disabled={busy !== null || inProgress || Boolean(publishDisabledReason)}
          title={publishDisabledReason}
          onClick={() => onAction('publish', feedback)}
        >
          {busy === 'publish' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Send className="h-4 w-4" aria-hidden="true" />}
          {labels?.publish ?? '게시'}
        </AdminButton>
        <AdminButton variant="danger" disabled={busy !== null || inProgress} onClick={() => onAction('delete', feedback)}>
          {busy === 'delete' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Trash2 className="h-4 w-4" aria-hidden="true" />}
          {labels?.delete ?? '삭제'}
        </AdminButton>
        <AdminButton
          disabled={busy !== null || inProgress}
          onClick={() => { onAction('regenerate', feedback, image); reset() }}
        >
          {busy === 'regenerate' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <RefreshCw className="h-4 w-4" aria-hidden="true" />}
          {labels?.regenerate ?? '전체 재제작'}
        </AdminButton>
      </div>
      {drawAction ? (
        <AdminButton block disabled={busy !== null || inProgress || drawAction.requested || drawAction.drawing} onClick={() => { onAction('draw', feedback, image); reset() }}>
          {busy === 'draw' || drawAction.drawing ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <ImageIcon className="h-4 w-4" aria-hidden="true" />}
          {drawAction.drawing ? '사진 그리는 중…' : drawAction.requested ? 'ChatGPT로 그리기 요청됨' : '글은 그대로, 사진만 그리기'}
        </AdminButton>
      ) : null}
      {inProgress ? <p className="text-xs text-slate-500">작업 중(글 다시 쓰기·사진 그리기)이라 끝나면 누를 수 있어요.</p> : null}
      {publishDisabledReason ? <p className="text-xs text-slate-500">{publishDisabledReason}</p> : null}
    </div>
  )
}

/** Languages staff can read any post or bio in, besides its own (staff 2026-11-24: Korean posts too). */
const STAFF_TARGETS = [STAFF_LANGUAGE, 'en', 'ja', 'zh', 'es']

/** The chips after 원문: Korean first, the account's own language, then the usual ones; never the text's own. */
function staffTargets(sourceLanguage: string | null, ownLanguage?: string | null): string[] {
  const base = (code: string | null | undefined) => (code ?? '').split('-')[0]
  const source = base(sourceLanguage)
  const list = [STAFF_LANGUAGE, ...(ownLanguage ? [ownLanguage] : []), ...STAFF_TARGETS]
  return list.filter((code, index) => base(code) !== source && list.findIndex((other) => base(other) === base(code)) === index)
}

/**
 * The app's flag chips for staff: 원문 and the languages above, each
 * translated on first tap (a post by `{ id }`, an account's bio by
 * `{ kind: 'profile', id }`).
 */
function useStaffTranslation(target: { id: string; kind?: 'profile' }, text: string, onError: (message: string | null) => void) {
  const [chip, setChip] = useState(ORIGINAL_CHIP)
  const [translated, setTranslated] = useState<{ source: string; byLanguage: Record<string, string> }>({ source: text, byLanguage: {} })
  const [translating, setTranslating] = useState<string | null>(null)
  const byLanguage = translated.source === text ? translated.byLanguage : {}

  async function select(language: string) {
    if (language === ORIGINAL_CHIP || byLanguage[language]) {
      setChip(language)
      return
    }
    setTranslating(language)
    onError(null)
    try {
      const response = await fetch('/admin/operators/api/review/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...target, language }),
      })
      const payload = await response.json().catch(() => ({})) as { text?: unknown }
      if (!response.ok || typeof payload.text !== 'string') throw new Error('translate_failed')
      const result = payload.text
      setTranslated((current) => ({ source: text, byLanguage: { ...(current.source === text ? current.byLanguage : {}), [language]: result } }))
      setChip(language)
    } catch {
      onError('번역하지 못했어요. 다시 눌러 주세요.')
    } finally {
      setTranslating(null)
    }
  }

  const shown = chip !== ORIGINAL_CHIP ? byLanguage[chip] : undefined
  return {
    shownText: shown ?? text,
    selected: shown ? chip : ORIGINAL_CHIP,
    translating,
    select,
  }
}

function StaffTranslationChips({ sourceLanguage, ownLanguage, translation }: {
  sourceLanguage: string | null
  ownLanguage?: string | null
  translation: ReturnType<typeof useStaffTranslation>
}) {
  return (
    <div className="-ml-1 mt-1">
      <PostLanguageChips
        sourceLanguage={sourceLanguage}
        languages={staffTargets(sourceLanguage, ownLanguage)}
        selected={translation.selected}
        loadingLanguage={translation.translating}
        locale="ko"
        originalLabel="원문"
        onSelect={(language) => void translation.select(language)}
      />
    </div>
  )
}

/** An account's bio with the 원문 / 한국어 chips (the profile screen). */
export function StaffBio({ userId, bio, sourceLanguage, className = '' }: { userId: string; bio: string; sourceLanguage: string | null; className?: string }) {
  const [error, setError] = useState<string | null>(null)
  const translation = useStaffTranslation({ kind: 'profile', id: userId }, bio, setError)
  return (
    <div className={className}>
      <p className="whitespace-pre-wrap break-words text-sm leading-6 text-slate-800">{translation.shownText}</p>
      <StaffTranslationChips sourceLanguage={sourceLanguage} translation={translation} />
      {error ? <p className="mt-1 text-xs text-rose-600">{error}</p> : null}
    </div>
  )
}

/**
 * On a post's photo: 사진 재제작 redraws only the photo right away (the text,
 * the persona and this photo go along); the speech-bubble button opens a
 * feedback box (text, and a pasted or picked photo) sent with the redo.
 */
function PhotoRedoOverlay({ drawing, disabled, onRedo, onRedoFromReference }: {
  drawing: boolean
  disabled: boolean
  onRedo: (feedback: string, image: File | null) => void
  /** 레퍼런스로: redraw from an unused reference-library photo (its direction, this account's persona). */
  onRedoFromReference?: () => void
}) {
  const [open, setOpen] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [image, setImage] = useState<File | null>(null)
  const preview = useObjectUrl(image)
  const send = (withFeedback: boolean) => {
    onRedo(withFeedback ? feedback.trim() : '', withFeedback ? image : null)
    setOpen(false)
    setFeedback('')
    setImage(null)
  }
  if (drawing) {
    return (
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-xl bg-black/35">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-white/90 px-3 py-1.5 text-xs font-semibold text-slate-800">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />사진 다시 그리는 중 (1~3분)
        </span>
      </div>
    )
  }
  return (
    <>
      {onRedoFromReference ? (
        <button
          type="button"
          disabled={disabled}
          onClick={onRedoFromReference}
          className="absolute left-2 top-2 inline-flex h-9 items-center gap-1 rounded-full bg-black/60 px-3 text-xs font-semibold text-white backdrop-blur active:bg-black/75 disabled:opacity-50"
        >
          <ImagePlus className="h-3.5 w-3.5" aria-hidden="true" />레퍼런스로 재제작
        </button>
      ) : null}
      <div className="absolute right-2 top-2 flex gap-1.5">
        <button
          type="button"
          disabled={disabled}
          onClick={() => send(false)}
          className="inline-flex h-9 items-center gap-1 rounded-full bg-black/60 px-3 text-xs font-semibold text-white backdrop-blur active:bg-black/75 disabled:opacity-50"
        >
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />사진 재제작
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-label="피드백 쓰고 사진 재제작"
          className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur active:bg-black/75 disabled:opacity-50"
        >
          <MessageSquarePlus className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      {open ? (
        <div className="absolute inset-x-2 top-12 z-10 space-y-2 rounded-xl border border-slate-200 bg-white p-3 shadow-lg">
          <textarea
            value={feedback}
            onChange={(event) => setFeedback(event.target.value)}
            onPaste={(event) => {
              const pasted = pastedImage(event.clipboardData)
              if (!pasted) return
              event.preventDefault()
              setImage(pasted)
            }}
            rows={3}
            autoFocus
            placeholder="사진 피드백 (사진은 붙여넣기도 돼요)"
            className={`${adminTextareaClassName} min-h-0`}
          />
          {image && preview ? (
            <div className="flex items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={preview} alt="첨부한 참고 사진" className="h-14 w-14 rounded-lg border border-slate-200 object-cover" />
              <span className="min-w-0 flex-1 text-xs text-slate-500">참고 사진으로 같이 보내요.</span>
              <button type="button" onClick={() => setImage(null)} className="rounded-full p-1 text-slate-500 hover:bg-slate-100" aria-label="첨부 사진 빼기">
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          ) : (
            <label className="inline-flex cursor-pointer items-center gap-1 text-sm font-medium text-slate-500 hover:text-slate-800">
              <ImagePlus className="h-4 w-4" aria-hidden="true" />참고 사진 첨부 (또는 붙여넣기)
              <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(event) => { setImage(event.target.files?.[0] ?? null); event.target.value = '' }} />
            </label>
          )}
          <div className="flex justify-end gap-2">
            <AdminButton onClick={() => setOpen(false)}>취소</AdminButton>
            <AdminButton variant="primary" disabled={disabled || (!feedback.trim() && !image)} onClick={() => send(true)}>
              <RefreshCw className="h-4 w-4" aria-hidden="true" />사진만 재제작
            </AdminButton>
          </div>
        </div>
      ) : null}
    </>
  )
}

/** A post's photos, swiped sideways like the app's feed, with a "2 / 4" count. */
export function ReviewPhotos({ photos }: { photos: Array<{ objectKey: string; width: number | null; height: number | null }> }) {
  const [index, setIndex] = useState(0)
  return (
    <div className="relative mt-2">
      <div
        className="flex snap-x snap-mandatory overflow-x-auto overflow-y-hidden overscroll-x-contain rounded-xl [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        onScroll={(event) => {
          const el = event.currentTarget
          setIndex(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)))
        }}
      >
        {photos.map((photo) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={photo.objectKey}
            src={reviewImageUrl(photo.objectKey)}
            alt=""
            width={photo.width ?? undefined}
            height={photo.height ?? undefined}
            loading="lazy"
            decoding="async"
            className="h-auto max-h-[85svh] w-full shrink-0 snap-center bg-slate-100 object-contain"
          />
        ))}
      </div>
      {photos.length > 1 ? (
        <span className="absolute right-2 top-2 rounded-full bg-black/55 px-2 py-0.5 text-xs font-semibold text-white tabular-nums">
          {Math.min(index, photos.length - 1) + 1} / {photos.length}
        </span>
      ) : null}
    </div>
  )
}

function PostCard({ post: initial, at, pinned, fromReference, reference, author, profileApproved, onDone }: {
  post: ReviewPost
  at: string
  pinned: boolean
  fromReference?: boolean
  reference?: ReviewReference | null
  author: { userId: string; name: string | null; handle: string; image: string | null; languages: string[]; interestLanguages: InterestLanguage[] }
  profileApproved: boolean
  onDone: () => void
}) {
  const reviewPath = useReviewPath()
  const [post, setPost] = useState(initial)
  const [busy, setBusy] = useState<Action | null>(null)
  const [error, setError] = useState<string | null>(null)
  const sourceLanguage = post.language ?? author.languages[0] ?? null
  const translation = useStaffTranslation({ id: post.id }, post.text, setError)
  const [editingPhotos, setEditingPhotos] = useState(false)
  const [editingText, setEditingText] = useState(false)
  const [draft, setDraft] = useState(post.text)
  const [draftLanguage, setDraftLanguage] = useState(post.language ?? '')
  const [draftTopic, setDraftTopic] = useState(post.topic ?? '')
  const [draftTime, setDraftTime] = useState(post.publishAt ? toLocalInput(new Date(post.publishAt)) : '')
  const [savingText, setSavingText] = useState(false)
  const languageOptions = useMemo(() => buildLanguageOptions(), [])
  const startEditing = () => {
    setDraft(post.text)
    setDraftLanguage(post.language ?? '')
    setDraftTopic(post.topic ?? '')
    setDraftTime(post.publishAt ? toLocalInput(new Date(post.publishAt)) : '')
    setEditingText(true)
  }
  const savedTime = post.publishAt ? toLocalInput(new Date(post.publishAt)) : ''
  const editChanged = draft.trim() !== post.text.trim() || draftLanguage !== (post.language ?? '') || draftTopic.trim() !== (post.topic ?? '') || draftTime !== savedTime
  const [aiNote, setAiNote] = useState('')
  const [drafting, setDrafting] = useState(false)

  /** The AI writes a new text into the editor (same person, language and photo); saving stays with staff. */
  async function draftWithAi() {
    setDrafting(true)
    setError(null)
    try {
      const response = await fetch('/admin/operators/api/review/text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: post.id, feedback: aiNote }),
      })
      const payload = await response.json().catch(() => ({})) as { text?: string; error?: string }
      if (!response.ok || !payload.text) throw new Error(payload.error ?? 'request_failed')
      setDraft(payload.text)
    } catch (caught) {
      setError(ERROR_COPY[(caught as Error).message] ?? 'AI가 글을 쓰지 못했어요. 다시 눌러 주세요.')
    } finally {
      setDrafting(false)
    }
  }

  async function saveText() {
    setSavingText(true)
    setError(null)
    try {
      const response = await fetch('/admin/operators/api/review/text', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: post.id,
          text: draft,
          language: draftLanguage || null,
          topic: draftTopic,
          publishAt: draftTime ? new Date(draftTime).toISOString() : null,
        }),
      })
      const payload = await response.json().catch(() => ({})) as { post?: ReviewPost; error?: string }
      if (!response.ok || !payload.post) throw new Error(payload.error ?? 'request_failed')
      setPost(payload.post)
      setEditingText(false)
    } catch (caught) {
      setError(ERROR_COPY[(caught as Error).message] ?? '저장하지 못했어요.')
    } finally {
      setSavingText(false)
    }
  }
  const publishBlocked = !profileApproved ? '계정을 먼저 게시해야 글을 올릴 수 있어요.' : post.photoDescription && !post.imageObjectKey ? '사진을 그린 뒤에 게시할 수 있어요.' : undefined
  const photos: ReviewPhoto[] = post.imageObjectKey
    ? [{ objectKey: post.imageObjectKey, width: post.imageWidth, height: post.imageHeight }, ...post.extraImages]
    : []

  // 재제작 rewrites the text, then the pool draws in the background; ask every 10s
  // until both are done. The state lives on the row, so a reload picks it up again.
  const working = post.photoDrawing || Boolean(post.rewriting)
  useDrawPolling(working, async () => {
    const latest = (await readReview('post', post.id))?.post as ReviewPost | undefined
    if (!latest) return false
    if (latest.photoDrawing || latest.rewriting) {
      if (latest.text !== post.text || latest.photoDrawing !== post.photoDrawing) setPost(latest)
      return false
    }
    setPost(latest)
    if (latest.photoDrawFailed || latest.error === 'photo_draw_failed') setError(ERROR_COPY.draw_failed)
    return true
  })

  async function handle(action: Action, feedback: string, image?: File | null) {
    if (action === 'delete' && !window.confirm('이 글을 삭제할까요?')) return
    setBusy(action)
    setError(null)
    try {
      const result = await sendReview('post', post.id, action, feedback, image)
      if ((action === 'regenerate' || action === 'draw' || action === 'redraw_photo' || action === 'redraw_reference') && result.post) setPost(result.post as ReviewPost)
      else onDone()
    } catch (caught) {
      setError(ERROR_COPY[(caught as Error).message] ?? '요청하지 못했어요.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <AdminCard as="article" id={`post-${post.id}`} className={`${CARD_CLASS} scroll-mt-4`}>
      {/* Laid out like a post in the app's feed: author row, text, then the photo at full width. */}
      <div className="mb-2 flex items-center gap-2">
        <Link href={profileHref(author.userId, reviewPath)} aria-label={`${author.name ?? author.handle} 프로필`}>
          <OperatorAvatar image={author.image} name={author.name} size={36} languages={author.languages} />
        </Link>
        <div className="min-w-0 flex-1">
          <Link href={profileHref(author.userId, reviewPath)} className="block truncate text-sm font-semibold text-slate-900">{author.name ?? '(이름 없음)'}</Link>
          <p className="truncate text-xs text-slate-500">@{author.handle} · 글 {formatAt(at)}</p>
          <CompactLanguageLevels primaryLanguages={author.languages} interestLanguages={author.interestLanguages} locale="ko" className="mt-1" />
        </div>
        {/* Edits this post's text; the account itself is edited from its profile page (tap the name). */}
        <button
          type="button"
          onClick={startEditing}
          disabled={editingText || busy !== null || Boolean(post.scheduledAt)}
          className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-100 disabled:opacity-40"
        >
          <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
          편집
        </button>
        <PinButton kind="post" id={post.id} pinned={pinned} />
      </div>
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        {fromReference && !reference ? <AdminChip tone="accent">레퍼런스 짤로 그림</AdminChip> : null}
        {reference && post.imageObjectKey ? (
          // The library photo this one was drawn from: tap to open it in the library.
          <Link
            href={`/admin/operators/references?photo=${encodeURIComponent(reference.id)}`}
            className="inline-flex items-center gap-1.5 rounded-full bg-sky-50 py-0.5 pl-0.5 pr-2.5 text-xs font-semibold text-sky-700 ring-1 ring-sky-200 active:bg-sky-100"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={reviewImageUrl(reference.objectKey)} alt="" className="h-7 w-7 rounded-full object-cover" />
            레퍼런스 짤 보기
          </Link>
        ) : null}
        {post.language ? <AdminChip tone="accent">{koreanLanguageName(post.language)}로 씀</AdminChip> : null}
        {post.topic ? <AdminChip>{post.topic}</AdminChip> : null}
        {post.photoKind ? <AdminChip tone="warning">사진: {PHOTO_KIND[post.photoKind] ?? post.photoKind}</AdminChip> : null}
        {post.scheduledAt ? null : <PublishAtEditor post={post} writtenAt={at} onSaved={setPost} disabled={busy !== null} />}
      </div>
      {editingText ? (
        <div className="space-y-2">
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            rows={6}
            maxLength={1000}
            autoFocus
            className={`${adminTextareaClassName} text-[15px] leading-6`}
            disabled={savingText || drafting}
          />
          {/* Only the text is rewritten; the photo stays. The result lands in the box above, unsaved. */}
          <div className="flex gap-2">
            <input
              value={aiNote}
              onChange={(event) => setAiNote(event.target.value)}
              placeholder="AI에게 요청 (선택) — 예: 더 짧게, 질문으로 끝내기"
              className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
              disabled={drafting || savingText}
            />
            <AdminButton disabled={drafting || savingText} onClick={() => void draftWithAi()}>
              {drafting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Sparkles className="h-4 w-4" aria-hidden="true" />}
              {drafting ? 'AI가 쓰는 중…' : 'AI로 글만 다시 쓰기'}
            </AdminButton>
          </div>
          {/* Everything but the photos. */}
          <div className="grid grid-cols-2 gap-2">
            <label className="block text-xs font-medium text-slate-500">
              쓴 언어
              <select
                value={draftLanguage}
                onChange={(event) => setDraftLanguage(event.target.value)}
                disabled={savingText}
                className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm text-slate-900"
              >
                <option value="">계정 기본 언어</option>
                {languageOptions.map((option) => <option key={option.code} value={option.code}>{option.label}</option>)}
              </select>
            </label>
            <label className="block text-xs font-medium text-slate-500">
              주제
              <input
                value={draftTopic}
                onChange={(event) => setDraftTopic(event.target.value)}
                maxLength={60}
                placeholder="없음"
                disabled={savingText}
                className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
              />
            </label>
          </div>
          <label className="block text-xs font-medium text-slate-500">
            게시 시각 <span className="font-normal text-slate-400">(비우면 쓴 때~게시한 때 사이 무작위, 미래는 안 됨)</span>
            <div className="mt-1 flex gap-2">
              <input
                type="datetime-local"
                value={draftTime}
                max={toLocalInput(new Date())}
                onChange={(event) => setDraftTime(event.target.value)}
                disabled={savingText}
                className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
              />
              {draftTime ? <AdminButton disabled={savingText} onClick={() => setDraftTime('')}>자동</AdminButton> : null}
            </div>
          </label>
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-slate-400">{draft.trim().length}/1000</span>
            <div className="flex gap-2">
              <AdminButton disabled={savingText} onClick={() => setEditingText(false)}>취소</AdminButton>
              <AdminButton variant="primary" disabled={savingText || !draft.trim() || !editChanged} onClick={() => void saveText()}>
                {savingText ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
                저장
              </AdminButton>
            </div>
          </div>
        </div>
      ) : (
        <>
          <p className="whitespace-pre-wrap break-words text-[15px] leading-6 text-slate-900">{translation.shownText}</p>
          <StaffTranslationChips sourceLanguage={sourceLanguage} ownLanguage={author.languages[0] ?? null} translation={translation} />
        </>
      )}
      {editingPhotos ? (
        <PhotoEditor
          postId={post.id}
          language={sourceLanguage}
          initial={photos}
          onSaved={(saved) => { setPost(saved); setEditingPhotos(false) }}
          onCancel={() => setEditingPhotos(false)}
        />
      ) : post.imageObjectKey ? (
        <div className="relative">
          <ReviewPhotos photos={photos} />
          {reference && !post.photoDrawing ? (
            // The library photo this one was drawn from, on the photo itself: tap to open it in the library.
            <Link
              href={`/admin/operators/references?photo=${encodeURIComponent(reference.id)}`}
              className="absolute bottom-2 left-2 z-[1] flex items-end gap-1.5 rounded-xl bg-black/60 p-1.5 pr-2.5 text-xs font-semibold text-white backdrop-blur active:bg-black/75"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={reviewImageUrl(reference.objectKey)} alt="레퍼런스 원본" className="h-20 w-[3.75rem] rounded-lg object-cover ring-1 ring-white/60" />
              레퍼런스 원본
            </Link>
          ) : null}
          <PhotoRedoOverlay
            drawing={post.photoDrawing}
            disabled={busy !== null || working || Boolean(post.scheduledAt)}
            onRedo={(feedback, image) => void handle('redraw_photo', feedback, image)}
            onRedoFromReference={() => void handle('redraw_reference', '')}
          />
        </div>
      ) : post.photoDescription ? (
        // Where the photo will go: its description on white, so it is not read as the post text.
        <div className="mt-2 flex aspect-square w-full flex-col items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white px-6 text-center">
          <p className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            {post.photoDrawing ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" /> : null}
            {post.photoDrawing ? '사진 · ChatGPT로 그리는 중 (1~3분)' : post.photoRequested ? '사진 · ChatGPT로 그리는 중' : '사진 · 아직 안 그림'}
          </p>
          <p className="text-sm leading-6 text-slate-700">{post.photoDescription}</p>
        </div>
      ) : null}
      {editingPhotos || post.scheduledAt ? null : (
        <button type="button" onClick={() => setEditingPhotos(true)} className="mt-2 text-sm font-semibold text-sky-700">
          {post.imageObjectKey ? '사진 편집 (바꾸기·추가·순서)' : '사진 직접 올리기'}
        </button>
      )}
      {post.rewriting && busy !== 'regenerate' ? (
        <p className="mt-2 inline-flex items-center gap-1 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
          재제작 중: 글을 다시 쓰고 있어요. 끝나면 사진을 그려요.
        </p>
      ) : null}
      {post.reviewFeedback ? <p className="mt-2 text-xs text-slate-500">지난 피드백: {post.reviewFeedback}</p> : null}
      {error ? <p className="mt-2 text-sm text-rose-700">{error}</p> : null}
      {post.scheduledAt ? (
        <ScheduleBox post={post} onSaved={setPost} disabled={busy !== null} />
      ) : (
        <>
          <ReviewActions
            busy={busy}
            inProgress={working}
            onAction={handle}
            publishDisabledReason={publishBlocked}
            drawAction={post.photoDescription && !post.imageObjectKey ? { requested: post.photoRequested, drawing: post.photoDrawing } : undefined}
          />
          <ScheduleBox post={post} onSaved={setPost} disabled={busy !== null || working} disabledReason={publishBlocked} />
        </>
      )}
    </AdminCard>
  )
}

function ProfileCard({ profile, at, pinned, image, onImage, onApproved, onDeleted }: {
  profile: ReviewProfile
  at: string
  pinned: boolean
  image: string | null
  onImage: (image: string) => void
  onApproved: () => void
  onDeleted: () => void
}) {
  const reviewPath = useReviewPath()
  const [busy, setBusy] = useState<Action | null>(null)
  const [error, setError] = useState<string | null>(null)
  const bio = useStaffTranslation({ kind: 'profile', id: profile.userId }, profile.bio ?? '', setError)
  // A live account's new profile photo: its own image, so the account's other cards keep the current one.
  const candidate = profile.candidate
  const [candidateImage, setCandidateImage] = useState(candidate?.image ?? null)
  const [drawing, setDrawing] = useState(candidate ? candidate.drawing : profile.profileState === 'drawing')
  const shownImage = candidate ? candidateImage : image

  // Where the pool draws, a new profile photo arrives in the background; ask every 10s.
  useDrawPolling(drawing, async () => {
    const latest = await readReview('profile', profile.userId)
    if (!latest || latest.profileState === 'drawing') return false
    setDrawing(false)
    if (typeof latest.image === 'string') {
      if (candidate) setCandidateImage(latest.image)
      else onImage(latest.image)
    }
    return true
  })

  async function handle(action: Action, feedback: string, image?: File | null) {
    const confirmDelete = candidate
      ? '새 프사를 버리고 지금 프사를 그대로 둘까요?'
      : `${profile.name ?? profile.handle} 계정과 검토 중인 글을 모두 삭제할까요?`
    if (action === 'delete' && !window.confirm(confirmDelete)) return
    setBusy(action)
    setError(null)
    try {
      const result = await sendReview('profile', profile.userId, action, feedback, image)
      if (action === 'delete') onDeleted()
      else if (action === 'publish') {
        if (candidate && typeof result.image === 'string') onImage(result.image)
        onApproved()
      } else if (result.state === 'drawing') setDrawing(true)
      else if (typeof result.image === 'string') onImage(result.image)
    } catch (caught) {
      setError(ERROR_COPY[(caught as Error).message] ?? '요청하지 못했어요.')
    } finally {
      setBusy(null)
    }
  }

  const facts = [
    profile.age ? `${profile.age}세` : null,
    profile.personaGender === 'female' ? '여성' : profile.personaGender === 'male' ? '남성' : null,
    [profile.city, profile.country].filter(Boolean).join(', ') || null,
  ].filter(Boolean)

  return (
    <AdminCard as="article" id={`profile-${profile.userId}`} className={`${CARD_CLASS} scroll-mt-4`}>
      <div className="mb-2 flex items-center justify-between gap-2">
        {/* Two short lines so the header never breaks a word at phone width ("프로필 보/기"). */}
        <Link href={profileHref(profile.userId, reviewPath)} className="min-w-0 text-xs font-semibold leading-5 text-slate-500">
          <span className="block truncate">{candidate ? '프사 변경' : `새 계정 · 가입 ${formatAt(at)}`}</span>
          <span className="block whitespace-nowrap">프로필 보기 ›</span>
        </Link>
        <div className="flex shrink-0 items-center">
          <EditLink userId={profile.userId} />
          <PinButton kind="profile" id={profile.userId} pinned={pinned} />
        </div>
      </div>
      {candidate ? (
        <div className="mb-2 flex items-center gap-2 text-xs text-slate-500">
          <OperatorAvatar image={image} name={profile.name} size={40} />
          <span>지금 프사 → 아래 새 프사로 바꿀지 검토해 주세요.</span>
        </div>
      ) : null}
      {shownImage ? (
        <div className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={shownImage} alt="" className="aspect-square max-h-[75svh] w-full rounded-xl bg-slate-100 object-cover" />
          {profile.primaryLanguages.length ? (
            <div className="absolute bottom-2 left-2 flex gap-1 rounded-full bg-white/90 px-2 py-1 text-2xl leading-none shadow-sm">
              {profile.primaryLanguages.map((code) => <LanguageFlag key={code} language={code} />)}
            </div>
          ) : null}
        </div>
      ) : (
        <div className="flex justify-center py-6"><OperatorAvatar image={null} name={profile.name} size={160} /></div>
      )}
      <div className="mt-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <h2 className="break-words text-lg font-semibold text-slate-900">{profile.name ?? '(이름 없음)'}</h2>
          <AdminChip tone="warning">{candidate ? '새 프사 검토 중' : '계정 검토 중'}</AdminChip>
        </div>
        <p className="text-sm text-slate-500">@{profile.handle}</p>
        {facts.length ? <p className="mt-1 text-sm text-slate-600">{facts.join(' · ')}</p> : null}
        <ProfileLanguageLevels primaryLanguages={profile.primaryLanguages} interestLanguages={profile.interestLanguages} locale="ko" className="mt-2" />
        {profile.bio ? (
          <>
            <p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-800">{bio.shownText}</p>
            <StaffTranslationChips sourceLanguage={profile.primaryLanguages[0] ?? null} translation={bio} />
          </>
        ) : null}
      </div>
      {profile.profileFeedback ? <p className="mt-2 text-xs text-slate-500">지난 피드백: {profile.profileFeedback}</p> : null}
      {drawing ? <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">새 프로필 사진을 ChatGPT로 그리는 중이에요. 그려서 올라오면 다시 검토할 수 있어요.</p> : null}
      {error ? <p className="mt-2 text-sm text-rose-700">{error}</p> : null}
      <ReviewActions
        busy={busy}
        inProgress={drawing}
        onAction={handle}
        publishDisabledReason={drawing ? '새 사진을 그리는 중이에요.' : candidate && !candidateImage ? '새 프사가 아직 없어요.' : undefined}
        labels={candidate ? { publish: '새 프사로', delete: '버리기', regenerate: '다시 그리기' } : undefined}
      />
    </AdminCard>
  )
}

/**
 * Accounts and posts on one timeline, oldest first. Answering a profile here
 * updates every post of that account on the page: 게시 unlocks them, 삭제
 * removes them, and a redrawn photo shows on their author rows.
 */
export function ReviewBoard({ items: initial, more }: {
  items: ReviewItem[]
  /** The next page, appended below as staff scroll (no page change). */
  more?: { cursor: string | null; kind?: ReviewItem['kind'] | null; userId?: string | null }
}) {
  const [items, setItems] = useState(initial)
  const [approved, setApproved] = useState(
    () => new Set(initial.flatMap((item) => (item.kind === 'post' && item.author.profileState === 'approved' ? [item.author.userId] : []))),
  )
  const moreKind = more?.kind ?? null
  const moreUser = more?.userId ?? null
  const loadMore = useCallback(async (cursor: string) => {
    const next = await loadMoreReview({ cursor, kind: moreKind, userId: moreUser })
    setItems((current) => {
      const seen = new Set(current.map((item) => item.key))
      return [...current, ...next.items.filter((item) => !seen.has(item.key))]
    })
    setApproved((current) => {
      const updated = new Set(current)
      for (const item of next.items) if (item.kind === 'post' && item.author.profileState === 'approved') updated.add(item.author.userId)
      return updated
    })
    return { value: null, nextCursor: next.nextCursor }
  }, [moreKind, moreUser])
  const [images, setImages] = useState<Record<string, string>>({})

  const remove = (predicate: (item: ReviewItem) => boolean) => setItems((current) => current.filter((item) => !predicate(item)))
  const authorOf = (item: ReviewItem) => (item.kind === 'profile' ? item.profile.userId : item.author.userId)

  return (
    <div className="-mx-4 space-y-3 sm:mx-auto sm:w-full sm:max-w-[440px] sm:space-y-6">
      {items.map((item) => {
        if (item.kind === 'profile') {
          const userId = item.profile.userId
          return (
            <ProfileCard
              key={item.key}
              profile={item.profile}
              at={item.at}
              pinned={item.pinned}
              image={images[userId] ?? item.profile.image}
              onImage={(image) => setImages((current) => ({ ...current, [userId]: image }))}
              onApproved={() => {
                setApproved((current) => new Set(current).add(userId))
                remove((other) => other.key === item.key)
              }}
              onDeleted={() => (item.profile.candidate ? remove((other) => other.key === item.key) : remove((other) => authorOf(other) === userId))}
            />
          )
        }
        const userId = item.author.userId
        return (
          <PostCard
            key={item.key}
            post={item.post}
            at={item.at}
            pinned={item.pinned}
            fromReference={item.fromReference}
            reference={item.reference}
            author={{ userId, name: item.author.name, handle: item.author.handle, image: images[userId] ?? item.author.image, languages: item.author.primaryLanguages, interestLanguages: item.author.interestLanguages }}
            profileApproved={approved.has(userId)}
            onDone={() => remove((other) => other.key === item.key)}
          />
        )
      })}
      {more ? (
        <div className="px-4 sm:px-0">
          <InfiniteMore initialCursor={more.cursor} load={loadMore} render={() => null} label="다음 글 보기" />
        </div>
      ) : null}
    </div>
  )
}
