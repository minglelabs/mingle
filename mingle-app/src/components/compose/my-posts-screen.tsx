'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { buildClientApiPath } from '@/lib/api-contract'
import { myPostsEndpoint, feedHref, type MyPostsSection } from '@/lib/feed-routes'
import type { FeedPostDto, FeedPostListResponse } from '@/lib/feed-post-dto'
import PostGridTile from '@/components/posts/post-grid-tile'
import { composeCopy, formatComposeCopy } from '@/i18n/compose-copy'
import { trashDaysLeft } from './trash-retention'

function sectionTitle(section: MyPostsSection, copy: ReturnType<typeof composeCopy>): string {
  return section === 'archived' ? copy.archiveTitle : section === 'trash' ? copy.trashTitle : copy.hiddenTitle
}

function emptyText(section: MyPostsSection, copy: ReturnType<typeof composeCopy>): string {
  return section === 'archived' ? copy.archiveEmpty : section === 'trash' ? copy.trashEmpty : copy.hiddenEmpty
}

function actionLabel(section: MyPostsSection, copy: ReturnType<typeof composeCopy>): string {
  return section === 'archived'
    ? copy.restoreToPublic
    : section === 'trash'
      ? copy.restoreFromTrash
      : copy.unhide
}

export default function MyPostsScreen({
  locale,
  section,
}: {
  locale: string
  section: MyPostsSection
}) {
  const copy = composeCopy(locale)
  const router = useRouter()
  const [posts, setPosts] = useState<FeedPostDto[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(false)
    try {
      const res = await fetch(buildClientApiPath(myPostsEndpoint(section, {})), { cache: 'no-store' })
      if (!res.ok) throw new Error('list_unavailable')
      const body = (await res.json()) as FeedPostListResponse
      setPosts(body.posts)
    } catch {
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }, [section])

  useEffect(() => {
    void load()
  }, [load])

  const runAction = useCallback(
    async (postId: string) => {
      setBusyId(postId)
      // Optimistically drop the tile; reload on failure.
      const snapshot = posts
      setPosts((prev) => prev.filter((p) => p.id !== postId))
      try {
        const request =
          section === 'hidden'
            ? fetch(buildClientApiPath(`/posts/${encodeURIComponent(postId)}/hide`), {
                method: 'DELETE',
                cache: 'no-store',
              })
            : fetch(buildClientApiPath(`/posts/${encodeURIComponent(postId)}/restore`), {
                method: 'POST',
                cache: 'no-store',
              })
        const res = await request
        if (!res.ok) throw new Error('action_failed')
      } catch {
        setPosts(snapshot)
      } finally {
        setBusyId(null)
      }
    },
    [posts, section],
  )

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-2 px-4 py-3">
        <button
          type="button"
          aria-label={copy.cancel}
          onClick={() => router.back()}
          className="inline-flex min-h-11 items-center rounded-lg px-2 py-2 text-sm text-muted-foreground hover:bg-secondary"
        >
          ‹
        </button>
        <h1 className="text-base font-semibold">{sectionTitle(section, copy)}</h1>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-6">
        {loading ? (
          <p className="px-2 py-6 text-sm text-muted-foreground" role="status" aria-live="polite">
            …
          </p>
        ) : loadError ? (
          <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
            <p className="text-sm text-muted-foreground">{copy.loadError}</p>
            <button
              type="button"
              onClick={() => void load()}
              className="inline-flex min-h-11 items-center rounded-lg bg-secondary px-4 py-2 text-sm"
            >
              {copy.retry}
            </button>
          </div>
        ) : posts.length === 0 ? (
          <p className="px-2 py-10 text-center text-sm text-muted-foreground">{emptyText(section, copy)}</p>
        ) : (
          <ul className="grid grid-cols-3 gap-1.5 px-1">
            {posts.map((post) => (
              <li key={post.id} className="flex flex-col gap-1">
                <PostGridTile
                  post={post}
                  locale={locale}
                  onSelect={(id) => router.push(feedHref(locale, { postId: id }))}
                  badge={
                    section === 'trash' ? (
                      <span className="rounded bg-black/60 px-1.5 py-0.5 text-[11px] text-white">
                        {formatComposeCopy(copy.trashDaysLeft, { days: trashDaysLeft(post.deletedAt) })}
                      </span>
                    ) : undefined
                  }
                />
                <button
                  type="button"
                  onClick={() => void runAction(post.id)}
                  disabled={busyId === post.id}
                  className="inline-flex min-h-9 items-center justify-center rounded-lg bg-secondary px-2 py-1.5 text-xs text-secondary-foreground hover:opacity-90 disabled:opacity-60"
                >
                  {actionLabel(section, copy)}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
