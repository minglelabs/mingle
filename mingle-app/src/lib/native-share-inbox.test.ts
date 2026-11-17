import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import {
  armPendingNativeShare,
  buildNativeShareTargetDonation,
  clearPendingNativeShare,
  decodeNativeShareImage,
  getPendingNativeShare,
  isPendingNativeShareAwaitingChoice,
  NATIVE_SHARE_INBOX_EVENT,
  NATIVE_SHARE_INBOX_WINDOW_KEY,
  parseNativeShareInboxPayload,
  receiveNativeShare,
  resolveNativeShareInboxCopy,
  takePendingNativeShareImage,
  takePendingNativeShareText,
  type NativeShareInboxPayload,
} from "@/lib/native-share-inbox";

let shareSequence = 0;
function share(overrides: Partial<NativeShareInboxPayload> = {}): NativeShareInboxPayload {
  shareSequence += 1;
  return {
    id: `share-${shareSequence}`,
    conversationId: "conv_1",
    text: null,
    image: { mimeType: "image/jpeg", base64: "QUJD" },
    ...overrides,
  };
}

describe("native share inbox contract", () => {
  it("matches the event, window key and message types of the RN shell", () => {
    const rnSource = readFileSync(path.join(process.cwd(), "rn/src/nativeShareInbox.ts"), "utf8");
    expect(rnSource).toContain(`NATIVE_SHARE_INBOX_EVENT = "${NATIVE_SHARE_INBOX_EVENT}"`);
    expect(rnSource).toContain(`NATIVE_SHARE_INBOX_WINDOW_KEY = "${NATIVE_SHARE_INBOX_WINDOW_KEY}"`);

    const appSource = readFileSync(path.join(process.cwd(), "rn/App.tsx"), "utf8");
    const webSource = readFileSync(path.join(process.cwd(), "src/lib/native-share-inbox.ts"), "utf8");
    for (const type of ["native_share_inbox_ack", "native_share_target_donate", "native_share_target_remove"]) {
      expect(appSource).toContain(`parsed.type === '${type}'`);
      expect(webSource).toContain(`type: "${type}"`);
    }
  });

  it("opens the app with the URL the shell recognises, from an extension that supports suggestions", () => {
    const inboxSource = readFileSync(path.join(process.cwd(), "rn/ios/Shared/MingleShareInbox.swift"), "utf8");
    expect(inboxSource).toContain('URL(string: "mingle://share-inbox")');
    const extensionPlist = readFileSync(path.join(process.cwd(), "rn/ios/MingleShare/Info.plist"), "utf8");
    expect(extensionPlist).toContain("INSendMessageIntent");
    expect(extensionPlist).toContain("com.apple.share-services");
    const appPlist = readFileSync(path.join(process.cwd(), "rn/ios/mingle/Info.plist"), "utf8");
    expect(appPlist).toContain("INSendMessageIntent");
  });

  it("registers Android as a share receiver with sharing shortcuts of one category", () => {
    const androidMain = path.join(process.cwd(), "rn/android/app/src/main");
    const manifest = readFileSync(path.join(androidMain, "AndroidManifest.xml"), "utf8");
    expect(manifest).toContain("android.intent.action.SEND");
    expect(manifest).toContain('android:resource="@xml/shortcuts"');

    const shortcuts = readFileSync(path.join(androidMain, "res/xml/shortcuts.xml"), "utf8");
    const moduleSource = readFileSync(
      path.join(androidMain, "java/com/minglelabs/mingle/rn/NativeShareTargetModule.kt"),
      "utf8",
    );
    const category = moduleSource.match(/SHARE_TARGET_CATEGORY = "([^"]+)"/)?.[1] ?? "";
    expect(category).not.toBe("");
    expect(shortcuts).toContain(`<category android:name="${category}" />`);

    const packageSource = readFileSync(
      path.join(androidMain, "java/com/minglelabs/mingle/rn/NativeRuntimeConfigPackage.kt"),
      "utf8",
    );
    expect(packageSource).toContain("NativeShareTargetModule(reactContext)");
  });
});

describe("parseNativeShareInboxPayload", () => {
  it("accepts an image share and a text share", () => {
    expect(parseNativeShareInboxPayload(share())?.image?.base64).toBe("QUJD");
    expect(parseNativeShareInboxPayload(share({ image: null, text: " hi " }))?.text).toBe("hi");
  });

  it("rejects empty shares and bad image data, and drops a malformed conversation id", () => {
    expect(parseNativeShareInboxPayload(share({ image: null }))).toBeNull();
    expect(parseNativeShareInboxPayload({ id: "x", image: { mimeType: "image/png", base64: "QUJD" } })).toBeNull();
    expect(parseNativeShareInboxPayload({ id: "x", image: { mimeType: "image/jpeg", base64: "<svg>" } })).toBeNull();
    expect(parseNativeShareInboxPayload({ id: "x", conversationId: "../a", text: "hi" })?.conversationId).toBeNull();
  });
});

describe("pending share", () => {
  beforeEach(() => {
    clearPendingNativeShare();
  });

  it("is taken only by the conversation it was shared to", () => {
    receiveNativeShare(share(), { roomOpen: true });
    expect(takePendingNativeShareImage("conv_other")).toBeNull();
    expect(takePendingNativeShareImage("conv_1")).toEqual({ mimeType: "image/jpeg", base64: "QUJD" });
    expect(getPendingNativeShare()).toBeNull();
  });

  it("ignores a repeated hand-over of the same share", () => {
    const payload = share();
    expect(receiveNativeShare(payload, { roomOpen: false })).toBe(true);
    takePendingNativeShareImage("conv_1");
    expect(receiveNativeShare(payload, { roomOpen: false })).toBe(false);
    expect(getPendingNativeShare()).toBeNull();
  });

  it("with no conversation picked, goes to the next room opened, not the one already open", () => {
    receiveNativeShare(share({ conversationId: null }), { roomOpen: true });
    expect(isPendingNativeShareAwaitingChoice()).toBe(true);
    expect(takePendingNativeShareImage("conv_open")).toBeNull();
    armPendingNativeShare();
    expect(takePendingNativeShareImage("conv_next")).not.toBeNull();
    expect(isPendingNativeShareAwaitingChoice()).toBe(false);
  });

  it("with no conversation picked and no room open, goes to the first room opened", () => {
    receiveNativeShare(share({ conversationId: null, image: null, text: "https://example.com" }), { roomOpen: false });
    expect(takePendingNativeShareText("conv_a")).toBe("https://example.com");
  });

  it("keeps the rest of a share for the room that took the first part", () => {
    receiveNativeShare(share({ conversationId: null, text: "caption" }), { roomOpen: false });
    expect(takePendingNativeShareImage("conv_a")).not.toBeNull();
    expect(takePendingNativeShareText("conv_b")).toBeNull();
    expect(takePendingNativeShareText("conv_a")).toBe("caption");
    expect(getPendingNativeShare()).toBeNull();
  });
});

describe("decodeNativeShareImage", () => {
  it("builds a JPEG file from the base64 data", async () => {
    const file = decodeNativeShareImage({ mimeType: "image/jpeg", base64: "QUJD" });
    expect(file.type).toBe("image/jpeg");
    expect(await file.text()).toBe("ABC");
  });
});

describe("buildNativeShareTargetDonation", () => {
  const origin = "https://app.example.com";

  it("uses the room title and the first member photo", () => {
    expect(buildNativeShareTargetDonation({
      conversationId: "conv_1",
      title: " Trip ",
      otherMembers: [{ name: "Hana", image: null }, { name: "Jun", image: "/avatars/jun.jpg" }],
      origin,
    })).toEqual({
      conversationId: "conv_1",
      displayName: "Trip",
      avatarUrl: "https://app.example.com/avatars/jun.jpg",
    });
  });

  it("falls back to member names, and reports nothing for a nameless room", () => {
    expect(buildNativeShareTargetDonation({
      conversationId: "conv_1",
      title: "",
      otherMembers: [{ name: "Hana" }, { name: "Jun" }],
      origin,
    })?.displayName).toBe("Hana, Jun");
    expect(buildNativeShareTargetDonation({ conversationId: "conv_1", title: "", otherMembers: [], origin })).toBeNull();
  });

  it("drops a photo that is not an http(s) URL", () => {
    expect(buildNativeShareTargetDonation({
      conversationId: "conv_1",
      title: "Trip",
      otherMembers: [{ name: "Hana", image: "data:image/png;base64,AAAA" }],
      origin,
    })?.avatarUrl).toBeNull();
  });
});

describe("resolveNativeShareInboxCopy", () => {
  it("resolves by locale, by language, then English", () => {
    expect(resolveNativeShareInboxCopy("ko").cancel).toBe("취소");
    expect(resolveNativeShareInboxCopy("fr-CA").cancel).toBe("Annuler");
    expect(resolveNativeShareInboxCopy("xx").cancel).toBe("Cancel");
  });
});
