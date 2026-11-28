'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useSession } from 'next-auth/react'
import PostLanguageChips, { ORIGINAL_CHIP } from '@/components/feed/post-language-chips'
import { buildClientApiPath } from '@/lib/api-contract'
import { BIO_CHANGED_EVENT, BIO_DEFAULT_LANGUAGES, DISPLAY_LANGUAGE_CHANGED_EVENT, sameBioLanguage, type ProfileBioSnapshot } from '@/lib/profile-bio'
import { profileBioCopy } from '@/i18n/profile-bio-copy'
import { buildLanguageChips } from '@/lib/language-chips'
import { useViewerLanguages } from '@/lib/use-viewer-languages'
import { resolveLanguageSearchCopy, resolveMoreLanguagesCopy } from '@/i18n/more-languages-copy'

export default function ProfileBio({ userId, initialBio, locale, dark = false, editing = false, expectTranslate = false }: {
  userId: string; initialBio?: string | null; locale: string; dark?: boolean; editing?: boolean
  /** The bio is probably in another language: keep the translate row's place while it loads, so what sits below does not move. */
  expectTranslate?: boolean
}) {
  const { data: session } = useSession()
  const viewerId = session?.user?.id
  const [snapshot, setSnapshot] = useState<ProfileBioSnapshot | null>(null)
  const [showOriginal, setShowOriginal] = useState(false)
  // The flag the reader tapped (owner, 2026-11-25: flags like a post's, not a "translate" button);
  // null = their own language, which the server picks.
  const [chosenLanguage, setChosenLanguage] = useState<string | null>(null)
  const [readerLanguage, setReaderLanguage] = useState<string | null>(null)
  const [requesting, setRequesting] = useState(false)
  const [error, setError] = useState(false)
  const previousInitialBio = useRef(initialBio)
  const shownUserId = useRef(userId)
  const lastReadAt = useRef(0)
  const generation = useRef(0)
  const inFlight = useRef<AbortController | null>(null)
  const snapshotRef = useRef(snapshot)
  snapshotRef.current = snapshot
  const copy = profileBioCopy(locale)
  const viewerLanguages = useViewerLanguages(viewerId)
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
      const languageQuery = chosenLanguage ? `&language=${encodeURIComponent(chosenLanguage)}` : ''
      const response = await fetch(buildClientApiPath(`/users/${encodeURIComponent(userId)}/bio?locale=${encodeURIComponent(locale)}${languageQuery}`), {
        method: request ? 'POST' : 'GET', cache: 'no-store', signal: controller.signal,
        headers: { 'x-mingle-expected-account-id': viewerId },
      })
      if (!response.ok) throw new Error('bio_unavailable')
      const next = await response.json() as ProfileBioSnapshot
      if (revision !== generation.current) return
      const previous = snapshotRef.current
      if (previous?.versionId !== next.versionId || previous?.language !== next.language) setShowOriginal(false)
      lastReadAt.current = Date.now()
      if (!chosenLanguage) setReaderLanguage(next.language)
      setSnapshot(next)
      if (next.status === 'succeeded') setError(false)
    } catch { if (revision === generation.current && request) setError(true) }
    finally {
      clearTimeout(deadline)
      if (revision === generation.current) { inFlight.current = null; setRequesting(false) }
    }
  }, [userId, viewerId, locale, chosenLanguage])
  useEffect(() => {
    if (previousInitialBio.current === initialBio) return
    previousInitialBio.current = initialBio
    // A saved deletion must disappear now, even if an earlier poll is still pending.
    generation.current++; inFlight.current?.abort(); inFlight.current = null
    setSnapshot(null); setRequesting(false); setShowOriginal(false)
    void refresh()
  }, [initialBio, refresh])
  useEffect(() => {
    // Another person: start clean. Another flag for the same person: keep what
    // is on screen until the new language arrives, so the flags do not blink.
    if (shownUserId.current !== userId) { shownUserId.current = userId; setSnapshot(null); setChosenLanguage(null); setReaderLanguage(null) }
    setShowOriginal(false); setError(false)
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
  }, [refresh, userId])
  // Read in the viewer's own language by default (owner, 2026-11-25): for the
  // four languages every bio is translated into, a missing translation is asked
  // for once, without a tap. Other languages show one only when it exists.
  const autoRequestedFor = useRef<string | null>(null)
  useEffect(() => {
    if (editing || !snapshot || snapshot.detecting || snapshot.translation || snapshot.status !== 'idle') return
    if (!snapshot.original || sameBioLanguage(snapshot.sourceLanguage, snapshot.language) || !snapshot.sourceLanguage) return
    // A flag the reader tapped is always asked for.
    if (!chosenLanguage && !(BIO_DEFAULT_LANGUAGES as readonly string[]).includes(snapshot.language)) return
    const key = `${snapshot.versionId ?? 'legacy'}:${snapshot.language}`
    if (autoRequestedFor.current === key) return
    autoRequestedFor.current = key
    void refresh(true)
  }, [chosenLanguage, editing, refresh, snapshot])
  if (editing) {
    if (!snapshot?.draft?.original) return null
    return <p role="status" className="mt-2 text-xs text-slate-500">{snapshot.draft.status === 'running' ? copy.processing : snapshot.draft.status === 'failed' ? copy.partial : copy.ready}</p>
  }
  const original = snapshot?.original ?? initialBio ?? ''
  if (!original) return null
  const translated = snapshot?.translation
  const pending = requesting || snapshot?.status === 'running'
  // The same flags as a post (see @/lib/language-chips): the original, the reader's own language, their 관심 언어, English; the rest behind "more languages".
  const source = snapshot?.sourceLanguage ?? null
  const { main: chipLanguages, more: moreChipLanguages } = buildLanguageChips({
    sourceLanguage: source,
    comfortableLanguages: [readerLanguage, ...viewerLanguages.comfortable],
    interestLanguages: viewerLanguages.interest,
    translatedLanguages: snapshot?.translatedLanguages,
  })
  // What can be shown at once; any other flag is faded and translated on its tap.
  const readyChipLanguages = [...(snapshot?.translatedLanguages ?? []), ...(translated && snapshot ? [snapshot.language] : [])]
  const showChips = Boolean(snapshot && !snapshot.detecting && source)
  return <div className={`mt-1 min-w-0 ${dark ? 'text-white/85' : 'text-slate-700'}`}>
    <p dir="auto" className="whitespace-pre-wrap break-words text-[14px] leading-relaxed [overflow-wrap:anywhere]">{translated && !showOriginal && !requesting ? translated : original}</p>
    {showChips && <div className="mt-1" data-qa="profile-bio-language-chips">
      <PostLanguageChips
        sourceLanguage={snapshot?.sourceLanguage ?? null}
        languages={chipLanguages}
        selected={showOriginal || !translated ? ORIGINAL_CHIP : snapshot?.language ?? ORIGINAL_CHIP}
        loadingLanguage={pending ? snapshot?.language ?? chosenLanguage : null}
        locale={locale}
        originalLabel={copy.original}
        moreLanguages={moreChipLanguages}
        moreLabel={resolveMoreLanguagesCopy(locale)}
        readyLanguages={readyChipLanguages}
        searchLabel={resolveLanguageSearchCopy(locale)}
        onSelect={(chip) => {
          if (chip === ORIGINAL_CHIP) { setShowOriginal(true); return }
          setShowOriginal(false)
          if (chip !== snapshot?.language) setChosenLanguage(chip)
          // The reader's own language outside the four: translated on this tap.
          else if (!translated && !pending) void refresh(true)
        }}
      />
    </div>}
    {!snapshot && expectTranslate && viewerId ? <div className="min-h-11" aria-hidden="true" /> : null}
    {(error || snapshot?.status === 'failed') && <p role="status" className={`text-xs ${dark ? 'text-white/75' : 'text-slate-500'}`}>{copy.failed}</p>}
  </div>
}
