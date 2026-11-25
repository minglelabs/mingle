import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { openRoomsCopy } from "@/i18n/open-rooms-copy";
import { PRIMARY_UI_LOCALES } from "@/i18n/mingle-locales";
import { parseOpenRooms } from "@/lib/open-room";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("women-only rooms", () => {
  it("is one column, false for every existing room", () => {
    expect(read("prisma/migrations/20261125180000_add_women_only_rooms/migration.sql"))
      .toContain('ADD COLUMN IF NOT EXISTS "women_only" BOOLEAN NOT NULL DEFAULT false');
  });

  it("is made by a woman only, and joined by a woman only, whichever way in", () => {
    const controller = read("src/server/api/controllers/shared/public-room-controller.ts");
    expect(controller).toContain("womenOnly: body.womenOnly === true && (await isWoman(userId)),");
    expect(controller).toContain('if (code === "women_only") return NextResponse.json({ error: "women_only" }, { status: 403 });');
    const rooms = read("src/lib/app-conversations.ts");
    // In the one join every entrance goes through (the list, a link, the room number).
    expect(rooms).toContain('if (joiner?.gender !== "female") throw new Error("women_only");');
    expect(rooms).toContain("locked: record.womenOnly && !viewerIsWoman,");
  });

  it("is listed for everyone, shut for whoever is not a woman", () => {
    const [open, shut] = parseOpenRooms({ rooms: [
      { id: "a", title: "A", womenOnly: true, locked: false },
      { id: "b", title: "B", womenOnly: true, locked: true },
    ] });
    expect(open).toMatchObject({ womenOnly: true, locked: false });
    expect(shut).toMatchObject({ womenOnly: true, locked: true });
    expect(parseOpenRooms({ rooms: [{ id: "c", title: "C" }] })[0]).toMatchObject({ womenOnly: false, locked: false });
    const list = read("src/components/search/open-rooms.tsx");
    expect(list).toContain("if (room.locked && !room.isMember) {");
    expect(list).toContain('data-open-room-shut={shut ? "1" : "0"}');
  });

  it("shows the choice in the make-a-room sheet to women only, in every app language", () => {
    const list = read("src/components/search/open-rooms.tsx");
    expect(list).toContain("{canMakeWomenOnly ? (");
    expect(list).toContain("...(canMakeWomenOnly && womenOnly ? { womenOnly: true } : {})");
    for (const locale of PRIMARY_UI_LOCALES) {
      const copy = openRoomsCopy(locale);
      for (const text of [copy.womenOnly, copy.womenOnlyHint, copy.womenOnlyLocked]) expect(text.length).toBeGreaterThan(0);
    }
  });
});
