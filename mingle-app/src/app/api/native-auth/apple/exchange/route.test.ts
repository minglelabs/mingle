import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockAccountFindUnique,
  mockAccountUpsert,
  mockCreateWithDefaultHandle,
  mockUserCreate,
  mockUserFindUnique,
  mockUserUpdate,
} = vi.hoisted(() => ({
  mockAccountFindUnique: vi.fn(),
  mockAccountUpsert: vi.fn(),
  mockCreateWithDefaultHandle: vi.fn(),
  mockUserCreate: vi.fn(),
  mockUserFindUnique: vi.fn(),
  mockUserUpdate: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    account: {
      findUnique: mockAccountFindUnique,
      upsert: mockAccountUpsert,
    },
    user: {
      create: mockUserCreate,
      findUnique: mockUserFindUnique,
      update: mockUserUpdate,
    },
  },
}));

vi.mock("@/lib/handles", () => ({
  createWithDefaultHandle: mockCreateWithDefaultHandle,
}));

vi.mock("@/lib/native-auth-bridge", () => ({
  createNativeAuthBridgeToken: vi.fn(),
  resolveNativeAuthRequestId: vi.fn(),
  resolveSafeCallbackPath: vi.fn(),
}));

vi.mock("@/lib/native-auth-pending-store", () => ({
  savePendingNativeAuthResult: vi.fn(),
}));

vi.mock("@/lib/signup-welcome-onboarding", () => ({
  ensureSignupWelcomeOnboarding: vi.fn(),
}));

import { upsertNativeAppleUser } from "@/app/api/native-auth/apple/exchange/route";

describe("upsertNativeAppleUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAccountFindUnique.mockResolvedValue(null);
    mockAccountUpsert.mockImplementation(async ({ create }: { create: { userId: string } }) => ({
      userId: create.userId,
    }));
    mockCreateWithDefaultHandle.mockImplementation(
      async (_input: unknown, create: (handle: string) => Promise<unknown>) => create("apple-user"),
    );
  });

  it("uses the existing NextAuth Account link as the canonical Apple identity", async () => {
    mockAccountFindUnique.mockResolvedValue({
      user: {
        id: "account_user_1",
        email: "relay@example.com",
        name: "Existing User",
      },
    });
    mockUserUpdate.mockResolvedValue({
      id: "account_user_1",
      email: "relay@example.com",
      name: "Existing User",
    });

    const result = await upsertNativeAppleUser({
      appleSubject: "apple_subject_1",
      email: "",
      name: "",
    });

    expect(result).toEqual({
      user: {
        id: "account_user_1",
        email: "relay@example.com",
        name: "Existing User",
      },
      created: false,
    });
    expect(mockUserFindUnique).not.toHaveBeenCalled();
    expect(mockAccountUpsert).not.toHaveBeenCalled();
  });

  it("backfills an Account link for an existing native Apple user", async () => {
    mockUserFindUnique.mockResolvedValueOnce({
      id: "legacy_native_apple_user",
      email: "relay@example.com",
      name: "Apple User",
    });
    mockUserUpdate.mockResolvedValue({
      id: "legacy_native_apple_user",
      email: "relay@example.com",
      name: "Apple User",
    });

    const result = await upsertNativeAppleUser({
      appleSubject: "apple_subject_2",
      email: "relay@example.com",
      name: "Apple User",
    });

    expect(result.user.id).toBe("legacy_native_apple_user");
    expect(mockAccountUpsert).toHaveBeenCalledWith({
      where: {
        provider_providerAccountId: {
          provider: "apple",
          providerAccountId: "apple_subject_2",
        },
      },
      create: {
        userId: "legacy_native_apple_user",
        type: "oauth",
        provider: "apple",
        providerAccountId: "apple_subject_2",
      },
      update: {},
      select: { userId: true },
    });
  });

  it("links a newly created User to the stable Apple provider subject", async () => {
    mockUserFindUnique.mockResolvedValue(null);
    mockUserCreate.mockResolvedValue({
      id: "new_apple_user",
      email: null,
      name: "New Apple User",
    });

    const result = await upsertNativeAppleUser({
      appleSubject: "apple_subject_3",
      email: "",
      name: "New Apple User",
    });

    expect(result.created).toBe(true);
    expect(result.user.id).toBe("new_apple_user");
    expect(mockUserCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        externalUserId: "apple:apple_subject_3",
        handle: "apple-user",
      }),
      select: {
        id: true,
        name: true,
        email: true,
      },
    });
    expect(mockAccountUpsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({
        userId: "new_apple_user",
        provider: "apple",
        providerAccountId: "apple_subject_3",
      }),
    }));
  });

  it("uses the Account owner when a concurrent Apple exchange wins the link race", async () => {
    mockUserFindUnique.mockResolvedValueOnce({
      id: "candidate_user",
      email: "relay@example.com",
      name: "Candidate User",
    });
    mockUserUpdate
      .mockResolvedValueOnce({
        id: "candidate_user",
        email: "relay@example.com",
        name: "Candidate User",
      })
      .mockResolvedValueOnce({
        id: "canonical_user",
        email: "relay@example.com",
        name: "Canonical User",
      });
    mockAccountUpsert.mockResolvedValue({ userId: "canonical_user" });

    const result = await upsertNativeAppleUser({
      appleSubject: "apple_subject_race",
      email: "relay@example.com",
      name: "Apple User",
    });

    expect(result).toEqual({
      user: {
        id: "canonical_user",
        email: "relay@example.com",
        name: "Canonical User",
      },
      created: false,
    });
    expect(mockUserUpdate).toHaveBeenLastCalledWith(expect.objectContaining({
      where: { id: "canonical_user" },
    }));
  });
});
