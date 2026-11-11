'use client'

// How to play, in the game's own words (engine/client/i18n.js: the same rules
// the Hash Rush web page shows), in the app's language where the game has it.
// The lines are the game's own fixed strings with a little markup (<b>).

import { pickLanguage, stringsFor } from './engine/client/i18n.js'

type GameStrings = {
  howto: string
  tagline: string
  how: string[]
  mapNames: Record<string, string>
}

export function hashRushHowToStrings(uiLocale: string): GameStrings {
  const strings = (stringsFor(pickLanguage(uiLocale)) || stringsFor('en')) as GameStrings
  return strings
}

export default function HashRushHowToPage({ uiLocale }: { uiLocale: string }) {
  const strings = hashRushHowToStrings(uiLocale)
  return (
    <div className="space-y-4 px-4 py-4 text-[0.94rem] leading-relaxed text-gray-800" data-qa="hash-rush-howto-page">
      <p
        className="rounded-2xl bg-amber-50 px-4 py-3 text-[0.95rem] text-amber-900"
        // The game's own fixed string.
        dangerouslySetInnerHTML={{ __html: strings.tagline }}
      />
      <ol className="space-y-3">
        {strings.how.map((line, index) => (
          <li key={index} className="flex gap-2.5">
            <span className="mt-[0.1rem] inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gray-100 text-[0.72rem] font-bold text-gray-500">{index + 1}</span>
            <span
              className="min-w-0 flex-1 [&_b]:font-semibold [&_b]:text-gray-950"
              dangerouslySetInnerHTML={{ __html: line }}
            />
          </li>
        ))}
      </ol>
    </div>
  )
}
