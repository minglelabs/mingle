import { prisma } from '@/lib/prisma'
import { EMPTY_POST_INTRO_EXTRAS, POST_HOUR_MS, type PostCategory, type PostHobby, type PostIntro, type PostIntroExtras } from '@/lib/post-category'
import { resolveNationalityCountry } from '@/lib/nationality'
import { calculateProfileAge } from '@/server/user-profile'

/**
 * Marks a post just published with its kind (owner, 2026-11-25; see
 * @/lib/post-category). An hour post gets the moment it leaves the lists; a
 * self-introduction gets the author's country, age and height as they are on
 * the profile now, with the hobbies picked.
 */
export async function applyPostCategory(args: {
  postId: string
  authorId: string
  category: PostCategory
  hobbies: PostHobby[]
  /** Job, personality, food, animals, drinking, interests (all optional). */
  introExtras?: PostIntroExtras
  /** A voice talk post's own title (already sanitized); null: the default invitation. */
  callTitle?: string | null
  publishedAt: Date
}): Promise<void> {
  // A call post is up for an hour too: its author has to be around to answer.
  if (args.category === 'hour' || args.category === 'call') {
    await prisma.post.updateMany({
      where: { id: args.postId, authorId: args.authorId },
      data: {
        category: args.category,
        expiresAt: new Date(args.publishedAt.getTime() + POST_HOUR_MS),
        ...(args.category === 'call' && args.callTitle ? { intro: { callTitle: args.callTitle } } : {}),
      },
    })
    return
  }
  if (args.category !== 'intro') return
  const author = await prisma.user.findUnique({
    where: { id: args.authorId },
    select: { nationalityCountry: true, primaryLanguages: true, birthDate: true, heightCm: true },
  })
  const intro: PostIntro = {
    country: author ? resolveNationalityCountry(author.nationalityCountry, author.primaryLanguages) ?? null : null,
    age: author ? calculateProfileAge(author.birthDate) ?? null : null,
    heightCm: typeof author?.heightCm === 'number' ? author.heightCm : null,
    hobbies: args.hobbies,
    ...(args.introExtras ?? EMPTY_POST_INTRO_EXTRAS),
  }
  await prisma.post.updateMany({ where: { id: args.postId, authorId: args.authorId }, data: { category: 'intro', intro } })
}
