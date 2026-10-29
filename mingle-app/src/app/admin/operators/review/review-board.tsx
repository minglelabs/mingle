'use client'

import { useState } from 'react'
import { Loader2, MessageSquarePlus, RefreshCw, Send, Trash2 } from 'lucide-react'
import type { ReviewItem, ReviewPost, ReviewProfile } from '@/server/operator-review/review'
import { AdminButton, AdminCard, AdminChip, adminTextareaClassName } from '../../_components/ui'
import { OperatorAvatar } from '../_components/operator-ui'
import { koreanLanguageName } from '../_lib/options'

type Action = 'publish' | 'delete' | 'regenerate'

const ERROR_COPY: Record<string, string> = {
  not_found: '이미 처리된 항목이에요.',
  already_approved: '이미 게시된 계정이에요.',
  busy: '다른 작업이 진행 중이에요. 잠시 후 다시 눌러 주세요.',
  profile_pending: '계정을 먼저 게시해야 글을 올릴 수 있어요.',
  publish_failed: '게시하지 못했어요. 다시 눌러 주세요.',
  regenerate_failed: '다시 만들지 못했어요. 다시 눌러 주세요.',
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

/** 게시 · 삭제 · 재제작, with a feedback note that opens on demand. */
function ReviewActions({
  busy,
  onAction,
  publishDisabledReason,
}: {
  busy: Action | null
  onAction: (action: Action, feedback: string) => void
  publishDisabledReason?: string
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
          placeholder="재제작할 때 반영할 피드백"
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
      {publishDisabledReason ? <p className="text-xs text-slate-500">{publishDisabledReason}</p> : null}
    </div>
  )
}

function PostCard({ post: initial, at, author, profileApproved, onDone }: {
  post: ReviewPost
  at: string
  author: { name: string | null; handle: string; image: string | null }
  profileApproved: boolean
  onDone: () => void
}) {
  const [post, setPost] = useState(initial)
  const [busy, setBusy] = useState<Action | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handle(action: Action, feedback: string) {
    if (action === 'delete' && !window.confirm('이 글을 삭제할까요?')) return
    setBusy(action)
    setError(null)
    try {
      const result = await sendReview('post', post.id, action, feedback)
      if (action === 'regenerate' && result.post) setPost(result.post as ReviewPost)
      else onDone()
    } catch (caught) {
      setError(ERROR_COPY[(caught as Error).message] ?? '요청하지 못했어요.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <AdminCard as="article" className="p-3">
      {/* Laid out like a post in the app's feed: author row, text, then the photo at full width. */}
      <div className="mb-2 flex items-center gap-2">
        <OperatorAvatar image={author.image} name={author.name} size={36} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-900">{author.name ?? '(이름 없음)'}</p>
          <p className="truncate text-xs text-slate-500">@{author.handle} · 글 {formatAt(at)}</p>
        </div>
      </div>
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        {post.language ? <AdminChip tone="accent">{koreanLanguageName(post.language)}로 씀</AdminChip> : null}
        {post.topic ? <AdminChip>{post.topic}</AdminChip> : null}
        {post.photoKind ? <AdminChip tone="warning">사진: {PHOTO_KIND[post.photoKind] ?? post.photoKind}</AdminChip> : null}
      </div>
      <p className="whitespace-pre-wrap break-words text-[15px] leading-6 text-slate-900">{post.text}</p>
      {post.imageObjectKey ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/admin/operators/api/review/image?key=${encodeURIComponent(post.imageObjectKey)}`}
          alt=""
          width={post.imageWidth ?? undefined}
          height={post.imageHeight ?? undefined}
          loading="lazy"
          className="mt-2 h-auto max-h-[85svh] w-full rounded-xl bg-slate-100 object-contain"
        />
      ) : post.photoDescription ? (
        <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
          게시할 때 그릴 사진: {post.photoDescription}
        </p>
      ) : null}
      {post.reviewFeedback ? <p className="mt-2 text-xs text-slate-500">지난 피드백: {post.reviewFeedback}</p> : null}
      {error ? <p className="mt-2 text-sm text-rose-700">{error}</p> : null}
      <ReviewActions
        busy={busy}
        onAction={handle}
        publishDisabledReason={profileApproved ? undefined : '계정을 먼저 게시해야 글을 올릴 수 있어요.'}
      />
    </AdminCard>
  )
}

function ProfileCard({ profile, at, image, onImage, onApproved, onDeleted }: {
  profile: ReviewProfile
  at: string
  image: string | null
  onImage: (image: string) => void
  onApproved: () => void
  onDeleted: () => void
}) {
  const [busy, setBusy] = useState<Action | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handle(action: Action, feedback: string) {
    if (action === 'delete' && !window.confirm(`${profile.name ?? profile.handle} 계정과 검토 중인 글을 모두 삭제할까요?`)) return
    setBusy(action)
    setError(null)
    try {
      const result = await sendReview('profile', profile.userId, action, feedback)
      if (action === 'delete') onDeleted()
      else if (action === 'publish') onApproved()
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
    profile.primaryLanguages.map((code) => koreanLanguageName(code)).join('·') || null,
  ].filter(Boolean)

  return (
    <AdminCard as="article" className="p-3">
      <p className="mb-2 text-xs font-semibold text-slate-500">새 계정 · 가입 {formatAt(at)}</p>
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image} alt="" className="aspect-square max-h-[75svh] w-full rounded-xl bg-slate-100 object-cover" />
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
        {profile.bio ? <p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-800">{profile.bio}</p> : null}
      </div>
      {profile.profileFeedback ? <p className="mt-2 text-xs text-slate-500">지난 피드백: {profile.profileFeedback}</p> : null}
      {error ? <p className="mt-2 text-sm text-rose-700">{error}</p> : null}
      <ReviewActions busy={busy} onAction={handle} />
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
    <div className="mx-auto w-full max-w-[440px] space-y-6">
      {items.map((item) => {
        if (item.kind === 'profile') {
          const userId = item.profile.userId
          return (
            <ProfileCard
              key={item.key}
              profile={item.profile}
              at={item.at}
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
            author={{ name: item.author.name, handle: item.author.handle, image: images[userId] ?? item.author.image }}
            profileApproved={approved.has(userId)}
            onDone={() => remove((other) => other.key === item.key)}
          />
        )
      })}
    </div>
  )
}
