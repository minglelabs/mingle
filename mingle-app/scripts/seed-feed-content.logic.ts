/**
 * Pure (DB-free, network-free) helpers for the posting-feed launch seed.
 *
 * The runnable entry point is `scripts/seed-feed-content.ts`; everything here
 * is deterministic so the content rules and the CLI safety rails can be unit
 * tested without a database.
 */

export const SEED_LANGUAGES = ['ko', 'en', 'ja', 'zh-CN'] as const
export type SeedLanguage = (typeof SEED_LANGUAGES)[number]

export const SEED_KINDS = ['notice', 'fact', 'tip', 'phrase', 'question'] as const
export type SeedKind = (typeof SEED_KINDS)[number]

export const SEED_TOPICS = ['beauty', 'korean', 'local'] as const
export type SeedTopic = (typeof SEED_TOPICS)[number]

/** Same limit as POST /api/posts (MAX_BODY_LENGTH). */
export const SEED_MAX_TEXT_LENGTH = 1000
/** Same shape POST /api/posts accepts as an idempotent clientPostId. */
export const SEED_CLIENT_POST_ID_PATTERN = /^[\w-]{12,128}$/
export const SEED_DEFAULT_AUTHOR_HANDLE = 'mingle_team'
export const SEED_DEFAULT_AUTHOR_NAME = 'Mingle 팀'

export type SeedSource = { url: string; checkedAt: string }

export type SeedItem = {
  key: string
  clientPostId: string
  kind: SeedKind
  topic: SeedTopic
  language: SeedLanguage
  text: string
  sources?: SeedSource[]
}

export type SeedContent = {
  version: number
  authorHandle: string
  authorDisplayName: string
  notes?: string
  items: SeedItem[]
}

/**
 * Trust rules (checklist 85). Each pattern is a phrase the seed must never
 * contain: first-person experience claims, promotion, or medical
 * efficacy/safety claims. Asking the community for recommendations is fine;
 * the team account recommending a business is not.
 */
export const FORBIDDEN_PATTERNS: ReadonlyArray<{ id: string; pattern: RegExp }> = [
  // First-person reviews / pretending to be a customer.
  { id: 'first-person-ko', pattern: /(받아\s?봤|다녀\s?왔|해\s?봤는데|제가\s?받은|내돈내산|솔직\s?후기|시술\s?후기|방문\s?후기)/ },
  { id: 'first-person-en', pattern: /\b(I|we)\s+(tried|got|had|went|did|visited)\b|\bmy\s+(experience|results?|procedure|surgery|treatment)\b|\breview\b/i },
  { id: 'first-person-ja', pattern: /(受けてみ|行ってきまし|やってみまし|私が受けた|体験談|口コミ)/ },
  { id: 'first-person-zh', pattern: /(我做了|我去了|亲测|我试了|我的体验|真实评价)/ },
  // Promotion / advertising / contact-me.
  { id: 'promotion', pattern: /(할인|이벤트|강추|추천합니다|예약\s?문의|카톡|discount|promo|coupon|best clinic|highly recommend|DM me|割引|おすすめです|最安|优惠|折扣|强烈推荐|推荐这家|微信)/i },
  { id: 'link', pattern: /https?:\/\//i },
  // Medical efficacy / safety claims.
  { id: 'medical-claim', pattern: /(부작용\s?(없|제로)|안전합니다|효과\s?(보장|확실)|통증\s?없|no side effects|painless|guaranteed|100%\s?safe|副作用(は)?(ない|なし)|痛くない|効果抜群|无副作用|不疼|保证效果)/i },
]

export type SeedValidationIssue = { key: string; message: string }

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value))
}

/** Returns the ids of every forbidden pattern the text matches. */
export function findForbiddenPhrases(text: string): string[] {
  return FORBIDDEN_PATTERNS.filter(({ pattern }) => pattern.test(text)).map(({ id }) => id)
}

/**
 * Validates the whole content file. An empty array means the file is safe to
 * seed. Checks: shape, language/kind/topic values, length, duplicate keys /
 * ids / texts, trust patterns, and official sources on every `fact`.
 */
export function validateSeedContent(raw: unknown): SeedValidationIssue[] {
  const issues: SeedValidationIssue[] = []
  if (!isRecord(raw)) return [{ key: '(root)', message: 'content must be an object' }]
  if (typeof raw.authorHandle !== 'string' || !raw.authorHandle) {
    issues.push({ key: '(root)', message: 'authorHandle is required' })
  }
  if (!Array.isArray(raw.items) || raw.items.length === 0) {
    issues.push({ key: '(root)', message: 'items must be a non-empty array' })
    return issues
  }

  const seenKeys = new Set<string>()
  const seenIds = new Set<string>()
  const seenTexts = new Set<string>()

  raw.items.forEach((entry, index) => {
    const key = isRecord(entry) && typeof entry.key === 'string' && entry.key ? entry.key : `#${index}`
    const push = (message: string) => issues.push({ key, message })
    if (!isRecord(entry)) return push('item must be an object')

    if (typeof entry.key !== 'string' || !/^[a-z0-9-]+$/.test(entry.key)) push('key must be kebab-case')
    else if (seenKeys.has(entry.key)) push('duplicate key')
    else seenKeys.add(entry.key)

    if (typeof entry.clientPostId !== 'string' || !SEED_CLIENT_POST_ID_PATTERN.test(entry.clientPostId)) {
      push('clientPostId must match /^[\\w-]{12,128}$/')
    } else if (seenIds.has(entry.clientPostId)) push('duplicate clientPostId')
    else seenIds.add(entry.clientPostId)

    if (!SEED_LANGUAGES.includes(entry.language as SeedLanguage)) push(`language must be one of ${SEED_LANGUAGES.join(', ')}`)
    if (!SEED_KINDS.includes(entry.kind as SeedKind)) push(`kind must be one of ${SEED_KINDS.join(', ')}`)
    if (!SEED_TOPICS.includes(entry.topic as SeedTopic)) push(`topic must be one of ${SEED_TOPICS.join(', ')}`)

    const text = typeof entry.text === 'string' ? entry.text : ''
    if (!text.trim()) push('text is required')
    if (text.length > SEED_MAX_TEXT_LENGTH) push(`text exceeds ${SEED_MAX_TEXT_LENGTH} characters`)
    if (text !== text.trim()) push('text must not have leading/trailing whitespace')
    const normalized = text.replace(/\s+/g, ' ').trim()
    if (normalized && seenTexts.has(normalized)) push('duplicate text')
    else if (normalized) seenTexts.add(normalized)

    for (const id of findForbiddenPhrases(text)) push(`forbidden phrase (${id})`)

    if (entry.kind === 'question' && !/[?？]/.test(text)) push('question must contain a question mark')

    const sources = entry.sources
    if (entry.kind === 'fact') {
      if (!Array.isArray(sources) || sources.length === 0) push('fact requires at least one source')
    }
    if (sources !== undefined) {
      if (!Array.isArray(sources)) push('sources must be an array')
      else {
        for (const source of sources) {
          if (!isRecord(source) || typeof source.url !== 'string' || !/^https:\/\/[^\s]+$/.test(source.url)) {
            push('source.url must be an https URL')
          }
          if (!isRecord(source) || !isIsoDate(source.checkedAt)) push('source.checkedAt must be YYYY-MM-DD')
        }
      }
    }
  })

  return issues
}

// ── CLI ─────────────────────────────────────────────────────────────────────

export type SeedCliOptions = {
  apply: boolean
  authorUserId: string | null
  createAuthor: boolean
  allowProduction: boolean
  noDb: boolean
  contentPath: string | null
  help: boolean
}

export function parseSeedArgs(argv: string[]): SeedCliOptions {
  const options: SeedCliOptions = {
    apply: false,
    authorUserId: null,
    createAuthor: false,
    allowProduction: false,
    noDb: false,
    contentPath: null,
    help: false,
  }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    const takeValue = (flag: string): string => {
      const inline = arg.startsWith(`${flag}=`) ? arg.slice(flag.length + 1) : null
      if (inline !== null) return inline
      const next = argv[i + 1]
      if (next === undefined || next.startsWith('--')) throw new Error(`${flag} requires a value`)
      i += 1
      return next
    }
    if (arg === '--') continue
    else if (arg === '--apply') options.apply = true
    else if (arg === '--create-author') options.createAuthor = true
    else if (arg === '--i-know-this-is-production') options.allowProduction = true
    else if (arg === '--no-db') options.noDb = true
    else if (arg === '--help' || arg === '-h') options.help = true
    else if (arg === '--author-user-id' || arg.startsWith('--author-user-id=')) {
      options.authorUserId = takeValue('--author-user-id').trim() || null
    } else if (arg === '--content' || arg.startsWith('--content=')) {
      options.contentPath = takeValue('--content')
    } else throw new Error(`unknown argument: ${arg}`)
  }
  if (options.apply && options.noDb) throw new Error('--apply cannot be combined with --no-db')
  return options
}

/** Host part of a postgres URL, or null when it cannot be parsed. */
export function databaseHost(databaseUrl: string | undefined | null): string | null {
  if (!databaseUrl) return null
  try {
    return new URL(databaseUrl).hostname || null
  } catch {
    return null
  }
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]'])

export function isLocalDatabaseUrl(databaseUrl: string | undefined | null): boolean {
  const host = databaseHost(databaseUrl)
  return host !== null && LOCAL_HOSTS.has(host.toLowerCase())
}

/**
 * Production guard: a non-local (or unparseable) DATABASE_URL is refused
 * unless the operator passed --i-know-this-is-production. Returns an error
 * message to print, or null when the run may proceed.
 */
export function productionGuardError(databaseUrl: string | undefined | null, allowProduction: boolean): string | null {
  if (isLocalDatabaseUrl(databaseUrl)) return null
  if (allowProduction) return null
  const host = databaseHost(databaseUrl) ?? '(unset or unparseable)'
  return `DATABASE_URL host is ${host}, not localhost/127.0.0.1. Re-run with --i-know-this-is-production if this is intended.`
}

export type ExistingPost = { id: string; authorId: string }

export type SeedPlanEntry = {
  item: SeedItem
  action: 'create' | 'skip-existing' | 'skip-conflict'
}

/**
 * Decides per item whether to create it. An id that already exists for the
 * seed author is skipped (idempotent re-run); an id owned by someone else is a
 * conflict and is also skipped, never overwritten.
 */
export function planSeed(items: SeedItem[], existing: ExistingPost[], authorId: string | null): SeedPlanEntry[] {
  const byId = new Map(existing.map((post) => [post.id, post]))
  return items.map((item) => {
    const found = byId.get(item.clientPostId)
    if (!found) return { item, action: 'create' as const }
    if (authorId && found.authorId === authorId) return { item, action: 'skip-existing' as const }
    return { item, action: 'skip-conflict' as const }
  })
}

/**
 * Publish order. Posts are inserted one by one with the real clock, so the
 * last insert is the newest in the feed. Inserting in reverse keeps the file's
 * first item at the top of the feed.
 */
export function publishOrder<T>(entries: T[]): T[] {
  return [...entries].reverse()
}

export function summarizeByLanguage(items: SeedItem[]): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const item of items) counts[item.language] = (counts[item.language] ?? 0) + 1
  return counts
}

export function previewText(text: string, max = 48): string {
  const flat = text.replace(/\s+/g, ' ')
  const chars = Array.from(flat)
  return chars.length <= max ? flat : `${chars.slice(0, max).join('')}…`
}
