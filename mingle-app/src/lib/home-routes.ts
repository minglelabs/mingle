/**
 * The home tab is the post feed again (owner, 2026-11-23); the people cards
 * moved to the explore tab. Every "go home" (landing, after sign-in) opens the feed.
 */
export function homeHref(locale: string): string {
  return `/${locale}/feed`
}

/** The explore tab: cards of people to talk to, two per row, with search on top. */
export function exploreHref(locale: string): string {
  return `/${locale}/explore`
}
