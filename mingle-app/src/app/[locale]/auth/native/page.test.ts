import { beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const { redirectMock, nativeOAuthLauncherMock } = vi.hoisted(() => ({
  redirectMock: vi.fn((target: string) => {
    throw new Error(`REDIRECT:${target}`);
  }),
  nativeOAuthLauncherMock: vi.fn((props: {
    locale: string;
    provider: "apple" | "google";
    callbackUrl: string;
    text: {
      title: string;
    };
  }) =>
    createElement("div", {
      "data-locale": props.locale,
      "data-provider": props.provider,
      "data-callback-url": props.callbackUrl,
      "data-title": props.text.title,
    }),
  ),
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

vi.mock("@/components/native-oauth-launcher", () => ({
  default: nativeOAuthLauncherMock,
}));

vi.mock("@/i18n", () => ({
  getDictionary: (locale: string) => ({
    authLauncher: {
      title: `${locale} auth launcher`,
    },
  }),
  isSupportedLocale: (locale: string) => locale === "en" || locale === "ko",
}));

import NativeOAuthLaunchPage from "@/app/[locale]/auth/native/page";

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

describe("[locale]/auth/native page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects to root when the locale is unsupported", async () => {
    const target = await expectRedirect(
      NativeOAuthLaunchPage({
        params: Promise.resolve({ locale: "zz" }),
        searchParams: Promise.resolve({
          provider: "google",
          callbackUrl: "/api/native-auth/complete?requestId=req_1234567890ab",
        }),
      }),
    );

    expect(target).toBe("/");
  });

  it("redirects back to the locale home when provider or callback is missing", async () => {
    const target = await expectRedirect(
      NativeOAuthLaunchPage({
        params: Promise.resolve({ locale: "ko" }),
        searchParams: Promise.resolve({
          provider: "email",
        }),
      }),
    );

    expect(target).toBe("/ko");
  });

  it("renders the native OAuth launcher for valid provider and callback inputs", async () => {
    const element = await NativeOAuthLaunchPage({
      params: Promise.resolve({ locale: "en" }),
      searchParams: Promise.resolve({
        provider: "apple",
        callbackUrl: "/api/native-auth/complete?requestId=req_1234567890ab",
      }),
    });

    const markup = renderToStaticMarkup(element);

    expect(markup).toContain('data-locale="en"');
    expect(markup).toContain('data-provider="apple"');
    expect(markup).toContain(
      'data-callback-url="/api/native-auth/complete?requestId=req_1234567890ab"',
    );
    expect(markup).toContain('data-title="en auth launcher"');
  });
});
