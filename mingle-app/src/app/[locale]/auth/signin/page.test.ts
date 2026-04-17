import { beforeEach, describe, expect, it, vi } from "vitest";

const { redirectMock } = vi.hoisted(() => ({
  redirectMock: vi.fn((target: string) => {
    throw new Error(`REDIRECT:${target}`);
  }),
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

import LocaleSignInPage from "@/app/[locale]/auth/signin/page";

async function expectRedirect(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("REDIRECT:")) {
      return error.message.slice("REDIRECT:".length);
    }
    throw error;
  }

  throw new Error("Expected redirect to be thrown.");
}

describe("[locale]/auth/signin page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects to the requested provider sign-in route and appends the ngrok bypass parameter", async () => {
    const target = await expectRedirect(
      LocaleSignInPage({
        searchParams: Promise.resolve({
          provider: "apple",
          callbackUrl: "/api/native-auth/complete?requestId=req_1234567890ab",
        }),
      }),
    );

    expect(target).toBe(
      "/api/auth/signin/apple?callbackUrl=%2Fapi%2Fnative-auth%2Fcomplete%3FrequestId%3Dreq_1234567890ab&ngrok-skip-browser-warning=1",
    );
  });

  it("falls back to google and the root callback when the incoming query is empty", async () => {
    const target = await expectRedirect(
      LocaleSignInPage({
        searchParams: Promise.resolve({}),
      }),
    );

    expect(target).toBe(
      "/api/auth/signin/google?callbackUrl=%2F&ngrok-skip-browser-warning=1",
    );
  });
});
