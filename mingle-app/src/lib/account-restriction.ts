/**
 * Client-safe single source for the "restricted account" error the posting
 * write APIs return (HTTP 403, body `{ error: 'account_restricted' }`).
 *
 * The server guard (`@/server/reports/account-restriction`) imports the code
 * from here, and every client write path (publish, drafts, edit, image upload,
 * post/comment likes, comments) detects the response with these helpers and
 * shows `moderationCopy(locale).accountRestricted` instead of a generic
 * failure + retry. Never compare against the string literal elsewhere.
 */
export const ACCOUNT_RESTRICTED_ERROR = 'account_restricted' as const

/** True when a parsed JSON error body is the restricted-account error. */
export function isAccountRestrictedBody(body: unknown): boolean {
  return (
    typeof body === 'object' &&
    body !== null &&
    (body as { error?: unknown }).error === ACCOUNT_RESTRICTED_ERROR
  )
}

/**
 * True when a fetch `Response` is the restricted-account 403. Reads a clone,
 * so the caller can still consume the original body.
 */
export async function isAccountRestrictedResponse(res: Response): Promise<boolean> {
  if (res.status !== 403) return false
  try {
    return isAccountRestrictedBody(await res.clone().json())
  } catch {
    return false
  }
}
