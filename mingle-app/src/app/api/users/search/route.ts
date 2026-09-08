import { type NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { getAuthOptions } from "@/lib/auth-options";
import { ANONYMOUS_HANDLE_PREFIX } from "@/lib/handles";
import { prisma } from "@/lib/prisma";
import { buildPostHogRequestContext } from "@/lib/posthog-request-context";
import { buildSearchAnalyticsProperties } from "@/lib/search-analytics";
import { captureMingleEvent } from "@/lib/posthog-server";

export const runtime = "nodejs";

const MAX_SEARCH_LENGTH = 80;
const MAX_RESULTS = 20;

const userSearchSelect = {
  id: true,
  handle: true,
  name: true,
  image: true,
  imageCropScale: true,
  imageCropX: true,
  imageCropY: true,
} as const;

function getSessionUserId(session: { user?: { id?: unknown } } | null): string {
  return typeof session?.user?.id === "string" ? session.user.id.trim() : "";
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(getAuthOptions());
  const userId = getSessionUserId(session);
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const query = (request.nextUrl.searchParams.get("q") || "")
    .trim()
    .slice(0, MAX_SEARCH_LENGTH);

  if (!query) {
    return NextResponse.json({ users: [] }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  }

  const handleQuery = query.startsWith("@") ? query.slice(1) : query;
  if (!handleQuery) {
    return NextResponse.json({ users: [] }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  }

  const users = await prisma.user.findMany({
    where: {
      isActive: true,
      AND: [
        { id: { not: userId } },
        {
          NOT: {
            handle: { startsWith: ANONYMOUS_HANDLE_PREFIX, mode: "insensitive" },
          },
        },
        {
          blockingRelations: {
            none: { blockedId: userId },
          },
        },
        {
          blockedByRelations: {
            none: { blockerId: userId },
          },
        },
        {
          OR: [
            { handle: { contains: handleQuery, mode: "insensitive" } },
            { name: { contains: query, mode: "insensitive" } },
          ],
        },
      ],
    },
    orderBy: { updatedAt: "desc" },
    take: MAX_RESULTS,
    select: {
      ...userSearchSelect,
      followerRelations: {
        where: { followerId: userId },
        select: { followerId: true },
        take: 1,
      },
    },
  });

  try {
    const [requestContext, searchProperties] = await Promise.all([
      buildPostHogRequestContext(request, userId),
      buildSearchAnalyticsProperties(query),
    ]);
    captureMingleEvent({
      distinctId: requestContext.distinctId,
      event: "mingle_user_search_api_request",
      properties: {
        ...searchProperties,
        result_count: users.length,
        account_id_digest: requestContext.accountIdDigest,
        tracking_source: requestContext.trackingSource,
        client_platform: requestContext.clientPlatform,
        api_namespace: requestContext.apiNamespace,
        app_version: requestContext.appVersion,
      },
    });
  } catch (error) {
    console.warn("[posthog] user search analytics failed", {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return NextResponse.json({
    users: users.map(({ followerRelations, ...user }) => ({
      ...user,
      isFollowing: followerRelations.length > 0,
    })),
  }, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
