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
import { composeHref, feedHref, postViewerHref } from "@/lib/feed-routes";
import { composeLoginHref, loginHref } from "@/components/feed/login-redirect";

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

  async function callbackFor(callbackUrl: string | string[] | undefined): Promise<string> {
    const target = await expectRedirect(
      LocaleSignInPage({ searchParams: Promise.resolve({ provider: "google", callbackUrl }) }),
    );
    const url = new URL(target, "https://mingle.local");
    expect(url.pathname).toBe("/api/auth/signin/google");
    return url.searchParams.get("callbackUrl") ?? "";
  }

  // The callbacks the app itself builds must keep working unchanged.
  const accepted: Array<[string, string]> = [
    ["feed", feedHref("ko")],
    ["feed anchored on a post (like → login → back)", feedHref("ko", { postId: "post_123" })],
    ["feed anchored on a comment", feedHref("en", { postId: "post_123", commentId: "c_9" })],
    ["compose", composeHref("ja")],
    ["compose with a draft", composeHref("ja", { draftId: "draft_1" })],
    ["author post viewer", postViewerHref("ko", { kind: "author", authorId: "u_1" }, "post_123")],
    ["native auth bridge", "/api/native-auth/complete?provider=apple&requestId=req_1234567890ab"],
    ["root", "/"],
    ["hash fragment", "/ko/feed#top"],
  ];

  it.each(accepted)("keeps the app callback: %s", async (_label, path) => {
    expect(await callbackFor(path)).toBe(path);
  });

  it("round-trips the callbackUrl built by the feed login helpers", async () => {
    for (const href of [loginHref("ko", "post_123"), loginHref("en"), composeLoginHref("ja")]) {
      const params = new URL(href, "https://mingle.local").searchParams;
      expect(await callbackFor(params.get("callbackUrl") ?? undefined)).toBe(params.get("callbackUrl"));
    }
  });

  const refused: Array<[string, string]> = [
    ["absolute https URL", "https://evil.example/phish"],
    ["absolute http URL", "http://evil.example"],
    ["absolute URL on a same-looking host", "https://mingle.local/ko/feed"],
    ["protocol-relative URL", "//evil.example/ko/feed"],
    ["backslash protocol-relative URL", "/\\evil.example"],
    ["mixed slash and backslash", "/\\/evil.example"],
    ["tab-smuggled protocol-relative URL", "/\t/evil.example"],
    ["newline-smuggled protocol-relative URL", "/\n/evil.example"],
    ["javascript: URL", "javascript:alert(1)"],
    ["data: URL", "data:text/html,<script>alert(1)</script>"],
    ["relative path without a leading slash", "ko/feed"],
    ["dot relative path", "../ko/feed"],
    ["whitespace only", "   "],
  ];

  it.each(refused)("replaces a refused callback with the root path: %s", async (_label, value) => {
    expect(await callbackFor(value)).toBe("/");
  });

  it("uses the first value when callbackUrl is repeated", async () => {
    expect(await callbackFor(["https://evil.example", "/ko/feed"])).toBe("/");
    expect(await callbackFor(["/ko/feed", "https://evil.example"])).toBe("/ko/feed");
  });
});

