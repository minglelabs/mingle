/**
 * Home, where the app lands on launch and after sign-in, is the explore tab
 * (owner, 2026-11-25): people first. It was the voice rooms tab for a day
 * (2026-11-24), which is now the fourth tab; the lounge may be empty while
 * few are online.
 */
export function homeHref(locale: string): string {
  return `/${locale}/explore`
}

/** The explore tab: cards of people to talk to, two per row, with search on top. */
export function exploreHref(locale: string): string {
  return `/${locale}/explore`
}
