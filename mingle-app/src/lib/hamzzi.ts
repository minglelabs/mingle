import { prisma } from "@/lib/prisma";
import type { OperatorAccountRecord } from "@/server/operators/operator-guard";

/**
 * Hamzzi (햄찌), HashChat's hamster mascot: an official account (the
 * "Official" badge, never an operator) that greets every user and answers
 * DMs with an AI-written reply (src/server/hamzzi). The account is created on
 * first use with a fixed id, so no manual setup is needed in any environment.
 */
export const HAMZZI_USER_ID = "hamzzi0official0mascot0001";
export const HAMZZI_HANDLE = "hamzzi";
const HAMZZI_FALLBACK_HANDLE = "hamzzi_official";
export const HAMZZI_NAME = "Hamzzi";
export const HAMZZI_AVATAR_PATH = "/avatars/hamzzi.png";
const HAMZZI_BIO = "HashChat's hamster 🐹 Chat with me in any language you want to practice!";

const HAMZZI_SELECT = {
  id: true,
  handle: true,
  name: true,
  image: true,
  primaryLanguages: true,
  defaultConversationLanguages: true,
  defaultDisplayLanguage: true,
  isActive: true,
} as const;

/**
 * The avatar as an absolute URL when the site URL is known: native surfaces
 * (the share sheet's recent chats) only load absolute http(s) URLs.
 */
export function hamzziAvatarUrl(env: NodeJS.ProcessEnv = process.env): string {
  const base = (env.NEXT_PUBLIC_SITE_URL || env.NEXTAUTH_URL || "").trim().replace(/\/+$/, "");
  return /^https?:\/\//i.test(base) ? `${base}${HAMZZI_AVATAR_PATH}` : HAMZZI_AVATAR_PATH;
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === "P2002";
}

/**
 * The Hamzzi account, created when missing. Returns null when it exists but
 * was deactivated or deleted on purpose (staff turned Hamzzi off).
 */
export async function ensureHamzziAccount(): Promise<OperatorAccountRecord | null> {
  const existing = await prisma.user.findUnique({
    where: { id: HAMZZI_USER_ID },
    select: { ...HAMZZI_SELECT, isDeleted: true },
  });
  if (existing) {
    if (existing.isDeleted || !existing.isActive) return null;
    return {
      id: existing.id,
      handle: existing.handle,
      name: existing.name,
      image: existing.image,
      primaryLanguages: existing.primaryLanguages,
      defaultConversationLanguages: existing.defaultConversationLanguages,
      defaultDisplayLanguage: existing.defaultDisplayLanguage,
      isActive: existing.isActive,
    };
  }

  for (const handle of [HAMZZI_HANDLE, HAMZZI_FALLBACK_HANDLE]) {
    try {
      return await prisma.user.create({
        data: {
          id: HAMZZI_USER_ID,
          handle,
          name: HAMZZI_NAME,
          image: hamzziAvatarUrl(),
          bio: HAMZZI_BIO,
          isOfficial: true,
          primaryLanguages: ["en"],
          defaultConversationLanguages: ["en"],
          defaultDisplayLanguage: "en",
        },
        select: HAMZZI_SELECT,
      });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      // Another process created it first, or the handle is taken.
      const raced = await prisma.user.findUnique({ where: { id: HAMZZI_USER_ID }, select: HAMZZI_SELECT });
      if (raced) return raced.isActive ? raced : null;
    }
  }
  throw new Error("hamzzi_handle_unavailable");
}
