'use client'

import { useState } from 'react'
import PostLanguageChips, { ORIGINAL_CHIP } from '@/components/feed/post-language-chips'

/** Korean first (staff read it), then the rest as stored. */
export function orderStaffLanguages(languages: readonly string[]): string[] {
  return [...languages].sort((a, b) => Number(b === 'ko') - Number(a === 'ko'))
}

/**
 * A published post's text with the app's language chips: 원문 and each stored
 * ready translation of the current body (no model call; translations are made
 * when the post goes out).
 */
export function PublishedPostText({ text, sourceLanguage, translations }: {
  text: string
  sourceLanguage: string | null
  translations: Array<{ language: string; text: string }>
}) {
  const [selected, setSelected] = useState(ORIGINAL_CHIP)
  const byLanguage = new Map(translations.map((row) => [row.language, row.text]))
  const languages = orderStaffLanguages([...byLanguage.keys()].filter((language) => language !== sourceLanguage))
  const shown = selected === ORIGINAL_CHIP ? text : byLanguage.get(selected) ?? text
  return (
    <>
      <p className="whitespace-pre-wrap break-words text-[15px] leading-6 text-slate-900">{shown || '(내용 없음)'}</p>
      {languages.length ? (
        <div className="-ml-1 mt-1">
          <PostLanguageChips
            sourceLanguage={sourceLanguage}
            languages={languages}
            selected={selected}
            loadingLanguage={null}
            locale="ko"
            originalLabel="원문"
            onSelect={setSelected}
          />
        </div>
      ) : (
        <p className="mt-1 text-xs text-slate-400">저장된 번역이 없어요.</p>
      )}
    </>
  )
}
