/**
 * Korean sign-ups (owner, 2026-11-21): the first sign-in option is the phone
 * number, an account without a verified number verifies it after sign-in (the
 * server's PHONE_REQUIRED, Korean by default: PHONE_REQUIRED_LOCALES), and the
 * contact sync screen must be passed right after sign-up (allowed or refused in
 * the system dialog). "Korean" is the app language picked on the first screen
 * (a Korean living abroad without a Korean number can still sign out at the gate).
 */
export function isKoreanAppLocale(rawLocale: string | null | undefined): boolean {
  return (rawLocale ?? '').trim().toLowerCase().split(/[-_]/)[0] === 'ko'
}

/** The contact sync screen opens by itself right after sign-up and cannot be skipped. */
export function isContactSyncRequiredLocale(rawLocale: string | null | undefined): boolean {
  return isKoreanAppLocale(rawLocale)
}

/** The sign-in screen leads with the phone number; Apple and Google sit under "other ways". */
export function isPhoneFirstSignInLocale(rawLocale: string | null | undefined): boolean {
  return isKoreanAppLocale(rawLocale)
}
