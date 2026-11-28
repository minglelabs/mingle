'use client'

import { useMemo } from 'react'
import { resolvePostIntroExtrasCopy } from '@/i18n/post-intro-extras-copy'
import {
  POST_INTRO_ANIMALS,
  POST_INTRO_DRINKS,
  POST_INTRO_FOODS,
  POST_INTRO_INTERESTS,
  POST_INTRO_JOBS,
  POST_INTRO_MULTI_MAX,
  POST_INTRO_PERSONALITIES,
  type PostIntroExtras,
} from '@/lib/post-category'

type MultiKey = 'personality' | 'foods' | 'animals' | 'interests'

/**
 * The optional part of a self-introduction (owner, 2026-11-26): job, drinking
 * (one each), personality, food, animals and what they are into lately (up
 * to three each). Picked from lists so every viewer reads them in their own
 * language. Tapping a picked chip again unpicks it.
 */
export default function ComposeIntroExtras({ locale, value, onChange }: {
  locale: string
  value: PostIntroExtras
  onChange: (next: PostIntroExtras) => void
}) {
  const copy = useMemo(() => resolvePostIntroExtrasCopy(locale), [locale])
  const upTo = copy.upTo.replace('{n}', String(POST_INTRO_MULTI_MAX))

  const toggleMulti = (key: MultiKey, entry: string) => {
    const current = value[key] as string[]
    if (current.includes(entry)) onChange({ ...value, [key]: current.filter((item) => item !== entry) })
    else if (current.length < POST_INTRO_MULTI_MAX) onChange({ ...value, [key]: [...current, entry] })
  }

  const group = (qa: string, label: string, note: string | null, entries: readonly string[], names: Record<string, string>, isPicked: (entry: string) => boolean, onTap: (entry: string) => void) => (
    <div className="mt-3" data-qa={`compose-intro-${qa}`}>
      <p className="text-[12px] font-bold text-foreground/50">
        {label}{note ? <span className="ml-1 font-semibold text-foreground/35">{note}</span> : null}
      </p>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {entries.map((entry) => {
          const picked = isPicked(entry)
          return (
            <button
              key={entry}
              type="button"
              aria-pressed={picked}
              data-qa={`compose-intro-${qa}-${entry}`}
              onClick={() => onTap(entry)}
              className={`h-8 rounded-full px-3 text-[13px] font-semibold transition active:scale-[0.97] ${
                picked ? 'bg-amber-400 text-white' : 'bg-foreground/5 text-foreground/70'
              }`}
            >
              {names[entry]}
            </button>
          )
        })}
      </div>
    </div>
  )

  return (
    <div className="mt-4 border-t border-foreground/10 pt-3" data-qa="compose-intro-extras">
      <p className="text-[13px] font-bold text-foreground/70">{copy.optional}</p>
      {group('job', copy.labels.job, null, POST_INTRO_JOBS, copy.jobs, (entry) => value.job === entry,
        (entry) => onChange({ ...value, job: value.job === entry ? null : (entry as PostIntroExtras['job']) }))}
      {group('personality', copy.labels.personality, upTo, POST_INTRO_PERSONALITIES, copy.personality, (entry) => (value.personality as string[]).includes(entry), (entry) => toggleMulti('personality', entry))}
      {group('foods', copy.labels.foods, upTo, POST_INTRO_FOODS, copy.foods, (entry) => (value.foods as string[]).includes(entry), (entry) => toggleMulti('foods', entry))}
      {group('animals', copy.labels.animals, upTo, POST_INTRO_ANIMALS, copy.animals, (entry) => (value.animals as string[]).includes(entry), (entry) => toggleMulti('animals', entry))}
      {group('drink', copy.labels.drink, null, POST_INTRO_DRINKS, copy.drinks, (entry) => value.drink === entry,
        (entry) => onChange({ ...value, drink: value.drink === entry ? null : (entry as PostIntroExtras['drink']) }))}
      {group('interests', copy.labels.interests, upTo, POST_INTRO_INTERESTS, copy.interests, (entry) => (value.interests as string[]).includes(entry), (entry) => toggleMulti('interests', entry))}
    </div>
  )
}
