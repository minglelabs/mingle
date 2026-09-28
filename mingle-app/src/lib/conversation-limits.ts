// Client-safe conversation limits. Kept apart from @/lib/app-conversations,
// which is server code (Prisma, OpenCC), so client components can import the
// cap without pulling that module into the browser bundle.

// Total people in a room, including the creator — matches the invite
// picker's selection cap.
export const MAX_CONVERSATION_MEMBERS = 10;
