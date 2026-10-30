/**
 * Pure state rules of the operator post composer (`/admin/posts`), kept out
 * of React so they can be unit-tested.
 *
 * The one rule that matters most: with "페르소나 언어로 변환" on, an item can
 * only be submitted with a conversion made for its CURRENT text and operator
 * — so what staff saw in the preview is exactly what gets queued.
 */
import {
  OPERATOR_POST_PUBLISH_NOW,
  type OperatorPostBatchCreateResponse,
  type OperatorPostBatchItemInput,
  type OperatorPostInvalidReason,
} from '@/server/operator-posts/types'
import { parseKstInputValue, roundUpToMinutes, toKstInputValue } from './kst'

export type ScheduleMode = 'spread' | 'now' | 'at'

export type ComposerPhoto = {
  /** The prepared (re-encoded JPEG) file; kept so a new operator can get its own upload. */
  file: File
  previewUrl: string
  status: 'waiting' | 'uploading' | 'ready' | 'error'
  /** The operator the uploaded key was minted for. */
  forOperatorId: string | null
  imageObjectKey: string | null
  width: number | null
  height: number | null
  error: string | null
}

export type ComposerConversion = {
  status: 'converting' | 'ready' | 'error'
  forText: string
  forOperatorId: string
  text: string | null
  language: string | null
  converted: boolean
  error: string | null
}

export type ComposerItem = {
  key: string
  operatorId: string | null
  text: string
  convert: boolean
  conversion: ComposerConversion | null
  photo: ComposerPhoto | null
  photoPreparing: boolean
  photoError: string | null
  /** A post-background catalog key, or null for "자동" (random at publish). */
  backgroundKey: string | null
  /** KST wall time for "시간 지정" ("YYYY-MM-DDTHH:mm"). */
  publishAt: string
  /** Why the server refused this item on the last submit. */
  rejection: OperatorPostInvalidReason | null
}

export function newComposerItem(key: string, operatorId: string | null, publishAt = ''): ComposerItem {
  return {
    key,
    operatorId,
    text: '',
    convert: true,
    conversion: null,
    photo: null,
    photoPreparing: false,
    photoError: null,
    backgroundKey: null,
    publishAt,
    rejection: null,
  }
}

export function hasText(text: string): boolean {
  return text.trim().length > 0
}

/** The conversion was made for the item's current text and operator. */
export function conversionIsCurrent(item: ComposerItem): boolean {
  const conversion = item.conversion
  return (
    !!conversion &&
    conversion.status === 'ready' &&
    conversion.forText === item.text &&
    conversion.forOperatorId === item.operatorId
  )
}

/** Whether the item still needs a (fresh) conversion before it can be submitted. */
export function needsConversion(item: ComposerItem): boolean {
  if (!item.convert || !hasText(item.text) || !item.operatorId) return false
  if (conversionIsCurrent(item)) return false
  const conversion = item.conversion
  const inFlight =
    conversion?.status === 'converting' &&
    conversion.forText === item.text &&
    conversion.forOperatorId === item.operatorId
  return !inFlight
}

/** The text that will be posted: the conversion (when converting) or the original; null for photo-only. */
export function finalText(item: ComposerItem): string | null {
  if (!hasText(item.text)) return null
  if (!item.convert) return item.text
  return conversionIsCurrent(item) ? item.conversion?.text ?? null : null
}

/** The uploaded photo belongs to the item's current operator. */
export function photoIsCurrent(item: ComposerItem): boolean {
  return !!item.photo && item.photo.status === 'ready' && item.photo.forOperatorId === item.operatorId
}

export type ItemIssue =
  | 'operator'
  | 'content'
  | 'photo_pending'
  | 'photo_error'
  | 'converting'
  | 'needs_conversion'
  | 'conversion_error'
  | 'too_long'
  | 'publish_at'

const ITEM_ISSUE_LABEL: Record<Exclude<ItemIssue, 'too_long'>, string> = {
  operator: '운영 계정을 골라 주세요.',
  content: '내용이나 사진을 넣어 주세요.',
  photo_pending: '사진을 올리는 중이에요.',
  photo_error: '사진을 올리지 못했어요. 다시 시도하거나 사진을 빼 주세요.',
  converting: '변환 중이에요.',
  needs_conversion: '변환 미리보기를 먼저 만들어 주세요.',
  conversion_error: '변환하지 못했어요. 다시 변환하거나 변환을 꺼 주세요.',
  publish_at: '게시 시간을 골라 주세요.',
}

export function itemIssueLabel(issue: ItemIssue, textMax: number): string {
  return issue === 'too_long' ? `게시될 내용이 ${textMax}자를 넘어요.` : ITEM_ISSUE_LABEL[issue]
}

/** The first thing that blocks submitting this item, or null when it is ready. */
export function itemIssue(item: ComposerItem, options: { textMax: number; mode: ScheduleMode }): ItemIssue | null {
  if (!item.operatorId) return 'operator'
  const text = hasText(item.text)
  if (!text && !item.photo) return item.photoPreparing ? 'photo_pending' : 'content'
  if (item.photoPreparing) return 'photo_pending'
  if (item.photo) {
    if (item.photo.status === 'error') return 'photo_error'
    if (!photoIsCurrent(item)) return 'photo_pending'
  }
  if (text && item.convert && !conversionIsCurrent(item)) {
    const conversion = item.conversion
    const current = conversion?.forText === item.text && conversion?.forOperatorId === item.operatorId
    if (current && conversion?.status === 'converting') return 'converting'
    if (current && conversion?.status === 'error') return 'conversion_error'
    return 'needs_conversion'
  }
  const posted = finalText(item)
  if (posted !== null && posted.length > options.textMax) return 'too_long'
  if (options.mode === 'at' && !parseKstInputValue(item.publishAt)) return 'publish_at'
  return null
}

/** The `items` array of `POST /admin/posts/api/batches`, in composer order. */
export function buildBatchItems(items: readonly ComposerItem[], mode: ScheduleMode): OperatorPostBatchItemInput[] {
  return items.map((item) => {
    const photo = item.photo && photoIsCurrent(item) ? item.photo : null
    const at = mode === 'at' ? parseKstInputValue(item.publishAt) : null
    return {
      operatorUserId: item.operatorId ?? '',
      text: finalText(item),
      imageObjectKey: photo?.imageObjectKey ?? null,
      imageWidth: photo?.width ?? null,
      imageHeight: photo?.height ?? null,
      backgroundKey: item.backgroundKey,
      publishAt: mode === 'now' ? OPERATOR_POST_PUBLISH_NOW : at ? at.toISOString() : null,
    }
  })
}

export type BatchOutcome = {
  /** Keys of the items the server queued. */
  queuedKeys: Set<string>
  /** Why the server refused the other items, by item key. */
  rejections: Map<string, OperatorPostInvalidReason>
}

/** Map the per-index result of a submit back onto the submitted items' keys. */
export function batchOutcome(submitted: readonly ComposerItem[], response: OperatorPostBatchCreateResponse): BatchOutcome {
  const queuedKeys = new Set<string>()
  const rejections = new Map<string, OperatorPostInvalidReason>()
  for (const result of response.items) {
    const item = submitted[result.index]
    if (!item) continue
    if (result.state === 'queued') queuedKeys.add(item.key)
    else rejections.set(item.key, result.reason)
  }
  return { queuedKeys, rejections }
}

/**
 * After a submit: queued items leave the composer, refused ones stay with
 * their reason so staff can fix and resubmit them. Applied to the CURRENT
 * items, so an upload that finished meanwhile is kept.
 */
export function mergeBatchOutcome(items: readonly ComposerItem[], outcome: BatchOutcome): ComposerItem[] {
  return items
    .filter((item) => !outcome.queuedKeys.has(item.key))
    .map((item) => {
      const rejection = outcome.rejections.get(item.key)
      return rejection ? { ...item, rejection } : item
    })
}

/** Default "시간 지정" times: each empty item 30 minutes after the one before, the first one at the next 10 minutes after an hour from now. */
export function fillPublishTimes(items: readonly ComposerItem[], nowMs: number): ComposerItem[] {
  let previous: Date | null = null
  return items.map((item) => {
    const own = parseKstInputValue(item.publishAt)
    if (own) {
      previous = own
      return item
    }
    const next: Date = previous
      ? new Date(previous.getTime() + 30 * 60_000)
      : roundUpToMinutes(new Date(nowMs + 60 * 60_000), 10)
    previous = next
    return { ...item, publishAt: toKstInputValue(next) }
  })
}
