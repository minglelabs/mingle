// Open rooms: public rooms listed under Explore (docs/home-explore-rooms-plan.md).
// Client-safe: the card shape the list shows and the rules for what a person
// may type when making one.

export const OPEN_ROOM_TITLE_MAX = 40;
export const OPEN_ROOM_TOPIC_MAX = 20;
export const OPEN_ROOM_PASSWORD_MIN = 4;
export const OPEN_ROOM_PASSWORD_MAX = 32;

export type OpenRoomPerson = { userId: string; name: string | null; image: string | null };

export type OpenRoomCard = {
  id: string;
  title: string;
  topic: string | null;
  languages: string[];
  hasPassword: boolean;
  isMember: boolean;
  memberCount: number;
  /** The person who made the room, while they are still in it. */
  owner: OpenRoomPerson | null;
  /** A few faces, the owner first. */
  members: OpenRoomPerson[];
  /** People in the room's live voice talk call (0: none). */
  voiceCallParticipantCount: number;
  hashRushActive: boolean;
  /** Women only: listed for everyone, entered by women. */
  womenOnly: boolean;
  /** This viewer may not come in (women only, and the viewer is not a woman). */
  locked: boolean;
  /** ISO time of the last change in the room. */
  updatedAt: string;
};

export type OpenRoomStatus = "voice" | "game" | "chat";

/** What the card says is going on: a call wins over a game, a game over plain chat. */
export function openRoomStatus(room: Pick<OpenRoomCard, "voiceCallParticipantCount" | "hashRushActive">): OpenRoomStatus {
  if (room.voiceCallParticipantCount > 0) return "voice";
  return room.hashRushActive ? "game" : "chat";
}

function squeeze(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

/** The room title, or null when nothing usable was typed. */
export function normalizeOpenRoomTitle(value: unknown): string | null {
  const title = squeeze(value);
  return title ? [...title].slice(0, OPEN_ROOM_TITLE_MAX).join("") : null;
}

/** The topic tag without a leading "#", or null for none. */
export function normalizeOpenRoomTopic(value: unknown): string | null {
  const topic = squeeze(value).replace(/^#+\s*/, "");
  return topic ? [...topic].slice(0, OPEN_ROOM_TOPIC_MAX).join("") : null;
}

export type OpenRoomPasswordInput =
  | { kind: "none" }
  | { kind: "ok"; password: string }
  | { kind: "invalid" };

/** Empty means no password; otherwise 4 to 32 characters, kept exactly as typed. */
export function readOpenRoomPassword(value: unknown): OpenRoomPasswordInput {
  if (value === undefined || value === null || value === "") return { kind: "none" };
  if (typeof value !== "string") return { kind: "invalid" };
  const length = [...value].length;
  if (length < OPEN_ROOM_PASSWORD_MIN || length > OPEN_ROOM_PASSWORD_MAX) return { kind: "invalid" };
  return { kind: "ok", password: value };
}

/**
 * List order: rooms the viewer is in first, then rooms with a call, then rooms
 * with a game, then by the last change.
 */
export function sortOpenRooms<T extends Pick<OpenRoomCard, "isMember" | "voiceCallParticipantCount" | "hashRushActive" | "updatedAt">>(rooms: T[]): T[] {
  const rank = (room: T) => (openRoomStatus(room) === "voice" ? 2 : openRoomStatus(room) === "game" ? 1 : 0);
  return [...rooms].sort((left, right) => (
    Number(right.isMember) - Number(left.isMember)
    || rank(right) - rank(left)
    || right.voiceCallParticipantCount - left.voiceCallParticipantCount
    || (Date.parse(right.updatedAt) || 0) - (Date.parse(left.updatedAt) || 0)
  ));
}

/** Tolerant reader for `GET /conversations/open-rooms`. */
export function parseOpenRooms(body: unknown): OpenRoomCard[] {
  const rooms = (body as { rooms?: unknown } | null)?.rooms;
  if (!Array.isArray(rooms)) return [];
  return rooms.flatMap((entry): OpenRoomCard[] => {
    if (!entry || typeof entry !== "object") return [];
    const row = entry as Partial<OpenRoomCard>;
    if (typeof row.id !== "string" || typeof row.title !== "string") return [];
    const person = (value: unknown): OpenRoomPerson | null => {
      const candidate = value as Partial<OpenRoomPerson> | null;
      return candidate && typeof candidate.userId === "string"
        ? { userId: candidate.userId, name: candidate.name ?? null, image: candidate.image ?? null }
        : null;
    };
    return [{
      id: row.id,
      title: row.title,
      topic: typeof row.topic === "string" && row.topic ? row.topic : null,
      languages: Array.isArray(row.languages) ? row.languages.filter((language): language is string => typeof language === "string") : [],
      hasPassword: row.hasPassword === true,
      isMember: row.isMember === true,
      memberCount: typeof row.memberCount === "number" && row.memberCount > 0 ? Math.floor(row.memberCount) : 0,
      owner: person(row.owner),
      members: Array.isArray(row.members) ? row.members.flatMap((member) => person(member) ?? []) : [],
      voiceCallParticipantCount: typeof row.voiceCallParticipantCount === "number" && row.voiceCallParticipantCount > 0 ? Math.floor(row.voiceCallParticipantCount) : 0,
      hashRushActive: row.hashRushActive === true,
      womenOnly: row.womenOnly === true,
      locked: row.locked === true,
      updatedAt: typeof row.updatedAt === "string" ? row.updatedAt : "",
    }];
  });
}
