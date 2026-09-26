'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession, signIn } from 'next-auth/react'
import { ImageIcon, Trash2 } from 'lucide-react'
import { buildClientApiPath } from '@/lib/api-contract'
import { composeHref, feedHref } from '@/lib/feed-routes'
import { randomBackgroundKey } from '@/lib/post-backgrounds'
import { composeCopy } from '@/i18n/compose-copy'
import ComposeEditor from './compose-editor'
import { postPreviewText } from './draft-preview'
import {
  canPublish,
  draftImageField,
  draftImagePath,
  generateClientPostId,
  MAX_POST_LENGTH,
  type ComposeDraft,
} from './compose-state'
import { startPublish } from './publish-store'
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
        width: null,
        height: null,
      }
    : { kind: 'none' }
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

  const [drafts, setDrafts] = useState<ComposeDraft[]>([])
  const [mode, setMode] = useState<'entry' | 'editor'>(initialDraftId ? 'editor' : 'entry')
  const [draftId, setDraftId] = useState<string | null>(initialDraftId)
  const [text, setText] = useState('')
  const [backgroundKey, setBackgroundKey] = useState<string | null>(null)
  const [image, setImageState] = useState<PendingImage>({ kind: 'none' })
  const [saving, setSaving] = useState(false)
  const [loadError, setLoadError] = useState(false)

  const clientPostId = useRef(generateClientPostId())
  const objectUrl = useRef<string | null>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Latest image, read at save time so a debounced autosave (or an upload that
  // finishes later) never persists a stale image field.
  const imageRef = useRef<PendingImage>({ kind: 'none' })
  const latest = useRef({ text: '', backgroundKey: null as string | null })
  const uploadSeq = useRef(0)

  const setImage = useCallback((next: PendingImage) => {
    imageRef.current = next
    setImageState(next)
  }, [])

  useEffect(() => {
    latest.current = { text, backgroundKey }
  }, [text, backgroundKey])

  const isSignedIn = status === 'authenticated'

  // ── Load drafts + restore an initial draft ───────────────────────────────
  const loadDrafts = useCallback(async () => {
    if (!isSignedIn) return
    try {
      const res = await fetch(buildClientApiPath('/posts/drafts'), { cache: 'no-store' })
      if (!res.ok) throw new Error('drafts_unavailable')
      const body = (await res.json()) as { drafts: ComposeDraft[] }
      setDrafts(body.drafts)
      setLoadError(false)
    } catch {
      setLoadError(true)
    }
  }, [isSignedIn])

  useEffect(() => {
    void loadDrafts()
  }, [loadDrafts])

  useEffect(() => {
    if (!initialDraftId || !isSignedIn) return
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch(buildClientApiPath('/posts/drafts'), { cache: 'no-store' })
        if (!res.ok) throw new Error('drafts_unavailable')
        const body = (await res.json()) as { drafts: ComposeDraft[] }
        const found = body.drafts.find((d) => d.id === initialDraftId)
        if (cancelled || !found) return
        setText(found.sourceText ?? '')
        setBackgroundKey(found.backgroundKey)
        setImage(draftImage(found))
      } catch {
        setLoadError(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [initialDraftId, isSignedIn, setImage])

  useEffect(() => {
    return () => {
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current)
      if (saveTimer.current) clearTimeout(saveTimer.current)
    }
  }, [])

  // ── Autosave (debounced) ──────────────────────────────────────────────────
  const persistDraft = useCallback(
    async (payload: { sourceText: string; backgroundKey: string | null }) => {
      if (!isSignedIn) return
      const draftPayload = { ...payload, ...draftImageField(imageRef.current) }
      setSaving(true)
      try {
        if (draftId) {
          await fetch(buildClientApiPath('/posts/drafts'), {
            method: 'PATCH',
            cache: 'no-store',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ draftId, ...draftPayload }),
          })
        } else {
          const res = await fetch(buildClientApiPath('/posts/drafts'), {
            method: 'POST',
            cache: 'no-store',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(draftPayload),
          })
          if (res.ok) {
            const body = (await res.json()) as { draft: ComposeDraft }
            setDraftId(body.draft.id)
          }
        }
      } catch {
        // Keep local state; a later keystroke retries the autosave.
      } finally {
        setSaving(false)
      }
    },
    [draftId, isSignedIn],
  )

  const scheduleAutosave = useCallback(
    (nextText: string, nextBackground: string | null) => {
      if (!isSignedIn) return
      if (saveTimer.current) clearTimeout(saveTimer.current)
      // Nothing to save for a brand-new empty draft.
      if (!nextText.trim() && !nextBackground && imageRef.current.kind === 'none') return
      saveTimer.current = setTimeout(() => {
        void persistDraft({ sourceText: nextText, backgroundKey: nextBackground })
      }, AUTOSAVE_DEBOUNCE_MS)
    },
    [isSignedIn, persistDraft],
  )

  function beginNewPost() {
    clientPostId.current = generateClientPostId()
    setDraftId(null)
    setText('')
    setBackgroundKey(randomBackgroundKey())
    uploadSeq.current += 1
    setImage({ kind: 'none' })
    setMode('editor')
  }

  function openDraft(draft: ComposeDraft) {
    router.replace(composeHref(locale, { draftId: draft.id }))
    setDraftId(draft.id)
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
      if (!res.ok) return
      const body = (await res.json()) as { imageObjectKey: string }
      if (seq !== uploadSeq.current) return
      setImage({
        kind: 'server',
        objectKey: body.imageObjectKey,
        url,
        width: prepared.originalWidth,
        height: prepared.originalHeight,
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

  function handlePublish() {
    if (!publishable) return
    startPublish({
      clientPostId: clientPostId.current,
      sourceText: text.trim().length > 0 ? text : null,
      sourceLanguage: null,
      imageObjectKey: image.kind === 'server' ? image.objectKey : null,
      imageFile: image.kind === 'local' ? image.prepared.file : null,
      imageWidth: image.kind === 'local' ? image.prepared.originalWidth : null,
      imageHeight: image.kind === 'local' ? image.prepared.originalHeight : null,
      draftId,
    })
    // Return to the feed; the PublishStatusBanner shows progress there.
    router.push(feedHref(locale))
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
                    className="flex min-h-16 flex-1 flex-col gap-1 rounded-xl border border-border bg-card px-3 py-2 text-left hover:bg-secondary"
                  >
                    <span className="line-clamp-2 text-sm" dir="auto">
                      {postPreviewText(draft.sourceText) || copy.draftUntitled}
                    </span>
                    <span className="flex items-center gap-2 text-xs text-muted-foreground">
                      {draft.imageObjectKey ? (
                        <span className="inline-flex items-center gap-1">
                          <ImageIcon size={12} aria-hidden="true" />
                          {copy.draftPhoto}
                        </span>
                      ) : null}
                      <time dateTime={draft.updatedAt}>
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
            router.replace(composeHref(locale))
            void loadDrafts()
          }}
          className="inline-flex min-h-11 items-center rounded-lg px-2 py-2 text-sm text-muted-foreground hover:bg-secondary"
        >
          {copy.discard}
        </button>
        <span className="text-xs text-muted-foreground" role="status" aria-live="polite">
          {saving ? copy.savingDraft : draftId ? copy.draftSaved : ''}
        </span>
        <button
          type="button"
          onClick={handlePublish}
          disabled={!publishable}
          className="inline-flex min-h-11 items-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {copy.publish}
        </button>
      </header>

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
