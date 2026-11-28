import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseVoiceRoomEntry, VOICE_ROOM_ENTRY_TTL_MS } from "@/lib/voice-room-entry";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("a voice room is always in a voice talk", () => {
  it("marks only the room the voice-room tab just opened, for a minute", () => {
    const now = 1_000_000;
    const mark = JSON.stringify({ conversationId: "room-1", at: now - 5_000 });
    expect(parseVoiceRoomEntry(mark, "room-1", now)).toBe(true);
    expect(parseVoiceRoomEntry(mark, "room-2", now)).toBe(false);
    expect(parseVoiceRoomEntry(mark, "room-1", now + VOICE_ROOM_ENTRY_TTL_MS)).toBe(false);
    expect(parseVoiceRoomEntry(null, "room-1", now)).toBe(false);
    expect(parseVoiceRoomEntry("{", "room-1", now)).toBe(false);
  });

  it("joins the call as the room opens from the voice-room tab, without asking", () => {
    const tab = read("src/components/voice-rooms/voice-rooms-page.tsx");
    expect(tab).toContain("markVoiceRoomEntry(conversationId);");
    const room = read("src/components/LivePhoneDemo/LivePhoneDemo.tsx");
    expect(room).toContain("if (!takeVoiceRoomEntry(conversationId)) return");
    expect(room).toContain("joinVoiceTalk({ conversationId, title: displayConversationTitle || undefined, lang: voiceTalkLang })\n  }, [conversationId, displayConversationTitle, headerMode, voiceTalkAvailable, voiceTalkLang, voiceTalkState.joined])");
  });

  it("shows the voice talk panel as one flat strip across the top, not a floating card", () => {
    const panel = read("src/components/LivePhoneDemo/VoiceTalkPanel.tsx");
    expect(panel).toContain('className="pointer-events-none absolute inset-x-0 z-30" style={{ top: props.topOffset }}');
    expect(panel).toContain('className="pointer-events-auto overflow-hidden border-b border-gray-100 bg-white"');
    expect(panel).not.toContain("rounded-2xl border border-gray-100 bg-white/95");
  });
});
