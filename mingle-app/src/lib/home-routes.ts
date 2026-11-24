/**
 * Home is the voice rooms tab (owner, 2026-11-24): the lounge and the rooms on
 * now. The app launch opens it. A new account lands on explore right after
 * signing up instead (owner, 2026-11-25: people first, the lounge may be
 * empty while few are online). The feed and explore have their own tabs.
 */
export function homeHref(locale: string): string {
  return `/${locale}/voice`
}

/** The explore tab: cards of people to talk to, two per row, with search on top. */
export function exploreHref(locale: string): string {
  return `/${locale}/explore`
}
