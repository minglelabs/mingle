import { getBackgroundKeys, randomBackgroundKey } from '@/lib/post-backgrounds'

/**
 * Pick a random background key that is guaranteed different from `current`.
 *
 * The catalog's own `randomBackgroundKey` may return the same key twice in a
 * row; the "Change background" button must always visibly change, so we retry
 * (bounded) and, as a fallback for a hypothetical single-key catalog, step to
 * the next key deterministically.
 */
export function nextBackgroundKey(current: string): string {
  const keys = getBackgroundKeys()
  if (keys.length <= 1) return keys[0] ?? current

  for (let attempt = 0; attempt < 8; attempt++) {
    const candidate = randomBackgroundKey()
    if (candidate !== current) return candidate
  }

  const index = keys.indexOf(current)
  return keys[(index + 1 + keys.length) % keys.length]
}
