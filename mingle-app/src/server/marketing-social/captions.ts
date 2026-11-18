import { SOCIAL_CAPTION_LIMIT, type SocialPlatform } from './types'

/** "#a, b  #c" → ["#a", "#b", "#c"]: one leading #, no spaces, no duplicates, at most 30. */
export function normalizeHashtags(input: unknown): string[] {
  const raw = Array.isArray(input) ? input.join(' ') : typeof input === 'string' ? input : ''
  const seen = new Set<string>()
  const tags: string[] = []
  for (const part of raw.split(/[\s,]+/)) {
    const word = part.replace(/^#+/, '').replace(/[^\p{L}\p{N}_]/gu, '')
    if (!word) continue
    const key = word.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    tags.push(`#${word}`)
    if (tags.length >= 30) break
  }
  return tags
}

/**
 * Default caption of one platform: the base caption plus hashtags. Threads
 * allows a single topic tag per post, so it keeps just the first one.
 */
export function composeCaption(platform: SocialPlatform, base: string, hashtags: string[]): string {
  const tags = platform === 'threads' ? hashtags.slice(0, 1) : hashtags
  const text = [base.trim(), tags.join(' ')].filter(Boolean).join('\n\n')
  return clipToCodePoints(text, SOCIAL_CAPTION_LIMIT[platform])
}

/** Cut by code points (as `captionTooLong` counts), never splitting an emoji's surrogate pair. */
export function clipToCodePoints(text: string, limit: number): string {
  const points = [...text]
  return points.length <= limit ? text : points.slice(0, limit).join('')
}

export function captionTooLong(platform: SocialPlatform, caption: string): boolean {
  return [...caption].length > SOCIAL_CAPTION_LIMIT[platform]
}
