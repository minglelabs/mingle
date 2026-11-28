import { type NextRequest, NextResponse, after } from "next/server";
import { getServerSession } from "next-auth";
import { getAuthOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { zipInterestLanguages } from "@/lib/interest-languages";
import { sanitizeSttLanguageSelection } from "@/lib/stt-languages";
import { resolveNationalityCountry } from "@/lib/nationality";
import { normalizeProfileGender } from "@/lib/profile-gender";
import { USER_IDENTITY_SELECT, identityBadgeFlags } from "@/server/identity/user-identity-select";
import { calculateProfileAge } from "@/server/user-profile";
import { BIO_DEFAULT_LANGUAGES, resolveBioDisplayLanguage, sameBioLanguage } from "@/lib/profile-bio";
import { requestBioTranslation } from "@/server/profile-bio";
import { fillNameTransliterations, nameLanguageOf, readNameTransliterations } from "@/server/name-transliteration";
import {
  buildPeopleDiscoverySql,
  parsePeopleDiscoveryFilters,
  decodePeopleDiscoveryCursor,
  encodePeopleDiscoveryCursor,
  bioCardLine,
  isNewDiscoveryUser, resolveDiscoveryActivityBadge,
  resolveViewerIsKorean,
  type PeopleDiscoveryRow,
} from "@/server/people-discovery";

export const runtime = "nodejs";

const DISCOVERY_PAGE_SIZE = 20;

function getSessionUserId(session: { user?: { id?: unknown } } | null): string {
  return typeof session?.user?.id === "string" ? session.user.id.trim() : "";
}

const NO_STORE = { "Cache-Control": "private, no-store" };

/**
 * The published bio of each user, in the language it was written in. A user
 * with a bio state shows the published version only (an unpublished draft
 * stays hidden); a user without one still has the plain `bio` column.
 */
async function readPublishedBios(
  users: { id: string; bio: string | null }[],
  readingLanguage: string,
): Promise<{ bios: Map<string, string | null>; untranslated: string[] }> {
  const bios = new Map<string, string | null>(users.map((user) => [user.id, user.bio]));
  // Bios with no translation into the reader's language yet (asked for in the background).
  const untranslated: string[] = [];
  if (users.length === 0) return { bios, untranslated };
  const states = await prisma.profileBioState.findMany({
    where: { userId: { in: users.map((user) => user.id) } },
    select: { userId: true, publishedVersionId: true },
  });
  const versionIds = states.map((state) => state.publishedVersionId).filter((id): id is string => Boolean(id));
  const [versions, translations] = versionIds.length > 0
    ? await Promise.all([
      prisma.profileBioVersion.findMany({ where: { id: { in: versionIds } }, select: { id: true, sourceText: true, sourceLanguage: true } }),
      // The reader's own language (owner, 2026-11-25), when a translation exists.
      prisma.profileBioTranslation.findMany({
        where: { versionId: { in: versionIds }, language: readingLanguage, status: "succeeded" },
        select: { versionId: true, text: true },
      }),
    ])
    : [[], []];
  const versionById = new Map(versions.map((version) => [version.id, version]));
  const translatedByVersion = new Map(translations.map((row) => [row.versionId, row.text]));
  const withState = new Set<string>();
  for (const state of states) {
    withState.add(state.userId);
    const version = state.publishedVersionId ? versionById.get(state.publishedVersionId) : undefined;
    if (!version) {
      bios.set(state.userId, null);
      continue;
    }
    const translated = translatedByVersion.get(version.id)?.trim();
    if (translated) bios.set(state.userId, translated);
    else {
      bios.set(state.userId, version.sourceText);
      if (version.sourceText?.trim() && !sameBioLanguage(version.sourceLanguage, readingLanguage)) untranslated.push(state.userId);
    }
  }
  // A plain bio with no state yet is detected and translated on request too.
  for (const user of users) if (!withState.has(user.id) && user.bio?.trim()) untranslated.push(user.id);
  return { bios, untranslated };
}

/**
 * GET /api/users/discover?locale=ko&cursor=…
 * People cards for the home tab (see `@/server/people-discovery`).
 */
const LIVE_WINDOW_MS = 60 * 60 * 1000;

export async function GET(request: NextRequest) {
  const viewerId = getSessionUserId(await getServerSession(getAuthOptions()));
  if (!viewerId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: NO_STORE });
  }

  const cursor = decodePeopleDiscoveryCursor(request.nextUrl.searchParams.get("cursor"));
  if (cursor === "invalid") {
    return NextResponse.json({ error: "invalid_cursor" }, { status: 400, headers: NO_STORE });
  }

  const viewer = await prisma.user.findUnique({
    where: { id: viewerId },
    select: { nationalityCountry: true, nationality: true, primaryLanguages: true, defaultDisplayLanguage: true, defaultConversationLanguages: true },
  });
  // Bios and names read in the viewer's own language (owner, 2026-11-25).
  const readingLanguage = resolveBioDisplayLanguage(
    viewer?.defaultDisplayLanguage,
    viewer?.primaryLanguages ?? [],
    viewer?.defaultConversationLanguages ?? [],
    request.nextUrl.searchParams.get("locale") ?? "en",
  );
  const viewerIsKorean = resolveViewerIsKorean(viewer, request.nextUrl.searchParams.get("locale"));

  const rankedRows = await prisma.$queryRaw<PeopleDiscoveryRow[]>(buildPeopleDiscoverySql({
    viewerId,
    viewerIsKorean,
    cursor,
    take: DISCOVERY_PAGE_SIZE + 1,
    // gender, ageMin, ageMax, online=1 (the explore filter sheet).
    filters: parsePeopleDiscoveryFilters(request.nextUrl.searchParams),
  }));

  const hasMore = rankedRows.length > DISCOVERY_PAGE_SIZE;
  const pageRows = hasMore ? rankedRows.slice(0, DISCOVERY_PAGE_SIZE) : rankedRows;
  const lastRow = pageRows[pageRows.length - 1];
  const nextCursor = hasMore && lastRow
    ? encodePeopleDiscoveryCursor({ tier: Number(lastRow.tier), lastSeenAt: new Date(lastRow.lastSeenAt), id: lastRow.id })
    : null;

  const pageIds = pageRows.map((row) => row.id);
  const details = pageIds.length > 0
    ? await prisma.user.findMany({
      where: { id: { in: pageIds } },
      select: {
        ...USER_IDENTITY_SELECT,
        birthDate: true,
        gender: true,
        nationality: true,
        nationalityCountry: true,
        primaryLanguages: true,
        interestLanguages: true,
        interestLanguageLevels: true,
        createdAt: true,
        lastSeenAt: true,
        bio: true,
        heightCm: true,
        // Whether the viewer follows this person, for the Follow button on the card.
        followerRelations: { where: { followerId: viewerId }, select: { followerId: true }, take: 1 },
      },
    })
    : [];
  const { bios: bioById, untranslated } = await readPublishedBios(details, readingLanguage);
  const nameLanguage = nameLanguageOf(readingLanguage);
  const nameById = nameLanguage ? await readNameTransliterations(details, nameLanguage) : new Map<string, string>();
  // What is missing is made in the background for the next look: bios only into
  // the four languages every bio is translated into, a few per page.
  after(async () => {
    if ((BIO_DEFAULT_LANGUAGES as readonly string[]).includes(readingLanguage)) {
      for (const userId of untranslated.slice(0, 6)) {
        // The request only claims the work; the returned job does it.
        const job = await requestBioTranslation(userId, readingLanguage).catch(() => null);
        if (job) await job().catch(() => undefined);
      }
    }
    if (nameLanguage) await fillNameTransliterations(details, nameLanguage).catch(() => 0);
  });
  const detailById = new Map(details.map((user) => [user.id, user]));
  const now = new Date();

  const users = pageIds
    .map((id) => detailById.get(id))
    .filter((user): user is NonNullable<typeof user> => Boolean(user))
    .map((user) => {
      const primaryLanguages = sanitizeSttLanguageSelection(
        user.primaryLanguages,
        user.nationality ? [user.nationality] : [],
      );
      const interestLanguages = zipInterestLanguages(user.interestLanguages, user.interestLanguageLevels)
        .filter((entry) => !primaryLanguages.includes(entry.code));
      const age = calculateProfileAge(user.birthDate, now);
      const gender = normalizeProfileGender(user.gender);
      const badge = resolveDiscoveryActivityBadge(user, now);
      const isNew = isNewDiscoveryUser(user, now);
      // Seen in the last hour: a live dot on the card (owner, 2026-11-25; no label anywhere).
      const live = now.getTime() - user.lastSeenAt.getTime() <= LIVE_WINDOW_MS;
      return {
        id: user.id,
        handle: user.handle,
        // The name written for the reader (李伟 → 리웨이); the original when there is none yet.
        name: nameById.get(user.id) ?? user.name,
        image: user.image,
        imageCropScale: user.imageCropScale,
        imageCropX: user.imageCropX,
        imageCropY: user.imageCropY,
        ...(age !== undefined ? { age } : {}),
        ...(gender ? { gender } : {}),
        nationalityCountry: resolveNationalityCountry(user.nationalityCountry, primaryLanguages),
        primaryLanguages,
        interestLanguages,
        ...(badge ? { badge } : {}),
        ...(isNew ? { isNew: true } : {}),
        ...(live ? { live: true } : {}),
        bio: bioCardLine(bioById.get(user.id)),
        ...(typeof user.heightCm === "number" ? { heightCm: user.heightCm } : {}),
        isFollowing: user.followerRelations.length > 0,
        ...identityBadgeFlags(user),
      };
    });

  return NextResponse.json({
    users,
    nextCursor,
    // Which side the viewer is on, so the client can title the grid ("Korean friends" vs "friends from abroad").
    viewerSide: viewerIsKorean ? "korean" : "foreign",
  }, { headers: NO_STORE });
}
