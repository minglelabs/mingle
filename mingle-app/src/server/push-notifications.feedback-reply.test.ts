import { generateKeyPairSync } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const findUnique = vi.fn();
const deleteMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: (...args: unknown[]) => findUnique(...args) },
    userPushToken: { deleteMany: (...args: unknown[]) => deleteMany(...args) },
  },
}));

const { privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});

const fetchMock = vi.fn();

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

function sentFcmMessages(): Array<{ token: string; notification: { title: string; body: string }; data: Record<string, string> }> {
  return fetchMock.mock.calls
    .filter(([url]) => String(url).includes("fcm.googleapis.com"))
    .map(([, init]) => JSON.parse(String((init as RequestInit).body)).message);
}

describe("sendPushNotificationForFeedbackReply", () => {
  beforeEach(() => {
    vi.resetModules();
    findUnique.mockReset();
    deleteMany.mockReset();
    fetchMock.mockReset();
    fetchMock.mockImplementation(async (url: unknown) => (
      String(url).includes("oauth2.googleapis.com")
        ? jsonResponse({ access_token: "token", expires_in: 3600 })
        : jsonResponse({ name: "ok" })
    ));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("APNS_TEAM_ID", "");
    vi.stubEnv("FCM_PROJECT_ID", "project");
    vi.stubEnv("FCM_CLIENT_EMAIL", "push@example.com");
    vi.stubEnv("FCM_PRIVATE_KEY", privateKey);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("sends the reply text under a title in the recipient's language", async () => {
    findUnique.mockResolvedValue({
      language: "en",
      pageLanguage: "th",
      pushTokens: [{ id: "t1", platform: "android", token: "device-token", environment: "production" }],
    });
    const { sendPushNotificationForFeedbackReply } = await import("./push-notifications");

    await sendPushNotificationForFeedbackReply({
      replyId: "reply-1",
      recipientUserId: "user-1",
      replyText: "  สวัสดีครับ\n\nขอบคุณครับ  ",
    });

    expect(sentFcmMessages()).toEqual([
      expect.objectContaining({
        token: "device-token",
        notification: { title: "มีคำตอบสำหรับความคิดเห็นของคุณ", body: "สวัสดีครับ ขอบคุณครับ" },
        data: { type: "feedback_reply", notificationId: "reply-1", actorId: "" },
      }),
    ]);
  });

  it("falls back to the feedback locale, then English", async () => {
    findUnique.mockResolvedValue({
      language: null,
      pageLanguage: null,
      pushTokens: [{ id: "t1", platform: "android", token: "device-token", environment: "production" }],
    });
    const { sendPushNotificationForFeedbackReply } = await import("./push-notifications");

    await sendPushNotificationForFeedbackReply({
      replyId: "reply-1", recipientUserId: "user-1", replyText: "Спасибо", feedbackLocale: "ru",
    });
    await sendPushNotificationForFeedbackReply({
      replyId: "reply-2", recipientUserId: "user-1", replyText: "Thanks", feedbackLocale: "xx",
    });

    expect(sentFcmMessages().map((message) => message.notification.title)).toEqual([
      "Ответ на ваш отзыв",
      "Reply to your feedback",
    ]);
  });

  it("drops tokens the provider reports as unregistered", async () => {
    findUnique.mockResolvedValue({
      language: "en",
      pageLanguage: null,
      pushTokens: [{ id: "t1", platform: "android", token: "device-token", environment: "production" }],
    });
    fetchMock.mockImplementation(async (url: unknown) => (
      String(url).includes("oauth2.googleapis.com")
        ? jsonResponse({ access_token: "token", expires_in: 3600 })
        : jsonResponse({ error: { status: "UNREGISTERED" } }, 404)
    ));
    const { sendPushNotificationForFeedbackReply } = await import("./push-notifications");

    await sendPushNotificationForFeedbackReply({ replyId: "reply-1", recipientUserId: "user-1", replyText: "Thanks" });

    expect(deleteMany).toHaveBeenCalledWith({ where: { id: { in: ["t1"] } } });
  });

  it("sends nothing for an empty reply or a missing recipient", async () => {
    findUnique.mockResolvedValue(null);
    const { sendPushNotificationForFeedbackReply } = await import("./push-notifications");

    await sendPushNotificationForFeedbackReply({ replyId: "reply-1", recipientUserId: "user-1", replyText: "   " });
    await sendPushNotificationForFeedbackReply({ replyId: "reply-1", recipientUserId: "user-1", replyText: "Thanks" });

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
