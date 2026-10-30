import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type MyPageProfileCacheModule = typeof import("@/components/my-page-profile-cache");

const STORAGE_KEY = "mingle:my-page-profile-cache:v1:user-1";

function createStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear() {
      values.clear();
    },
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    key(index: number) {
      return [...values.keys()][index] ?? null;
    },
    removeItem(key: string) {
      values.delete(key);
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
  };
}

describe("my page profile cache", () => {
  let cache: MyPageProfileCacheModule;
  let localStorage: Storage;

  const loadFreshModule = async () => {
    vi.resetModules();
    cache = await import("@/components/my-page-profile-cache");
  };

  const buildProfile = () => ({
    ...cache.createEmptyMyPageProfile(),
    image: "https://cdn.example/profile.png",
    imageCropScale: 1.4,
    imageCropX: 0.2,
    imageCropY: -0.1,
    handle: "mingle.name",
    name: "Mingle Name",
    bio: "Hello",
    bioDraft: "Unpublished",
    nationality: "ko",
    primaryLanguages: ["ko", "en"],
    defaultConversationLanguages: ["ko", "ja"],
    location: {
      latitude: 37.5,
      longitude: 127,
      city: "Seoul",
      country: "South Korea",
      countryCode: "KR",
    },
    birthDate: { year: 1995, month: 4, day: 2 },
    followersCount: 12,
    followingCount: 7,
  });

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-10T09:00:00.000Z"));
    localStorage = createStorage();
    vi.stubGlobal("window", { localStorage });
    await loadFreshModule();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("returns the full profile on the next mount within the same session", () => {
    const profile = buildProfile();

    cache.writeMyPageProfileCache("user-1", profile);

    expect(cache.readMyPageProfileMemoryCache("user-1")).toEqual(profile);
    expect(cache.readMyPageProfileMemoryCache("user-2")).toBeNull();
  });

  it("starts a fresh page load without a memory snapshot so hydration matches the server", async () => {
    cache.writeMyPageProfileCache("user-1", buildProfile());

    await loadFreshModule();

    expect(cache.readMyPageProfileMemoryCache("user-1")).toBeNull();
  });

  it("restores the profile header after a cold start without the private fields", async () => {
    const profile = buildProfile();
    cache.writeMyPageProfileCache("user-1", profile);

    await loadFreshModule();

    expect(cache.readMyPageProfileCache("user-1")).toEqual({
      ...profile,
      bioDraft: undefined,
      birthDate: null,
      location: null,
    });
    expect(localStorage.getItem(STORAGE_KEY)).not.toContain("Seoul");
    expect(localStorage.getItem(STORAGE_KEY)).not.toContain("Unpublished");
    expect(localStorage.getItem(STORAGE_KEY)).not.toContain("1995");
  });

  it("drops a persisted snapshot that is too old or malformed", async () => {
    cache.writeMyPageProfileCache("user-1", buildProfile());
    await loadFreshModule();
    vi.setSystemTime(new Date("2026-10-18T09:00:00.000Z"));

    expect(cache.readMyPageProfileCache("user-1")).toBeNull();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();

    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      savedAt: Date.now(),
      profile: { name: "Mingle Name" },
    }));

    expect(cache.readMyPageProfileCache("user-1")).toBeNull();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("removes every cached profile on sign-out", () => {
    cache.writeMyPageProfileCache("user-1", buildProfile());
    cache.writeMyPageProfileCache("user-2", buildProfile());
    localStorage.setItem("mingle:conversation-list-cache:v2:default:user%3Auser-1", "{}");

    cache.clearMyPageProfileCache();

    expect(cache.readMyPageProfileCache("user-1")).toBeNull();
    expect(cache.readMyPageProfileCache("user-2")).toBeNull();
    expect(localStorage.length).toBe(1);
  });
});
