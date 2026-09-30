import type { PersonaFieldError } from '@/server/operators/persona-rules'

/** Browser helpers for `/admin/operators/api/**` (same origin; the admin cookie is scoped to /admin). */

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; error: string; errors: PersonaFieldError[] }

async function readResult<T>(response: Response): Promise<ApiResult<T>> {
  let payload: unknown = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }
  if (response.ok) return { ok: true, data: payload as T }
  const record = payload && typeof payload === 'object' ? payload as { error?: unknown; errors?: unknown } : {}
  return {
    ok: false,
    status: response.status,
    error: response.status === 401 ? 'unauthorized' : typeof record.error === 'string' ? record.error : 'request_failed',
    errors: Array.isArray(record.errors) ? record.errors as PersonaFieldError[] : [],
  }
}

export async function getJson<T>(url: string): Promise<ApiResult<T>> {
  try {
    const response = await fetch(url, { cache: 'no-store', credentials: 'same-origin' })
    return await readResult<T>(response)
  } catch {
    return { ok: false, status: 0, error: 'network', errors: [] }
  }
}

export async function sendJson<T>(url: string, body: unknown, method: 'POST' | 'PATCH' = 'POST'): Promise<ApiResult<T>> {
  try {
    const response = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
      credentials: 'same-origin',
    })
    return await readResult<T>(response)
  } catch {
    return { ok: false, status: 0, error: 'network', errors: [] }
  }
}

export const AVATAR_ACCEPT = 'image/jpeg,image/png,image/webp'
const AVATAR_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const AVATAR_MAX_BYTES = 10 * 1024 * 1024

/** Same limits as the server, checked before uploading so a bad file fails instantly. */
export function checkAvatarFile(file: File): string | null {
  if (!AVATAR_TYPES.has(file.type.toLowerCase())) return 'invalid_image'
  if (file.size <= 0) return 'invalid_image'
  if (file.size > AVATAR_MAX_BYTES) return 'image_too_large'
  return null
}

/** One request per photo (never a Server Action: their body limit is 1 MB). */
export async function uploadOperatorAvatar(userId: string, file: File): Promise<ApiResult<{ image: string }>> {
  const problem = checkAvatarFile(file)
  if (problem) return { ok: false, status: 400, error: problem, errors: [] }
  const form = new FormData()
  form.append('file', file)
  try {
    const response = await fetch(`/admin/operators/api/${encodeURIComponent(userId)}/avatar`, {
      method: 'POST',
      body: form,
      cache: 'no-store',
      credentials: 'same-origin',
    })
    return await readResult<{ image: string }>(response)
  } catch {
    return { ok: false, status: 0, error: 'network', errors: [] }
  }
}
