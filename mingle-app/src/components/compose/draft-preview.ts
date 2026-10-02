import { generatePreviewText } from '@/lib/post-preview-text'

/**
 * A one/two-line body preview for the draft list. Reuses the feed's own
 * snippet rule (`generatePreviewText`) so a draft reads the same way its
 * published post will, and collapses the blank lines a multi-paragraph draft
 * would otherwise waste the row on.
 */
export function postPreviewText(sourceText: string | null): string {
  if (!sourceText) return ''
  const collapsed = sourceText.replace(/\s*\n\s*\n\s*/g, ' ').replace(/\n/g, ' ')
  return generatePreviewText(collapsed).text
}
