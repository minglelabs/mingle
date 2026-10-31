// Client id for an outgoing conversation photo. The server accepts
// /^[\w-]{12,128}$/.
//
// crypto.randomUUID is missing before iOS 15.4 (the app supports 15.1) and on
// non-secure origins such as the http devbox. Calling it unguarded threw inside
// the file input's change handler, so the photo preview never opened.
// crypto.getRandomValues exists in both cases.

type CryptoLike = {
  randomUUID?: () => string
  getRandomValues?: (array: Uint8Array) => Uint8Array
}

export function createImageClientMessageId(
  cryptoImpl: CryptoLike | undefined = typeof crypto === 'undefined' ? undefined : crypto,
): string {
  if (typeof cryptoImpl?.randomUUID === 'function') return `image-${cryptoImpl.randomUUID()}`
  if (typeof cryptoImpl?.getRandomValues === 'function') {
    const bytes = cryptoImpl.getRandomValues(new Uint8Array(16))
    return `image-${Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')}`
  }
  return `image-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`
}
