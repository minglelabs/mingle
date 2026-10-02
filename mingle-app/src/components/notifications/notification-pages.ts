/**
 * Client-side helpers for the notification list's "load more" pages.
 *
 * The server groups likes per target WITHIN one page. A group whose rows are
 * split across pages (newest likes on page 1, older ones on page 2) must still
 * read as ONE entry, so the panel merges each appended page into the list it
 * already shows: a grouped entry whose `groupKey` is already on screen absorbs
 * the new page's actors instead of appearing twice. Ungrouped rows
 * (`row:<id>`) never merge.
 */

export type MergeableNotificationActor = { id: string }

export type MergeableNotification<A extends MergeableNotificationActor = MergeableNotificationActor> = {
  id: string
  groupKey: string
  isRead: boolean
  createdAt: string
  actors: A[]
  actorCount: number
  actorIds: string[]
}

const MAX_ACTORS_PER_GROUP = 3

export function isGroupedNotificationKey(groupKey: string): boolean {
  return !groupKey.startsWith('row:')
}

/**
 * Append `incoming` (an older page) to `existing`. The existing entry keeps its
 * id, timestamp and position (it holds the newest row); it gains the older
 * page's distinct actors, and it is read only when both parts are read.
 */
export function mergeNotificationPage<T extends MergeableNotification>(existing: T[], incoming: T[]): T[] {
  const result = existing.slice()
  const indexByKey = new Map<string, number>()
  const seenIds = new Set<string>()
  result.forEach((item, index) => {
    seenIds.add(item.id)
    if (isGroupedNotificationKey(item.groupKey)) indexByKey.set(item.groupKey, index)
  })

  for (const item of incoming) {
    if (seenIds.has(item.id)) continue
    const at = isGroupedNotificationKey(item.groupKey) ? indexByKey.get(item.groupKey) : undefined
    if (at === undefined) {
      seenIds.add(item.id)
      if (isGroupedNotificationKey(item.groupKey)) indexByKey.set(item.groupKey, result.length)
      result.push(item)
      continue
    }
    const current = result[at]
    const actorIds = [...current.actorIds]
    const known = new Set(actorIds)
    const actors = [...current.actors]
    for (const id of item.actorIds) {
      if (known.has(id)) continue
      known.add(id)
      actorIds.push(id)
    }
    for (const actor of item.actors) {
      if (actors.length >= MAX_ACTORS_PER_GROUP) break
      if (!actors.some((a) => a.id === actor.id)) actors.push(actor)
    }
    result[at] = {
      ...current,
      actors,
      actorIds,
      actorCount: Math.max(actorIds.length, current.actorCount),
      isRead: current.isRead && item.isRead,
    }
  }
  return result
}
