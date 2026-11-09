import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const h = vi.hoisted(() => ({
  session: vi.fn(),
  sessionKey: vi.fn(),
  members: vi.fn(),
  findFirst: vi.fn(),
  findUnique: vi.fn(),
  userFindUnique: vi.fn(),
  lock: vi.fn(),
  upsert: vi.fn(),
  notify: vi.fn(),
  translate: vi.fn(),
  billingUser: vi.fn(),
  canSpend: vi.fn(),
  charge: vi.fn(),
}));

vi.mock("next-auth", () => ({ getServerSession: h.session }));
vi.mock("@/lib/auth-options", () => ({ getAuthOptions: () => ({}) }));
vi.mock("@/lib/app-conversations", () => ({
  getConversationSessionKeyForMember: h.sessionKey,
  listChannelMemberUserIdsBySessionKey: h.members,
}));
vi.mock("@/server/conversation-realtime", () => ({ notifyConversationMessage: h.notify }));
vi.mock("@/server/coins/request-billing", () => ({ resolveCoinBillingUserId: h.billingUser }));
vi.mock("@/server/coins/wallet", () => ({ canSpendCoins: h.canSpend, chargeCoinUsageSafely: h.charge }));
vi.mock("@/server/translation/translate-texts", () => ({
  translateTexts: h.translate,
  resolveTranslationProviderConfig: (model: string) => ({
    ok: true, config: { provider: "gemini", model, infrastructureProvider: "google" },
  }),
}));
vi.mock("@/server/operator-inbox/staff-translate", () => ({
  isPhotoMessageMetadata: (metadata: unknown) => Boolean((metadata as { image?: unknown } | null)?.image),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: (run: (tx: unknown) => unknown) => run({
      $queryRaw: h.lock,
      appMessage: { findUnique: h.findUnique },
      appMessageContent: { upsert: h.upsert },
    }),
    appMessage: { findFirst: h.findFirst },
    user: { findUnique: h.userFindUnique },
  },
}));

import { POST } from "./route";

function retranslate(body: unknown) {
  return POST(new NextRequest("https://example.com/api/conversations/room_1/retranslate", {
    method: "POST", body: JSON.stringify(body),
  }), { params: Promise.resolve({ conversationId: "room_1" }) });
}

const message = {
  id: "msg_1",
  clientMessageId: "u-1700000000000-1",
  isDeleted: false,
  sourceLanguage: "ko",
  metadata: {},
  contents: [{ text: "안녕하세요", language: "ko", isDeleted: false }],
};

describe("POST /api/conversations/[conversationId]/retranslate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.session.mockResolvedValue({ user: { id: "user_2" } });
    h.sessionKey.mockResolvedValue("sess_1");
    h.members.mockResolvedValue(["user_1", "user_2"]);
    h.findFirst.mockResolvedValue(message);
    h.findUnique.mockResolvedValue({ isDeleted: false, metadata: {} });
    h.userFindUnique.mockResolvedValue({ translationModel: null });
    h.translate.mockResolvedValue({ translations: { en: "Hello there" }, provider: "gemini", model: "served-model" });
    h.billingUser.mockResolvedValue("user_2");
    h.canSpend.mockResolvedValue(true);
    h.charge.mockResolvedValue({ wallet: { balance: 41 } });
  });

  it("replaces the stored translation for the room, bills the caller and notifies members", async () => {
    const response = await retranslate({ messageId: "u-1700000000000-1", language: "en", requestId: "req-12345678" });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true, messageId: "u-1700000000000-1", language: "en", text: "Hello there", coinBalance: 41,
    });
    expect(h.translate).toHaveBeenCalledWith(expect.objectContaining({
      text: "안녕하세요", sourceLanguage: "ko", targetLanguages: ["en"], isFinal: true,
    }));
    // Serialized with the finalize upsert and the recall.
    expect(h.lock.mock.invocationCallOrder[0]).toBeLessThan(h.upsert.mock.invocationCallOrder[0]);
    expect(h.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { messageId_contentType_language: { messageId: "msg_1", contentType: "TRANSLATION_FINAL", language: "en" } },
      update: expect.objectContaining({ text: "Hello there", isDeleted: false }),
    }));
    expect(h.charge).toHaveBeenCalledWith(expect.objectContaining({
      userId: "user_2", kind: "translation", units: { message: 1 },
      idempotencyKey: "retranslation:user_2:msg_1:en:req-12345678",
    }));
    expect(h.notify).toHaveBeenCalledWith("sess_1", ["user_1", "user_2"], undefined, { timeoutMs: 3000 });
  });

  it("uses the caller's own translation model", async () => {
    h.userFindUnique.mockResolvedValue({ translationModel: "gpt-5.4-nano" });
    await retranslate({ messageId: "u-1700000000000-1", language: "en" });
    const selection = h.translate.mock.calls[0][0].modelSelection;
    expect(typeof selection).toBe("string");
    expect(selection).not.toBe("");
  });

  it("refuses without coins and translates nothing", async () => {
    h.canSpend.mockResolvedValue(false);
    const response = await retranslate({ messageId: "u-1700000000000-1", language: "en" });
    expect(response.status).toBe(402);
    expect(h.translate).not.toHaveBeenCalled();
    expect(h.upsert).not.toHaveBeenCalled();
  });

  it("rejects non-members, recalled messages, photos and the source language", async () => {
    h.sessionKey.mockResolvedValueOnce(null);
    expect((await retranslate({ messageId: "u-1", language: "en" })).status).toBe(404);

    h.findFirst.mockResolvedValueOnce({ ...message, metadata: { recalledAtMs: 1 } });
    expect((await retranslate({ messageId: "u-1", language: "en" })).status).toBe(404);

    h.findFirst.mockResolvedValueOnce({ ...message, metadata: { image: { objectKey: "k" } } });
    expect((await retranslate({ messageId: "u-1", language: "en" })).status).toBe(400);

    expect((await retranslate({ messageId: "u-1", language: "ko" })).status).toBe(400);
    expect(h.translate).not.toHaveBeenCalled();
  });

  it("stores and bills nothing when the translation comes back empty", async () => {
    h.translate.mockResolvedValue({ translations: {}, provider: "gemini", model: "m" });
    const response = await retranslate({ messageId: "u-1700000000000-1", language: "en" });
    expect(response.status).toBe(502);
    expect(h.upsert).not.toHaveBeenCalled();
    expect(h.charge).not.toHaveBeenCalled();
  });

  it("drops the write when the message was recalled meanwhile", async () => {
    h.findUnique.mockResolvedValue({ isDeleted: true, metadata: { recalledAtMs: 1 } });
    const response = await retranslate({ messageId: "u-1700000000000-1", language: "en" });
    expect(response.status).toBe(404);
    expect(h.upsert).not.toHaveBeenCalled();
    expect(h.charge).not.toHaveBeenCalled();
  });
});
