import type { Metadata } from 'next'
import Link from 'next/link'
import { requireAdmin } from '@/server/admin/guard'
import { normalizeActivityId } from '@/server/operator-activity/activity'
import { loadOperatorPostThread } from '@/server/operator-activity/thread'
import { PostThreadView } from '../../_components/post-thread-view'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: '댓글 · Mingle Admin',
  robots: { index: false, follow: false },
}

type PageProps = {
  params: Promise<{ postId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

function firstParam(value: string | string[] | undefined): string {
  return typeof value === 'string' ? value : Array.isArray(value) ? value[0] ?? '' : ''
}

const ERROR_COPY = {
  not_found: '글이 삭제되었거나 숨겨져서 열 수 없습니다.',
  operator_required: '이 글에 참여한 운영 계정이 없습니다. 알림 목록에서 다시 열어 주세요.',
} as const

/** One post's comment thread, read and answered as an operator account. */
export default async function AdminActivityPostPage({ params, searchParams }: PageProps) {
  const { postId: rawPostId } = await params
  await requireAdmin(`/admin/activity/posts/${encodeURIComponent(rawPostId)}`)
  const query = await searchParams
  const postId = normalizeActivityId(rawPostId)
  const rawAs = firstParam(query.as)
  const operatorUserId = rawAs ? normalizeActivityId(rawAs) : null

  const result = postId && (!rawAs || operatorUserId)
    ? await loadOperatorPostThread({ postId, operatorUserId })
    : { ok: false as const, error: rawAs ? 'operator_required' as const : 'not_found' as const }

  if (!result.ok) {
    return (
      <div className="px-4 py-12 text-slate-900">
        <div className="mx-auto flex max-w-md flex-col items-center gap-4 rounded-2xl border border-slate-200 bg-white px-5 py-8 text-center">
          <h1 className="text-lg font-semibold">글을 열 수 없습니다</h1>
          <p className="break-words text-sm text-slate-600">{ERROR_COPY[result.error]}</p>
          <Link
            href="/admin/activity"
            className="inline-flex min-h-11 items-center rounded-full bg-slate-900 px-5 text-sm font-medium text-white"
          >
            알림으로 돌아가기
          </Link>
        </div>
      </div>
    )
  }

  // Keyed by post and operator: switching either starts a fresh thread state.
  return (
    <PostThreadView
      key={`${result.thread.post.id}:${result.thread.operator.userId}`}
      initialThread={result.thread}
      focusCommentId={normalizeActivityId(firstParam(query.comment))}
    />
  )
}
