import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { nameLanguageOf, needsTransliteration, validateTransliterations } from '@/server/name-transliteration'

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8')

describe('names in the reader\'s script', () => {
  it('covers the four translated languages only', () => {
    expect(nameLanguageOf('ko')).toBe('ko')
    expect(nameLanguageOf('zh-TW')).toBe('zh-CN')
    expect(nameLanguageOf('en-US')).toBe('en')
    expect(nameLanguageOf('th')).toBeNull()
  })

  it('leaves a name already in the reader\'s script alone', () => {
    expect(needsTransliteration('李伟', 'ko')).toBe(true)
    expect(needsTransliteration('김민지', 'ko')).toBe(false)
    expect(needsTransliteration('Minji Kim', 'en')).toBe(false)
    expect(needsTransliteration('สมชาย', 'en')).toBe(true)
    expect(needsTransliteration('佐藤 健', 'ja')).toBe(false)
    expect(needsTransliteration('さくら', 'zh-CN')).toBe(true)
    expect(needsTransliteration('😀', 'ko')).toBe(false)
  })

  it('keeps only answers written in the reader\'s script', () => {
    const ids = new Set(['a', 'b', 'c'])
    const out = validateTransliterations({ names: [
      { id: 'a', text: '리웨이' },
      { id: 'b', text: 'Li Wei' },
      { id: 'x', text: '누구' },
    ] }, ids, 'ko')
    expect([...out]).toEqual([['a', '리웨이']])
  })

  it('is what explore cards, the profile, its bio and posts show by default', () => {
    const discover = read('src/app/api/users/discover/route.ts')
    expect(discover).toContain('name: nameById.get(user.id) ?? user.name,')
    expect(discover).toContain('language: readingLanguage, status: "succeeded"')
    expect(read('src/app/api/users/[userId]/route.ts')).toContain('...(readerName ? { readerName } : {}),')
    expect(read('src/components/profile-bio.tsx')).toContain('void refresh(true)\n  }, [editing, refresh, snapshot])')
    expect(read('src/server/feed/feed-post-loader.ts')).toContain('viewer?.defaultDisplayLanguage ?? viewer?.primaryLanguages?.[0] ?? null')
  })
})
