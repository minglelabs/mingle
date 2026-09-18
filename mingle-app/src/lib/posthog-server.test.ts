import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockCapture, mockPostHog } = vi.hoisted(() => ({
  mockCapture: vi.fn(),
  mockPostHog: vi.fn(),
}));

vi.mock("posthog-node", () => ({
  PostHog: mockPostHog,
}));

const originalToken = process.env.POSTHOG_TOKEN;
const originalHost = process.env.POSTHOG_HOST;

describe("captureMingleEvent", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.POSTHOG_TOKEN = "project-token";
    delete process.env.POSTHOG_HOST;
    mockPostHog.mockImplementation(() => ({ capture: mockCapture }));
  });

  afterEach(() => {
    if (originalToken === undefined) delete process.env.POSTHOG_TOKEN;
    else process.env.POSTHOG_TOKEN = originalToken;
    if (originalHost === undefined) delete process.env.POSTHOG_HOST;
    else process.env.POSTHOG_HOST = originalHost;
  });

  it("creates a server client from the project token and omits undefined properties", async () => {
    const { captureMingleEvent } = await import("@/lib/posthog-server");

    captureMingleEvent({
      distinctId: "anon_1",
      event: "mingle_stt_session_started",
      properties: {
        app_version: "2.0.0",
        secret_value: undefined,
      },
    });

    expect(mockPostHog).toHaveBeenCalledWith("project-token", {
      host: "https://us.i.posthog.com",
      flushAt: 20,
      flushInterval: 10_000,
      disableGeoip: true,
    });
    expect(mockCapture).toHaveBeenCalledWith({
      distinctId: "anon_1",
      event: "mingle_stt_session_started",
      properties: { app_version: "2.0.0" },
    });
  });

  it("does nothing when the server token is absent", async () => {
    delete process.env.POSTHOG_TOKEN;
    const { captureMingleEvent } = await import("@/lib/posthog-server");

    captureMingleEvent({ distinctId: "anon_1", event: "mingle_event" });

    expect(mockPostHog).not.toHaveBeenCalled();
    expect(mockCapture).not.toHaveBeenCalled();
  });
});

