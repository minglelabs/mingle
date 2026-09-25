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

// ─── Test helper: clear in-flight map ────────────────────────────────────────

export function __testClearInFlightRequests(): void {
  inFlightRequests.clear()
}

export function __testGetInFlightCount(): number {
  return inFlightRequests.size
}
