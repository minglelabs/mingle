/**
 * Before a first room with someone new, the server may answer
 * `403 { error: "first_message_setup", needs }` (see @/server/first-message-gate).
 * The caller then awaits `requestFirstMessageSetup(needs)`: it resolves true
 * once the user has done what was missing (the caller sends again) and false
 * when the user closes the sheet (the caller drops the action).
 *
 * The sheet itself is `FirstMessageGate`, mounted once in the root layout.
 * With no gate mounted the action is dropped, since the server would refuse it.
 */
export type FirstMessageNeed = 'phone' | 'face_photo' | 'face_check'

type FirstMessageSetupHandler = (needs: FirstMessageNeed[]) => Promise<boolean>

let handler: FirstMessageSetupHandler | null = null

export function registerFirstMessageSetupHandler(next: FirstMessageSetupHandler): () => void {
  handler = next
  return () => {
    if (handler === next) handler = null
  }
}

export function requestFirstMessageSetup(needs: FirstMessageNeed[]): Promise<boolean> {
  return handler ? handler(needs) : Promise.resolve(false)
}

/** The needs from a refused first room, or null when the answer is something else. */
export function parseFirstMessageSetupNeeds(status: number, body: unknown): FirstMessageNeed[] | null {
  if (status !== 403 || typeof body !== 'object' || body === null) return null
  const record = body as Record<string, unknown>
  if (record.error !== 'first_message_setup' || !Array.isArray(record.needs)) return null
  const needs = record.needs.filter((need): need is FirstMessageNeed => need === 'phone' || need === 'face_photo' || need === 'face_check')
  return needs.length > 0 ? needs : null
}
