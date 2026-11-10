import { prisma } from '@/lib/prisma'

const POST_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/

/** A well-formed post id from a request body or query, else null. */
export function parseSourcePostId(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const id = raw.trim()
  return POST_ID_PATTERN.test(id) ? id : null
}

/**
 * The post an action on `authorId` was made from (a follow, a profile visit),
 * kept only when it is a post by that author; anything else is null. Used by
 * the operator post stats to credit the action to the post.
 */
export async function resolveSourcePostId(raw: unknown, authorId: string): Promise<string | null> {
  const id = parseSourcePostId(raw)
  if (!id || !authorId) return null
  const post = await prisma.post.findFirst({ where: { id, authorId }, select: { id: true } })
  return post?.id ?? null
}

/** `sourcePostId` from a JSON request body; null without one (no body, other content types, bad JSON). */
export async function readSourcePostIdFromBody(request: Request): Promise<unknown> {
  if (!request.headers.get('content-type')?.toLowerCase().includes('application/json')) return null
  try {
    const body: unknown = await request.json()
    return body && typeof body === 'object' ? (body as { sourcePostId?: unknown }).sourcePostId ?? null : null
  } catch {
    return null
  }
}
