"use client";

const CONVERSATION_MEMBER_PROFILE_CACHE_KEY_PREFIX = "mingle:conversation-member-profiles-cache:v1";
const CONVERSATION_MEMBER_PROFILE_CACHE_MAX_STALE_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export type ConversationMemberProfile = {
  userId: string;
  image: string | null;
  imageCropScale: number | null;
  imageCropX: number | null;
  imageCropY: number | null;
  name: string | null;
};

export type ConversationMemberProfileCacheIdentity = {
  apiNamespace: string;
  conversationId: string;
  authenticatedUserId?: string | null;
  trackingUserId?: string | null;
};

export type ConversationMemberProfileCacheSnapshot = {
  savedAt: number;
  members: ConversationMemberProfile[];
};

const conversationMemberProfileMemoryCache = new Map<
  string,
  ConversationMemberProfileCacheSnapshot
>();

function normalizeNullableText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized || null;
}

function normalizeNullableFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function normalizeConversationMemberProfile(
  value: unknown,
): ConversationMemberProfile | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const candidate = value as Partial<ConversationMemberProfile>;
  const userId = typeof candidate.userId === "string" ? candidate.userId.trim() : "";
  if (!userId) return null;

  return {
    userId,
    image: normalizeNullableText(candidate.image),
    imageCropScale: normalizeNullableFiniteNumber(candidate.imageCropScale),
    imageCropX: normalizeNullableFiniteNumber(candidate.imageCropX),
    imageCropY: normalizeNullableFiniteNumber(candidate.imageCropY),
    name: normalizeNullableText(candidate.name),
  };
}

export function mergeConversationMemberProfiles(
  ...groups: readonly (readonly ConversationMemberProfile[])[]
): ConversationMemberProfile[] {
  const membersById = new Map<string, ConversationMemberProfile>();
  for (const group of groups) {
    for (const rawMember of group) {
      const member = normalizeConversationMemberProfile(rawMember);
      if (member) membersById.set(member.userId, member);
    }
  }
  return [...membersById.values()];
}

function buildConversationMemberProfileCacheKey(
  identity: ConversationMemberProfileCacheIdentity,
): string | null {
  const conversationId = identity.conversationId.trim();
  if (!conversationId) return null;

  const namespace = identity.apiNamespace.trim() || "default";
  const authenticatedUserId = identity.authenticatedUserId?.trim();
  const trackingUserId = identity.trackingUserId?.trim();
  const owner = authenticatedUserId
    ? `user:${authenticatedUserId}`
    : `tracking:${trackingUserId || "anonymous"}`;

  return `${CONVERSATION_MEMBER_PROFILE_CACHE_KEY_PREFIX}:${encodeURIComponent(namespace)}:${encodeURIComponent(owner)}:${encodeURIComponent(conversationId)}`;
}

function normalizeConversationMemberProfileCacheSnapshot(
  value: unknown,
  now = Date.now(),
): ConversationMemberProfileCacheSnapshot | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const candidate = value as Partial<ConversationMemberProfileCacheSnapshot>;
  if (
    typeof candidate.savedAt !== "number"
    || !Number.isFinite(candidate.savedAt)
    || candidate.savedAt > now + 60_000
    || now - candidate.savedAt > CONVERSATION_MEMBER_PROFILE_CACHE_MAX_STALE_AGE_MS
    || !Array.isArray(candidate.members)
  ) {
    return null;
  }

  return {
    savedAt: candidate.savedAt,
    members: mergeConversationMemberProfiles(candidate.members as ConversationMemberProfile[]),
  };
}

export function readConversationMemberProfileMemoryCache(
  identity: ConversationMemberProfileCacheIdentity,
): ConversationMemberProfileCacheSnapshot | null {
  if (typeof window === "undefined") return null;

  const storageKey = buildConversationMemberProfileCacheKey(identity);
  if (!storageKey) return null;

  const cached = normalizeConversationMemberProfileCacheSnapshot(
    conversationMemberProfileMemoryCache.get(storageKey),
  );
  if (cached) return cached;

  conversationMemberProfileMemoryCache.delete(storageKey);
  return null;
}

export function readConversationMemberProfileCache(
  identity: ConversationMemberProfileCacheIdentity,
): ConversationMemberProfileCacheSnapshot | null {
  if (typeof window === "undefined") return null;

  const storageKey = buildConversationMemberProfileCacheKey(identity);
  if (!storageKey) return null;

  const memoryCached = readConversationMemberProfileMemoryCache(identity);
  if (memoryCached) return memoryCached;

  const storageNames = ["localStorage", "sessionStorage"] as const;
  for (const storageName of storageNames) {
    try {
      const storage = window[storageName];
      const rawValue = storage.getItem(storageKey);
      if (!rawValue) continue;

      const cached = normalizeConversationMemberProfileCacheSnapshot(JSON.parse(rawValue));
      if (!cached) {
        storage.removeItem(storageKey);
        continue;
      }

      conversationMemberProfileMemoryCache.set(storageKey, cached);
      if (storageName === "sessionStorage") {
        try {
          window.localStorage.setItem(storageKey, JSON.stringify(cached));
        } catch {
          // Keep using the valid session snapshot when durable storage is restricted.
        }
      }
      return cached;
    } catch {
      // Try the next browser storage tier.
    }
  }

  return null;
}

export function writeConversationMemberProfileCache(
  identity: ConversationMemberProfileCacheIdentity,
  members: readonly ConversationMemberProfile[],
): void {
  if (typeof window === "undefined") return;

  const storageKey = buildConversationMemberProfileCacheKey(identity);
  if (!storageKey) return;

  const cached: ConversationMemberProfileCacheSnapshot = {
    savedAt: Date.now(),
    members: mergeConversationMemberProfiles(members),
  };
  conversationMemberProfileMemoryCache.set(storageKey, cached);

  const serialized = JSON.stringify(cached);
  try {
    window.localStorage.setItem(storageKey, serialized);
    return;
  } catch {
    // Fall back to session storage when durable WebView storage is restricted.
  }

  try {
    window.sessionStorage.setItem(storageKey, serialized);
  } catch {
    // The in-memory snapshot still keeps the current WebView warm.
  }
}

export function clearConversationMemberProfileCache(
  identity: ConversationMemberProfileCacheIdentity,
): void {
  if (typeof window === "undefined") return;

  const storageKey = buildConversationMemberProfileCacheKey(identity);
  if (!storageKey) return;

  conversationMemberProfileMemoryCache.delete(storageKey);
  for (const storageName of ["localStorage", "sessionStorage"] as const) {
    try {
      window[storageName].removeItem(storageKey);
    } catch {
      // Ignore storage restrictions; clearing the memory snapshot is sufficient for this tab.
    }
  }
}
