'use client'

import { useState } from 'react'
import PostLanguageChips, { ORIGINAL_CHIP } from '@/components/feed/post-language-chips'

/**
 * A post's text with the same language flags as the app card: the original
 * and every finished translation of the current body, switchable in place.
 */
export function PostBody({ sourceText, sourceLanguage, translations }: {
  sourceText: string
  sourceLanguage: string | null
  translations: ReadonlyArray<{ language: string; text: string }>
}) {
  const [selected, setSelected] = useState(ORIGINAL_CHIP)
  const shown = translations.find((translation) => translation.language === selected)?.text ?? sourceText
  return (
    <>
      <p className="mt-3 whitespace-pre-wrap break-words text-[15px] leading-6 text-slate-900">{shown}</p>
      {translations.length ? (
        <div className="-ml-1 mt-1">
          <PostLanguageChips
            sourceLanguage={sourceLanguage}
            languages={translations.map((translation) => translation.language)}
            selected={selected}
            loadingLanguage={null}
            locale="ko"
            originalLabel="원문"
            onSelect={setSelected}
          />
        </div>
      ) : null}
    </>
  )
}
