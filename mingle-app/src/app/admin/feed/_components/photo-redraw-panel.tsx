'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

const ERRORS: Record<string, string> = {
  invalid_image: 'JPG·PNG·WEBP 사진만 넣을 수 있어요.',
  image_too_large: '사진이 너무 커요 (15MB까지).',
  image_refused: 'ChatGPT가 이 사진은 그려 주지 않았어요. 메모를 바꾸거나 다른 레퍼런스로 해 보세요.',
  draw_failed: '사진을 만들지 못했어요. 잠시 후 다시 해 주세요.',
  no_brief: '이 글은 원래 사진 설명이 없어요. 레퍼런스 사진을 넣어 주세요.',
  not_found: '운영 계정 글만 고칠 수 있어요.',
}

type Candidate = { objectKey: string; width: number; height: number }

function languageLabel(code: string | null): string | null {
  if (!code) return null
  try {
    return new Intl.DisplayNames(['ko'], { type: 'language' }).of(code) ?? null
  } catch {
    return null
  }
}

function Choice<T extends string>({ value, current, onPick, children }: { value: T; current: T; onPick: (value: T) => void; children: React.ReactNode }) {
  const active = value === current
  return (
    <button
      type="button"
      onClick={() => onPick(value)}
      className={`h-8 rounded-full border px-3 text-xs font-medium ${active ? 'border-sky-600 bg-sky-600 text-white' : 'border-slate-200 bg-white text-slate-600'}`}
    >
      {children}
    </button>
  )
}

/**
 * Draws a new photo for an operator post in ChatGPT and shows it before it
 * goes on the post. With a reference photo, that shot is redrawn with this
 * account's face; without one, the post's own photo is drawn again.
 */
export function PhotoRedrawPanel({ postId, language, onClose }: { postId: string; language: string | null; onClose: () => void }) {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [reference, setReference] = useState<File | null>(null)
  const [referenceUrl, setReferenceUrl] = useState<string | null>(null)
  const [face, setFace] = useState<'poster' | 'new'>('poster')
  const [text, setText] = useState<'translate' | 'remove' | 'keep'>('translate')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState<'draw' | 'apply' | null>(null)
  const [candidate, setCandidate] = useState<Candidate | null>(null)
  const [error, setError] = useState<string | null>(null)
  const languageText = languageLabel(language)

  useEffect(() => {
    if (!reference) { setReferenceUrl(null); return }
    const url = URL.createObjectURL(reference)
    setReferenceUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [reference])

  async function draw() {
    setBusy('draw')
    setError(null)
    const form = new FormData()
    if (reference) form.set('reference', reference)
    form.set('face', face)
    form.set('text', text)
    form.set('note', note)
    try {
      const response = await fetch(`/admin/api/posts/${postId}/image/redraw`, { method: 'POST', body: form })
      const body = await response.json().catch(() => ({})) as Partial<Candidate> & { error?: string }
      if (!response.ok || !body.objectKey) { setError(ERRORS[body.error ?? ''] ?? '사진을 만들지 못했어요.'); return }
      setCandidate({ objectKey: body.objectKey, width: body.width ?? 0, height: body.height ?? 0 })
    } catch {
      setError('사진을 만들지 못했어요.')
    } finally {
      setBusy(null)
    }
  }

  async function apply() {
    if (!candidate) return
    setBusy('apply')
    setError(null)
    try {
      const response = await fetch(`/admin/api/posts/${postId}/image`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ objectKey: candidate.objectKey }),
      })
      if (!response.ok) { setError('사진을 바꾸지 못했어요.'); return }
      router.refresh()
      onClose()
    } catch {
      setError('사진을 바꾸지 못했어요.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
      <p className="text-sm font-semibold text-slate-900">사진 다시 만들기</p>
      <p className="mt-0.5 text-xs text-slate-500">글은 그대로 두고 사진만 새로 만듭니다. 만든 사진을 보고 고른 뒤에만 글에 들어가요.</p>

      <div className="mt-3 flex items-start gap-3">
        {referenceUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={referenceUrl} alt="레퍼런스 사진" className="h-24 w-auto rounded-lg border border-slate-200 bg-white object-contain" />
        ) : null}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => fileRef.current?.click()}
            className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 active:bg-slate-100 disabled:opacity-50"
          >
            {reference ? '레퍼런스 바꾸기' : '레퍼런스 사진 넣기 (선택)'}
          </button>
          {reference ? (
            <button type="button" disabled={busy !== null} onClick={() => setReference(null)} className="h-9 px-2 text-sm text-slate-500 disabled:opacity-50">빼기</button>
          ) : null}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(event) => { setReference(event.target.files?.[0] ?? null); event.target.value = '' }}
        />
      </div>

      {reference ? (
        <div className="mt-3 space-y-2">
          <div>
            <p className="text-xs font-medium text-slate-700">얼굴</p>
            <div className="mt-1 flex flex-wrap gap-2">
              <Choice value="poster" current={face} onPick={setFace}>이 계정 사람 얼굴로</Choice>
              <Choice value="new" current={face} onPick={setFace}>새 얼굴로</Choice>
            </div>
          </div>
          <div>
            <p className="text-xs font-medium text-slate-700">사진 속 글자 (자막·스티커)</p>
            <div className="mt-1 flex flex-wrap gap-2">
              <Choice value="translate" current={text} onPick={setText}>{languageText ? `${languageText}로 바꾸기` : '글쓴이 언어로 바꾸기'}</Choice>
              <Choice value="remove" current={text} onPick={setText}>지우기</Choice>
              <Choice value="keep" current={text} onPick={setText}>그대로</Choice>
            </div>
          </div>
          <p className="text-xs text-slate-500">구도·포즈·옷·머리·배경은 레퍼런스를 따르고, 얼굴은 레퍼런스 속 사람과 닮지 않게 바꿉니다. 앱 화면 캡처면 버튼·아이디 같은 화면 요소는 빼고 사진만 그려요.</p>
        </div>
      ) : null}

      <textarea
        value={note}
        onChange={(event) => setNote(event.target.value)}
        rows={2}
        maxLength={500}
        placeholder="추가 요청 (선택). 예: 웃는 표정으로, 배경은 카페로"
        className="mt-3 w-full rounded-lg border border-slate-200 bg-white p-2 text-sm text-slate-900"
      />

      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => void draw()}
          className="h-9 rounded-lg bg-sky-600 px-4 text-sm font-semibold text-white disabled:opacity-50"
        >
          {busy === 'draw' ? '만드는 중… (1~5분)' : candidate ? '다시 만들기' : '만들기'}
        </button>
        <button type="button" disabled={busy !== null} onClick={onClose} className="h-9 px-3 text-sm text-slate-500 disabled:opacity-50">닫기</button>
      </div>

      {candidate ? (
        <div className="mt-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/admin/api/posts/${postId}/image?candidate=${encodeURIComponent(candidate.objectKey)}`}
            alt="새로 만든 사진"
            width={candidate.width || undefined}
            height={candidate.height || undefined}
            className="h-auto max-h-[70svh] w-full rounded-xl border border-slate-200 bg-slate-900 object-contain"
          />
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void apply()}
            className="mt-2 h-10 w-full rounded-lg bg-slate-900 text-sm font-semibold text-white disabled:opacity-50"
          >
            {busy === 'apply' ? '바꾸는 중…' : '이 사진으로 바꾸기'}
          </button>
        </div>
      ) : null}

      {error ? <p className="mt-2 text-xs text-red-600">{error}</p> : null}
    </div>
  )
}
