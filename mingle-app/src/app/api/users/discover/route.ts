import { type NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { getAuthOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { zipInterestLanguages } from "@/lib/interest-languages";
import { sanitizeSttLanguageSelection } from "@/lib/stt-languages";
import { resolveNationalityCountry } from "@/lib/nationality";
import { normalizeProfileGender } from "@/lib/profile-gender";
import { USER_IDENTITY_SELECT, identityBadgeFlags } from "@/server/identity/user-identity-select";
import { calculateProfileAge } from "@/server/user-profile";
import {
  buildPeopleDiscoverySql,
  decodePeopleDiscoveryCursor,
  encodePeopleDiscoveryCursor,
  bioCardLine,
  resolveDiscoveryBadge,
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
async function readPublishedBios(users: { id: string; bio: string | null }[]): Promise<Map<string, string | null>> {
  const bios = new Map<string, string | null>(users.map((user) => [user.id, user.bio]));
  if (users.length === 0) return bios;
  const states = await prisma.profileBioState.findMany({
    where: { userId: { in: users.map((user) => user.id) } },
    select: { userId: true, publishedVersionId: true },
  });
  const versionIds = states.map((state) => state.publishedVersionId).filter((id): id is string => Boolean(id));
  const versions = versionIds.length > 0
    ? await prisma.profileBioVersion.findMany({ where: { id: { in: versionIds } }, select: { id: true, sourceText: true } })
    : [];
  const textByVersion = new Map(versions.map((version) => [version.id, version.sourceText]));
  for (const state of states) {
    bios.set(state.userId, state.publishedVersionId ? textByVersion.get(state.publishedVersionId) ?? null : null);
  }
  return bios;
}

/**
 * GET /api/users/discover?locale=ko&cursor=…
 * People cards for the home tab (see `@/server/people-discovery`).
 */
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
    select: { nationalityCountry: true, nationality: true, primaryLanguages: true },
  });
  const viewerIsKorean = resolveViewerIsKorean(viewer, request.nextUrl.searchParams.get("locale"));

  const rankedRows = await prisma.$queryRaw<PeopleDiscoveryRow[]>(buildPeopleDiscoverySql({
    viewerId,
    viewerIsKorean,
    cursor,
    take: DISCOVERY_PAGE_SIZE + 1,
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
      },
    })
    : [];
  const bioById = await readPublishedBios(details);
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
      const badge = resolveDiscoveryBadge(user, now);
      return {
        id: user.id,
        handle: user.handle,
        name: user.name,
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
        bio: bioCardLine(bioById.get(user.id)),
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
