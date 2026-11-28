// Client-safe conversation limits. Kept apart from @/lib/app-conversations,
// which is server code (Prisma, OpenCC), so client components can import the
// cap without pulling that module into the browser bundle.

// Total people in a room, including the creator — matches the invite
// picker's selection cap.
export const MAX_CONVERSATION_MEMBERS = 10;

// An open room (public, listed under Explore) holds many more: most people in it
// only read along or listen to its voice talk (the call's stage still has 8 seats).
export const MAX_OPEN_ROOM_MEMBERS = 200;

export function maxRoomMembers(room: { isPublic?: boolean | null }): number {
  return room.isPublic === true ? MAX_OPEN_ROOM_MEMBERS : MAX_CONVERSATION_MEMBERS;
}
