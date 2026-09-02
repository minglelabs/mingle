import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getServerSessionMock,
  getUserProfileMock,
  notFoundMock,
} = vi.hoisted(() => ({
  getServerSessionMock: vi.fn(),
  getUserProfileMock: vi.fn(),
  notFoundMock: vi.fn(() => {
    throw new Error("NOT_FOUND");
  }),
}));

vi.mock("next-auth", () => ({
  getServerSession: getServerSessionMock,
}));

vi.mock("next/navigation", () => ({
  notFound: notFoundMock,
}));

vi.mock("@/lib/auth-options", () => ({
  getAuthOptions: () => ({}),
}));

vi.mock("@/server/user-profile", () => ({
  getUserProfile: getUserProfileMock,
}));

vi.mock("@/components/my-page", () => ({
  default: () => null,
}));

vi.mock("@/i18n", () => ({
  getDictionary: (locale: string) => ({ locale }),
  isSupportedLocale: (locale: string) => locale === "ko" || locale === "en",
}));

import MyPagePage from "@/app/[locale]/mypage/page";

describe("[locale]/mypage page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getServerSessionMock.mockResolvedValue({ user: { id: "user_123" } });
  });

  it("passes the server-loaded handle and follow counts into the first render", async () => {
    const profile = {
      id: "user_123",
      name: "Mingle Name",
      image: null,
      handle: "mingle.name",
      bio: "Hello",
      nationality: "ko",
      followersCount: 12,
      followingCount: 7,
    };
    getUserProfileMock.mockResolvedValue(profile);

    const element = await MyPagePage({ params: Promise.resolve({ locale: "ko" }) });

    expect(getUserProfileMock).toHaveBeenCalledWith("user_123");
    expect(element.props).toEqual(expect.objectContaining({
      initialProfile: profile,
      locale: "ko",
    }));
  });

  it("keeps the session-name fallback when no authenticated profile is available", async () => {
    getServerSessionMock.mockResolvedValue(null);

    const element = await MyPagePage({ params: Promise.resolve({ locale: "en" }) });

    expect(getUserProfileMock).not.toHaveBeenCalled();
    expect(element.props.initialProfile).toBeNull();
  });
});
