import type { PersonaDraft, PersonaFieldError } from './persona-rules'

/** Wire shapes of the `/admin/operators/api/**` endpoints (shared by the routes and the admin pages). */

export type PersonaDraftsResponse = { drafts: PersonaDraft[]; missing: number }

export type CreateOperatorItemResult =
  | { index: number; ok: true; userId: string; handle: string; requestedHandle: string; bioQueued: boolean }
  | { index: number; ok: false; error: 'invalid_draft' | 'handle_unavailable' | 'create_failed'; errors?: PersonaFieldError[] }

export type CreateOperatorsResponse = { results: CreateOperatorItemResult[] }

export type OperatorApiError = { error: string; errors?: PersonaFieldError[] }

export type OperatorAvatarResponse = { image: string }
