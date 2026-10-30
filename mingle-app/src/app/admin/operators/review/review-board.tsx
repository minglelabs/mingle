'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import Link from 'next/link'
import { ImageIcon, Loader2, MessageSquarePlus, Pencil, Pin, PinOff, RefreshCw, Send, Trash2 } from 'lucide-react'
import type { ReviewItem, ReviewPost, ReviewProfile } from '@/server/operator-review/review'
import { AdminButton, AdminCard, AdminChip, adminTextareaClassName } from '../../_components/ui'
import LanguageFlag from '@/components/language-flag'
import ProfileLanguageLevels, { CompactLanguageLevels } from '@/components/profile-language-levels'
import type { InterestLanguage } from '@/lib/interest-languages'
import PostLanguageChips, { ORIGINAL_CHIP } from '@/components/feed/post-language-chips'
import { OperatorAvatar } from '../_components/operator-ui'
import { koreanLanguageName } from '../_lib/options'

type Action = 'publish' | 'delete' | 'regenerate' | 'draw'

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
  invalid_image: '사진을 읽지 못했어요. 다른 파일로 해 주세요.',
  file_too_large: '사진이 너무 커요(15MB까지).',
  invalid_photos: '사진 목록이 올바르지 않아요. 새로고침 후 다시 해 주세요.',
}

type ReviewPhoto = { objectKey: string; width: number | null; height: number | null }
const MAX_POST_PHOTOS = 10

function reviewImageUrl(objectKey: string): string {
  return `/admin/operators/api/review/image?key=${encodeURIComponent(objectKey)}`
}

/**
 * Edit a post's photos: add (upload), remove, reorder; the first is the one
 * the feed shows first. Saved as a whole; removing every photo makes a text post.
 */
function PhotoEditor({ postId, initial, onSaved, onCancel }: {
  postId: string
  initial: ReviewPhoto[]
  onSaved: (post: ReviewPost) => void
  onCancel: () => void
}) {
  const [photos, setPhotos] = useState(initial)
  const [uploading, setUploading] = useState(0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function add(files: FileList | null) {
    const picked = Array.from(files ?? []).slice(0, MAX_POST_PHOTOS - photos.length)
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
    <div className="mt-2 rounded-xl border border-sky-200 bg-sky-50/50 p-2">
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
            <input type="file" accept="image/*" multiple className="sr-only" onChange={(event) => { void add(event.target.files); event.target.value = '' }} />
          </label>
        ) : null}
      </div>
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

async function sendReview(kind: 'profile' | 'post', id: string, action: Action, feedback: string) {
  const response = await fetch('/admin/operators/api/review', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind, id, action, feedback }),
  })
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>
  if (!response.ok) throw new Error(typeof payload.error === 'string' ? payload.error : 'request_failed')
  return payload
}

/** Opens the account editor (bio, 관심 언어, age, city…); its back arrow returns here. */
function EditLink({ userId }: { userId: string }) {
  return (
    <Link
      href={`/admin/operators/${encodeURIComponent(userId)}?from=review`}
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

/** 게시 · 삭제 · 재제작, with a feedback note that opens on demand. */
function ReviewActions({
  busy,
  onAction,
  publishDisabledReason,
  drawAction,
}: {
  busy: Action | null
  onAction: (action: Action, feedback: string) => void
  publishDisabledReason?: string
  /** A post whose photo is not drawn yet: offer to have only the photo drawn (null once it is queued). */
  drawAction?: { requested: boolean }
}) {
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const [feedback, setFeedback] = useState('')
  return (
    <div className="mt-3 space-y-2">
      {feedbackOpen ? (
        <textarea
          value={feedback}
          onChange={(event) => setFeedback(event.target.value)}
          rows={3}
          autoFocus
          placeholder="피드백 — 게시·삭제·재제작 모두 함께 저장돼요"
          className={`${adminTextareaClassName} min-h-0`}
          disabled={busy !== null}
        />
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
          disabled={busy !== null || Boolean(publishDisabledReason)}
          title={publishDisabledReason}
          onClick={() => onAction('publish', feedback)}
        >
          {busy === 'publish' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Send className="h-4 w-4" aria-hidden="true" />}
          게시
        </AdminButton>
        <AdminButton variant="danger" disabled={busy !== null} onClick={() => onAction('delete', feedback)}>
          {busy === 'delete' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Trash2 className="h-4 w-4" aria-hidden="true" />}
          삭제
        </AdminButton>
        <AdminButton
          disabled={busy !== null}
          onClick={() => { onAction('regenerate', feedback); setFeedback(''); setFeedbackOpen(false) }}
        >
          {busy === 'regenerate' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <RefreshCw className="h-4 w-4" aria-hidden="true" />}
          재제작
        </AdminButton>
      </div>
      {drawAction ? (
        <AdminButton block disabled={busy !== null || drawAction.requested} onClick={() => { onAction('draw', feedback); setFeedback(''); setFeedbackOpen(false) }}>
          {busy === 'draw' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <ImageIcon className="h-4 w-4" aria-hidden="true" />}
          {drawAction.requested ? 'ChatGPT로 그리기 요청됨' : '글은 그대로, 사진만 그리기'}
        </AdminButton>
      ) : null}
      {publishDisabledReason ? <p className="text-xs text-slate-500">{publishDisabledReason}</p> : null}
    </div>
  )
}

/**
 * The app's flag chips for staff: 원문 and Korean, translated on first tap
 * (a post by `{ id }`, an account's bio by `{ kind: 'profile', id }`).
 */
function useStaffTranslation(target: { id: string; kind?: 'profile' }, text: string, onError: (message: string | null) => void) {
  const [chip, setChip] = useState(ORIGINAL_CHIP)
  const [korean, setKorean] = useState<{ text: string; source: string } | null>(null)
  const [translating, setTranslating] = useState(false)
  const koreanText = korean?.source === text ? korean.text : null

  async function select(language: string) {
    if (language !== STAFF_LANGUAGE || koreanText) {
      setChip(language)
      return
    }
    setTranslating(true)
    onError(null)
    try {
      const response = await fetch('/admin/operators/api/review/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(target),
      })
      const payload = await response.json().catch(() => ({})) as { text?: unknown }
      if (!response.ok || typeof payload.text !== 'string') throw new Error('translate_failed')
      setKorean({ text: payload.text, source: text })
      setChip(STAFF_LANGUAGE)
    } catch {
      onError('번역하지 못했어요. 다시 눌러 주세요.')
    } finally {
      setTranslating(false)
    }
  }

  return {
    shownText: chip === STAFF_LANGUAGE && koreanText ? koreanText : text,
    selected: koreanText ? chip : ORIGINAL_CHIP,
    translating,
    select,
  }
}

function StaffTranslationChips({ sourceLanguage, translation }: {
  sourceLanguage: string | null
  translation: ReturnType<typeof useStaffTranslation>
}) {
  if (sourceLanguage === STAFF_LANGUAGE) return null
  return (
    <div className="-ml-1 mt-1">
      <PostLanguageChips
        sourceLanguage={sourceLanguage}
        languages={[STAFF_LANGUAGE]}
        selected={translation.selected}
        loadingLanguage={translation.translating ? STAFF_LANGUAGE : null}
        locale="ko"
        originalLabel="원문"
        onSelect={(language) => void translation.select(language)}
      />
    </div>
  )
}

/** A post's photos, swiped sideways like the app's feed, with a "2 / 4" count. */
function ReviewPhotos({ photos }: { photos: Array<{ objectKey: string; width: number | null; height: number | null }> }) {
  const [index, setIndex] = useState(0)
  return (
    <div className="relative mt-2">
      <div
        className="flex snap-x snap-mandatory overflow-x-auto rounded-xl [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
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

function PostCard({ post: initial, at, pinned, author, profileApproved, onDone }: {
  post: ReviewPost
  at: string
  pinned: boolean
  author: { userId: string; name: string | null; handle: string; image: string | null; languages: string[]; interestLanguages: InterestLanguage[] }
  profileApproved: boolean
  onDone: () => void
}) {
  const [post, setPost] = useState(initial)
  const [busy, setBusy] = useState<Action | null>(null)
  const [error, setError] = useState<string | null>(null)
  const sourceLanguage = post.language ?? author.languages[0] ?? null
  const translation = useStaffTranslation({ id: post.id }, post.text, setError)
  const [editingPhotos, setEditingPhotos] = useState(false)
  const photos: ReviewPhoto[] = post.imageObjectKey
    ? [{ objectKey: post.imageObjectKey, width: post.imageWidth, height: post.imageHeight }, ...post.extraImages]
    : []

  async function handle(action: Action, feedback: string) {
    if (action === 'delete' && !window.confirm('이 글을 삭제할까요?')) return
    setBusy(action)
    setError(null)
    try {
      const result = await sendReview('post', post.id, action, feedback)
      if ((action === 'regenerate' || action === 'draw') && result.post) setPost(result.post as ReviewPost)
      else onDone()
    } catch (caught) {
      setError(ERROR_COPY[(caught as Error).message] ?? '요청하지 못했어요.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <AdminCard as="article" className={CARD_CLASS}>
      {/* Laid out like a post in the app's feed: author row, text, then the photo at full width. */}
      <div className="mb-2 flex items-center gap-2">
        <OperatorAvatar image={author.image} name={author.name} size={36} languages={author.languages} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-900">{author.name ?? '(이름 없음)'}</p>
          <p className="truncate text-xs text-slate-500">@{author.handle} · 글 {formatAt(at)}</p>
          <CompactLanguageLevels primaryLanguages={author.languages} interestLanguages={author.interestLanguages} locale="ko" className="mt-1" />
        </div>
        <EditLink userId={author.userId} />
        <PinButton kind="post" id={post.id} pinned={pinned} />
      </div>
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        {post.language ? <AdminChip tone="accent">{koreanLanguageName(post.language)}로 씀</AdminChip> : null}
        {post.topic ? <AdminChip>{post.topic}</AdminChip> : null}
        {post.photoKind ? <AdminChip tone="warning">사진: {PHOTO_KIND[post.photoKind] ?? post.photoKind}</AdminChip> : null}
      </div>
      <p className="whitespace-pre-wrap break-words text-[15px] leading-6 text-slate-900">{translation.shownText}</p>
      <StaffTranslationChips sourceLanguage={sourceLanguage} translation={translation} />
      {editingPhotos ? (
        <PhotoEditor
          postId={post.id}
          initial={photos}
          onSaved={(saved) => { setPost(saved); setEditingPhotos(false) }}
          onCancel={() => setEditingPhotos(false)}
        />
      ) : post.imageObjectKey ? (
        <ReviewPhotos photos={photos} />
      ) : post.photoDescription ? (
        // Where the photo will go: its description on white, so it is not read as the post text.
        <div className="mt-2 flex aspect-square w-full flex-col items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white px-6 text-center">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{post.photoRequested ? '사진 · ChatGPT로 그리는 중' : '사진 · 아직 안 그림'}</p>
          <p className="text-sm leading-6 text-slate-700">{post.photoDescription}</p>
        </div>
      ) : null}
      {editingPhotos ? null : (
        <button type="button" onClick={() => setEditingPhotos(true)} className="mt-2 text-sm font-semibold text-sky-700">
          {post.imageObjectKey ? '사진 편집 (바꾸기·추가·순서)' : '사진 직접 올리기'}
        </button>
      )}
      {post.reviewFeedback ? <p className="mt-2 text-xs text-slate-500">지난 피드백: {post.reviewFeedback}</p> : null}
      {error ? <p className="mt-2 text-sm text-rose-700">{error}</p> : null}
      <ReviewActions
        busy={busy}
        onAction={handle}
        publishDisabledReason={!profileApproved ? '계정을 먼저 게시해야 글을 올릴 수 있어요.' : post.photoDescription && !post.imageObjectKey ? '사진을 그린 뒤에 게시할 수 있어요.' : undefined}
        drawAction={post.photoDescription && !post.imageObjectKey ? { requested: post.photoRequested } : undefined}
      />
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
  const [busy, setBusy] = useState<Action | null>(null)
  const [error, setError] = useState<string | null>(null)
  const bio = useStaffTranslation({ kind: 'profile', id: profile.userId }, profile.bio ?? '', setError)
  const [drawing, setDrawing] = useState(profile.profileState === 'drawing')

  async function handle(action: Action, feedback: string) {
    if (action === 'delete' && !window.confirm(`${profile.name ?? profile.handle} 계정과 검토 중인 글을 모두 삭제할까요?`)) return
    setBusy(action)
    setError(null)
    try {
      const result = await sendReview('profile', profile.userId, action, feedback)
      if (action === 'delete') onDeleted()
      else if (action === 'publish') onApproved()
      else if (result.state === 'drawing') setDrawing(true)
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
    <AdminCard as="article" className={CARD_CLASS}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-slate-500">새 계정 · 가입 {formatAt(at)}</p>
        <div className="flex items-center">
          <EditLink userId={profile.userId} />
          <PinButton kind="profile" id={profile.userId} pinned={pinned} />
        </div>
      </div>
      {image ? (
        <div className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={image} alt="" className="aspect-square max-h-[75svh] w-full rounded-xl bg-slate-100 object-cover" />
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
          <AdminChip tone="warning">계정 검토 중</AdminChip>
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
      <ReviewActions busy={busy} onAction={handle} publishDisabledReason={drawing ? '새 사진을 그리는 중이에요.' : undefined} />
    </AdminCard>
  )
}

/**
 * Accounts and posts on one timeline, oldest first. Answering a profile here
 * updates every post of that account on the page: 게시 unlocks them, 삭제
 * removes them, and a redrawn photo shows on their author rows.
 */
export function ReviewBoard({ items: initial }: { items: ReviewItem[] }) {
  const [items, setItems] = useState(initial)
  const [approved, setApproved] = useState(
    () => new Set(initial.flatMap((item) => (item.kind === 'post' && item.author.profileState === 'approved' ? [item.author.userId] : []))),
  )
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
              onDeleted={() => remove((other) => authorOf(other) === userId)}
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
            author={{ userId, name: item.author.name, handle: item.author.handle, image: images[userId] ?? item.author.image, languages: item.author.primaryLanguages, interestLanguages: item.author.interestLanguages }}
            profileApproved={approved.has(userId)}
            onDone={() => remove((other) => other.key === item.key)}
          />
        )
      })}
    </div>
  )
}
