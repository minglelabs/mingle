import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ph = vi.hoisted(() => ({
  init: vi.fn(),
  identify: vi.fn(),
  register: vi.fn(),
  capture: vi.fn(),
  reset: vi.fn(),
  sessionRecordingStarted: vi.fn(() => true),
  stopSessionRecording: vi.fn(),
  startSessionRecording: vi.fn(),
}));

vi.mock("posthog-js", () => ({ default: ph }));
vi.mock("@/lib/api-contract", () => ({ clientApiNamespace: "" }));
vi.mock("@/components/LivePhoneDemo/realtime-storage", () => ({
  getOrCreateTrackingUserId: () => "anon_test",
  resetTrackingUserId: vi.fn(),
}));

type PostHogClientModule = typeof import("./posthog-client");

const location = { pathname: "/", hostname: "mingle.example", search: "" };

function visit(pathname: string) {
  location.pathname = pathname;
}

/** Fresh module per test: `initialized` is module state. */
async function loadClient(): Promise<PostHogClientModule> {
  vi.resetModules();
  return import("./posthog-client");
}

const CONFIG = { projectToken: "phc_testtoken123", host: "https://us.i.posthog.com" };

type BeforeSend = (event: { uuid: string; event: string; properties: Record<string, unknown> } | null) => unknown;

function beforeSendHooks(): BeforeSend[] {
  const hooks = ph.init.mock.calls[0][1].before_send;
  return Array.isArray(hooks) ? hooks : [hooks];
}

function runBeforeSend(event: { uuid: string; event: string; properties: Record<string, unknown> }): unknown {
  return beforeSendHooks().reduce<unknown>((current, hook) => (current ? hook(current as never) : current), event);
}

beforeEach(() => {
  vi.clearAllMocks();
  ph.sessionRecordingStarted.mockReturnValue(true);
  visit("/ko/conversations");
  vi.stubGlobal("window", { location });
  vi.stubGlobal("document", { documentElement: { lang: "ko" } });
  vi.stubGlobal("navigator", { language: "ko-KR" });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("PostHog on admin screens", () => {
  it("matches /admin and everything below it, nothing else", async () => {
    const { isPostHogExcludedPath } = await loadClient();
    expect(isPostHogExcludedPath("/admin")).toBe(true);
    expect(isPostHogExcludedPath("/admin/")).toBe(true);
    expect(isPostHogExcludedPath("/admin/inbox/conv_1")).toBe(true);
    expect(isPostHogExcludedPath("/administrator")).toBe(false);
    expect(isPostHogExcludedPath("/ko/admin")).toBe(false);
    expect(isPostHogExcludedPath("/")).toBe(false);
    expect(isPostHogExcludedPath(null)).toBe(false);
  });

  it("never starts PostHog on an admin screen (no pageview, autocapture or replay)", async () => {
    visit("/admin/inbox");
    const client = await loadClient();

    expect(client.initializeMinglePostHog(CONFIG)).toBe(false);
    client.captureMingleClientEvent("mingle_screen_viewed", { screen: "unknown" });
    client.identifyMinglePostHogAccount(true);

    expect(ph.init).not.toHaveBeenCalled();
    expect(ph.capture).not.toHaveBeenCalled();
    expect(ph.identify).not.toHaveBeenCalled();
  });

  it("starts on the first app route after an admin screen", async () => {
    visit("/admin");
    const client = await loadClient();
    expect(client.initializeMinglePostHog(CONFIG)).toBe(false);

    visit("/ko/conversations");
    expect(client.initializeMinglePostHog(CONFIG)).toBe(true);
    expect(ph.init).toHaveBeenCalledOnce();
  });

  it("drops every event captured while an admin screen is open, including replay snapshots", async () => {
    const client = await loadClient();
    expect(client.initializeMinglePostHog(CONFIG)).toBe(true);

    const appEvent = { uuid: "e1", event: "$pageview", properties: { $current_url: "https://mingle.example/ko/conversations?conversation=secret" } };
    expect(runBeforeSend(appEvent)).toMatchObject({ properties: { $current_url: "https://mingle.example/ko/conversations" } });

    visit("/admin/inbox/conv_1");
    for (const event of ["$pageview", "$autocapture", "$snapshot", "$pageleave", "mingle_screen_viewed"]) {
      expect(runBeforeSend({ uuid: "e2", event, properties: { $current_url: "https://mingle.example/admin/inbox/conv_1" } })).toBeNull();
    }

    // An event stamped with an admin URL is dropped even after leaving admin.
    visit("/ko/conversations");
    expect(runBeforeSend({ uuid: "e3", event: "$pageleave", properties: { $current_url: "https://mingle.example/admin/reports?status=open" } })).toBeNull();
  });

  it("skips custom events on admin screens once PostHog is running", async () => {
    const client = await loadClient();
    client.initializeMinglePostHog(CONFIG);
    ph.capture.mockClear();

    visit("/admin/reports");
    client.captureMingleClientEvent("mingle_screen_viewed", { screen: "unknown" });
    expect(ph.capture).not.toHaveBeenCalled();

    visit("/ko/conversations");
    client.captureMingleClientEvent("mingle_screen_viewed", { screen: "conversation_list" });
    expect(ph.capture).toHaveBeenCalledOnce();
  });

  it("pauses a running replay on admin screens and resumes it after", async () => {
    const client = await loadClient();
    client.initializeMinglePostHog(CONFIG);

    client.syncMinglePostHogRoute("/admin/inbox/conv_1");
    client.syncMinglePostHogRoute("/admin/inbox");
    expect(ph.stopSessionRecording).toHaveBeenCalledOnce();
    expect(ph.startSessionRecording).not.toHaveBeenCalled();

    client.syncMinglePostHogRoute("/ko/conversations");
    expect(ph.startSessionRecording).toHaveBeenCalledOnce();
    client.syncMinglePostHogRoute("/ko/connect");
    expect(ph.startSessionRecording).toHaveBeenCalledOnce();
  });

  it("never starts a replay that was not running before admin", async () => {
    const client = await loadClient();
    client.initializeMinglePostHog(CONFIG);
    ph.sessionRecordingStarted.mockReturnValue(false);

    client.syncMinglePostHogRoute("/admin");
    client.syncMinglePostHogRoute("/ko/conversations");
    expect(ph.stopSessionRecording).not.toHaveBeenCalled();
    expect(ph.startSessionRecording).not.toHaveBeenCalled();
  });
});
