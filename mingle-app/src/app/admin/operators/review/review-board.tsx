'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Loader2, RefreshCw, Send, Trash2 } from 'lucide-react'
import type { ReviewOperator, ReviewPost } from '@/server/operator-review/review'
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

/** 게시 · 삭제 · 재제작 plus an optional feedback note, shared by both card kinds. */
function ReviewActions({
  busy,
  onAction,
  publishDisabledReason,
}: {
  busy: Action | null
  onAction: (action: Action, feedback: string) => void
  publishDisabledReason?: string
}) {
  const [feedback, setFeedback] = useState('')
  return (
    <div className="mt-3 space-y-2">
      <textarea
        value={feedback}
        onChange={(event) => setFeedback(event.target.value)}
        rows={2}
        placeholder="피드백 (선택) — 재제작할 때 반영돼요"
        className={`${adminTextareaClassName} min-h-0`}
        disabled={busy !== null}
      />
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
        <AdminButton disabled={busy !== null} onClick={() => { onAction('regenerate', feedback); setFeedback('') }}>
          {busy === 'regenerate' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <RefreshCw className="h-4 w-4" aria-hidden="true" />}
          재제작
        </AdminButton>
      </div>
      {publishDisabledReason ? <p className="text-xs text-slate-500">{publishDisabledReason}</p> : null}
    </div>
  )
}

function PostCard({ post: initial, profileApproved, onDone }: { post: ReviewPost; profileApproved: boolean; onDone: () => void }) {
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
          className="mt-2 max-h-96 w-full rounded-lg bg-slate-100 object-contain"
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

function OperatorSection({ operator, focused }: { operator: ReviewOperator; focused: boolean }) {
  const router = useRouter()
  const [image, setImage] = useState(operator.image)
  const [profileState, setProfileState] = useState(operator.profileState)
  const [posts, setPosts] = useState(operator.posts)
  const [busy, setBusy] = useState<Action | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [deleted, setDeleted] = useState(false)
  const profileApproved = profileState === 'approved'

  async function handleProfile(action: Action, feedback: string) {
    if (action === 'delete' && !window.confirm(`${operator.name ?? operator.handle} 계정과 글 ${operator.postsInReview}개를 삭제할까요?`)) return
    setBusy(action)
    setError(null)
    try {
      const result = await sendReview('profile', operator.userId, action, feedback)
      if (action === 'delete') setDeleted(true)
      else if (action === 'publish') setProfileState('approved')
      else if (typeof result.image === 'string') setImage(result.image)
    } catch (caught) {
      setError(ERROR_COPY[(caught as Error).message] ?? '요청하지 못했어요.')
    } finally {
      setBusy(null)
    }
  }

  if (deleted) return null
  const facts = [
    operator.age ? `${operator.age}세` : null,
    operator.personaGender === 'female' ? '여성' : operator.personaGender === 'male' ? '남성' : null,
    [operator.city, operator.country].filter(Boolean).join(', ') || null,
    operator.primaryLanguages.map((code) => koreanLanguageName(code)).join('·') || null,
  ].filter(Boolean)
  const remaining = operator.postsInReview - (operator.posts.length - posts.length)

  return (
    <section className="space-y-3">
      <AdminCard>
        <div className="flex gap-3">
          <OperatorAvatar image={image} name={operator.name} size={88} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <h2 className="break-words text-lg font-semibold text-slate-900">{operator.name ?? '(이름 없음)'}</h2>
              <AdminChip tone={profileApproved ? 'success' : 'warning'}>{profileApproved ? '게시됨' : '계정 검토 중'}</AdminChip>
            </div>
            <p className="text-sm text-slate-500">@{operator.handle}</p>
            {facts.length ? <p className="mt-1 text-sm text-slate-600">{facts.join(' · ')}</p> : null}
            {operator.bio ? <p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-800">{operator.bio}</p> : null}
          </div>
        </div>
        {operator.profileFeedback && !profileApproved ? <p className="mt-2 text-xs text-slate-500">지난 피드백: {operator.profileFeedback}</p> : null}
        {error ? <p className="mt-2 text-sm text-rose-700">{error}</p> : null}
        {profileApproved ? null : <ReviewActions busy={busy} onAction={handleProfile} />}
      </AdminCard>

      {posts.map((post) => (
        <PostCard
          key={post.id}
          post={post}
          profileApproved={profileApproved}
          onDone={() => setPosts((current) => current.filter((item) => item.id !== post.id))}
        />
      ))}
      {remaining > posts.length ? (
        focused ? (
          <AdminButton block onClick={() => router.refresh()}>남은 글 {remaining - posts.length}개 더 불러오기</AdminButton>
        ) : (
          <Link
            href={`/admin/operators/review?operator=${encodeURIComponent(operator.userId)}`}
            className="block rounded-lg border border-slate-200 bg-white px-4 py-3 text-center text-sm font-semibold text-sky-700"
          >
            이 계정의 글 {remaining}개 모두 보기
          </Link>
        )
      ) : null}
    </section>
  )
}

export function ReviewBoard({ operators, focused }: { operators: ReviewOperator[]; focused: boolean }) {
  return (
    <div className="space-y-8">
      {operators.map((operator) => <OperatorSection key={operator.userId} operator={operator} focused={focused} />)}
    </div>
  )
}
