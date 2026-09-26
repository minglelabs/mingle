/**
 * Post / comment translation service.
 *
 * Uses the pure translateTexts() engine. DB access is behind injectable
 * repository interfaces so this module can be tested without Prisma and
 * wired up to the real DB in a later Phase.
 */

import { translateTexts, type TranslateTextsInput } from './translate-texts'
import { canonicalizeTranslationLanguageCode } from '@/lib/translation-languages'
import { normalizeTargetLanguages, parseTranslations } from '@/app/api/translate/finalize/utils'

// ─── Constants ───────────────────────────────────────────────────────────────

export const DEFAULT_POST_TRANSLATION_LANGUAGES = ['en', 'zh-CN', 'ja', 'ko'] as const

export type PostTranslationStatus = 'pending' | 'ready' | 'failed'

// ─── Repository interfaces (injected, no Prisma direct import) ──────────────

export type PostTranslationRecord = {
  postId: string
  bodyVersion: number
  language: string
  status: PostTranslationStatus
  text: string | null
}

export type PostTranslationRepository = {
  /** Upsert a translation row, returning the current record. */
  upsert(args: {
    postId: string
    bodyVersion: number
    language: string
    status: PostTranslationStatus
    text: string | null
  }): Promise<PostTranslationRecord>

  /** Find existing translations for a post (any body version). */
  findByPost(postId: string): Promise<PostTranslationRecord[]>

  /** Find a specific translation. */
  find(postId: string, bodyVersion: number, language: string): Promise<PostTranslationRecord | null>

  /** Find all translations for a specific bodyVersion. */
  findByPostVersion(postId: string, bodyVersion: number): Promise<PostTranslationRecord[]>

  /**
   * Atomically write a settled set of translation rows for one bodyVersion.
   * Used by the settle-then-commit publish/edit paths so the body and its
   * translations become visible together. Implementations run this in a
   * transaction; the in-memory test repo writes them synchronously.
   */
  replaceVersionTranslations(args: {
    postId: string
    bodyVersion: number
    rows: Array<{ language: string; status: PostTranslationStatus; text: string | null }>
  }): Promise<void>
}

export type CommentTranslationRecord = {
  commentId: string
  bodyVersion: number
  language: string
  status: PostTranslationStatus
  text: string | null
}

export type CommentTranslationRepository = {
  upsert(args: {
    commentId: string
    bodyVersion: number
    language: string
    status: PostTranslationStatus
    text: string | null
  }): Promise<CommentTranslationRecord>

  find(commentId: string, bodyVersion: number, language: string): Promise<CommentTranslationRecord | null>

  findByCommentVersion(commentId: string, bodyVersion: number): Promise<CommentTranslationRecord[]>

  /** Find all translations for a comment (any body version). */
  findByComment(commentId: string): Promise<CommentTranslationRecord[]>

  /** Atomically write a settled set of translation rows for one bodyVersion. */
  replaceVersionTranslations(args: {
    commentId: string
    bodyVersion: number
    rows: Array<{ language: string; status: PostTranslationStatus; text: string | null }>
  }): Promise<void>
}

// ─── In-flight dedup map ─────────────────────────────────────────────────────

type InFlightKey = string

function buildInFlightKey(entityType: 'post' | 'comment', entityId: string, bodyVersion: number, language: string): InFlightKey {
  return `${entityType}:${entityId}:${bodyVersion}:${language}`
}

const inFlightRequests = new Map<InFlightKey, Promise<string | null>>()

// ─── Post translation prompt (preserves line breaks / paragraph structure) ───

function buildPostTranslationSystemPrompt(): string {
  return [
    'You are an expert translator for social media posts.',
    'Return ONLY strict JSON with keys exactly matching target language codes.',
    'No explanations, no markdown, no extra keys.',
    'Always translate the ENTIRE text as a standalone translation for each target language.',
    'IMPORTANT: Preserve the original line breaks, empty lines, and paragraph structure exactly as they appear in the source text. Do not merge paragraphs or remove blank lines.',
  ].join('\n')
}

function buildPostTranslationUserPrompt(text: string, sourceLanguage: string, targetLanguages: string[]): string {
  return [
    `source=${sourceLanguage}`,
    `targets=${targetLanguages.join(', ')}`,
    `text="${text}"`,
  ].join('\n')
}

// ─── Comment translation prompt (also preserves structure) ───────────────────

function buildCommentTranslationSystemPrompt(): string {
  return [
    'You are an expert translator for social media comments.',
    'Return ONLY strict JSON with keys exactly matching target language codes.',
    'No explanations, no markdown, no extra keys.',
    'Always translate the ENTIRE text as a standalone translation for each target language.',
    'IMPORTANT: Preserve the original line breaks and paragraph structure exactly as they appear in the source text.',
  ].join('\n')
}

function buildCommentTranslationUserPrompt(text: string, sourceLanguage: string, targetLanguages: string[]): string {
  return [
    `source=${sourceLanguage}`,
    `targets=${targetLanguages.join(', ')}`,
    `text="${text}"`,
  ].join('\n')
}

// ─── Resolve default target languages ────────────────────────────────────────

export function resolveDefaultPostTranslationLanguages(sourceLanguage: string): string[] {
  const canonicalSource = canonicalizeTranslationLanguageCode(sourceLanguage)
  return DEFAULT_POST_TRANSLATION_LANGUAGES.filter((lang) => lang !== canonicalSource)
}

// ─── Single-language translation (with in-flight dedup) ──────────────────────

async function translateSinglePostLanguage(
  repo: PostTranslationRepository,
  postId: string,
  bodyVersion: number,
  sourceText: string,
  sourceLanguage: string,
  language: string,
  modelSelection?: TranslateTextsInput['modelSelection'],
): Promise<string | null> {
  const key = buildInFlightKey('post', postId, bodyVersion, language)

  // Return existing in-flight promise if one exists (dedup)
  const existing = inFlightRequests.get(key)
  if (existing) return existing

  const promise = (async () => {
    try {
      // Mark as pending
      await repo.upsert({
        postId,
        bodyVersion,
        language,
        status: 'pending',
        text: null,
      })

      const result = await translateTexts({
        text: sourceText,
        sourceLanguage,
        targetLanguages: [language],
        modelSelection,
        isFinal: true,
        systemPromptOverride: buildPostTranslationSystemPrompt(),
        userPromptOverride: buildPostTranslationUserPrompt(sourceText, sourceLanguage, [language]),
      })

      const translatedText = result.translations[language]
      if (!translatedText) {
        // bodyVersion guard: only update if still current
        const current = await repo.find(postId, bodyVersion, language)
        if (current && current.bodyVersion === bodyVersion) {
          await repo.upsert({
            postId,
            bodyVersion,
            language,
            status: 'failed',
            text: null,
          })
        }
        return null
      }

      // bodyVersion guard: verify we're still writing for the expected version
      const current = await repo.find(postId, bodyVersion, language)
      if (current && current.bodyVersion === bodyVersion) {
        await repo.upsert({
          postId,
          bodyVersion,
          language,
          status: 'ready',
          text: translatedText,
        })
      }

      return translatedText
    } catch {
      // Mark as failed if this bodyVersion is still current
      try {
        const current = await repo.find(postId, bodyVersion, language)
        if (current && current.bodyVersion === bodyVersion) {
          await repo.upsert({
            postId,
            bodyVersion,
            language,
            status: 'failed',
            text: null,
          })
        }
      } catch {
        // ignore nested error
      }
      return null
    } finally {
      inFlightRequests.delete(key)
    }
  })()

  inFlightRequests.set(key, promise)
  return promise
}

async function translateSingleCommentLanguage(
  repo: CommentTranslationRepository,
  commentId: string,
  bodyVersion: number,
  sourceText: string,
  sourceLanguage: string,
  language: string,
  modelSelection?: TranslateTextsInput['modelSelection'],
): Promise<string | null> {
  const key = buildInFlightKey('comment', commentId, bodyVersion, language)

  const existing = inFlightRequests.get(key)
  if (existing) return existing

  const promise = (async () => {
    try {
      await repo.upsert({
        commentId,
        bodyVersion,
        language,
        status: 'pending',
        text: null,
      })

      const result = await translateTexts({
        text: sourceText,
        sourceLanguage,
        targetLanguages: [language],
        modelSelection,
        isFinal: true,
        systemPromptOverride: buildCommentTranslationSystemPrompt(),
        userPromptOverride: buildCommentTranslationUserPrompt(sourceText, sourceLanguage, [language]),
      })

      const translatedText = result.translations[language]
      if (!translatedText) {
        const current = await repo.find(commentId, bodyVersion, language)
        if (current && current.bodyVersion === bodyVersion) {
          await repo.upsert({
            commentId,
            bodyVersion,
            language,
            status: 'failed',
            text: null,
          })
        }
        return null
      }

      const current = await repo.find(commentId, bodyVersion, language)
      if (current && current.bodyVersion === bodyVersion) {
        await repo.upsert({
          commentId,
          bodyVersion,
          language,
          status: 'ready',
          text: translatedText,
        })
      }

      return translatedText
    } catch {
      try {
        const current = await repo.find(commentId, bodyVersion, language)
        if (current && current.bodyVersion === bodyVersion) {
          await repo.upsert({
            commentId,
            bodyVersion,
            language,
            status: 'failed',
            text: null,
          })
        }
      } catch {
        // ignore
      }
      return null
    } finally {
      inFlightRequests.delete(key)
    }
  })()

  inFlightRequests.set(key, promise)
  return promise
}

// ─── Public API ──────────────────────────────────────────────────────────────

export type PostTranslationServiceDeps = {
  postTranslationRepo: PostTranslationRepository
  commentTranslationRepo: CommentTranslationRepository
}

/**
 * Translate a post's body on publish.
 * Generates translations for DEFAULT_POST_TRANSLATION_LANGUAGES minus sourceLanguage.
 */
export async function translatePostOnPublish(
  deps: PostTranslationServiceDeps,
  args: {
    postId: string
    bodyVersion: number
    sourceText: string
    sourceLanguage: string
    modelSelection?: TranslateTextsInput['modelSelection']
  },
): Promise<Record<string, string | null>> {
  const targetLanguages = resolveDefaultPostTranslationLanguages(args.sourceLanguage)
  const results: Record<string, string | null> = {}

  await Promise.allSettled(
    targetLanguages.map(async (lang) => {
      results[lang] = await translateSinglePostLanguage(
        deps.postTranslationRepo,
        args.postId,
        args.bodyVersion,
        args.sourceText,
        args.sourceLanguage,
        lang,
        args.modelSelection,
      )
    }),
  )

  return results
}

/**
 * Translate a post to a specific language on demand.
 * Returns cached translation if already ready; retries if previously failed.
 */
export async function translatePostOnDemand(
  deps: PostTranslationServiceDeps,
  args: {
    postId: string
    bodyVersion: number
    sourceText: string
    sourceLanguage: string
    language: string
    modelSelection?: TranslateTextsInput['modelSelection']
  },
): Promise<string | null> {
  const { postTranslationRepo } = deps

  // Check if already translated for this version
  const existing = await postTranslationRepo.find(args.postId, args.bodyVersion, args.language)
  if (existing && existing.status === 'ready' && existing.text) {
    return existing.text
  }

  // If pending (in-flight), the in-flight dedup will share the promise
  // If failed, retry
  return translateSinglePostLanguage(
    postTranslationRepo,
    args.postId,
    args.bodyVersion,
    args.sourceText,
    args.sourceLanguage,
    args.language,
    args.modelSelection,
  )
}

/**
 * Re-translate a post after body edit.
 * Re-translates default 4 languages + any language that already had a translation
 * for a previous bodyVersion. Uses the new bodyVersion to guard against stale writes.
 */
export async function retranslatePostOnEdit(
  deps: PostTranslationServiceDeps,
  args: {
    postId: string
    newBodyVersion: number
    sourceText: string
    sourceLanguage: string
    modelSelection?: TranslateTextsInput['modelSelection']
  },
): Promise<Record<string, string | null>> {
  const { postTranslationRepo } = deps

  // Gather all languages that previously had translations
  const existingTranslations = await postTranslationRepo.findByPost(args.postId)
  const previousLanguages = new Set(existingTranslations.map((t) => t.language))

  // Merge with default languages
  const defaultLanguages = resolveDefaultPostTranslationLanguages(args.sourceLanguage)
  for (const lang of defaultLanguages) {
    previousLanguages.add(lang)
  }

  // Remove source language
  const canonicalSource = canonicalizeTranslationLanguageCode(args.sourceLanguage)
  previousLanguages.delete(canonicalSource)

  const allTargetLanguages = Array.from(previousLanguages)
  const results: Record<string, string | null> = {}

  await Promise.allSettled(
    allTargetLanguages.map(async (lang) => {
      results[lang] = await translateSinglePostLanguage(
        postTranslationRepo,
        args.postId,
        args.newBodyVersion,
        args.sourceText,
        args.sourceLanguage,
        lang,
        args.modelSelection,
      )
    }),
  )

  return results
}

/**
 * Translate a comment on demand.
 */
export async function translateCommentOnDemand(
  deps: PostTranslationServiceDeps,
  args: {
    commentId: string
    bodyVersion: number
    sourceText: string
    sourceLanguage: string
    language: string
    modelSelection?: TranslateTextsInput['modelSelection']
  },
): Promise<string | null> {
  const { commentTranslationRepo } = deps

  const existing = await commentTranslationRepo.find(args.commentId, args.bodyVersion, args.language)
  if (existing && existing.status === 'ready' && existing.text) {
    return existing.text
  }

  return translateSingleCommentLanguage(
    commentTranslationRepo,
    args.commentId,
    args.bodyVersion,
    args.sourceText,
    args.sourceLanguage,
    args.language,
    args.modelSelection,
  )
}

// ─── Settle-then-commit translation (planning policy) ────────────────────────
//
// The planning policy publishes a post/comment only AFTER its default-language
// translations have settled (each either ready or failed), and on edit replaces
// the body + all its translations atomically. To make that possible the caller
// needs the settled translation rows BEFORE it writes anything to the DB, so
// these helpers translate purely in memory (no repository writes) and hand back
// rows the caller then persists inside its own transaction.

/** Overall wall-clock budget for a settle-then-commit translation batch. */
export const SETTLE_TRANSLATION_BUDGET_MS = 15_000

export type SettledTranslationRow = {
  language: string
  status: 'ready' | 'failed'
  text: string | null
}

/**
 * Translate one language, resolving to a settled row instead of writing to a
 * repository. A provider failure or empty result becomes status 'failed' with
 * null text — never thrown, so one failing language cannot sink the batch.
 */
async function translateSettledLanguage(
  sourceText: string,
  sourceLanguage: string,
  language: string,
  systemPrompt: string,
  userPromptFor: (lang: string) => string,
  modelSelection?: TranslateTextsInput['modelSelection'],
): Promise<SettledTranslationRow> {
  try {
    const result = await translateTexts({
      text: sourceText,
      sourceLanguage,
      targetLanguages: [language],
      modelSelection,
      isFinal: true,
      systemPromptOverride: systemPrompt,
      userPromptOverride: userPromptFor(language),
    })
    const text = result.translations[language]
    if (text) return { language, status: 'ready', text }
    return { language, status: 'failed', text: null }
  } catch {
    return { language, status: 'failed', text: null }
  }
}

/**
 * Race the whole batch against a wall-clock budget. Languages that have not
 * settled when the budget expires are recorded as 'failed' (their late result
 * is discarded), so publishing is never blocked past the cap.
 */
async function settleWithinBudget(
  languages: string[],
  translateOne: (language: string) => Promise<SettledTranslationRow>,
  budgetMs: number,
): Promise<SettledTranslationRow[]> {
  const settled = new Map<string, SettledTranslationRow>()

  const work = languages.map(async (language) => {
    const row = await translateOne(language)
    // Only record if the budget has not already timed this language out.
    if (!settled.has(language)) settled.set(language, row)
  })

  let timer: ReturnType<typeof setTimeout> | undefined
  const budget = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, budgetMs)
  })

  await Promise.race([Promise.allSettled(work), budget])
  if (timer) clearTimeout(timer)

  // Any language not settled by the deadline is failed.
  return languages.map(
    (language) => settled.get(language) ?? { language, status: 'failed' as const, text: null },
  )
}

/**
 * Translate a post body to the given target languages, purely in memory.
 * Returns one settled row per language (never throws). The caller persists
 * these rows transactionally alongside the post row / body update.
 */
export async function translatePostBodySettled(args: {
  sourceText: string
  sourceLanguage: string
  targetLanguages: string[]
  budgetMs?: number
  modelSelection?: TranslateTextsInput['modelSelection']
}): Promise<SettledTranslationRow[]> {
  const targets = args.targetLanguages.filter(Boolean)
  if (targets.length === 0) return []
  const systemPrompt = buildPostTranslationSystemPrompt()
  return settleWithinBudget(
    targets,
    (language) =>
      translateSettledLanguage(
        args.sourceText,
        args.sourceLanguage,
        language,
        systemPrompt,
        (lang) => buildPostTranslationUserPrompt(args.sourceText, args.sourceLanguage, [lang]),
        args.modelSelection,
      ),
    args.budgetMs ?? SETTLE_TRANSLATION_BUDGET_MS,
  )
}

/** Same as translatePostBodySettled but with the comment prompt. */
export async function translateCommentBodySettled(args: {
  sourceText: string
  sourceLanguage: string
  targetLanguages: string[]
  budgetMs?: number
  modelSelection?: TranslateTextsInput['modelSelection']
}): Promise<SettledTranslationRow[]> {
  const targets = args.targetLanguages.filter(Boolean)
  if (targets.length === 0) return []
  const systemPrompt = buildCommentTranslationSystemPrompt()
  return settleWithinBudget(
    targets,
    (language) =>
      translateSettledLanguage(
        args.sourceText,
        args.sourceLanguage,
        language,
        systemPrompt,
        (lang) => buildCommentTranslationUserPrompt(args.sourceText, args.sourceLanguage, [lang]),
        args.modelSelection,
      ),
    args.budgetMs ?? SETTLE_TRANSLATION_BUDGET_MS,
  )
}

/**
 * Compute the full set of target languages for a post edit: the default 4
 * (minus the new source language) unioned with every language that already had
 * a translation on the post, minus the source. Pure — the caller supplies the
 * existing languages so this can run before or inside a transaction.
 */
export function resolveEditTargetLanguages(sourceLanguage: string, existingLanguages: string[]): string[] {
  const canonicalSource = canonicalizeTranslationLanguageCode(sourceLanguage)
  const set = new Set<string>(existingLanguages)
  for (const lang of resolveDefaultPostTranslationLanguages(sourceLanguage)) set.add(lang)
  set.delete(canonicalSource)
  return Array.from(set)
}

// ─── Test helper: clear in-flight map ────────────────────────────────────────

export function __testClearInFlightRequests(): void {
  inFlightRequests.clear()
}

export function __testGetInFlightCount(): number {
  return inFlightRequests.size
}
