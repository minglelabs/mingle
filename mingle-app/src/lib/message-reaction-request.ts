export const REACTION_REQUEST_TIMEOUT_MS = 10_000

// Keep the deadline active through body parsing, not only until headers arrive.
export async function fetchReactionJson<T>(url: string, init: RequestInit = {}): Promise<T> {
  const controller = new AbortController()
  const abort = () => controller.abort()
  const timer = setTimeout(abort, REACTION_REQUEST_TIMEOUT_MS)
  init.signal?.addEventListener('abort', abort, { once: true })
  if (init.signal?.aborted) abort()
  try {
    const response = await fetch(url, { ...init, signal: controller.signal })
    if (!response.ok) throw new Error(`reaction_request_${response.status}`)
    return await response.json() as T
  } finally {
    clearTimeout(timer)
    init.signal?.removeEventListener('abort', abort)
  }
}
