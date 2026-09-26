import { beforeEach, describe, expect, it, vi } from "vitest";

const { redirectMock } = vi.hoisted(() => ({
  redirectMock: vi.fn((path: string) => {
    // Next's redirect throws to unwind; mirror that so control never falls
    // through to a second redirect in the same render.
    throw new Error(`REDIRECT:${path}`);
  }),
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

import V110HomeEntry from "@/web/shared/v1.1.0/home-entry";

function landingFor(searchParams: Record<string, string | string[] | undefined>): string {
  redirectMock.mockClear();
  try {
    V110HomeEntry({ locale: "ko", searchParams });
  } catch {
    // The mocked redirect throws; the destination is captured below.
  }
  expect(redirectMock).toHaveBeenCalledTimes(1);
  return redirectMock.mock.calls[0][0] as string;
}

describe("v1.1.0 home entry rollout gate", () => {
  beforeEach(() => {
    redirectMock.mockClear();
  });

  it("sends a supported app (2.1.0+) to the feed", () => {
    expect(landingFor({ apiNamespace: "ios/v2.1.0" })).toBe("/ko/feed?apiNamespace=ios%2Fv2.1.0");
  });

  it("sends a pre-2.1.0 app (2.0.x) to the conversation list, not the feed", () => {
    expect(landingFor({ apiNamespace: "ios/v2.0.4" })).toBe("/ko/conversations?apiNamespace=ios%2Fv2.0.4");
  });

  it("sends a plain web visitor (no namespace) to the feed", () => {
    expect(landingFor({})).toBe("/ko/feed");
  });

  it("preserves a deep-link query through the feed redirect", () => {
    expect(landingFor({ postId: "p9" })).toBe("/ko/feed?postId=p9");
  });

  it("recovers a pre-2.1.0 native shell that only kept native params", () => {
    expect(landingFor({ nativePlatform: "ios", nativeClientVersion: "2.0.4" }))
      .toBe("/ko/conversations?nativePlatform=ios&nativeClientVersion=2.0.4");
  });
});
