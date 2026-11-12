// The last translation text each bubble showed, per message and language.
// Kept outside the component so it survives the remount when a live draft
// becomes a stored message.
const MAX_REMEMBERED_TRANSLATIONS = 800
const lastShown = new Map<string, string>()

/**
 * Returns the text to show in place of an empty translation, or null when
 * `text` itself should be shown. A non-empty `text` is remembered; an empty
 * one falls back to the last text this message showed for that language.
 */
export function holdLastShownTranslation(messageId: string, languageKey: string, text: string): string | null {
  const key = `${messageId}\u0000${languageKey}`
  if (text.trim()) {
    lastShown.delete(key)
    lastShown.set(key, text)
    if (lastShown.size > MAX_REMEMBERED_TRANSLATIONS) {
      const oldest = lastShown.keys().next().value
      if (oldest !== undefined) lastShown.delete(oldest)
    }
    return null
  }
  return lastShown.get(key) ?? null
}

export function forgetAllShownTranslations(): void {
  lastShown.clear()
}
