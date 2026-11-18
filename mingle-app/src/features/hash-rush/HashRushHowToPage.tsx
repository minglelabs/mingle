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

// Shots of the game (public/hash-rush/howto, taken from the game page at
// phone size) next to the lines they show. Korean shots for Korean, English
// for every other language. `after` is the line (1-based) they follow.
type Shot = { file: 'start' | 'seed' | 'maps'; after: number; caption: Record<'ko' | 'en' | 'ja', string> }
const SHOTS: Shot[] = [
  {
    file: 'start',
    after: 2,
    caption: {
      ko: '위에 해바라기, 아래에 집. 양옆 🌀 포탈은 집으로 순간이동해요. 왼쪽 아래 방향키로 움직이고, 오른쪽 아래 꿀밤 버튼으로 쳐요.',
      en: 'The sunflower is at the top and home at the bottom; the 🌀 portals take you home. Move with the pad at the bottom left, bonk with the button at the bottom right.',
      ja: '上にひまわり、下に家。左右の🌀ポータルは家へワープします。左下の十字キーで動き、右下のボタンでデコピン。',
    },
  },
  {
    file: 'seed',
    after: 4,
    caption: {
      ko: '해바라기 옆에 가만히 서 있으면 씨를 물어요. 그대로 집까지 가면 승리!',
      en: 'Stand still by the sunflower to pick up a seed, then carry it home to win.',
      ja: 'ひまわりのそばでじっとしていると種をくわえます。そのまま家に帰れば勝ち！',
    },
  },
  {
    file: 'maps',
    after: 14,
    caption: {
      ko: '해변 맵: 파도에 젖으면 느려져요. 맵마다 길과 함정이 달라요.',
      en: 'The beach: waves slow you down when you get wet. Every map has its own paths and traps.',
      ja: 'ビーチ：波にぬれると遅くなります。マップごとに道もワナもちがいます。',
    },
  },
]

function shotLanguage(uiLocale: string): 'ko' | 'en' | 'ja' {
  const lang = (uiLocale || '').toLowerCase()
  return lang.startsWith('ko') ? 'ko' : lang.startsWith('ja') ? 'ja' : 'en'
}

function ShotFigure({ shot, uiLocale }: { shot: Shot, uiLocale: string }) {
  const lang = shotLanguage(uiLocale)
  const src = `/hash-rush/howto/${lang === 'ko' ? 'ko' : 'en'}-${shot.file}.jpg`
  return (
    <figure className="my-1 overflow-hidden rounded-2xl border border-gray-100 bg-gray-50" data-qa="hash-rush-howto-shot">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={shot.caption[lang]} loading="lazy" className="mx-auto block w-[72%] max-w-[260px] py-3" />
      <figcaption className="border-t border-gray-100 bg-white px-3 py-2 text-[0.82rem] leading-snug text-gray-600">{shot.caption[lang]}</figcaption>
    </figure>
  )
}

export default function HashRushHowToPage({ uiLocale }: { uiLocale: string }) {
  const strings = hashRushHowToStrings(uiLocale)
  const lines = strings.how
  // A shot meant for a line past the end goes after the last one.
  const shotsAfter = (index: number) => SHOTS.filter((shot) => Math.min(shot.after, lines.length) === index + 1)
  return (
    <div className="space-y-4 px-4 py-4 text-[0.94rem] leading-relaxed text-gray-800" data-qa="hash-rush-howto-page">
      <p
        className="rounded-2xl bg-amber-50 px-4 py-3 text-[0.95rem] text-amber-900"
        // The game's own fixed string.
        dangerouslySetInnerHTML={{ __html: strings.tagline }}
      />
      <ol className="space-y-3">
        {lines.map((line, index) => (
          <li key={index}>
            <div className="flex gap-2.5">
              <span className="mt-[0.1rem] inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gray-100 text-[0.72rem] font-bold text-gray-500">{index + 1}</span>
              <span
                className="min-w-0 flex-1 [&_b]:font-semibold [&_b]:text-gray-950"
                dangerouslySetInnerHTML={{ __html: line }}
              />
            </div>
            {shotsAfter(index).map((shot) => <div key={shot.file} className="mt-3"><ShotFigure shot={shot} uiLocale={uiLocale} /></div>)}
          </li>
        ))}
      </ol>
    </div>
  )
}
