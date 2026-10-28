import { generateKeyPairSync } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const createNotification = vi.fn();
const findNotification = vi.fn();
const deleteTokens = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    userNotification: {
      create: (...args: unknown[]) => createNotification(...args),
      findUnique: (...args: unknown[]) => findNotification(...args),
    },
    userPushToken: { deleteMany: (...args: unknown[]) => deleteTokens(...args) },
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

function sentFcmMessages(): Array<{ notification: { title: string; body: string }; data: Record<string, string> }> {
  return fetchMock.mock.calls
    .filter(([url]) => String(url).includes("fcm.googleapis.com"))
    .map(([, init]) => JSON.parse(String((init as RequestInit).body)).message);
}

function storedNotification(type: string, body: string, pageLanguage: string) {
  return {
    id: "notification-1",
    type,
    body,
    recipient: {
      language: "en",
      pageLanguage,
      pushTokens: [{ id: "t1", platform: "android", token: "device-token", environment: "production" }],
    },
    actor: null,
  };
}

describe("notifyUserFromTeam", () => {
  beforeEach(() => {
    vi.resetModules();
    createNotification.mockReset();
    findNotification.mockReset();
    deleteTokens.mockReset();
    fetchMock.mockReset();
    createNotification.mockResolvedValue({ id: "notification-1" });
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
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("stores an actor-less in-app notification and pushes the reply in the recipient's language", async () => {
    findNotification.mockResolvedValue(storedNotification("feedback_reply", "  สวัสดีครับ\n\nขอบคุณครับ  ", "th"));
    const { notifyUserFromTeam } = await import("./team-notifications");

    await notifyUserFromTeam({
      recipientId: "user-1",
      type: "feedback_reply",
      body: "  สวัสดีครับ\n\nขอบคุณครับ  ",
      targetId: "feedback-1",
    });

    expect(createNotification).toHaveBeenCalledWith({
      data: {
        recipientId: "user-1",
        type: "feedback_reply",
        body: "  สวัสดีครับ\n\nขอบคุณครับ  ",
        targetId: "feedback-1",
      },
      select: { id: true },
    });
    expect(sentFcmMessages()).toEqual([
      expect.objectContaining({
        notification: { title: "มีคำตอบสำหรับความคิดเห็นของคุณ", body: "สวัสดีครับ ขอบคุณครับ" },
        data: { type: "feedback_reply", notificationId: "notification-1" },
      }),
    ]);
  });

  it("pushes a localized outcome for a report status", async () => {
    findNotification.mockResolvedValue(storedNotification("report_status", "rejected", "ru"));
    const { notifyUserFromTeam } = await import("./team-notifications");

    await notifyUserFromTeam({ recipientId: "user-1", type: "report_status", body: "rejected", targetId: "report-1" });

    expect(sentFcmMessages().map((message) => message.notification)).toEqual([
      {
        title: "Результат рассмотрения жалобы",
        body: "Мы рассмотрели вашу жалобу и не обнаружили нарушений.",
      },
    ]);
  });

  it("does not throw or push when the notification cannot be stored", async () => {
    createNotification.mockRejectedValue(new Error("db down"));
    const { notifyUserFromTeam } = await import("./team-notifications");

    await expect(notifyUserFromTeam({
      recipientId: "user-1", type: "report_reply", body: "Hello", targetId: "report-1",
    })).resolves.toBeUndefined();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps the in-app notification when the push fails", async () => {
    findNotification.mockRejectedValue(new Error("push lookup failed"));
    const { notifyUserFromTeam } = await import("./team-notifications");

    await expect(notifyUserFromTeam({
      recipientId: "user-1", type: "report_reply", body: "Hello", targetId: "report-1",
    })).resolves.toBeUndefined();

    expect(createNotification).toHaveBeenCalledTimes(1);
  });
});
