import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { voiceRoomsCopy } from "@/i18n/voice-rooms-copy";
import { PRIMARY_UI_LOCALES } from "@/i18n/mingle-locales";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("voice rooms are a kind of their own", () => {
  it("is one column, false for every existing room", () => {
    const sql = read("prisma/migrations/20261125170000_add_voice_room_kind/migration.sql");
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS "is_voice_room" BOOLEAN NOT NULL DEFAULT false');
    expect(read("prisma/schema.prisma")).toContain('isVoiceRoom                Boolean   @default(false) @map("is_voice_room")');
  });

  it("lists one kind at a time: open chat rooms by default, voice rooms when asked", () => {
    const rooms = read("src/lib/app-conversations.ts");
    expect(rooms).toContain("...(options.ids ? { id: { in: options.ids } } : { isVoiceRoom: options.voiceRooms === true }),");
    expect(rooms).toContain("isVoiceRoom: args.voiceRoom === true,");
    const controller = read("src/server/api/controllers/shared/public-room-controller.ts");
    expect(controller).toContain('voiceRooms: request.nextUrl.searchParams.get("kind") === "voice"');
    expect(controller).toContain("voiceRoom: body.voiceRoom === true,");
  });

  it("makes the lounge a voice room, new or old", () => {
    const lounge = read("src/server/voice-lounge.ts");
    expect(lounge).toContain("title: VOICE_LOUNGE_TITLE, voiceRoom: true })");
    expect(lounge).toContain("where: { id: channelId, isVoiceRoom: false }, data: { isVoiceRoom: true }");
  });

  it("shows voice rooms, and the button to make one, on the voice-room tab only", () => {
    const tab = read("src/components/voice-rooms/voice-rooms-page.tsx");
    expect(tab).toContain("voiceRooms={{ createTitle: copy.createRoomTitle, heading: copy.roomsHeading, createSignal }}");
    // The button is an icon in the tab's top bar; the list draws none of its own.
    expect(tab).toContain('data-qa="voice-room-create"');
    expect(tab).toContain("aria-label={copy.createRoom}");
    expect(read("src/components/search/open-rooms.tsx")).toContain("{voiceRooms ? null : (");
    const list = read("src/components/search/open-rooms.tsx");
    expect(list).toContain('if (isVoiceList) search.set("kind", "voice");');
    expect(list).toContain("...(voiceRoomTitle ? { voiceRoom: true } : {})");
    for (const locale of PRIMARY_UI_LOCALES) {
      const copy = voiceRoomsCopy(locale);
      for (const text of [copy.createRoom, copy.createRoomTitle, copy.roomsHeading]) expect(text.length).toBeGreaterThan(0);
    }
  });

  it("lists open chats on the search screen again, next to the posts", () => {
    const search = read("src/components/search/unified-search.tsx");
    expect(search).toContain("export const OPEN_ROOMS_IN_EXPLORE = true;");
    // Open chats get the coloured card; voice rooms keep their row.
    expect(read("src/components/search/open-rooms.tsx")).toContain("{voiceRooms ? <OpenRoomRow room={room} copy={copy} busy={busyId === room.id} onEnter={() => void enter(room)} /> : <OpenChatCard room={room} copy={copy} busy={busyId === room.id} onEnter={() => void enter(room)} />}");
    expect(search).toContain("const canBrowseRooms = OPEN_ROOMS_IN_EXPLORE && Boolean(onOpenLiveRoom);");
    expect(search).toContain("{OPEN_ROOMS_IN_EXPLORE && onOpenLiveRoom && dispatchedQuery ? (");
    // A room is still found by its number.
    expect(search).toContain("{roomCodeQuery !== null && onOpenLiveRoom ? (");
  });
});
