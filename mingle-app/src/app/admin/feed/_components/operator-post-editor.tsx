'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { PhotoRedrawPanel } from './photo-redraw-panel'
import { PostTakedownButton } from './post-takedown-button'
import { refreshInPlace } from '../../_components/refresh-in-place'

const ERRORS: Record<string, string> = {
  invalid_image: 'JPG·PNG·WEBP 사진만 올릴 수 있어요.',
  image_too_large: '사진이 너무 커요 (15MB까지).',
  invalid_text: '글이 비었거나 너무 길어요.',
  conflict: '그사이 글이 바뀌었어요. 새로고침 후 다시 해 주세요.',
  not_found: '운영 계정 글만 고칠 수 있어요.',
  invalid_time: '지금보다 이전 시각으로만 바꿀 수 있어요.',
}

/** A Date as a `datetime-local` value in the viewer's time zone. */
function toLocalInput(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** Staff edits on an operator's post, straight from the feed preview: swap the photo, rewrite the text, move its time. */
export function OperatorPostEditor({ postId, text, hasPhoto, language = null, publishedAt = null }: { postId: string; text: string | null; hasPhoto: boolean; language?: string | null; publishedAt?: string | null }) {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [editing, setEditing] = useState(false)
  const [redrawing, setRedrawing] = useState(false)
  const [draft, setDraft] = useState(text ?? '')
  const [busy, setBusy] = useState<'photo' | 'text' | 'time' | null>(null)
  const [timing, setTiming] = useState(false)
  const [time, setTime] = useState(publishedAt ? toLocalInput(new Date(publishedAt)) : '')
  const [error, setError] = useState<string | null>(null)

  async function send(kind: 'photo' | 'text' | 'time', request: () => Promise<Response>) {
    setBusy(kind)
    setError(null)
    try {
      const response = await request()
      if (!response.ok) {
        const body = await response.json().catch(() => ({})) as { error?: string }
        setError(ERRORS[body.error ?? ''] ?? '저장하지 못했어요.')
        return false
      }
      refreshInPlace(router)
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

  async function saveTime() {
    const at = new Date(time)
    if (Number.isNaN(at.getTime())) return
    // A few random seconds, so two posts moved to the same minute still differ.
    at.setSeconds(Math.floor(Math.random() * 60))
    const saved = await send('time', () => fetch(`/admin/api/posts/${postId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ publishedAt: at.toISOString() }),
    }))
    if (saved) setTiming(false)
  }

  return (
    <div className="mt-3">
      <div className="flex flex-wrap gap-2">
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
          onClick={() => setRedrawing((open) => !open)}
          className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 active:bg-slate-100 disabled:opacity-50"
        >
          {redrawing ? '다시 만들기 닫기' : '사진 다시 만들기'}
        </button>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => { setDraft(text ?? ''); setEditing((open) => !open); setError(null) }}
          className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 active:bg-slate-100 disabled:opacity-50"
        >
          {editing ? '수정 취소' : '글 수정'}
        </button>
        {publishedAt ? (
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => { setTime(toLocalInput(new Date(publishedAt))); setTiming((open) => !open); setError(null) }}
            className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 active:bg-slate-100 disabled:opacity-50"
          >
            {timing ? '시간 수정 닫기' : '시간 수정'}
          </button>
        ) : null}
        <PostTakedownButton postId={postId} hidden={false} />
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadPhoto(file) }}
        />
      </div>
      {redrawing ? <PhotoRedrawPanel postId={postId} language={language} onClose={() => setRedrawing(false)} /> : null}
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
      {timing ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input
            type="datetime-local"
            value={time}
            max={toLocalInput(new Date())}
            onChange={(event) => setTime(event.target.value)}
            className="h-9 rounded-lg border border-slate-200 px-2 text-sm text-slate-900"
          />
          <button
            type="button"
            disabled={busy !== null || !time}
            onClick={() => void saveTime()}
            className="h-9 rounded-lg bg-sky-600 px-4 text-sm font-semibold text-white disabled:opacity-50"
          >
            {busy === 'time' ? '저장 중…' : '시간 저장'}
          </button>
          <span className="w-full text-xs text-slate-500">피드와 프로필에 이 시각에 올린 글로 보여요. 지금보다 이전만 돼요.</span>
        </div>
      ) : null}
      {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : null}
    </div>
  )
}
