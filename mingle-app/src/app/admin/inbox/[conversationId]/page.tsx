import type { Metadata } from 'next'
import Link from 'next/link'
import { requireAdmin } from '@/server/admin/guard'
import { loadInboxRoomView, normalizeInboxId } from '@/server/operator-inbox/inbox'
import { InboxRoomView } from '../_components/inbox-room-view'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: '대화 · Mingle Admin',
  robots: { index: false, follow: false },
}

type PageProps = {
  params: Promise<{ conversationId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

function firstParam(value: string | string[] | undefined): string {
  return typeof value === 'string' ? value : Array.isArray(value) ? value[0] ?? '' : ''
}

const ERROR_COPY: Record<string, string> = {
  not_found: '인박스에 없는 대화방입니다. 운영 계정이 나갔거나 대화방이 삭제되었을 수 있습니다.',
  operator_not_in_room: '선택한 운영 계정은 이 대화방의 멤버가 아닙니다.',
  operator_required: '운영 계정이 아니어서 이 대화방을 열 수 없습니다.',
  operator_ambiguous: '답장할 운영 계정을 골라 주세요.',
}

/** One operator room, opened as the operator account (audited as `inbox.open`). */
export default async function AdminInboxRoomPage({ params, searchParams }: PageProps) {
  const ctx = await requireAdmin(`/admin/inbox/${encodeURIComponent((await params).conversationId)}`)
  const { conversationId: rawConversationId } = await params
  const query = await searchParams
  const conversationId = normalizeInboxId(rawConversationId)
  const rawAs = firstParam(query.as)
  const operatorUserId = rawAs ? normalizeInboxId(rawAs) : null

  const result = conversationId && (!rawAs || operatorUserId)
    ? await loadInboxRoomView({ ctx, conversationId, operatorUserId, auditOpen: true })
    : { ok: false as const, error: rawAs ? 'operator_not_in_room' as const : 'not_found' as const }

  if (!result.ok) {
    return (
      <main className="min-h-dvh bg-slate-50 px-4 py-12 text-slate-900">
        <div className="mx-auto flex max-w-md flex-col items-center gap-4 rounded-2xl border border-slate-200 bg-white px-5 py-8 text-center">
          <h1 className="text-lg font-semibold">대화방을 열 수 없습니다</h1>
          <p className="break-words text-sm text-slate-600">{ERROR_COPY[result.error] ?? ERROR_COPY.not_found}</p>
          <Link
            href="/admin/inbox"
            className="inline-flex min-h-11 items-center rounded-full bg-slate-900 px-5 text-sm font-medium text-white"
          >
            인박스로 돌아가기
          </Link>
        </div>
      </main>
    )
  }

  // Keyed by the operator: switching `?as=` starts a fresh room state.
  return <InboxRoomView key={result.view.room.operator.userId} initialView={result.view} />
}
