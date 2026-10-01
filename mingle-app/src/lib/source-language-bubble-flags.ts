// The two flags translate/finalize sets on a finalized utterance whose
// original mixes languages or uses another script. They keep the
// same-language row (a fully Korean `ko` rendering of a `ko` original that
// contains Japanese or Hanja), which is otherwise hidden as a copy of the
// original. Every hop after finalization (the stored message, room history,
// the committed realtime frame, the share page) carries them through this
// one helper so none of them can drop one. Pure: used by client and server.

export type SourceLanguageBubbleFlags = {
  sourceLanguagesMixed?: true
  sourceTextHasForeignScript?: true
}

/** Only a literal `true` is kept; anything else (false, missing, malformed) means "no flag". */
export function pickSourceLanguageBubbleFlags(value: unknown): SourceLanguageBubbleFlags {
  if (!value || typeof value !== 'object') return {}
  const record = value as Record<string, unknown>
  return {
    ...(record.sourceLanguagesMixed === true ? { sourceLanguagesMixed: true } : {}),
    ...(record.sourceTextHasForeignScript === true ? { sourceTextHasForeignScript: true } : {}),
  }
}
