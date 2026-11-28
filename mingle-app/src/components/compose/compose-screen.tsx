'use client'

import ComposeCallCard, { useOwnCallFacts } from '@/components/compose/compose-call-card'
import PostCallInvite from '@/components/feed/post-call-invite'
import PostCategoryStrip from '@/components/feed/post-category-strip'
import ComposeCategoryPicker, { ComposeCategoryStep } from '@/components/compose/compose-category-picker'
import { POST_CALL_LISTEN_EVENT } from '@/lib/post-call'
import { EMPTY_POST_INTRO_EXTRAS, POST_HOUR_MS, postIntroProblem, sanitizePostCallTitle, type PostCategory, type PostHobby, type PostIntroExtras } from '@/lib/post-category'
import { requestProfileBasics } from '@/lib/profile-basics'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession, signIn } from 'next-auth/react'
import { ChevronLeft, FileText, ImageIcon, Plus, Trash2 } from 'lucide-react'
import { buildClientApiPath } from '@/lib/api-contract'
import { isAccountRestrictedResponse } from '@/lib/account-restriction'
import { composeHref } from '@/lib/feed-routes'
import { homeFeedRootHref } from '@/lib/home-feed-href'
import { randomBackgroundKey, resolveBackgroundPreset } from '@/lib/post-backgrounds'
import { composeCopy } from '@/i18n/compose-copy'
import { moderationCopy } from '@/i18n/moderation-copy'
import {
  ComposeHeader,
  ComposeHeaderTextButton,
  ComposePrimaryButton,
  useKeyboardCover,
} from './compose-chrome'
import ComposeEditor, { MAX_POST_PHOTOS } from './compose-editor'
import { composeGapCopy } from './compose-gap-copy'
import { postPreviewText } from './draft-preview'
import {
  appendDraftPage,
  canPublish,
  MAX_POST_LENGTH,
  draftImageField,
  draftImagePath,
  generateClientPostId,
  type ComposeDraft,
  type ComposeDraftListResponse,
} from './compose-state'
import { createDraftAutosaver, type DraftAutosaver, type DraftSaveState } from './draft-autosave'
import { isPublishRunning, startPublish } from './publish-store'
import { feedEvents, trackFeedEvent } from '@/lib/feed-analytics'
import { prepareComposeImage, type PreparedImage } from './compose-image'
import { isNativePhotoGalleryAvailable, openNativePhotoGallery } from '@/lib/native-photo-gallery'
import { resolveComposePhotoCopy } from '@/i18n/compose-photo-copy'
import { resolvePostCategoryCopy } from '@/i18n/post-category-copy'
import { resolveComposeCategoryStepCopy } from '@/i18n/compose-category-step-copy'

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
  backHandlerRef,
}: {
  locale: string
  initialDraftId: string | null
  /** Overlay mode (ComposeOverlay): close the panel instead of navigating back, and keep the URL as is. */
  onClose?: () => void
  /** Overlay mode: what to do once a publish starts (default: go to the feed). */
  onPublished?: () => void
  /**
   * Overlay mode: the panel asks this before closing (back / edge swipe).
   * Returns true when it closed an inner layer (preview, drafts) instead.
   */
  backHandlerRef?: { current: (() => boolean) | null }
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
  const [previewOpen, setPreviewOpen] = useState(false)
  const [text, setText] = useState('')
  const [backgroundKey, setBackgroundKey] = useState<string | null>(null)
  const [image, setImageState] = useState<PendingImage>({ kind: 'none' })
  // The 2nd to 10th photo. A draft keeps only the first photo; these live with the open composer.
  const [extras, setExtras] = useState<Array<{ id: string; image: Exclude<PendingImage, { kind: 'none' }> }>>([])
  const extraSeq = useRef(0)
  const [saveState, setSaveState] = useState<DraftSaveState>({
    saving: false,
    draftId: initialDraftId,
    error: null,
  })
  const [imageRestricted, setImageRestricted] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [loadError, setLoadError] = useState(false)

  const clientPostId = useRef(generateClientPostId())
  // The post's kind (see @/lib/post-category); a new post starts as an ordinary one.
  const [category, setCategory] = useState<PostCategory>('free')
  // A new post asks for its kind on the write screen (after the app's gallery);
  // the write form unfolds under it once one is tapped (owner, 2026-11-27).
  // A draft goes straight to writing.
  const [categoryChosen, setCategoryChosen] = useState(Boolean(initialDraftId))
  const [hobbies, setHobbies] = useState<PostHobby[]>([])
  const [introExtras, setIntroExtras] = useState<PostIntroExtras>(EMPTY_POST_INTRO_EXTRAS)
  // A voice talk post's own title; empty: the default invitation.
  const [callTitle, setCallTitle] = useState('')
  const callFacts = useOwnCallFacts(category === 'call')
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

  // One layer per back: preview → editor, drafts → editor, then the panel.
  useEffect(() => {
    if (!backHandlerRef) return
    backHandlerRef.current = () => {
      if (previewOpen) {
        setPreviewOpen(false)
        return true
      }
      // Nothing written yet: back to the choice of kind.
      if (mode === 'editor' && categoryChosen && !initialDraftId && !latest.current.text && imageRef.current.kind === 'none') {
        setCategoryChosen(false)
        return true
      }
      if (mode === 'drafts') {
        setMode('editor')
        return true
      }
      return false
    }
    return () => {
      backHandlerRef.current = null
    }
  }, [backHandlerRef, previewOpen, mode, categoryChosen, initialDraftId])
  const editorBoxRef = useRef<HTMLDivElement | null>(null)
  const keyboardInset = useKeyboardCover(editorBoxRef)

  // A new post gets its random background once, on the client (a draft
  // restores its own below).
  useEffect(() => {
    if (!initialDraftId) setBackgroundKey((current) => current ?? randomBackgroundKey())
  }, [initialDraftId])

  // A new post opens on the app's gallery, Instagram-style (owner, 2026-11-27);
  // its "next" or "text only" comes back to the choice of kind. Browsers and
  // apps without it start on the choice of kind.
  const openGalleryFirstRef = useRef<() => void>(() => undefined)
  useEffect(() => {
    openGalleryFirstRef.current = () => { requestNativePhotos({ first: true }) }
  })
  const galleryOpenedFirstRef = useRef(false)
  useEffect(() => {
    if (!isSignedIn || initialDraftId || galleryOpenedFirstRef.current || !isNativePhotoGalleryAvailable()) return
    galleryOpenedFirstRef.current = true
    openGalleryFirstRef.current()
  }, [initialDraftId, isSignedIn])

  function pickCategory(next: PostCategory) {
    setCategory(next)
    setCategoryChosen(true)
    // Then the writing, and only the writing: the caption box, focused. Not for a
    // self-introduction (its choices come first) or a voice talk post (its card
    // comes first): the keyboard would hide them (owner, 2026-11-27).
    if (next === 'intro' || next === 'call') return
    window.setTimeout(() => document.getElementById('compose-body')?.focus({ preventScroll: true }), 80)
  }

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
    clearExtras()
    setCategory('free')
    setCategoryChosen(false)
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
    clearExtras()
    clientPostId.current = generateClientPostId()
    setCategoryChosen(true)
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

  function clearExtras() {
    setExtras((prev) => {
      for (const extra of prev) URL.revokeObjectURL(extra.image.url)
      return []
    })
  }

  /** Photos picked together: the first fills the post's first photo if it is empty, the rest follow. */
  function handleAddPhotos(prepared: PreparedImage[]) {
    let rest = prepared
    if (image.kind === 'none' && rest.length) {
      handlePickImage(rest[0])
      rest = rest.slice(1)
    }
    const added = rest.slice(0, Math.max(0, MAX_POST_PHOTOS - 1 - extras.length)).map((photo) => ({
      id: `extra-${++extraSeq.current}`,
      image: { kind: 'local' as const, prepared: photo, url: URL.createObjectURL(photo.file) },
    }))
    if (!added.length) return
    setExtras((prev) => [...prev, ...added])
    if (isSignedIn) for (const extra of added) void uploadExtra(extra.id, extra.image.prepared, extra.image.url)
  }

  // Each extra photo uploads right away too; on failure it stays local and publish uploads it.
  async function uploadExtra(id: string, prepared: PreparedImage, url: string) {
    try {
      const form = new FormData()
      form.append('file', prepared.file)
      const res = await fetch(buildClientApiPath('/posts/images'), { method: 'POST', cache: 'no-store', body: form })
      if (!res.ok) {
        if (await isAccountRestrictedResponse(res)) setImageRestricted(true)
        return
      }
      const body = (await res.json()) as { imageObjectKey: string; width?: number; height?: number }
      setExtras((prev) => prev.map((extra) => extra.id !== id ? extra : {
        id,
        image: {
          kind: 'server',
          objectKey: body.imageObjectKey,
          url,
          width: typeof body.width === 'number' ? body.width : prepared.originalWidth,
          height: typeof body.height === 'number' ? body.height : prepared.originalHeight,
        },
      }))
    } catch {
      // Keep the local photo; the publish pipeline uploads it.
    }
  }

  // The app's own gallery, when the app has one (see @/lib/native-photo-gallery);
  // false lets the editor open the system photo picker instead. `first`: the
  // gallery opened by itself with the write screen (owner, 2026-11-27, as
  // Instagram): closing it leaves the post, "text only" goes on to writing.
  function requestNativePhotos(options: { first?: boolean } = {}): boolean {
    if (!isNativePhotoGalleryAvailable()) return false
    const room = MAX_POST_PHOTOS - photos.length
    if (room <= 0) return true
    const galleryCopy = resolveComposePhotoCopy(locale)
    void openNativePhotoGallery(room, {
      title: galleryCopy.pickTitle,
      next: galleryCopy.galleryNext,
      close: galleryCopy.galleryClose,
      limited: galleryCopy.galleryLimited,
      denied: galleryCopy.galleryDenied,
      openSettings: galleryCopy.galleryOpenSettings,
      skip: galleryCopy.galleryTextOnly,
      recent: galleryCopy.galleryRecent,
      albums: galleryCopy.galleryAlbums,
    }).then(async ({ outcome, files }) => {
      if (outcome === 'cancelled' && options.first) {
        leave()
        return
      }
      // "Text only": on to the choice of kind (or the writing, when the kind is picked).
      if (outcome === 'skipped') return
      if (!files) return
      const prepared: PreparedImage[] = []
      for (const file of files.slice(0, room)) {
        try {
          prepared.push(await prepareComposeImage(file))
        } catch {
          // One unreadable photo does not stop the rest.
        }
      }
      if (prepared.length) handleAddPhotos(prepared)
    })
    return true
  }

  function handleRemovePhoto(index: number) {
    if (index > 0) {
      setExtras((prev) => {
        const removed = prev[index - 1]
        if (removed) URL.revokeObjectURL(removed.image.url)
        return prev.filter((_, i) => i !== index - 1)
      })
      return
    }
    // Removing the first photo moves the next one up.
    const [next, ...others] = extras
    if (!next) {
      handlePickImage(null)
      return
    }
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current)
    objectUrl.current = next.image.url
    uploadSeq.current += 1
    setImage(next.image)
    setExtras(others)
    scheduleAutosave(latest.current.text, latest.current.backgroundKey)
  }

  const previewUrl = image.kind === 'none' ? null : image.url
  const dimensions =
    image.kind === 'local'
      ? { width: image.prepared.originalWidth, height: image.prepared.originalHeight }
      : image.kind === 'server'
        ? { width: image.width, height: image.height }
        : null

  const hasImage = image.kind !== 'none'
  const photos = [
    ...(image.kind === 'none' ? [] : [{ id: 'first', image }]),
    ...extras,
  ].map(({ id, image: photo }) => ({
    id,
    url: photo.url,
    width: photo.kind === 'local' ? photo.prepared.originalWidth : photo.width,
    height: photo.kind === 'local' ? photo.prepared.originalHeight : photo.height,
  }))
  // A self-introduction needs a hobby and some text before it can be posted.
  const introProblem = category === 'intro' ? postIntroProblem({ text, hobbies }) : null
  // A voice talk post may go up with its title alone (owner, 2026-11-28): no text or photo needed.
  const hasContent = canPublish({ sourceText: text, hasImage }) || (category === 'call' && text.length <= MAX_POST_LENGTH)
  const publishable = hasContent && !introProblem
  const photoCopy = resolveComposePhotoCopy(locale)
  const categoryCopy = resolvePostCategoryCopy(locale)
  const stepCopy = resolveComposeCategoryStepCopy(locale)
  // Before the kind is confirmed, the same bottom button posts at once when there
  // is something to post (an ordinary post by default: photos, then one tap), and
  // otherwise goes on to the writing (owner, 2026-11-27).
  const continueFirst = !categoryChosen && !publishable
  const blockedReason = publishable || continueFirst
    ? null
    : text.length > MAX_POST_LENGTH
      ? photoCopy.textTooLong
      : !hasContent
        ? photoCopy.needContent
        : introProblem === 'hobbies'
          ? categoryCopy.needHobby
          : introProblem === 'text'
            ? categoryCopy.needText
            : null

  async function handlePublish() {
    if (!publishable || publishing.current) return
    publishing.current = true
    try {
      // Gender and birth date are asked before the first post; closing the
      // question leaves the post on screen, unpublished.
      if (!(await requestProfileBasics())) return
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
        extraImages: extras.map(({ image: photo }) => photo.kind === 'server'
          ? { objectKey: photo.objectKey, file: null, width: photo.width, height: photo.height }
          : { objectKey: null, file: photo.prepared.file, width: photo.prepared.originalWidth, height: photo.prepared.originalHeight }),
        draftId,
        category,
        hobbies: category === 'intro' ? hobbies : undefined,
        introExtras: category === 'intro' ? introExtras : undefined,
        callTitle: category === 'call' ? sanitizePostCallTitle(callTitle) : undefined,
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
      // A call post: the app starts listening for calls at once (IncomingPostCallGate).
      if (category === 'call') window.dispatchEvent(new Event(POST_CALL_LISTEN_EVENT))
      // Return to the feed; the PublishStatusBanner shows progress there.
      if (onPublished) onPublished()
      // Replace: back from the feed must not reopen the composer.
      else router.replace(homeFeedRootHref(locale))
    } finally {
      publishing.current = false
    }
  }

  /** Leave compose; what was typed is already (or is now) saved as a draft. */
  function leave() {
    void saver().flush()
    if (onClose) onClose()
    else if (typeof window !== 'undefined' && window.history.length > 1) router.back()
    else router.replace(homeFeedRootHref(locale))
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
      ref={editorBoxRef}
      // Keep the content, the bottom bar included, above the on-screen keyboard.
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

        {initialDraftId ? null : (
          <ComposeCategoryStep
            locale={locale}
            selected={category}
            open={!categoryChosen}
            onPick={pickCategory}
            onReopen={() => setCategoryChosen(false)}
          />
        )}
        {!categoryChosen && photos.length > 0 ? (
          // The photos picked in the gallery, so the button below plainly posts them.
          <div className="no-scrollbar flex gap-2 overflow-x-auto px-4 pb-2 pt-1" data-qa="compose-step-photos">
            {photos.map((photo) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={photo.id} src={photo.url} alt="" className="h-16 w-16 shrink-0 rounded-xl object-cover" draggable={false} />
            ))}
          </div>
        ) : null}
        {categoryChosen ? (
        <>
        {/* The write form unfolds under the kind picked: the caption, then the photos (each removable, more addable). */}
        <div className="motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-4 motion-safe:duration-300">
        {/* A voice talk post: who takes the calls and the invitation, before the text. */}
        {category === 'call' ? <ComposeCallCard locale={locale} headline={stepCopy.callHeadline} title={callTitle} onTitleChange={setCallTitle} author={author} facts={callFacts} /> : null}
        {/* A self-introduction: its choices (hobbies and more) first, the text after. */}
        {/* What goes with the kind picked (a self-introduction's hobbies and more). */}
        <ComposeCategoryPicker
          locale={locale}
          category={category}
          onCategoryChange={setCategory}
          hobbies={hobbies}
          introExtras={introExtras}
          onIntroExtrasChange={setIntroExtras}
          onHobbiesChange={setHobbies}
          problem={introProblem}
          compact
        />
        <ComposeEditor
          locale={locale}
          sourceText={text}
          onChangeText={handleTextChange}
          backgroundKey={backgroundKey}
          imagePreviewUrl={previewUrl}
          imageDimensions={dimensions}
          onPickImage={handlePickImage}
          photos={photos}
          onAddPhotos={handleAddPhotos}
          onRemovePhoto={handleRemovePhoto}
          author={author}
          autoFocus={false}
          // The preview shows the kind as viewers will: a call post's title and its call button.
          previewControl={category === 'call' || category === 'hour'
            ? <PostCategoryStrip category={category} expiresAt={new Date(Date.now() + POST_HOUR_MS - 1000).toISOString()} locale={locale} withButton={false} />
            : undefined}
          previewHeader={category === 'call' ? (
            <PostCallInvite
              postId=""
              locale={locale}
              title={sanitizePostCallTitle(callTitle)}
              author={{
                ...author,
                nationality: callFacts?.nationality ?? null,
                languages: callFacts ? { primary: callFacts.primary, interest: callFacts.interest } : undefined,
              }}
              demo
            />
          ) : undefined}
          toolsNote={category === 'hour' ? <HourDeletesAt locale={locale} template={stepCopy.hourDeletesAt} /> : undefined}
          onRequestPhotos={requestNativePhotos}
          previewOpen={previewOpen}
          onPreviewOpenChange={setPreviewOpen}
        />

        </div>
        </>
        ) : null}
      </div>

      {/* Always here, in the easiest place to tap: above the keyboard, else at the bottom. */}
      <div
        className="shrink-0 border-t border-foreground/10 px-4 pt-2"
        style={{
          paddingBottom: keyboardInset > 0 ? '10px' : 'max(env(safe-area-inset-bottom, 0px), 10px)',
        }}
      >
        {/* Why the button is not ready yet, else how the draft is doing. */}
        <p
          className={`mb-2 min-h-[18px] truncate text-center text-[13px] ${blockedReason ? 'font-semibold text-amber-700' : 'text-foreground/45'}`}
          role="status"
          aria-live="polite"
          data-qa="compose-publish-reason"
        >
          {blockedReason ?? saveStatus}
        </p>
        <button
          type="button"
          data-qa="compose-publish"
          onClick={() => (continueFirst ? pickCategory(category) : void handlePublish())}
          disabled={!publishable && !continueFirst}
          className="flex h-12 w-full items-center justify-center rounded-2xl bg-primary text-[16px] font-bold text-primary-foreground transition active:scale-[0.99] disabled:bg-foreground/10 disabled:text-foreground/35"
        >
          {continueFirst ? stepCopy.continue : copy.publish}
        </button>
      </div>
    </div>
  )
}

/**
 * An hour post being written: when it would be deleted if posted this second
 * (owner, 2026-11-27), ticking every second, e.g. "…13:14:29에 삭제돼요".
 */
function HourDeletesAt({ locale, template }: { locale: string; template: string }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])
  const time = new Date(now + POST_HOUR_MS).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
  return <span data-qa="compose-hour-deletes-at" className="tabular-nums">{template.replace('{time}', time)}</span>
}
