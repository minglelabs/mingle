'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { buildClientApiPath } from '@/lib/api-contract'
import { postEndpoint, feedHref } from '@/lib/feed-routes'
import type { FeedPostResponse } from '@/lib/feed-post-dto'
import { composeCopy } from '@/i18n/compose-copy'
import ComposeEditor from './compose-editor'
import { nextBackgroundKey } from './compose-background'
import { canPublish, MAX_POST_LENGTH } from './compose-state'
import type { PreparedImage } from './compose-image'

type EditImage =
  | { kind: 'unchanged'; url: string | null; width: number | null; height: number | null }
  | { kind: 'local'; prepared: PreparedImage; url: string }
  | { kind: 'removed' }

export default function EditPostScreen({ locale, postId }: { locale: string; postId: string }) {
  const copy = composeCopy(locale)
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [text, setText] = useState('')
  const [backgroundKey, setBackgroundKey] = useState<string | null>(null)
  const [changeBackground, setChangeBackground] = useState(false)
  const [image, setImage] = useState<EditImage>({ kind: 'unchanged', url: null, width: null, height: null })
  const [author, setAuthor] = useState<{ name: string | null; handle: string; imageUrl: string | null }>({
    name: null,
    handle: '',
    imageUrl: null,
  })
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(false)

  const objectUrl = useRef<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(false)
    try {
      const res = await fetch(buildClientApiPath(postEndpoint(postId)), { cache: 'no-store' })
      if (!res.ok) throw new Error('post_unavailable')
      const body = (await res.json()) as FeedPostResponse
      const post = body.post
      setText(post.sourceText ?? '')
      setBackgroundKey(post.backgroundKey)
      setImage({
        kind: 'unchanged',
        url: post.image?.url ?? null,
        width: post.image?.width ?? null,
        height: post.image?.height ?? null,
      })
      setAuthor({ name: post.author.name, handle: post.author.handle, imageUrl: post.author.imageUrl })
    } catch {
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }, [postId])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    return () => {
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current)
    }
  }, [])

  function handleChangeBackground() {
    setChangeBackground(true)
    setBackgroundKey((current) => nextBackgroundKey(current ?? 'warm-cream'))
  }

  function handlePickImage(prepared: PreparedImage | null) {
    if (objectUrl.current) {
      URL.revokeObjectURL(objectUrl.current)
      objectUrl.current = null
    }
    if (!prepared) {
      setImage({ kind: 'removed' })
      return
    }
    const url = URL.createObjectURL(prepared.file)
    objectUrl.current = url
    setImage({ kind: 'local', prepared, url })
  }

  const previewUrl =
    image.kind === 'local' ? image.url : image.kind === 'unchanged' ? image.url : null
  const dimensions =
    image.kind === 'local'
      ? { width: image.prepared.originalWidth, height: image.prepared.originalHeight }
      : image.kind === 'unchanged'
        ? { width: image.width, height: image.height }
        : null
  const hasImage = image.kind === 'local' || (image.kind === 'unchanged' && !!image.url)
  const publishable = canPublish({ sourceText: text, hasImage })

  async function handleSave() {
    if (!publishable || saving) return
    setSaving(true)
    setSaveError(false)
    try {
      // Upload a new image first, so its object key is set before the PATCH.
      if (image.kind === 'local') {
        const form = new FormData()
        form.append('file', image.prepared.file)
        form.append('width', String(image.prepared.originalWidth))
        form.append('height', String(image.prepared.originalHeight))
        const imgRes = await fetch(buildClientApiPath(`/posts/${encodeURIComponent(postId)}/image`), {
          method: 'POST',
          cache: 'no-store',
          body: form,
        })
        if (!imgRes.ok) throw new Error('image_failed')
      }

      const patch: Record<string, unknown> = {
        sourceText: text.trim().length > 0 ? text : null,
      }
      if (changeBackground) patch.changeBackground = true
      if (image.kind === 'removed') patch.imageObjectKey = null

      const res = await fetch(buildClientApiPath(postEndpoint(postId)), {
        method: 'PATCH',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      if (!res.ok) throw new Error('save_failed')

      router.push(feedHref(locale, { postId }))
    } catch {
      setSaveError(true)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center" role="status" aria-live="polite">
        <span className="text-sm text-muted-foreground">…</span>
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm text-muted-foreground">{copy.editLoadError}</p>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex min-h-11 items-center rounded-lg bg-secondary px-4 py-2 text-sm"
        >
          {copy.retry}
        </button>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between px-4 py-3">
        <button
          type="button"
          onClick={() => router.back()}
          className="inline-flex min-h-11 items-center rounded-lg px-2 py-2 text-sm text-muted-foreground hover:bg-secondary"
        >
          {copy.cancel}
        </button>
        <h1 className="text-base font-semibold">{copy.editTitle}</h1>
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={!publishable || saving}
          className="inline-flex min-h-11 items-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {saving ? copy.savingChanges : copy.saveChanges}
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <ComposeEditor
          locale={locale}
          sourceText={text}
          onChangeText={setText}
          backgroundKey={backgroundKey}
          imagePreviewUrl={previewUrl}
          imageDimensions={dimensions}
          onPickImage={handlePickImage}
          onChangeBackground={handleChangeBackground}
          author={author}
        />
        {text.length > MAX_POST_LENGTH || (!text.trim() && !hasImage) ? (
          <p role="status" className="px-4 pb-3 text-xs text-muted-foreground">
            {copy.emptyBlocked}
          </p>
        ) : null}
        {saveError ? (
          <p role="alert" className="px-4 pb-4 text-xs text-destructive">
            {copy.loadError}
          </p>
        ) : null}
      </div>
    </div>
  )
}
