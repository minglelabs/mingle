'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useSession } from 'next-auth/react'
import { Languages } from 'lucide-react'
import { buildClientApiPath } from '@/lib/api-contract'
import { BIO_CHANGED_EVENT, DISPLAY_LANGUAGE_CHANGED_EVENT, sameBioLanguage, type ProfileBioSnapshot } from '@/lib/profile-bio'
import { profileBioCopy } from '@/i18n/profile-bio-copy'

export default function ProfileBio({ userId, initialBio, locale, dark = false, editing = false }: {
  userId: string; initialBio?: string | null; locale: string; dark?: boolean; editing?: boolean
}) {
  const { data: session } = useSession()
  const viewerId = session?.user?.id
  const [snapshot, setSnapshot] = useState<ProfileBioSnapshot | null>(null)
  const [showOriginal, setShowOriginal] = useState(false)
  const [requesting, setRequesting] = useState(false)
  const [error, setError] = useState(false)
  const previousInitialBio = useRef(initialBio)
  const lastReadAt = useRef(0)
  const generation = useRef(0)
  const inFlight = useRef<AbortController | null>(null)
  const snapshotRef = useRef(snapshot)
  snapshotRef.current = snapshot
  const copy = profileBioCopy(locale)
  const refresh = useCallback(async (request = false) => {
    if (!viewerId || !userId) return
    // User intent supersedes an in-flight poll; polls never cancel a POST.
    if (inFlight.current && !request) return
    inFlight.current?.abort()
    const controller = new AbortController()
    inFlight.current = controller
    const revision = ++generation.current
    const deadline = setTimeout(() => controller.abort(), 12_000)
    if (request) { setRequesting(true); setError(false); setShowOriginal(false) }
    try {
      const response = await fetch(buildClientApiPath(`/users/${encodeURIComponent(userId)}/bio?locale=${encodeURIComponent(locale)}`), {
        method: request ? 'POST' : 'GET', cache: 'no-store', signal: controller.signal,
        headers: { 'x-mingle-expected-account-id': viewerId },
      })
      if (!response.ok) throw new Error('bio_unavailable')
      const next = await response.json() as ProfileBioSnapshot
      if (revision !== generation.current) return
      const previous = snapshotRef.current
      if (previous?.versionId !== next.versionId || previous?.language !== next.language) setShowOriginal(false)
      lastReadAt.current = Date.now()
      setSnapshot(next)
      if (next.status === 'succeeded') setError(false)
    } catch { if (revision === generation.current && request) setError(true) }
    finally {
      clearTimeout(deadline)
      if (revision === generation.current) { inFlight.current = null; setRequesting(false) }
    }
  }, [userId, viewerId, locale])
  useEffect(() => {
    if (previousInitialBio.current === initialBio) return
    previousInitialBio.current = initialBio
    // A saved deletion must disappear now, even if an earlier poll is still pending.
    generation.current++; inFlight.current?.abort(); inFlight.current = null
    setSnapshot(null); setRequesting(false); setShowOriginal(false)
    void refresh()
  }, [initialBio, refresh])
  useEffect(() => {
    setSnapshot(null); setShowOriginal(false); setError(false)
    void refresh()
    const interval = setInterval(() => {
      const current = snapshotRef.current
      if (!document.hidden && (current?.updating || current?.detecting || current?.status === 'running' || Date.now() - lastReadAt.current >= 15_000)) void refresh()
    }, 2000)
    const changed = () => {
      if (document.hidden) return
      generation.current++; inFlight.current?.abort(); inFlight.current = null
      setRequesting(false)
      void refresh()
    }
    window.addEventListener(BIO_CHANGED_EVENT, changed)
    window.addEventListener(DISPLAY_LANGUAGE_CHANGED_EVENT, changed)
    window.addEventListener('focus', changed)
    document.addEventListener('visibilitychange', changed)
    return () => {
      // Invalidate the latest request counter, not the value captured when this effect mounted.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      generation.current++; inFlight.current?.abort(); inFlight.current = null
      clearInterval(interval)
      window.removeEventListener(BIO_CHANGED_EVENT, changed)
      window.removeEventListener(DISPLAY_LANGUAGE_CHANGED_EVENT, changed)
      window.removeEventListener('focus', changed)
      document.removeEventListener('visibilitychange', changed)
    }
  }, [refresh])
  if (editing) {
    if (!snapshot?.draft?.original) return null
    return <p role="status" className="mt-2 text-xs text-slate-500">{snapshot.draft.status === 'running' ? copy.processing : snapshot.draft.status === 'failed' ? copy.partial : copy.ready}</p>
  }
  const original = snapshot?.original ?? initialBio ?? ''
  if (!original) return null
  const translated = snapshot?.translation
  const pending = requesting || snapshot?.status === 'running'
  const canTranslate = snapshot && !snapshot.detecting && !sameBioLanguage(snapshot.sourceLanguage, snapshot.language)
  return <div className={`mt-1 min-w-0 ${dark ? 'text-white/85' : 'text-slate-700'}`}>
    <p dir="auto" className="whitespace-pre-wrap break-words text-[14px] leading-relaxed [overflow-wrap:anywhere]">{translated && !showOriginal && !requesting ? translated : original}</p>
    {canTranslate && <button type="button" disabled={pending} onClick={() => translated ? setShowOriginal(value => !value) : void refresh(true)}
      className={`-ml-2 inline-flex min-h-11 max-w-full items-center gap-1.5 rounded-lg px-2 py-2 text-left text-xs ${dark ? 'text-white/75 hover:bg-white/10' : 'text-slate-500 hover:bg-slate-50'} disabled:opacity-70`}>
      <Languages size={15} className="shrink-0" aria-hidden="true" /><span>{pending ? copy.translating : translated && !showOriginal ? copy.original : copy.translate}</span>
    </button>}
    {(error || snapshot?.status === 'failed') && <p role="status" className={`text-xs ${dark ? 'text-white/75' : 'text-slate-500'}`}>{copy.failed}</p>}
  </div>
}
