'use client'

import { useCallback, useEffect, useState } from 'react'
import { Download, Link2, Loader2, Share2, X } from 'lucide-react'
import { renderProfileQrCardDataUrl, renderStyledQrDataUrl } from '@/components/profile-qr-card'
import { formatHandle } from '@/lib/handles'
import { buildProfileLinkUrl } from '@/lib/profile-link'
import { buildInviteSharedLinkMessage } from '@/i18n/invite-ticket-copy'
import type { PrimaryUiLocale } from '@/i18n/mingle-locales'

type NativeBridgeWindow = Window & { ReactNativeWebView?: { postMessage?: (message: string) => void } }

/**
 * 프로필 공유 for an operator account, the way a real person shares their own
 * profile from the app's share screen (`profile-share-screen.tsx`): the same
 * profile link, the same message (link plus the account's invite code), and
 * the same QR card image to save. `origin` is the app's public site URL, so
 * the link is the one the app itself hands out.
 */
export function ProfileShareButton({ userId, name, handle, origin, inviteCode, messageLocale }: {
  userId: string
  name: string
  handle: string
  origin: string
  inviteCode: string | null
  messageLocale: PrimaryUiLocale
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-semibold text-slate-700">
        <Share2 className="h-4 w-4" aria-hidden="true" />
        프로필 공유
      </button>
      {open ? <ShareSheet userId={userId} name={name} handle={handle} origin={origin} inviteCode={inviteCode} messageLocale={messageLocale} onClose={() => setOpen(false)} /> : null}
    </>
  )
}

function ShareSheet({ userId, name, handle, origin, inviteCode, messageLocale, onClose }: {
  userId: string
  name: string
  handle: string
  origin: string
  inviteCode: string | null
  messageLocale: PrimaryUiLocale
  onClose: () => void
}) {
  const profileUrl = buildProfileLinkUrl(origin || window.location.origin, userId) ?? ''
  const message = profileUrl ? buildInviteSharedLinkMessage(messageLocale, profileUrl, inviteCode) : ''
  const [qr, setQr] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!profileUrl) return
    let cancelled = false
    void renderStyledQrDataUrl(profileUrl).then((dataUrl) => { if (!cancelled) setQr(dataUrl) }).catch(() => { if (!cancelled) setStatus('QR을 만들지 못했어요.') })
    return () => { cancelled = true }
  }, [profileUrl])

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(message)
      setStatus('링크를 복사했어요.')
    } catch {
      setStatus('복사하지 못했어요.')
    }
  }, [message])

  const share = useCallback(async () => {
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: name, text: message })
        return
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return
      }
    }
    await copy()
  }, [copy, message, name])

  const saveQr = useCallback(async () => {
    setSaving(true)
    try {
      const card = await renderProfileQrCardDataUrl({ value: profileUrl, handle: formatHandle(handle), name })
      const fileName = `mingle-profile-${userId}.png`
      const bridge = window as NativeBridgeWindow
      if (typeof bridge.ReactNativeWebView?.postMessage === 'function') {
        // Inside the app: the native side saves it to the photo library, like the app's own share screen.
        bridge.ReactNativeWebView.postMessage(JSON.stringify({ type: 'native_qr_save', payload: { dataUrl: card, fileName } }))
        setStatus('QR 사진을 저장하는 중…')
        return
      }
      const anchor = document.createElement('a')
      anchor.href = card
      anchor.download = fileName
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      setStatus('QR 사진을 내려받았어요.')
    } catch {
      setStatus('QR 사진을 만들지 못했어요.')
    } finally {
      setSaving(false)
    }
  }, [handle, name, profileUrl, userId])

  return (
    <div className="fixed inset-0 z-[130] flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <section
        role="dialog"
        aria-modal="true"
        aria-label="프로필 공유"
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-md rounded-t-3xl bg-white px-5 pb-[max(env(safe-area-inset-bottom),20px)] pt-4 sm:rounded-3xl"
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900">프로필 공유</h2>
          <button type="button" onClick={onClose} aria-label="닫기" className="rounded-full p-2 text-slate-500 active:bg-slate-100">
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <div className="flex flex-col items-center rounded-2xl p-5" style={{ background: 'linear-gradient(135deg, #1295e8 0%, #3569ed 52%, #7338f2 100%)' }}>
          <div className="flex h-56 w-56 items-center justify-center rounded-2xl bg-white p-3">
            {qr ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qr} alt={`${name} 프로필 QR`} className="h-full w-full" />
            ) : <Loader2 className="h-6 w-6 animate-spin text-slate-400" aria-hidden="true" />}
          </div>
          <p className="mt-3 text-base font-bold text-white">{name}</p>
          <p className="text-sm text-white/80">{formatHandle(handle)}</p>
        </div>
        <p className="mt-3 select-all break-all rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">{message}</p>
        <div className="mt-3 grid grid-cols-3 gap-2 text-sm font-semibold">
          <button type="button" onClick={() => void copy()} className="flex flex-col items-center gap-1 rounded-xl border border-slate-200 py-2.5 text-slate-700 active:bg-slate-50">
            <Link2 className="h-5 w-5" aria-hidden="true" />링크 복사
          </button>
          <button type="button" onClick={() => void share()} className="flex flex-col items-center gap-1 rounded-xl border border-slate-200 py-2.5 text-slate-700 active:bg-slate-50">
            <Share2 className="h-5 w-5" aria-hidden="true" />공유
          </button>
          <button type="button" onClick={() => void saveQr()} disabled={!qr || saving} className="flex flex-col items-center gap-1 rounded-xl border border-slate-200 py-2.5 text-slate-700 active:bg-slate-50 disabled:opacity-50">
            {saving ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : <Download className="h-5 w-5" aria-hidden="true" />}QR 사진 저장
          </button>
        </div>
        {status ? <p role="status" className="mt-2 text-center text-xs text-slate-600">{status}</p> : null}
      </section>
    </div>
  )
}
