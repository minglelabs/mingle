/**
 * People-search relevance ranking, as a pure function so it is testable without
 * a database and shared by the search route and its re-exports.
 *
 * Order: exact match on name OR handle first, then prefix match, then a plain
 * "contains" match. Within one tier the input order is preserved (a stable
 * sort), so the caller's own people-list ordering — updatedAt desc — decides
 * ties. `@`-prefixed queries match on handle; the raw query matches on name.
 */

export type RankablePerson = {
  handle: string | null;
  name: string | null;
};

/** 0 = exact, 1 = prefix, 2 = contains, 3 = no textual match (kept last). */
export function personMatchTier(person: RankablePerson, rawQuery: string): number {
  const query = rawQuery.trim().toLocaleLowerCase();
  if (!query) return 3;
  const handleQuery = query.startsWith("@") ? query.slice(1) : query;

  const fields = [person.name, person.handle]
    .map((value) => (typeof value === "string" ? value.trim().toLocaleLowerCase() : ""))
    .filter((value) => value.length > 0);

  // A handle-only query (`@…`) still compares against both fields: a handle
  // that starts with the text is a strong hit, a name containing it is weaker.
  const needles = query === handleQuery ? [query] : [handleQuery, query];

  let best = 3;
  for (const field of fields) {
    for (const needle of needles) {
      if (!needle) continue;
      if (field === needle) return 0;
      if (field.startsWith(needle)) best = Math.min(best, 1);
      else if (field.includes(needle)) best = Math.min(best, 2);
    }
  }
  return best;
}

/**
 * Stable-sort `people` by match tier for `query`, preserving the incoming order
 * within each tier. Does not filter — exclusion (anon_, blocks) happens in the
 * query; this only reorders what the DB already returned in people-list order.
 */
export function rankPeopleByRelevance<T extends RankablePerson>(people: T[], query: string): T[] {
  return people
    .map((person, index) => ({ person, index, tier: personMatchTier(person, query) }))
    .sort((a, b) => (a.tier - b.tier) || (a.index - b.index))
    .map((entry) => entry.person);
}
