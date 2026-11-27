import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolvePostCallCopy } from "@/i18n/post-call-copy";
import { resolvePostCategoryCopy } from "@/i18n/post-category-copy";
import { PRIMARY_UI_LOCALES } from "@/i18n/mingle-locales";
import {
  POST_CALL_RING_MS,
  isPostCallOver,
  parsePostCallView,
  postCallInterpretsByDefault,
  postCallSecondsLeft,
} from "@/lib/post-call";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("1:1 voice talk from a post", () => {
  it("rings for 30 seconds, counted down in whole seconds", () => {
    expect(POST_CALL_RING_MS).toBe(30_000);
    const end = "2026-11-25T12:00:30Z";
    expect(postCallSecondsLeft(end, Date.parse("2026-11-25T12:00:00Z"))).toBe(30);
    expect(postCallSecondsLeft(end, Date.parse("2026-11-25T12:00:29.2Z"))).toBe(1);
    expect(postCallSecondsLeft(end, Date.parse("2026-11-25T12:01:00Z"))).toBe(0);
    // A phone whose clock is behind never shows more than the ring.
    expect(postCallSecondsLeft(end, Date.parse("2026-11-25T11:50:00Z"))).toBe(30);
  });

  it("is over once it is not ringing or answered", () => {
    expect(isPostCallOver("ringing")).toBe(false);
    expect(isPostCallOver("accepted")).toBe(false);
    for (const status of ["declined", "missed", "cancelled", "ended"]) expect(isPostCallOver(status)).toBe(true);
  });

  it("turns interpretation on by itself only when the two speak different languages", () => {
    expect(postCallInterpretsByDefault("ko", "ja")).toBe(true);
    expect(postCallInterpretsByDefault("ko", "ko-KR")).toBe(false);
    expect(postCallInterpretsByDefault("zh-CN", "zh-TW")).toBe(false);
    // Unknown language on either side: nothing is switched on unasked.
    expect(postCallInterpretsByDefault("ko", null)).toBe(false);
    const panel = read("src/components/LivePhoneDemo/VoiceTalkPanel.tsx");
    expect(panel).toContain("if (!postCallInterpretsByDefault(myLangRef.current, duoPeerLang)) return");
    // Paid: never switched on by itself with no Hash.
    expect(panel).toContain("if (interpretOnRef.current || walletExhausted) return");
  });

  it("reads a call from the wire defensively", () => {
    const view = parsePostCallView({
      id: "c1", status: "ringing", role: "author", conversationId: "room1", ringEndsAt: "2026-11-25T12:00:30Z",
      peer: { userId: "u2", name: "Mina", image: null, country: "JP", age: 24, language: "ja" },
    });
    expect(view?.role).toBe("author");
    expect(view?.peer).toEqual({ userId: "u2", name: "Mina", image: null, country: "JP", age: 24, language: "ja" });
    expect(parsePostCallView({ id: "c1", status: "nope", conversationId: "room1", peer: { userId: "u2" } })).toBeNull();
    expect(parsePostCallView(null)).toBeNull();
  });

  it("keeps the rules on the server: who may call, one call at a time, a hidden room", () => {
    const server = read("src/server/post-calls.ts");
    expect(server).toContain('category: "call"');
    expect(server).toContain('if (post.authorId === args.callerId) return { ok: false, error: "own_post" }');
    expect(server).toContain('if (await isNewRoomBlockedForMen(args.callerId, post.authorId)) return { ok: false, error: "blocked" }');
    expect(server).toContain('if (await isBusy(post.authorId)) return { ok: false, error: "busy" }');
    // A ring nobody answered is missed; an answered call with one person left is ended.
    expect(server).toContain('next = "missed"');
    expect(server).toContain('if ((await peopleInVoice(call.channelId)) < 2) next = "ended"');
    // The room it runs in is in no list, and gets no "started a voice talk" message.
    const conversations = read("src/lib/app-conversations.ts");
    expect(conversations).toContain("isDuoCall: false,");
    expect(conversations).toContain("data: { isDuoCall: true }");
    expect(read("src/server/api/controllers/shared/voice-call-controller.ts")).toContain("if (created && !duoCall) {");
  });

  it("opens over whatever tab is on screen, folds into a bubble on back, and keeps the call going", () => {
    const host = read("src/components/post-call/post-call-host.tsx");
    expect(read("src/app/layout.tsx")).toContain("<PostCallHost />");
    expect(read("src/components/feed/post-call-button.tsx")).toContain("openPostCall(view);");
    expect(host).toContain('if (action === "accept" && answered) openPostCall(answered);');
    expect(host).toContain('data-qa="post-call-bubble"');
    const screen = read("src/components/post-call/post-call-screen.tsx");
    // Back (edge swipe, Android back) folds the screen; it does not hang up.
    expect(screen).toContain("onClose={minimizePostCall}");
    // One glass bar: own face, photo, text, send; face and photo fold away while typing.
    expect(screen).toContain('data-qa="post-call-bar"');
    expect(screen).toContain("focused ? 'pointer-events-none -mr-1.5 max-w-0 overflow-hidden opacity-0'");
    // The generic room bubble leaves this call alone.
    expect(read("src/components/post-call/use-post-call-session.ts")).toContain("setLiveRoomOwnCall(conversationId)");
    // Typed lines are translated into the other person's language on the server.
    expect(read("src/server/post-call-lines.ts")).toContain("const targets = [...new Set([theirs, mine].filter(Boolean))];");
  });

  it("keeps the old call dress of the room screen for a hidden room opened by its address", () => {
    const room = read("src/components/LivePhoneDemo/LivePhoneDemo.tsx");
    expect(room).toContain("variant={isDuoCall ? 'duo' : isVoiceRoom ? 'room' : 'panel'}");
    expect(room).toContain("data-duo-call={isDuoCall ? 'on' : undefined}");
    // The text box stays; the viewer's own face sits left of it.
    expect(room).toContain("isComposerOpen || isDuoCall");
    expect(room).toContain("<DuoCallSelfFace");
    // The bottom bar (owner, 2026-11-26): a large own face, "+" with a photo and PiP only,
    // a send button that is always there, and the face and "+" stepping aside while typing.
    expect(room).toContain("const DUO_CALL_SELF_FACE_PX = 52");
    expect(room).toContain("sizePx={DUO_CALL_SELF_FACE_PX}");
    expect(room).toContain("isComposerTextareaFocused ? 'pointer-events-none -mr-2 max-w-0 overflow-hidden opacity-0'");
    expect(room).toContain("data-qa={isDuoCall ? 'duo-call-send' : undefined}");
    const panel = room.slice(room.indexOf("const actionPanelItems = useMemo"), room.indexOf("const syncNativePipPlaybackState"));
    expect(panel.indexOf("if (isDuoCall) {")).toBeGreaterThan(panel.indexOf("key: 'photo'"));
    expect(panel.slice(panel.indexOf("if (isDuoCall) {"), panel.indexOf("return items")).includes("key: 'pip'")).toBe(true);
    const stage = read("src/components/LivePhoneDemo/DuoCallStage.tsx");
    // The face is a third of the way down, with waves while they speak.
    expect(stage).toContain("const FACE_CENTER = 35");
    expect(stage).toContain("FACE_CENTER_COMPACT : FACE_CENTER}% - ${FACE_PX / 2}px)");
    expect(stage).toContain('data-qa="duo-call-peer-wave"');
    for (const qa of ["duo-call-translate", "duo-call-read-aloud", "duo-call-mic", "duo-call-hang-up", "duo-call-accept", "duo-call-decline"]) {
      expect(stage).toContain(`qa="${qa}"`);
    }
    const css = read("src/app/globals.css");
    expect(css).toContain('[data-duo-call="on"] [data-qa="live-demo-header"]');
  });

  it("is a category of its own, with a call button for everyone but the author, in every app language", () => {
    // The card's call button is the invitation above the author row; never for the author.
    expect(read("src/components/feed/post-call-invite.tsx")).toContain("const canCall = !ownPost;");
    expect(read("src/components/feed/post-call-invite.tsx")).toContain("void call();");
    expect(read("src/components/feed/feed-post-card.tsx")).toContain("ownPost={Boolean(viewerId) && post.author.id === viewerId}");
    // Only the app offers the category: a browser cannot answer a call.
    expect(read("src/components/compose/compose-category-picker.tsx")).toContain("entry !== 'call' || canTakeCalls");
    const english = resolvePostCallCopy("en");
    for (const locale of PRIMARY_UI_LOCALES) {
      const copy = resolvePostCallCopy(locale);
      for (const [key, text] of Object.entries(copy)) {
        expect(text.length, `${locale}.${key}`).toBeGreaterThan(0);
        if (locale !== "en") expect(text, `${locale}.${key}`).not.toBe(english[key as keyof typeof english]);
      }
      expect(resolvePostCategoryCopy(locale).categories.call).toBe(copy.category);
      expect(resolvePostCategoryCopy(locale).callHint).toBe(copy.hint);
    }
  });
});
