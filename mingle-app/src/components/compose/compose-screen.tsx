'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession, signIn } from 'next-auth/react'
import { ImageIcon, Trash2 } from 'lucide-react'
import { buildClientApiPath } from '@/lib/api-contract'
import { isAccountRestrictedResponse } from '@/lib/account-restriction'
import { composeHref, feedHref } from '@/lib/feed-routes'
import { randomBackgroundKey, resolveBackgroundPreset } from '@/lib/post-backgrounds'
import { composeCopy } from '@/i18n/compose-copy'
import { moderationCopy } from '@/i18n/moderation-copy'
import ComposeEditor from './compose-editor'
import { composeGapCopy } from './compose-gap-copy'
import { postPreviewText } from './draft-preview'
import {
  appendDraftPage,
  canPublish,
  draftImageField,
  draftImagePath,
  generateClientPostId,
  MAX_POST_LENGTH,
  type ComposeDraft,
  type ComposeDraftListResponse,
} from './compose-state'
import { createDraftAutosaver, type DraftAutosaver, type DraftSaveState } from './draft-autosave'
import { isPublishRunning, startPublish } from './publish-store'
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
      <span className="inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-secondary text-muted-foreground">
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
      className="h-14 w-14 shrink-0 rounded-lg object-cover"
    />
  )
}

export default function ComposeScreen({
  locale,
  initialDraftId,
}: {
  locale: string
  initialDraftId: string | null
}) {
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
  const [mode, setMode] = useState<'entry' | 'editor'>(initialDraftId ? 'editor' : 'entry')
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
    router.replace(composeHref(locale, { draftId: draft.id }))
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
      router.push(feedHref(locale))
    } finally {
      publishing.current = false
    }
  }

  // ── Sign-in gate ──────────────────────────────────────────────────────────
  if (status !== 'loading' && !isSignedIn) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-sm text-muted-foreground">{copy.signInRequired}</p>
        <button
          type="button"
          onClick={() => void signIn(undefined, { callbackUrl: composeHref(locale, { draftId: initialDraftId }) })}
          className="inline-flex min-h-11 items-center rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground"
        >
          {copy.signInCta}
        </button>
      </div>
    )
  }

  if (mode === 'entry') {
    return (
      <div className="flex h-full flex-col">
        <header className="px-4 py-4">
          <h1 className="text-lg font-semibold">{copy.entryTitle}</h1>
        </header>
        <div className="px-4">
          <button
            type="button"
            onClick={beginNewPost}
            className="w-full rounded-2xl bg-primary px-4 py-3.5 text-left text-[15px] font-medium text-primary-foreground"
          >
            {copy.newPost}
          </button>
        </div>
        <div className="mt-5 min-h-0 flex-1 overflow-y-auto px-4 pb-6">
          <h2 className="mb-2 text-sm font-medium text-muted-foreground">{copy.draftsTitle}</h2>
          {loadError ? (
            <p className="text-sm text-muted-foreground">{copy.loadError}</p>
          ) : drafts.length === 0 ? (
            <p className="text-sm text-muted-foreground">{copy.draftsEmpty}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {drafts.map((draft) => (
                <li key={draft.id} className="flex items-stretch gap-2">
                  <button
                    type="button"
                    onClick={() => openDraft(draft)}
                    className="flex min-h-16 flex-1 items-center gap-3 rounded-xl border border-border bg-card px-3 py-2 text-left hover:bg-secondary"
                  >
                    {draft.imageObjectKey ? <DraftThumbnail draftId={draft.id} label={copy.draftPhoto} /> : null}
                    <span className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="line-clamp-2 text-sm" dir="auto">
                        {postPreviewText(draft.sourceText) || copy.draftUntitled}
                      </span>
                      <time dateTime={draft.updatedAt} className="text-xs text-muted-foreground">
                        {copy.savedAtPrefix} {new Date(draft.updatedAt).toLocaleString(locale)}
                      </time>
                    </span>
                  </button>
                  <button
                    type="button"
                    aria-label={copy.draftDelete}
                    onClick={() => void deleteDraft(draft.id)}
                    className="inline-flex min-h-16 w-11 items-center justify-center rounded-xl text-muted-foreground hover:bg-secondary hover:text-destructive"
                  >
                    <Trash2 size={18} aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {!loadError && draftsCursor ? (
            <button
              type="button"
              onClick={() => void loadMoreDrafts()}
              disabled={loadingMore}
              className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-secondary px-4 py-2 text-sm text-secondary-foreground disabled:opacity-60"
            >
              {loadingMore ? '…' : gapCopy.loadMore}
            </button>
          ) : null}
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between px-4 py-3">
        <button
          type="button"
          onClick={() => {
            setMode('entry')
            setNotice(null)
            router.replace(composeHref(locale))
            // Save the last keystrokes first so the list shows them.
            void saver().flush().then(loadDrafts)
          }}
          className="inline-flex min-h-11 items-center rounded-lg px-2 py-2 text-sm text-muted-foreground hover:bg-secondary"
        >
          {copy.discard}
        </button>
        <span className="text-xs text-muted-foreground" role="status" aria-live="polite">
          {saveState.saving
            ? copy.savingDraft
            : saveState.error === 'failed'
              ? gapCopy.draftSaveFailed
              : saveState.draftId && !saveState.error
                ? copy.draftSaved
                : ''}
        </span>
        <button
          type="button"
          onClick={() => void handlePublish()}
          disabled={!publishable}
          className="inline-flex min-h-11 items-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {copy.publish}
        </button>
      </header>

      {saveState.error === 'restricted' || imageRestricted ? (
        <p role="alert" className="mx-4 mb-2 rounded-lg bg-secondary px-3 py-2 text-xs text-foreground">
          {restrictedCopy}
        </p>
      ) : null}
      {notice ? (
        <p role="status" aria-live="polite" className="mx-4 mb-2 rounded-lg bg-secondary px-3 py-2 text-xs text-foreground">
          {notice}
        </p>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto">
        <ComposeEditor
          locale={locale}
          sourceText={text}
          onChangeText={handleTextChange}
          backgroundKey={backgroundKey}
          imagePreviewUrl={previewUrl}
          imageDimensions={dimensions}
          onPickImage={handlePickImage}
          author={author}
        />
        {!publishable && (text.length > MAX_POST_LENGTH || (!text.trim() && !hasImage)) ? (
          <p role="status" className="px-4 pb-4 text-xs text-muted-foreground">
            {copy.emptyBlocked}
          </p>
        ) : null}
      </div>
    </div>
  )
}
