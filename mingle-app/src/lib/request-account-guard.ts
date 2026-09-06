export const EXPECTED_ACCOUNT_HEADER = 'x-mingle-expected-account-id'

// This header is a precondition, never an authentication mechanism. Old clients
// omit it and keep their existing contract; queued writes must match the session.
export function matchesExpectedAccount(
  request: Request,
  session: { user?: { id?: unknown } } | null,
): boolean {
  const expected = request.headers.get(EXPECTED_ACCOUNT_HEADER)
  if (expected === null) return true
  return !!expected.trim() && typeof session?.user?.id === 'string'
    && expected.trim() === session.user.id.trim()
}
