import { type NextRequest, NextResponse, after } from "next/server";
import { resolveBioDisplayLanguage } from "@/lib/profile-bio";
import { fillNameTransliterations, nameLanguageOf, readNameTransliterations } from "@/server/name-transliteration";
import { getServerSession } from "next-auth";
import { getAuthOptions } from "@/lib/auth-options";
import { getPublishedBioText } from "@/server/profile-bio";
import { prisma } from "@/lib/prisma";
import { normalizeHandle } from "@/lib/handles";
import { zipInterestLanguages } from "@/lib/interest-languages";
import { sanitizeSttLanguageSelection } from "@/lib/stt-languages";
import { USER_IDENTITY_SELECT, identityBadgeFlags } from "@/server/identity/user-identity-select";
import { calculateProfileAge } from "@/server/user-profile";
import { normalizeProfileGender } from "@/lib/profile-gender";
import { resolveNationalityCountry } from "@/lib/nationality";
import { getMemberNumber } from "@/server/member-number";

export const runtime = "nodejs";

type UserProfileRouteProps = {
  params: Promise<{
    userId: string;
  }>;
};

function getSessionUserId(session: { user?: { id?: unknown } } | null): string {
  return typeof session?.user?.id === "string" ? session.user.id.trim() : "";
}

function responseJson(payload: object, init?: ResponseInit): NextResponse {
  return NextResponse.json(payload, {
    ...init,
    headers: {
      "Cache-Control": "private, no-store",
      ...init?.headers,
    },
  });
}

const userProfileSelect = {
  // Identity + badge flags (official / operator).
  ...USER_IDENTITY_SELECT,
  birthDate: true,
  gender: true,
  bio: true,
  nationality: true,
  nationalityCountry: true,
  primaryLanguages: true,
  interestLanguages: true,
  interestLanguageLevels: true,
  locationLatitude: true,
  locationLongitude: true,
  locationCity: true,
  locationCountry: true,
  locationCountryCode: true,
  faceVerifiedAt: true,
  phoneVerifiedAt: true,
  heightCm: true,
  createdAt: true,
  _count: {
    select: {
      followerRelations: {
        where: { follower: { isActive: true } },
      },
      followingRelations: {
        where: { following: { isActive: true } },
      },
    },
  },
  followerRelations: {
    select: { followerId: true },
    take: 1,
  },
} as const;

export async function GET(request: NextRequest, { params }: UserProfileRouteProps) {
  const viewerId = getSessionUserId(await getServerSession(getAuthOptions()));
  if (!viewerId) {
    return responseJson({ error: "unauthorized" }, { status: 401 });
  }

  const { userId: rawUserId } = await params;
  const userReference = rawUserId.trim();
  if (!userReference) {
    return responseJson({ error: "invalid_user_id" }, { status: 400 });
  }
  const normalizedHandle = normalizeHandle(userReference.startsWith("@")
    ? userReference.slice(1)
    : userReference).value;
  const userById = await prisma.user.findUnique({
    where: { id: userReference, isActive: true },
    select: {
      ...userProfileSelect,
      followerRelations: {
        where: { followerId: viewerId },
        ...userProfileSelect.followerRelations,
      },
    },
  });
  const user = userById ?? (normalizedHandle
    ? await prisma.user.findUnique({
        where: { handle: normalizedHandle, isActive: true },
        select: {
          ...userProfileSelect,
          followerRelations: {
            where: { followerId: viewerId },
            ...userProfileSelect.followerRelations,
          },
        },
      })
    : null);

  if (!user) {
    return responseJson({ error: "user_not_found" }, { status: 404 });
  }
  if (user.id === viewerId) {
    return responseJson({ error: "use_profile_endpoint" }, { status: 400 });
  }

  const block = await prisma.userBlock.findFirst({
    where: {
      OR: [
        { blockerId: viewerId, blockedId: user.id },
        { blockerId: user.id, blockedId: viewerId },
      ],
    },
    select: { blockerId: true, blockedId: true },
  });

  if (block?.blockerId === user.id) {
    return responseJson({ error: "user_unavailable" }, { status: 403 });
  }

  const primaryLanguages = sanitizeSttLanguageSelection(
    user.primaryLanguages,
    user.nationality ? [user.nationality] : [],
  );
  // The name written for the reader (owner, 2026-11-25): 李伟 → 리웨이 for a Korean reader.
  const reader = await prisma.user.findUnique({
    where: { id: viewerId },
    select: { defaultDisplayLanguage: true, primaryLanguages: true, defaultConversationLanguages: true },
  });
  const nameLanguage = nameLanguageOf(resolveBioDisplayLanguage(
    reader?.defaultDisplayLanguage,
    reader?.primaryLanguages ?? [],
    reader?.defaultConversationLanguages ?? [],
    request.nextUrl.searchParams.get("locale") ?? "en",
  ));
  const [bio, memberNumber, readerNames] = await Promise.all([
    getPublishedBioText(user.id, user.bio),
    getMemberNumber(user),
    nameLanguage ? readNameTransliterations([user], nameLanguage) : Promise.resolve(new Map<string, string>()),
  ]);
  const readerName = readerNames.get(user.id) ?? null;
  if (nameLanguage && !readerName) {
    after(() => fillNameTransliterations([user], nameLanguage).catch(() => 0));
  }
  return responseJson({
    id: user.id,
    handle: user.handle,
    name: user.name,
    ...(readerName ? { readerName } : {}),
    image: user.image,
    imageCropScale: user.imageCropScale,
    imageCropX: user.imageCropX,
    imageCropY: user.imageCropY,
    age: calculateProfileAge(user.birthDate),
    ...(normalizeProfileGender(user.gender) ? { gender: normalizeProfileGender(user.gender) } : {}),
    bio,
    nationality: user.nationality,
    nationalityCountry: resolveNationalityCountry(user.nationalityCountry, primaryLanguages),
    primaryLanguages,
    interestLanguages: zipInterestLanguages(user.interestLanguages, user.interestLanguageLevels)
      .filter((entry) => !primaryLanguages.includes(entry.code)),
    location: typeof user.locationLatitude === "number"
      && Number.isFinite(user.locationLatitude)
      && typeof user.locationLongitude === "number"
      && Number.isFinite(user.locationLongitude)
      ? {
          latitude: user.locationLatitude,
          longitude: user.locationLongitude,
          city: user.locationCity,
          country: user.locationCountry,
          countryCode: user.locationCountryCode,
        }
      : null,
    followersCount: user._count.followerRelations,
    followingCount: user._count.followingRelations,
    isFollowing: user.followerRelations.length > 0,
    isBlocked: block?.blockerId === viewerId,
    // Badge flags (official / operator) only when true; absent means false.
    ...identityBadgeFlags(user),
    // Passed the selfie check for the current photo.
    ...(user.faceVerifiedAt ? { faceVerified: true } : {}),
    // A verified number (never the number itself), shown as a chip.
    ...(user.phoneVerifiedAt ? { phoneVerified: true } : {}),
    ...(typeof user.heightCm === "number" ? { heightCm: user.heightCm } : {}),
    // "Member #N" (the order the account joined in); staff accounts have none.
    ...(memberNumber ? { memberNumber } : {}),
  });
}
