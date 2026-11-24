/**
 * Home is the voice rooms tab (owner, 2026-11-24): the lounge and the rooms on
 * now. A new account lands there after the speak trial, so the first thing
 * after speaking is a place to speak. The feed and the people cards (explore)
 * have their own tabs. Every "go home" (landing, after sign-in) opens it.
 */
export function homeHref(locale: string): string {
  return `/${locale}/voice`
}

/** The explore tab: cards of people to talk to, two per row, with search on top. */
export function exploreHref(locale: string): string {
  return `/${locale}/explore`
}
