'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

const ERRORS: Record<string, string> = {
  invalid_image: 'JPG·PNG·WEBP 사진만 올릴 수 있어요.',
  image_too_large: '사진이 너무 커요 (15MB까지).',
  invalid_text: '글이 비었거나 너무 길어요.',
  conflict: '그사이 글이 바뀌었어요. 새로고침 후 다시 해 주세요.',
  not_found: '운영 계정 글만 고칠 수 있어요.',
}

/** Staff edits on an operator's post, straight from the feed preview: swap the photo, rewrite the text. */
export function OperatorPostEditor({ postId, text, hasPhoto }: { postId: string; text: string | null; hasPhoto: boolean }) {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(text ?? '')
  const [busy, setBusy] = useState<'photo' | 'text' | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function send(kind: 'photo' | 'text', request: () => Promise<Response>) {
    setBusy(kind)
    setError(null)
    try {
      const response = await request()
      if (!response.ok) {
        const body = await response.json().catch(() => ({})) as { error?: string }
        setError(ERRORS[body.error ?? ''] ?? '저장하지 못했어요.')
        return false
      }
      router.refresh()
      return true
    } catch {
      setError('저장하지 못했어요.')
      return false
    } finally {
      setBusy(null)
    }
  }

  async function uploadPhoto(file: File) {
    const form = new FormData()
    form.set('file', file)
    await send('photo', () => fetch(`/admin/api/posts/${postId}/image`, { method: 'POST', body: form }))
    if (fileRef.current) fileRef.current.value = ''
  }

  async function saveText() {
    const saved = await send('text', () => fetch(`/admin/api/posts/${postId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: draft }),
    }))
    if (saved) setEditing(false)
  }

  return (
    <div className="mt-3">
      <div className="flex gap-2">
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => fileRef.current?.click()}
          className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 active:bg-slate-100 disabled:opacity-50"
        >
          {busy === 'photo' ? '올리는 중…' : hasPhoto ? '사진 바꾸기' : '사진 넣기'}
        </button>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => { setDraft(text ?? ''); setEditing((open) => !open); setError(null) }}
          className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 active:bg-slate-100 disabled:opacity-50"
        >
          {editing ? '수정 취소' : '글 수정'}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadPhoto(file) }}
        />
      </div>
      {editing ? (
        <div className="mt-2">
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            rows={3}
            maxLength={1000}
            className="w-full rounded-lg border border-slate-200 p-2 text-sm text-slate-900"
          />
          <button
            type="button"
            disabled={busy !== null || !draft.trim()}
            onClick={() => void saveText()}
            className="mt-1 h-9 rounded-lg bg-sky-600 px-4 text-sm font-semibold text-white disabled:opacity-50"
          >
            {busy === 'text' ? '번역까지 저장 중…' : '저장'}
          </button>
        </div>
      ) : null}
      {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : null}
    </div>
  )
}
