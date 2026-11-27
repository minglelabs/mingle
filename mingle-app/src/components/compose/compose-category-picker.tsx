'use client'

import { Check, ChevronRight, Clock, Lock, Phone, Sparkles, UserRound } from 'lucide-react'
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import FlagEmoji from '@/components/flag-emoji'
import { isVoiceTalkAvailable } from '@/components/LivePhoneDemo/VoiceTalkPanel'
import { resolveComposeCategoryStepCopy } from '@/i18n/compose-category-step-copy'
import { resolvePostCategoryCopy } from '@/i18n/post-category-copy'
import type { AppLocale } from '@/i18n'
import { formatProfileAge } from '@/i18n/profile-age-copy'
import { buildClientApiPath } from '@/lib/api-contract'
import { countryFlagEmoji, getCountryDisplayName } from '@/lib/nationality'
import { POST_CATEGORIES, POST_HOBBIES, POST_INTRO_HOBBIES_MAX, type PostCategory, type PostHobby, type PostIntroExtras } from '@/lib/post-category'
import ComposeIntroExtras from './compose-intro-extras'

// Whether this is the app does not change while the page is open.
const subscribeNever = () => () => undefined

/** The kinds of post the author can pick here (a call post only in the app). */
function useCategories() {
  // A call post is answered in the app (its voice engine): only the app offers it.
  const canTakeCalls = useSyncExternalStore(subscribeNever, isVoiceTalkAvailable, () => false)
  return POST_CATEGORIES.filter((entry) => entry !== 'call' || canTakeCalls)
}

function CategoryIcon({ category, size }: { category: PostCategory; size: number }) {
  if (category === 'hour') return <Clock size={size} strokeWidth={2.2} aria-hidden="true" />
  if (category === 'call') return <Phone size={size - 1} strokeWidth={2.2} aria-hidden="true" />
  if (category === 'intro') return <UserRound size={size} strokeWidth={2.2} aria-hidden="true" />
  return <Sparkles size={size} strokeWidth={2.2} aria-hidden="true" />
}

/**
 * The kind of a new post, asked on the write screen once the gallery has
 * closed (owner, 2026-11-27): one big row each. Tapping one keeps it where it
 * is while the question and the other rows fold away, and the write form
 * unfolds under it; tapping the kept row again opens the choice back up.
 */
export function ComposeCategoryStep({
  locale,
  selected,
  open,
  onPick,
  onReopen,
}: {
  locale: string
  /** The kind marked (an ordinary post until another is tapped). */
  selected: PostCategory
  /** The choice is on screen (false: folded to the kind picked, the form under it). */
  open: boolean
  onPick: (category: PostCategory) => void
  onReopen: () => void
}) {
  const copy = useMemo(() => resolvePostCategoryCopy(locale), [locale])
  const stepCopy = useMemo(() => resolveComposeCategoryStepCopy(locale), [locale])
  const categories = useCategories()
  const hints: Record<PostCategory, string> = {
    free: stepCopy.freeHint,
    hour: copy.hourHint,
    intro: stepCopy.introShort,
    call: copy.callHint,
  }
  // Folds to nothing (height and opacity), so what is under it slides up smoothly.
  const fold = (shown: boolean) =>
    `grid transition-[grid-template-rows,opacity] duration-300 ease-out ${shown ? 'grid-rows-[1fr] opacity-100' : 'pointer-events-none grid-rows-[0fr] opacity-0'}`
  return (
    <section data-qa="compose-category-step" data-open={open ? '1' : '0'} className="px-4 pt-3">
      <div className={fold(open)} aria-hidden={!open}>
        <div className="min-h-0 overflow-hidden">
          <h2 className="pb-3 pt-2 text-[22px] font-bold leading-tight">{stepCopy.question}</h2>
        </div>
      </div>
      <div role="radiogroup" aria-label={copy.label}>
        {categories.map((entry) => {
          const picked = entry === selected
          return (
            <div key={entry} className={fold(open || picked)} aria-hidden={!open && !picked}>
              <div className="min-h-0 overflow-hidden">
                <div className="pb-2.5">
                  <button
                    type="button"
                    role="radio"
                    aria-checked={picked}
                    data-qa={`compose-category-${entry}`}
                    tabIndex={open || picked ? 0 : -1}
                    onClick={() => (open ? onPick(entry) : onReopen())}
                    className={`flex min-h-[4.25rem] w-full items-center gap-3.5 rounded-2xl border px-4 py-3 text-left transition active:scale-[0.99] ${
                      picked ? 'border-amber-300 bg-amber-50' : 'border-foreground/10 bg-background active:bg-foreground/5'
                    }`}
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100/70 text-amber-600">
                      <CategoryIcon category={entry} size={19} />
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="text-[16px] font-bold">{copy.categories[entry]}</span>
                      <span className="text-[13px] leading-snug text-foreground/55">{hints[entry]}</span>
                    </span>
                    {picked && !open ? (
                      <span className="shrink-0 text-[13px] font-semibold text-foreground/45">{stepCopy.change}</span>
                    ) : picked ? (
                      <Check size={20} strokeWidth={2.8} className="shrink-0 text-amber-600" aria-hidden="true" />
                    ) : (
                      <ChevronRight size={18} strokeWidth={2.2} className="shrink-0 text-foreground/30" aria-hidden="true" />
                    )}
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

type ProfileFacts = { country: string | null; age: number | null; heightCm: number | null }

/**
 * The category of the post being written (owner, 2026-11-25): chips on top of
 * the write screen. "1 hour" says the post will disappear; "self-introduction"
 * shows what comes from the profile (country, age, height: locked) and asks
 * for hobbies. See @/lib/post-category.
 */
export default function ComposeCategoryPicker({
  locale,
  category,
  onCategoryChange,
  hobbies,
  onHobbiesChange,
  introExtras,
  onIntroExtrasChange,
  problem,
  compact = false,
}: {
  locale: string
  category: PostCategory
  onCategoryChange: (category: PostCategory) => void
  hobbies: readonly PostHobby[]
  onHobbiesChange: (hobbies: PostHobby[]) => void
  /** Job, personality, food, animals, drinking, interests (optional). */
  introExtras: PostIntroExtras
  onIntroExtrasChange: (next: PostIntroExtras) => void
  /** Why a self-introduction cannot be posted yet (shown under the form). */
  problem: 'hobbies' | 'text' | null
  /** The kind was picked in the first step: no chips, only what goes with the kind picked. */
  compact?: boolean
}) {
  const copy = useMemo(() => resolvePostCategoryCopy(locale), [locale])
  const [facts, setFacts] = useState<ProfileFacts | null>(null)
  useEffect(() => {
    if (category !== 'intro' || facts) return
    let cancelled = false
    void fetch(buildClientApiPath('/profile'), { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { nationalityCountry?: unknown; age?: unknown; heightCm?: unknown } | null) => {
        if (cancelled || !body) return
        setFacts({
          country: typeof body.nationalityCountry === 'string' ? body.nationalityCountry : null,
          age: typeof body.age === 'number' ? body.age : null,
          heightCm: typeof body.heightCm === 'number' ? body.heightCm : null,
        })
      })
      .catch(() => undefined)
    return () => { cancelled = true }
  }, [category, facts])

  const categories = useCategories()

  const toggleHobby = (hobby: PostHobby) => {
    if (hobbies.includes(hobby)) onHobbiesChange(hobbies.filter((entry) => entry !== hobby))
    else if (hobbies.length < POST_INTRO_HOBBIES_MAX) onHobbiesChange([...hobbies, hobby])
  }

  // Folded: the summary on top names the kind; only the self-introduction form stays here.
  if (compact && category !== 'intro') return null

  return (
    <section data-qa="compose-category" className={compact ? 'px-4 pb-2 pt-1' : 'border-t border-foreground/10 px-4 pb-4 pt-3'}>
      {compact ? null : <>
      <p className="text-[12px] font-bold text-foreground/50">{copy.label}</p>
      <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label={copy.label}>
        {categories.map((entry) => {
          const picked = entry === category
          return (
            <button
              key={entry}
              type="button"
              role="radio"
              aria-checked={picked}
              data-qa={`compose-category-${entry}`}
              onClick={() => onCategoryChange(entry)}
              className={`inline-flex h-9 items-center gap-1 rounded-full border px-3.5 text-[14px] font-semibold transition active:scale-[0.97] ${
                picked ? 'border-amber-400 bg-amber-50 text-slate-950' : 'border-foreground/15 bg-background text-foreground/70'
              }`}
            >
              {picked ? <Check size={14} strokeWidth={3} aria-hidden="true" /> : entry === 'hour' ? <Clock size={14} strokeWidth={2.4} aria-hidden="true" /> : entry === 'call' ? <Phone size={13} strokeWidth={2.4} aria-hidden="true" /> : null}
              {copy.categories[entry]}
            </button>
          )
        })}
      </div>
      </>}

      {category === 'hour' ? <p className="mt-2 text-[13px] text-foreground/55" data-qa="compose-category-hour-hint">{copy.hourHint}</p> : null}
      {category === 'call' ? <p className="mt-2 text-[13px] text-foreground/55" data-qa="compose-category-call-hint">{copy.callHint}</p> : null}

      {category === 'intro' ? (
        <div className="mt-3" data-qa="compose-intro-form">
          <p className="text-[13px] leading-snug text-foreground/55">{copy.introHint}</p>
          {/* From the profile: shown, not typed here. */}
          <div className="mt-2 flex flex-wrap items-center gap-1.5 rounded-xl bg-foreground/5 px-3 py-2 text-[14px] font-semibold text-foreground/80">
            {facts?.country ? (
              <span className="inline-flex items-center gap-1">
                <FlagEmoji emoji={countryFlagEmoji(facts.country)} className="text-[15px] leading-none" />
                {getCountryDisplayName(facts.country, locale as AppLocale)}
              </span>
            ) : null}
            {typeof facts?.age === 'number' ? <span>· {formatProfileAge(facts.age, locale as AppLocale)}</span> : null}
            {typeof facts?.heightCm === 'number' ? <span className="tabular-nums">· {facts.heightCm}cm</span> : null}
            <Lock size={13} strokeWidth={2.4} className="ml-auto shrink-0 text-foreground/35" aria-hidden="true" />
          </div>
          <p className="mt-3 text-[12px] font-bold text-foreground/50">
            {copy.hobbiesLabel} <span className="tabular-nums">{hobbies.length}/{POST_INTRO_HOBBIES_MAX}</span>
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {POST_HOBBIES.map((hobby) => {
              const picked = hobbies.includes(hobby)
              return (
                <button
                  key={hobby}
                  type="button"
                  aria-pressed={picked}
                  data-qa={`compose-hobby-${hobby}`}
                  onClick={() => toggleHobby(hobby)}
                  className={`h-9 rounded-full px-3.5 text-[14px] font-semibold transition active:scale-[0.97] ${
                    picked ? 'bg-amber-400 text-white' : 'bg-foreground/5 text-foreground/70'
                  }`}
                >
                  {copy.hobbies[hobby]}
                </button>
              )
            })}
          </div>
          {problem ? <p role="status" className="mt-2 text-[13px] font-semibold text-amber-700">{problem === 'hobbies' ? copy.needHobby : copy.needText}</p> : null}
          <ComposeIntroExtras locale={locale} value={introExtras} onChange={onIntroExtrasChange} />
        </div>
      ) : null}
    </section>
  )
}
