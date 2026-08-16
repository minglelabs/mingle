import { type NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { getAuthOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { normalizeHandle } from "@/lib/handles";
import { sanitizeSttLanguageSelection } from "@/lib/stt-languages";

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
  id: true,
  handle: true,
  name: true,
  image: true,
  imageCropScale: true,
  imageCropX: true,
  imageCropY: true,
  bio: true,
  nationality: true,
  primaryLanguages: true,
  _count: {
    select: {
      followerRelations: true,
      followingRelations: true,
    },
  },
  followerRelations: {
    select: { followerId: true },
    take: 1,
  },
} as const;

export async function GET(_request: NextRequest, { params }: UserProfileRouteProps) {
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
    where: { id: userReference },
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
        where: { handle: normalizedHandle },
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

  return responseJson({
    id: user.id,
    handle: user.handle,
    name: user.name,
    image: user.image,
    imageCropScale: user.imageCropScale,
    imageCropX: user.imageCropX,
    imageCropY: user.imageCropY,
    bio: user.bio,
    nationality: user.nationality,
    primaryLanguages: sanitizeSttLanguageSelection(
      user.primaryLanguages,
      user.nationality ? [user.nationality] : [],
    ),
    followersCount: user._count.followerRelations,
    followingCount: user._count.followingRelations,
    isFollowing: user.followerRelations.length > 0,
    isBlocked: block?.blockerId === viewerId,
  });
}
