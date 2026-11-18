// Room numbers: 7 digits people read out and type in Search, shown as "482 1937".

export const ROOM_CODE_MIN = 1_000_000
export const ROOM_CODE_MAX = 9_999_999

/** "4821937" -> "482 1937". */
export function formatRoomCode(code: number | null | undefined): string {
  if (typeof code !== 'number' || !Number.isInteger(code) || code < ROOM_CODE_MIN || code > ROOM_CODE_MAX) return ''
  const digits = String(code)
  return `${digits.slice(0, 3)} ${digits.slice(3)}`
}

/**
 * A room number typed in Search, or null. Spaces, dashes and a leading "#"
 * are allowed ("482 1937", "482-1937", "#4821937"); anything else is not a number.
 */
export function parseRoomCode(text: string | null | undefined): number | null {
  const compact = String(text ?? '').trim().replace(/^#/, '').replace(/[\s-]/g, '')
  if (!/^\d{7}$/.test(compact)) return null
  const code = Number(compact)
  return code >= ROOM_CODE_MIN && code <= ROOM_CODE_MAX ? code : null
}
