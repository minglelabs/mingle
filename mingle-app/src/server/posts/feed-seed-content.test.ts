import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  SEED_LANGUAGES,
  applySeedPlan,
  SEED_MAX_TEXT_LENGTH,
  findForbiddenPhrases,
  isLocalDatabaseUrl,
  parseSeedArgs,
  planSeed,
  productionGuardError,
  publishOrder,
  validateSeedContent,
  type SeedContent,
  type SeedItem,
  type SeedApplyDeps,
  type SeedPublishInput,
  type SeedPublishResult,
} from '../../../scripts/seed-feed-content.logic'

const CONTENT_PATH = path.resolve(__dirname, '../../../content/feed-seed/posts.v1.json')
const content = JSON.parse(readFileSync(CONTENT_PATH, 'utf8')) as SeedContent

function item(overrides: Partial<SeedItem> = {}): SeedItem {
  return {
    key: 'sample-item',
    clientPostId: 'mingleseed-test-001',
    kind: 'tip',
    topic: 'korean',
    language: 'ko',
    text: '가게에서 나올 때는 안녕히 계세요라고 해요.',
    ...overrides,
  }
}

function contentWith(items: SeedItem[]): SeedContent {
  return { version: 1, authorHandle: 'mingle_team', authorDisplayName: 'Mingle 팀', items }
}

describe('feed seed content file (posts.v1.json)', () => {
  it('passes every content rule', () => {
    expect(validateSeedContent(content)).toEqual([])
  })

  it('has about 40 short posts within the app limit', () => {
    expect(content.items.length).toBeGreaterThanOrEqual(35)
    expect(content.items.length).toBeLessThanOrEqual(50)
    for (const entry of content.items) {
      expect(entry.text.length).toBeLessThanOrEqual(SEED_MAX_TEXT_LENGTH)
      expect(entry.text.length).toBeLessThanOrEqual(300)
    }
  })

  it('mixes all four source languages', () => {
    const langs = new Set(content.items.map((entry) => entry.language))
    for (const lang of SEED_LANGUAGES) expect(langs.has(lang)).toBe(true)
  })

  it('uses unique keys, ids and texts', () => {
    const keys = content.items.map((entry) => entry.key)
    const ids = content.items.map((entry) => entry.clientPostId)
    const texts = content.items.map((entry) => entry.text)
    expect(new Set(keys).size).toBe(keys.length)
    expect(new Set(ids).size).toBe(ids.length)
    expect(new Set(texts).size).toBe(texts.length)
  })

  it('attaches official https sources to every fact', () => {
    const facts = content.items.filter((entry) => entry.kind === 'fact')
    expect(facts.length).toBeGreaterThan(0)
    const officialHosts = /(^|\.)(visitkorea\.or\.kr|seoul\.go\.kr|go\.kr)$/
    for (const fact of facts) {
      expect(fact.sources?.length ?? 0).toBeGreaterThan(0)
      for (const source of fact.sources ?? []) {
        expect(officialHosts.test(new URL(source.url).hostname)).toBe(true)
      }
    }
  })

  it('is authored by the team account handle', () => {
    expect(content.authorHandle).toBe('mingle_team')
  })
})

describe('validateSeedContent', () => {
  it('rejects a bad language, over-long text and a fact without sources', () => {
    const issues = validateSeedContent(
      contentWith([
        item({ key: 'bad-lang', clientPostId: 'mingleseed-test-001', language: 'fr' as SeedItem['language'] }),
        item({ key: 'too-long', clientPostId: 'mingleseed-test-002', text: 'a'.repeat(1001) }),
        item({ key: 'no-source', clientPostId: 'mingleseed-test-003', kind: 'fact', text: '세금 환급은 15,000원 이상.' }),
      ]),
    )
    expect(issues.map((i) => i.key)).toEqual(expect.arrayContaining(['bad-lang', 'too-long', 'no-source']))
  })

  it('rejects duplicate ids and duplicate texts', () => {
    const issues = validateSeedContent(
      contentWith([
        item({ key: 'one', clientPostId: 'mingleseed-test-001' }),
        item({ key: 'two', clientPostId: 'mingleseed-test-001' }),
      ]),
    )
    const messages = issues.map((i) => i.message)
    expect(messages).toContain('duplicate clientPostId')
    expect(messages).toContain('duplicate text')
  })

  it('rejects a source that is not https or has no checkedAt', () => {
    const issues = validateSeedContent(
      contentWith([item({ kind: 'fact', sources: [{ url: 'http://example.com', checkedAt: 'yesterday' }] })]),
    )
    expect(issues.map((i) => i.message)).toEqual(
      expect.arrayContaining(['source.url must be an https URL', 'source.checkedAt must be YYYY-MM-DD']),
    )
  })

  it('requires a question mark on questions', () => {
    const issues = validateSeedContent(contentWith([item({ kind: 'question', text: '서울에서 뭐 하세요' })]))
    expect(issues.map((i) => i.message)).toContain('question must contain a question mark')
  })
})

describe('findForbiddenPhrases (trust rules)', () => {
  it.each([
    ['제가 받아봤는데 좋았어요', 'first-person-ko'],
    ['I tried this clinic last week', 'first-person-en'],
    ['先週受けてみました', 'first-person-ja'],
    ['我做了这个项目', 'first-person-zh'],
    ['지금 예약하면 30% 할인', 'promotion'],
    ['Best clinic in Gangnam, DM me', 'promotion'],
    ['详情见 https://example.com', 'link'],
    ['부작용 없는 시술이에요', 'medical-claim'],
    ['Totally painless and guaranteed', 'medical-claim'],
    ['无副作用', 'medical-claim'],
  ])('flags %s', (text, id) => {
    expect(findForbiddenPhrases(text)).toContain(id)
  })

  it.each([
    '회복 기간은 얼마나 걸려요?',
    '想听听本地人的推荐。',
    'Who will perform the procedure?',
    'ネイルサロンで使える韓国語',
  ])('allows %s', (text) => {
    expect(findForbiddenPhrases(text)).toEqual([])
  })
})

describe('CLI safety rails', () => {
  it('defaults to dry-run', () => {
    expect(parseSeedArgs([]).apply).toBe(false)
    expect(parseSeedArgs(['--apply']).apply).toBe(true)
  })

  it('parses author and creation flags', () => {
    const options = parseSeedArgs(['--author-user-id', 'user_1', '--create-author'])
    expect(options.authorUserId).toBe('user_1')
    expect(options.createAuthor).toBe(true)
    expect(parseSeedArgs(['--author-user-id=user_2']).authorUserId).toBe('user_2')
  })

  it('rejects unknown flags, a missing value and --apply with --no-db', () => {
    expect(() => parseSeedArgs(['--force'])).toThrow(/unknown argument/)
    expect(() => parseSeedArgs(['--author-user-id'])).toThrow(/requires a value/)
    expect(() => parseSeedArgs(['--apply', '--no-db'])).toThrow()
  })

  it('treats only localhost/127.0.0.1 as local', () => {
    expect(isLocalDatabaseUrl('postgresql://u:p@localhost:5432/db')).toBe(true)
    expect(isLocalDatabaseUrl('postgresql://u:p@127.0.0.1:5432/db?schema=app')).toBe(true)
    expect(isLocalDatabaseUrl('postgresql://u:p@db.railway.internal:5432/db')).toBe(false)
    expect(isLocalDatabaseUrl('postgresql://u:p@localhost.evil.com:5432/db')).toBe(false)
    expect(isLocalDatabaseUrl(undefined)).toBe(false)
  })

  it('refuses a remote DATABASE_URL without the production flag', () => {
    const remote = 'postgresql://u:p@db.example.com:5432/db'
    expect(productionGuardError(remote, false)).toMatch(/--i-know-this-is-production/)
    expect(productionGuardError(remote, true)).toBeNull()
    expect(productionGuardError('postgresql://u:p@127.0.0.1:5432/db', false)).toBeNull()
    expect(productionGuardError('', false)).not.toBeNull()
  })
})

describe('planSeed (idempotency)', () => {
  const items = [
    item({ key: 'a', clientPostId: 'mingleseed-test-001' }),
    item({ key: 'b', clientPostId: 'mingleseed-test-002', text: 'b' }),
    item({ key: 'c', clientPostId: 'mingleseed-test-003', text: 'c' }),
  ]

  it('skips posts that already exist for the author and never touches foreign ones', () => {
    const plan = planSeed(
      items,
      [
        { id: 'mingleseed-test-001', authorId: 'team' },
        { id: 'mingleseed-test-002', authorId: 'someone-else' },
      ],
      'team',
    )
    expect(plan.map((p) => p.action)).toEqual(['skip-existing', 'skip-conflict', 'create'])
  })

  it('publishes in reverse so the first file item ends up newest', () => {
    expect(publishOrder(items).map((i) => i.key)).toEqual(['c', 'b', 'a'])
    expect(items.map((i) => i.key)).toEqual(['a', 'b', 'c'])
  })
})

describe('applySeedPlan (shared publish pipeline)', () => {
  const a = item({ key: 'a', clientPostId: 'mingleseed-test-00a', language: 'ko' })
  const b = item({ key: 'b', clientPostId: 'mingleseed-test-00b', language: 'en', text: 'Say hello.' })
  const c = item({ key: 'c', clientPostId: 'mingleseed-test-00c', language: 'ja', text: 'こんにちは。' })

  function deps(publish: (input: SeedPublishInput) => Promise<SeedPublishResult>, existing: string[] = []) {
    const lines: string[] = []
    const warnings: string[] = []
    const d: SeedApplyDeps = {
      authorId: 'author-1',
      postExists: async (id) => existing.includes(id),
      publish: vi.fn(publish),
      log: (line) => lines.push(line),
      warn: (line) => warnings.push(line),
    }
    return { d, lines, warnings }
  }

  const created = (input: SeedPublishInput, language: string | null = input.clientHint): SeedPublishResult => ({
    kind: 'created',
    post: { id: input.clientPostId },
    sourceLanguage: language,
    translations: [
      { language: 'x1', status: 'ready' },
      { language: 'x2', status: 'failed' },
    ],
  })

  it('publishes only create entries, newest last, through the shared pipeline with the seed id', async () => {
    const plan = planSeed([a, b, c], [{ id: b.clientPostId, authorId: 'author-1' }], 'author-1')
    const { d } = deps(async (input) => created(input))
    const summary = await applySeedPlan(plan, d)

    expect(summary).toEqual({ created: 2, skipped: 0, failedTranslations: 2 })
    expect(vi.mocked(d.publish).mock.calls.map(([input]) => input)).toEqual([
      { authorId: 'author-1', text: c.text, imageObjectKey: null, clientHint: 'ja', clientPostId: c.clientPostId },
      { authorId: 'author-1', text: a.text, imageObjectKey: null, clientHint: 'ko', clientPostId: a.clientPostId },
    ])
  })

  it('skips ids that appeared meanwhile or that the pipeline reports as duplicate / conflict', async () => {
    const plan = planSeed([a, b, c], [], 'author-1')
    const { d, lines } = deps(
      async (input) => (input.clientPostId === b.clientPostId ? { kind: 'duplicate' } : { kind: 'conflict' }),
      [c.clientPostId],
    )
    const summary = await applySeedPlan(plan, d)

    expect(summary).toEqual({ created: 0, skipped: 3, failedTranslations: 0 })
    expect(d.publish).toHaveBeenCalledTimes(2)
    expect(lines.some((line) => line.includes('already belongs to another user'))).toBe(true)
  })

  it('warns when the detected language differs from the declared one', async () => {
    const { d, warnings } = deps(async (input) => created(input, 'en'))
    await applySeedPlan(planSeed([a], [], 'author-1'), d)
    expect(warnings).toEqual([`  ! ${a.clientPostId} declared=ko detected=en`])
  })

  it('stops when a post is created under an id other than the seed id', async () => {
    const { d } = deps(async () => ({ kind: 'created', post: { id: 'server-id' }, sourceLanguage: 'ko', translations: [] }))
    await expect(applySeedPlan(planSeed([a], [], 'author-1'), d)).rejects.toThrow('without its seed id')
  })
})
