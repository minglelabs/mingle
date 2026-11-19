// Who to draw in an open room's row of people: everyone with the room open
// right now (lib/room-presence), as small faces. Pure, so it can be tested.

export type OpenRoomMember = { id: string; name: string | null; image: string | null }

/**
 * The people in the room right now, others first and the viewer last. While
 * the server has not said who is here (presence null) only the viewer is
 * known to be. Someone present whose profile has not loaded yet is still
 * drawn, without a name.
 */
export function resolveOpenRoomPeople(input: {
  members: readonly OpenRoomMember[]
  presence: readonly string[] | null
  viewerUserId: string | null | undefined
}): OpenRoomMember[] {
  const viewerId = input.viewerUserId || ''
  const byId = new Map(input.members.map((member) => [member.id, member]))
  const here = new Set(input.presence ?? [])
  if (viewerId) here.add(viewerId)
  const people = [...here].map((id) => byId.get(id) ?? { id, name: null, image: null })
  return [
    ...people.filter((person) => person.id !== viewerId),
    ...people.filter((person) => person.id === viewerId),
  ]
}

/** Someone is here whose profile the loaded member list does not have: load the list again. */
export function openRoomPeopleNeedReload(members: readonly OpenRoomMember[], presence: readonly string[] | null): boolean {
  if (!presence) return false
  const known = new Set(members.map((member) => member.id))
  return presence.some((id) => !known.has(id))
}
