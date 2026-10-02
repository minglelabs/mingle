'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession, signIn } from 'next-auth/react'
import { ChevronLeft, FileText, ImageIcon, Plus, Trash2 } from 'lucide-react'
import { buildClientApiPath } from '@/lib/api-contract'
import { isAccountRestrictedResponse } from '@/lib/account-restriction'
import { composeHref, feedHref } from '@/lib/feed-routes'
import { randomBackgroundKey, resolveBackgroundPreset } from '@/lib/post-backgrounds'
import { composeCopy } from '@/i18n/compose-copy'
import { moderationCopy } from '@/i18n/moderation-copy'
import {
  ComposeHeader,
  ComposeHeaderTextButton,
  ComposePrimaryButton,
  useKeyboardInset,
} from './compose-chrome'
import ComposeEditor from './compose-editor'
import { composeGapCopy } from './compose-gap-copy'
import { postPreviewText } from './draft-preview'
import {
  appendDraftPage,
  canPublish,
  draftImageField,
  draftImagePath,
  generateClientPostId,
  type ComposeDraft,
  type ComposeDraftListResponse,
} from './compose-state'
import { createDraftAutosaver, type DraftAutosaver, type DraftSaveState } from './draft-autosave'
import { isPublishRunning, startPublish } from './publish-store'
import { feedEvents, trackFeedEvent } from '@/lib/feed-analytics'
import type { PreparedImage } from './compose-image'

const AUTOSAVE_DEBOUNCE_MS = 1200

type PendingImage =
  | { kind: 'none' }
  | { kind: 'server'; objectKey: string; url: string; width: number | null; height: number | null }
  | { kind: 'local'; prepared: PreparedImage; url: string }

function draftImage(draft: ComposeDraft): PendingImage {
  return draft.imageObjectKey
    ? {
        kind: 'server',
        objectKey: draft.imageObjectKey,
        url: buildClientApiPath(draftImagePath(draft.id)),
        width: draft.imageWidth ?? null,
        height: draft.imageHeight ?? null,
      }
    : { kind: 'none' }
}

/** Draft list page URL (first page without a cursor). */
function draftsPath(cursor: string | null): `/${string}` {
  return cursor ? `/posts/drafts?cursor=${encodeURIComponent(cursor)}` : '/posts/drafts'
}

/** A draft's photo thumbnail; falls back to the photo icon if it cannot load. */
function DraftThumbnail({ draftId, label }: { draftId: string; label: string }) {
  const [failed, setFailed] = useState(false)
  if (failed) {
    return (
      <span className="inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-foreground/5 text-foreground/45">
        <ImageIcon size={18} aria-label={label} />
      </span>
    )
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={buildClientApiPath(draftImagePath(draftId))}
      alt={label}
      loading="lazy"
      onError={() => setFailed(true)}
      className="h-14 w-14 shrink-0 rounded-xl object-cover"
    />
  )
}

export default function ComposeScreen({
  locale,
  initialDraftId,
  onClose,
  onPublished,
}: {
  locale: string
  initialDraftId: string | null
  /** Overlay mode (ComposeOverlay): close the panel instead of navigating back, and keep the URL as is. */
  onClose?: () => void
  /** Overlay mode: what to do once a publish starts (default: go to the feed). */
  onPublished?: () => void
}) {
  const embedded = Boolean(onClose)
  const copy = composeCopy(locale)
  const router = useRouter()
  const { data: session, status } = useSession()
  const author = useMemo(
    () => ({
      name: session?.user?.name ?? null,
      handle: (session?.user as { handle?: string } | undefined)?.handle ?? '',
      imageUrl: session?.user?.image ?? null,
    }),
    [session],
  )

  const gapCopy = composeGapCopy(locale)
  const restrictedCopy = moderationCopy(locale).accountRestricted

  const [drafts, setDrafts] = useState<ComposeDraft[]>([])
  const [draftsCursor, setDraftsCursor] = useState<string | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  // The screen opens on the editor; the draft list is one tap away in the header.
  const [mode, setMode] = useState<'editor' | 'drafts'>('editor')
  const [text, setText] = useState('')
  const [backgroundKey, setBackgroundKey] = useState<string | null>(null)
  const [image, setImageState] = useState<PendingImage>({ kind: 'none' })
  const [saveState, setSaveState] = useState<DraftSaveState>({
    saving: false,
    draftId: initialDraftId,
    error: null,
  })
  const [imageRestricted, setImageRestricted] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [loadError, setLoadError] = useState(false)

  const clientPostId = useRef(generateClientPostId())
  const objectUrl = useRef<string | null>(null)
  // Latest image, read at save time so a debounced autosave (or an upload that
  // finishes later) never persists a stale image field.
  const imageRef = useRef<PendingImage>({ kind: 'none' })
  const latest = useRef({ text: '', backgroundKey: null as string | null })
  const uploadSeq = useRef(0)
  const publishing = useRef(false)

  // One serialized autosaver per post being edited (see draft-autosave).
  const saverRef = useRef<DraftAutosaver | null>(null)
  const newSaver = useCallback((draftId: string | null): DraftAutosaver => {
    const created: DraftAutosaver = createDraftAutosaver({
      initialDraftId: draftId,
      debounceMs: AUTOSAVE_DEBOUNCE_MS,
      // A replaced saver may still finish a save; only the current one reports.
      onState: (state) => {
        if (saverRef.current === created) setSaveState(state)
      },
    })
    return created
  }, [])
  if (saverRef.current === null) saverRef.current = newSaver(initialDraftId)
  const saver = () => saverRef.current as DraftAutosaver

  /** Replace the autosaver for another post, saving the previous one first. */
  function switchSaver(draftId: string | null) {
    void saver().flush()
    saverRef.current = newSaver(draftId)
    setSaveState({ saving: false, draftId, error: null })
  }

  const setImage = useCallback((next: PendingImage) => {
    imageRef.current = next
    setImageState(next)
  }, [])

  useEffect(() => {
    latest.current = { text, backgroundKey }
  }, [text, backgroundKey])

  const isSignedIn = status === 'authenticated'
  const keyboardInset = useKeyboardInset()

  // A new post gets its random background once, on the client (a draft
  // restores its own below).
  useEffect(() => {
    if (!initialDraftId) setBackgroundKey((current) => current ?? randomBackgroundKey())
  }, [initialDraftId])

  // Analytics: compose entry, once per screen mount for a signed-in author.
  const composeOpenedRef = useRef(false)
  useEffect(() => {
    if (!isSignedIn || composeOpenedRef.current) return
    composeOpenedRef.current = true
    trackFeedEvent(feedEvents.composeOpened(initialDraftId ? 'draft' : 'new'))
  }, [isSignedIn, initialDraftId])

  // ── Load drafts (paged) + restore an initial draft ───────────────────────
  const loadDrafts = useCallback(async () => {
    if (!isSignedIn) return
    try {
      const res = await fetch(buildClientApiPath(draftsPath(null)), { cache: 'no-store' })
      if (!res.ok) throw new Error('drafts_unavailable')
      const body = (await res.json()) as ComposeDraftListResponse
      setDrafts(body.drafts)
      setDraftsCursor(body.nextCursor ?? null)
      setLoadError(false)
    } catch {
      setLoadError(true)
    }
  }, [isSignedIn])

  async function loadMoreDrafts() {
    if (!draftsCursor || loadingMore) return
    setLoadingMore(true)
    try {
      const res = await fetch(buildClientApiPath(draftsPath(draftsCursor)), { cache: 'no-store' })
      if (!res.ok) throw new Error('drafts_unavailable')
      const body = (await res.json()) as ComposeDraftListResponse
      setDrafts((prev) => appendDraftPage(prev, body.drafts))
      setDraftsCursor(body.nextCursor ?? null)
    } catch {
      // Keep the cursor so "Load more" can be tapped again.
    } finally {
      setLoadingMore(false)
    }
  }

  useEffect(() => {
    void loadDrafts()
  }, [loadDrafts])

  useEffect(() => {
    if (!initialDraftId || !isSignedIn) return
    let cancelled = false
    void (async () => {
      try {
        // Walk the pages until the draft turns up (bounded).
        let cursor: string | null = null
        for (let page = 0; page < 20; page++) {
          const res = await fetch(buildClientApiPath(draftsPath(cursor)), { cache: 'no-store' })
          if (!res.ok) throw new Error('drafts_unavailable')
          const body = (await res.json()) as ComposeDraftListResponse
          const found = body.drafts.find((d) => d.id === initialDraftId)
          if (cancelled) return
          if (found) {
            setText(found.sourceText ?? '')
            setBackgroundKey(found.backgroundKey ?? randomBackgroundKey())
            setImage(draftImage(found))
            return
          }
          cursor = body.nextCursor ?? null
          if (!cursor) break
        }
        // Draft gone (published / deleted elsewhere): start from a fresh background.
        if (!cancelled) setBackgroundKey((current) => current ?? randomBackgroundKey())
      } catch {
        setLoadError(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [initialDraftId, isSignedIn, setImage])

  // Leaving the screen or the app going to the background saves the last
  // keystrokes right away instead of dropping the pending debounce.
  useEffect(() => {
    const flush = () => void saverRef.current?.flush()
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush()
    }
    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('pagehide', flush)
      document.removeEventListener('visibilitychange', onVisibility)
      flush()
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current)
    }
  }, [])

  // ── Autosave (debounced, serialized, flushable) ──────────────────────────
  const scheduleAutosave = useCallback(
    (nextText: string, nextBackground: string | null) => {
      if (!isSignedIn) return
      saverRef.current?.schedule({
        sourceText: nextText,
        backgroundKey: nextBackground,
        image: draftImageField(imageRef.current),
      })
    },
    [isSignedIn],
  )

  function beginNewPost() {
    if (!embedded) router.replace(composeHref(locale))
    clientPostId.current = generateClientPostId()
    switchSaver(null)
    setNotice(null)
    setText('')
    setBackgroundKey(randomBackgroundKey())
    uploadSeq.current += 1
    setImage({ kind: 'none' })
    setMode('editor')
  }

  function openDraft(draft: ComposeDraft) {
    if (!embedded) router.replace(composeHref(locale, { draftId: draft.id }))
    switchSaver(draft.id)
    setNotice(null)
    setText(draft.sourceText ?? '')
    setBackgroundKey(draft.backgroundKey ?? randomBackgroundKey())
    uploadSeq.current += 1
    setImage(draftImage(draft))
    clientPostId.current = generateClientPostId()
    setMode('editor')
  }

  async function deleteDraft(id: string) {
    setDrafts((prev) => prev.filter((d) => d.id !== id))
    try {
      await fetch(buildClientApiPath(`/posts/drafts?draftId=${encodeURIComponent(id)}`), {
        method: 'DELETE',
        cache: 'no-store',
      })
    } catch {
      void loadDrafts()
    }
  }

  function handleTextChange(next: string) {
    setText(next)
    scheduleAutosave(next, backgroundKey)
  }

  function handlePickImage(prepared: PreparedImage | null) {
    if (objectUrl.current) {
      URL.revokeObjectURL(objectUrl.current)
      objectUrl.current = null
    }
    const seq = ++uploadSeq.current
    if (!prepared) {
      setImage({ kind: 'none' })
      scheduleAutosave(latest.current.text, latest.current.backgroundKey)
      return
    }
    const url = URL.createObjectURL(prepared.file)
    objectUrl.current = url
    setImage({ kind: 'local', prepared, url })
    if (isSignedIn) void uploadPickedImage(prepared, url, seq)
  }

  // Upload the picked photo right away so the draft can keep it by its
  // server-issued key. On failure it stays local; publish uploads it then.
  async function uploadPickedImage(prepared: PreparedImage, url: string, seq: number) {
    try {
      const form = new FormData()
      form.append('file', prepared.file)
      const res = await fetch(buildClientApiPath('/posts/images'), {
        method: 'POST',
        cache: 'no-store',
        body: form,
      })
      if (!res.ok) {
        // A restricted account keeps the photo on screen but is told why.
        if (await isAccountRestrictedResponse(res)) setImageRestricted(true)
        return
      }
      const body = (await res.json()) as { imageObjectKey: string; width?: number; height?: number }
      if (seq !== uploadSeq.current) return
      setImage({
        kind: 'server',
        objectKey: body.imageObjectKey,
        url,
        // The processed size the server stored (what the card will show).
        width: typeof body.width === 'number' ? body.width : prepared.originalWidth,
        height: typeof body.height === 'number' ? body.height : prepared.originalHeight,
      })
      scheduleAutosave(latest.current.text, latest.current.backgroundKey)
    } catch {
      // Keep the local image; the publish pipeline uploads it.
    }
  }

  const previewUrl = image.kind === 'none' ? null : image.url
  const dimensions =
    image.kind === 'local'
      ? { width: image.prepared.originalWidth, height: image.prepared.originalHeight }
      : image.kind === 'server'
        ? { width: image.width, height: image.height }
        : null

  const hasImage = image.kind !== 'none'
  const publishable = canPublish({ sourceText: text, hasImage })

  async function handlePublish() {
    if (!publishable || publishing.current) return
    publishing.current = true
    try {
      if (isPublishRunning()) {
        // One post uploads at a time. Never drop this one silently: keep it on
        // screen, save it as a draft now, and tell the author to post it after.
        scheduleAutosave(text, backgroundKey)
        await saver().flush()
        setNotice(saver().getDraftId() ? gapCopy.publishBusy : `${copy.bannerPublishing} ${gapCopy.draftSaveFailed}`)
        return
      }

      // Settle the draft id first: a first autosave POST still in flight would
      // otherwise leave its draft behind after the post succeeds.
      const draftId = await saver().drain()
      const accepted = startPublish({
        clientPostId: clientPostId.current,
        sourceText: text.trim().length > 0 ? text : null,
        sourceLanguage: null,
        // Exactly the preset the preview drew (a missing key draws the first one).
        backgroundKey: resolveBackgroundPreset(backgroundKey).key,
        imageObjectKey: image.kind === 'server' ? image.objectKey : null,
        imageFile: image.kind === 'local' ? image.prepared.file : null,
        imageWidth: image.kind === 'server' ? image.width : image.kind === 'local' ? image.prepared.originalWidth : null,
        imageHeight: image.kind === 'server' ? image.height : image.kind === 'local' ? image.prepared.originalHeight : null,
        draftId,
      })
      if (!accepted) {
        // Another publish started in between: same handling as above.
        scheduleAutosave(text, backgroundKey)
        await saver().flush()
        setNotice(gapCopy.publishBusy)
        return
      }
      // The post now belongs to the publish job; no more draft writes for it.
      saver().close()
      // Return to the feed; the PublishStatusBanner shows progress there.
      if (onPublished) onPublished()
      else router.push(feedHref(locale))
    } finally {
      publishing.current = false
    }
  }

  /** Leave compose; what was typed is already (or is now) saved as a draft. */
  function leave() {
    void saver().flush()
    if (onClose) onClose()
    else if (typeof window !== 'undefined' && window.history.length > 1) router.back()
    else router.replace(feedHref(locale))
  }

  function openDrafts() {
    setNotice(null)
    setMode('drafts')
    // Save the last keystrokes first so the list shows them.
    void saver().flush().then(loadDrafts)
  }

  // ── Sign-in gate ──────────────────────────────────────────────────────────
  if (status !== 'loading' && !isSignedIn) {
    return (
      <div className="flex h-full flex-col bg-card text-card-foreground">
        <ComposeHeader
          leading={<ComposeHeaderTextButton onClick={leave}>{copy.discard}</ComposeHeaderTextButton>}
          title={copy.entryTitle}
        />
        <div className="flex flex-1 flex-col items-center justify-center gap-5 px-8 text-center">
          <p className="text-[15px] text-foreground/60">{copy.signInRequired}</p>
          <ComposePrimaryButton
            onClick={() => void signIn(undefined, { callbackUrl: composeHref(locale, { draftId: initialDraftId }) })}
          >
            {copy.signInCta}
          </ComposePrimaryButton>
        </div>
      </div>
    )
  }

  if (mode === 'drafts') {
    return (
      <div className="flex h-full flex-col bg-card text-card-foreground">
        <ComposeHeader
          leading={
            <button
              type="button"
              onClick={() => setMode('editor')}
              aria-label={copy.backToEdit}
              className="inline-flex h-11 w-11 items-center justify-center rounded-full transition active:bg-foreground/5"
            >
              <ChevronLeft size={26} strokeWidth={2} aria-hidden="true" />
            </button>
          }
          title={copy.draftsTitle}
          trailing={
            <button
              type="button"
              onClick={beginNewPost}
              aria-label={copy.newPost}
              className="inline-flex h-11 w-11 items-center justify-center rounded-full transition active:bg-foreground/5"
            >
              <Plus size={24} strokeWidth={2} aria-hidden="true" />
            </button>
          }
        />
        <div
          className="min-h-0 flex-1 overflow-y-auto"
          style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 16px)' }}
        >
          {loadError ? (
            <p className="px-8 py-16 text-center text-[15px] text-foreground/55">{copy.loadError}</p>
          ) : drafts.length === 0 ? (
            <div className="flex flex-col items-center gap-3 px-8 py-20 text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-foreground/5 text-foreground/40">
                <FileText size={26} strokeWidth={1.8} aria-hidden="true" />
              </span>
              <p className="text-[15px] text-foreground/55">{copy.draftsEmpty}</p>
            </div>
          ) : (
            <ul>
              {drafts.map((draft) => (
                <li key={draft.id} className="flex items-stretch border-b border-foreground/10">
                  <button
                    type="button"
                    onClick={() => openDraft(draft)}
                    className="flex min-h-[4.5rem] min-w-0 flex-1 items-center gap-3 py-3 pl-4 pr-1 text-left transition active:bg-foreground/5"
                  >
                    {draft.imageObjectKey ? <DraftThumbnail draftId={draft.id} label={copy.draftPhoto} /> : null}
                    <span className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="line-clamp-2 text-[15px] leading-snug" dir="auto">
                        {postPreviewText(draft.sourceText) || copy.draftUntitled}
                      </span>
                      <time dateTime={draft.updatedAt} className="text-[13px] text-foreground/45">
                        {copy.savedAtPrefix} {new Date(draft.updatedAt).toLocaleString(locale)}
                      </time>
                    </span>
                  </button>
                  <button
                    type="button"
                    aria-label={copy.draftDelete}
                    onClick={() => void deleteDraft(draft.id)}
                    className="inline-flex w-14 shrink-0 items-center justify-center text-foreground/40 transition active:bg-foreground/5 active:text-destructive"
                  >
                    <Trash2 size={20} strokeWidth={1.9} aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {!loadError && draftsCursor ? (
            <div className="px-4 pt-4">
              <button
                type="button"
                onClick={() => void loadMoreDrafts()}
                disabled={loadingMore}
                className="inline-flex min-h-11 w-full items-center justify-center rounded-full bg-foreground/5 px-4 text-[15px] font-medium disabled:opacity-60"
              >
                {loadingMore ? '…' : gapCopy.loadMore}
              </button>
            </div>
          ) : null}
        </div>
      </div>
    )
  }

  const saveStatus = saveState.saving
    ? copy.savingDraft
    : saveState.error === 'failed'
      ? gapCopy.draftSaveFailed
      : saveState.draftId && !saveState.error
        ? copy.draftSaved
        : ''

  return (
    <div
      className="flex h-full flex-col bg-card text-card-foreground"
      // Keep the bottom bar above the on-screen keyboard.
      style={{ paddingBottom: keyboardInset }}
    >
      <ComposeHeader
        leading={<ComposeHeaderTextButton onClick={leave}>{copy.discard}</ComposeHeaderTextButton>}
        title={copy.entryTitle}
        trailing={
          <button
            type="button"
            onClick={openDrafts}
            aria-label={drafts.length > 0 ? `${copy.draftsTitle}, ${drafts.length}` : copy.draftsTitle}
            className="relative inline-flex h-11 w-11 items-center justify-center rounded-full transition active:bg-foreground/5"
          >
            <FileText size={23} strokeWidth={1.9} aria-hidden="true" />
            {drafts.length > 0 ? (
              <span
                aria-hidden="true"
                className="absolute right-0.5 top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-primary px-1 text-[11px] font-bold leading-none text-primary-foreground"
              >
                {drafts.length > 9 ? '9+' : drafts.length}
              </span>
            ) : null}
          </button>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        {saveState.error === 'restricted' || imageRestricted ? (
          <p role="alert" className="mx-4 mt-3 rounded-2xl bg-destructive/10 px-4 py-3 text-[14px] leading-snug text-destructive">
            {restrictedCopy}
          </p>
        ) : null}
        {notice ? (
          <p role="status" aria-live="polite" className="mx-4 mt-3 rounded-2xl bg-secondary px-4 py-3 text-[14px] leading-snug text-secondary-foreground">
            {notice}
          </p>
        ) : null}

        <ComposeEditor
          locale={locale}
          sourceText={text}
          onChangeText={handleTextChange}
          backgroundKey={backgroundKey}
          imagePreviewUrl={previewUrl}
          imageDimensions={dimensions}
          onPickImage={handlePickImage}
          author={author}
          autoFocus={!initialDraftId}
        />
      </div>

      <div
        className="flex shrink-0 items-center justify-between gap-3 border-t border-foreground/10 px-4 pt-2.5"
        style={{
          paddingBottom: keyboardInset > 0 ? '10px' : 'max(env(safe-area-inset-bottom, 0px), 10px)',
        }}
      >
        <span className="min-w-0 flex-1 truncate text-[13px] text-foreground/45" role="status" aria-live="polite">
          {saveStatus}
        </span>
        <ComposePrimaryButton onClick={() => void handlePublish()} disabled={!publishable}>
          {copy.publish}
        </ComposePrimaryButton>
      </div>
    </div>
  )
}
