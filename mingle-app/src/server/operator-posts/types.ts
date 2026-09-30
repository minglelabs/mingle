/**
 * Wire types and limits for bulk posting as operator accounts (admin only).
 *
 * Client-safe on purpose: this module has NO runtime imports, so the admin
 * pages under `src/app/admin/posts/**` can import it without pulling Prisma
 * or any server code into the browser bundle. Keep it that way.
 */

/** Most items one batch may carry. */
export const OPERATOR_POST_BATCH_MAX_ITEMS = 100

/** Most jobs that may wait (queued or publishing) across all batches. */
export const OPERATOR_POST_QUEUE_MAX = 500

/** Longest text the persona-language converter accepts (the staff original, before conversion). */
export const OPERATOR_POST_CONVERT_INPUT_MAX = 2000

/** `publishAt` value of an item that should go out right away ("바로 게시"). */
export const OPERATOR_POST_PUBLISH_NOW = 'now'

/** Publish attempts per job before it is marked failed. */
export const OPERATOR_POST_MAX_ATTEMPTS = 5

/** Every state of `app_operator_post_jobs.state`. */
export type OperatorPostJobState =
  | 'queued'
  | 'publishing'
  | 'published'
  | 'duplicate'
  | 'conflict'
  | 'failed'
  | 'cancelled'

/** Why an item of a batch was not queued. */
export type OperatorPostInvalidReason =
  | 'invalid_item'
  | 'not_operator'
  | 'operator_inactive'
  | 'account_restricted'
  | 'text_or_image_required'
  | 'text_too_long'
  | 'invalid_image_key'
  | 'invalid_background'
  | 'invalid_publish_at'
  | 'publish_at_past'
  | 'publish_at_too_far'

/** One item of `POST /admin/posts/api/batches`. */
export type OperatorPostBatchItemInput = {
  operatorUserId: string
  text?: string | null
  imageObjectKey?: string | null
  imageWidth?: number | null
  imageHeight?: number | null
  /** A post-background catalog key; omitted = random at publish time. */
  backgroundKey?: string | null
  /** ISO time, `'now'` ("바로 게시"), or omitted = spread over the next 6 hours. */
  publishAt?: string | null
}

export type OperatorPostItemResult =
  | { index: number; state: 'queued'; jobId: string; clientPostId: string; publishAt: string }
  | { index: number; state: 'invalid'; reason: OperatorPostInvalidReason }

/** 202 body of `POST /admin/posts/api/batches`. `batchId` is null when nothing was queued. */
export type OperatorPostBatchCreateResponse = {
  batchId: string | null
  queued: number
  invalid: number
  items: OperatorPostItemResult[]
}

/** Error body of `POST /admin/posts/api/batches` (400 / 409). */
export type OperatorPostBatchCreateError =
  | { error: 'invalid_body' | 'no_items' | 'too_many_items'; limit?: number }
  | { error: 'queue_full'; limit: number; waiting: number }

/** An operator account as the admin post pages show it. */
export type OperatorPostIdentity = {
  id: string
  handle: string
  name: string | null
  image: string | null
  /** The persona language (`primaryLanguages[0]`), or null when the account has none. */
  language: string | null
}

/** A pickable operator for the composer. */
export type OperatorPostPickerEntry = OperatorPostIdentity & {
  isActive: boolean
  restricted: boolean
}

/** 200 body of `POST /admin/posts/api/convert`. */
export type OperatorPostConvertResponse = {
  /** The text to post (the original when no conversion was needed). */
  text: string
  /** The persona language the text is in. */
  language: string
  /** False when the text already was in the persona language. */
  converted: boolean
  /** The detected language of the original, when known. */
  sourceLanguage: string | null
}

/** 201 body of `POST /admin/posts/api/images`. */
export type OperatorPostImageUploadResponse = {
  imageObjectKey: string
  width: number
  height: number
}

export type OperatorPostJobDto = {
  id: string
  /** 1-based position of the item in the batch it was submitted with. */
  index: number
  clientPostId: string
  operator: OperatorPostIdentity | null
  text: string | null
  imageObjectKey: string | null
  backgroundKey: string | null
  publishAt: string
  state: OperatorPostJobState
  postId: string | null
  error: string | null
  attempts: number
  updatedAt: string
}

/** 200 body of `GET /admin/posts/api/batches/{batchId}`. */
export type OperatorPostBatchDetail = {
  batchId: string
  createdAt: string
  items: OperatorPostJobDto[]
}

export type OperatorPostBatchSummary = {
  batchId: string
  createdAt: string
  total: number
  counts: Partial<Record<OperatorPostJobState, number>>
  firstPublishAt: string
  lastPublishAt: string
  /** Up to five of the batch's operators. */
  operators: OperatorPostIdentity[]
  operatorCount: number
}

/** 200 body of `GET /admin/posts/api/batches`. */
export type OperatorPostBatchListResponse = {
  batches: OperatorPostBatchSummary[]
}

/** 200 body of `POST /admin/posts/api/batches/{batchId}` (cancel). */
export type OperatorPostCancelResponse = {
  cancelled: number
  batch: OperatorPostBatchDetail | null
}
