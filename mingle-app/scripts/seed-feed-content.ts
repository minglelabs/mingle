/**
 * Posting-feed launch seed (checklist 83-85).
 *
 * Run from mingle-app (always through the launcher, which wires the `@/` alias):
 *   node scripts/run-with-env-local.mjs node scripts/seed-feed-content.mjs            # dry-run (default)
 *   node scripts/run-with-env-local.mjs node scripts/seed-feed-content.mjs --apply    # write
 *
 * Flags:
 *   --apply                       write posts (default is a read-only dry-run)
 *   --author-user-id <id>         author account id (default: look up handle mingle_team)
 *   --create-author               create the mingle_team account (as an official account) when it does not exist
 *   --mark-official               mark the existing author account as official (User.isOfficial) and exit; no posts
 *   --i-know-this-is-production   allow a DATABASE_URL whose host is not localhost/127.0.0.1
 *   --no-db                       dry-run without touching the DB (content check + plan only)
 *   --content <path>              alternative content file (default content/feed-seed/posts.v1.json)
 *
 * Only posts are created. Likes, comments, views and counters are never
 * written (checklist 84): every seeded post starts at zero.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  parseSeedArgs,
  productionGuardError,
  validateSeedContent,
  planSeed,
  planMarkOfficial,
  publishOrder,
  summarizeByLanguage,
  previewText,
  databaseHost,
  SEED_DEFAULT_AUTHOR_HANDLE,
  SEED_DEFAULT_AUTHOR_NAME,
  type SeedContent,
  type SeedPlanEntry,
  type ExistingPost,
} from './seed-feed-content.logic'

const DEFAULT_CONTENT_PATH = resolve(process.cwd(), 'content/feed-seed/posts.v1.json')

const HELP = `Usage: node scripts/run-with-env-local.mjs node scripts/seed-feed-content.mjs [--apply] [--author-user-id <id>] [--create-author] [--mark-official] [--i-know-this-is-production] [--no-db] [--content <path>]`

function loadContent(path: string): SeedContent {
  const raw: unknown = JSON.parse(readFileSync(path, 'utf8'))
  const issues = validateSeedContent(raw)
  if (issues.length > 0) {
    for (const issue of issues) console.error(`  ✗ ${issue.key}: ${issue.message}`)
    throw new Error(`content validation failed (${issues.length} issue(s)) in ${path}`)
  }
  return raw as SeedContent
}

function printPlan(plan: SeedPlanEntry[], content: SeedContent): void {
  const counts = { create: 0, 'skip-existing': 0, 'skip-conflict': 0 }
  for (const entry of plan) {
    counts[entry.action] += 1
    const mark = entry.action === 'create' ? '+' : entry.action === 'skip-existing' ? '=' : '!'
    console.log(
      `  ${mark} ${entry.item.clientPostId}  ${entry.item.language.padEnd(5)} ${entry.item.kind.padEnd(8)} ${String(Array.from(entry.item.text).length).padStart(4)}자  ${previewText(entry.item.text)}`,
    )
  }
  const langs = Object.entries(summarizeByLanguage(content.items)).map(([k, v]) => `${k}=${v}`).join(' ')
  console.log(`\n  items=${plan.length} (${langs})  create=${counts.create}  skip-existing=${counts['skip-existing']}  skip-conflict=${counts['skip-conflict']}`)
  if (counts['skip-conflict'] > 0) {
    console.log('  ! skip-conflict: that post id already belongs to another user; it is left untouched.')
  }
}

async function main(): Promise<number> {
  const options = parseSeedArgs(process.argv.slice(2))
  if (options.help) {
    console.log(HELP)
    return 0
  }

  const contentPath = options.contentPath ? resolve(process.cwd(), options.contentPath) : DEFAULT_CONTENT_PATH
  const content = loadContent(contentPath)
  const mode = options.apply ? 'APPLY' : 'DRY-RUN'
  console.log(`[seed-feed] mode=${mode} content=${contentPath} items=${content.items.length}`)

  if (options.noDb) {
    console.log('[seed-feed] --no-db: DB not contacted; every item is shown as create.')
    printPlan(planSeed(content.items, [], null), content)
    return 0
  }

  // Guard BEFORE any DB connection is opened.
  const guard = productionGuardError(process.env.DATABASE_URL, options.allowProduction)
  if (guard) {
    console.error(`[seed-feed] refused: ${guard}`)
    return 2
  }
  console.log(`[seed-feed] database host=${databaseHost(process.env.DATABASE_URL)}`)

  // Imported lazily so --no-db / --help never load Prisma or the translator.
  const { prisma } = await import('@/lib/prisma')
  try {
    const handle = content.authorHandle || SEED_DEFAULT_AUTHOR_HANDLE
    const author = options.authorUserId
      ? await prisma.user.findUnique({
          where: { id: options.authorUserId },
          select: { id: true, handle: true, name: true, isDeleted: true, moderationRestrictedAt: true, isOfficial: true },
        })
      : await prisma.user.findUnique({
          where: { handle },
          select: { id: true, handle: true, name: true, isDeleted: true, moderationRestrictedAt: true, isOfficial: true },
        })

    if (options.markOfficial) {
      // Operator step (spec 84): flag an existing account so its posts,
      // comments and profile carry the "Official" badge. Display only.
      const action = planMarkOfficial(author)
      if (action === 'not-found') {
        console.error(`[seed-feed] refused: account ${options.authorUserId ?? `@${handle}`} not found`)
        return 2
      }
      if (!author) return 2
      if (action === 'already-official') {
        console.log(`[seed-feed] author id=${author.id} handle=@${author.handle} is already official. Nothing to do.`)
        return 0
      }
      if (!options.apply) {
        console.log(`[seed-feed] dry-run: would mark id=${author.id} handle=@${author.handle} as official. Re-run with --apply to write.`)
        return 0
      }
      await prisma.user.update({ where: { id: author.id }, data: { isOfficial: true }, select: { id: true } })
      console.log(`[seed-feed] marked id=${author.id} handle=@${author.handle} as official.`)
      return 0
    }

    if (options.authorUserId && !author) {
      console.error(`[seed-feed] refused: no user with id ${options.authorUserId}`)
      return 2
    }
    if (author?.isDeleted) {
      console.error(`[seed-feed] refused: author ${author.id} is deleted`)
      return 2
    }
    if (author?.moderationRestrictedAt) {
      console.error(`[seed-feed] refused: author ${author.id} is moderation-restricted`)
      return 2
    }
    if (author) {
      console.log(`[seed-feed] author id=${author.id} handle=@${author.handle} name=${author.name ?? '(none)'} official=${author.isOfficial}`)
      if (!author.isOfficial) {
        console.log('[seed-feed] note: the author is not marked official; run with --mark-official to show the "Official" badge.')
      }
    } else if (options.createAuthor) {
      console.log(`[seed-feed] author @${handle} not found → ${options.apply ? 'will be created' : 'would be created'} as official (name "${content.authorDisplayName || SEED_DEFAULT_AUTHOR_NAME}")`)
    } else {
      console.error(`[seed-feed] author @${handle} not found. Pass --author-user-id <id> or --create-author.`)
      if (options.apply) return 2
    }

    const ids = content.items.map((item) => item.clientPostId)
    const existing: ExistingPost[] = await prisma.post.findMany({
      where: { id: { in: ids } },
      select: { id: true, authorId: true },
    })
    const plan = planSeed(content.items, existing, author?.id ?? null)
    printPlan(plan, content)

    if (!options.apply) {
      console.log('\n[seed-feed] dry-run only. Nothing was written. Re-run with --apply to publish.')
      return 0
    }

    // ── APPLY ───────────────────────────────────────────────────────────────
    const authorId =
      author?.id ??
      (
        await prisma.user.create({
          // The seed author is the operator account: created as official so its
          // posts carry the "Official" badge (spec 84).
          data: { handle, name: content.authorDisplayName || SEED_DEFAULT_AUTHOR_NAME, isOfficial: true },
          select: { id: true },
        })
      ).id
    if (!author) console.log(`[seed-feed] created author id=${authorId} handle=@${handle}`)

    // Same publish pipeline as POST /api/posts: server language detection,
    // default 4-language settled translation, random background preset,
    // atomic post + translations insert.
    const { detectSourceLanguage } = await import('@/server/translation/detect-source-language')
    const { resolveDefaultPostTranslationLanguages, translatePostBodySettled } = await import(
      '@/server/translation/post-translation-service'
    )
    const { randomBackgroundKey } = await import('@/lib/post-backgrounds')

    let created = 0
    let failedTranslations = 0
    for (const entry of publishOrder(plan.filter((p) => p.action === 'create'))) {
      const { item } = entry
      const already = await prisma.post.findUnique({ where: { id: item.clientPostId }, select: { id: true } })
      if (already) {
        console.log(`  = ${item.clientPostId} appeared meanwhile, skipped`)
        continue
      }
      const detected = await detectSourceLanguage({ text: item.text, clientHint: item.language })
      if (detected !== item.language) {
        console.warn(`  ! ${item.clientPostId} declared=${item.language} detected=${detected ?? 'null'}`)
      }
      const targets = detected ? resolveDefaultPostTranslationLanguages(detected) : []
      const rows =
        detected && targets.length > 0
          ? await translatePostBodySettled({ sourceText: item.text, sourceLanguage: detected, targetLanguages: targets })
          : []
      const failed = rows.filter((row) => row.status !== 'ready').map((row) => row.language)
      failedTranslations += failed.length

      await prisma.$transaction(async (tx) => {
        const post = await tx.post.create({
          data: {
            id: item.clientPostId,
            authorId,
            sourceText: item.text,
            sourceLanguage: detected,
            backgroundKey: randomBackgroundKey(),
            imageObjectKey: null,
            visibility: 'public',
            bodyVersion: 1,
          },
        })
        if (rows.length > 0) {
          await tx.postTranslation.createMany({
            data: rows.map((row) => ({
              postId: post.id,
              bodyVersion: 1,
              language: row.language,
              status: row.status,
              text: row.text,
            })),
          })
        }
      })
      created += 1
      console.log(`  + ${item.clientPostId} lang=${detected} translations=${rows.length - failed.length}/${rows.length}${failed.length ? ` failed=${failed.join(',')}` : ''}`)
    }
    console.log(`\n[seed-feed] applied: created=${created} failedTranslations=${failedTranslations}`)
    if (failedTranslations > 0) {
      console.log('  failed translations are stored as status=failed, exactly like a post published from the app.')
    }
    return 0
  } finally {
    await prisma.$disconnect()
  }
}

main()
  .then((code) => process.exit(code))
  .catch((error: unknown) => {
    console.error(`[seed-feed] error: ${error instanceof Error ? error.message : String(error)}`)
    process.exit(1)
  })
