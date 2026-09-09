import { type NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { getAuthOptions } from "@/lib/auth-options";
import { ANONYMOUS_HANDLE_PREFIX, RESERVED_SEARCH_HANDLE } from "@/lib/handles";
import { prisma } from "@/lib/prisma";
import { buildPostHogRequestContext } from "@/lib/posthog-request-context";
import { buildSearchAnalyticsProperties } from "@/lib/search-analytics";
import { captureMingleEvent } from "@/lib/posthog-server";

export const runtime = "nodejs";

const MAX_SEARCH_LENGTH = 80;
const SEARCH_PAGE_SIZE = 20;
const MAX_CURSOR_LENGTH = 512;

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

type SearchCursor = {
  updatedAt: Date;
  id: string;
};

function encodeSearchCursor(updatedAt: Date, id: string): string {
  return Buffer.from(JSON.stringify({
    updatedAt: updatedAt.toISOString(),
    id,
  }), "utf8").toString("base64url");
}

function decodeSearchCursor(rawCursor: string | null): SearchCursor | null | "invalid" {
  if (!rawCursor) return null;
  if (rawCursor.length > MAX_CURSOR_LENGTH) return "invalid";

  try {
    const parsed = JSON.parse(Buffer.from(rawCursor, "base64url").toString("utf8")) as {
      updatedAt?: unknown;
      id?: unknown;
    };
    if (typeof parsed.updatedAt !== "string" || typeof parsed.id !== "string" || !parsed.id.trim()) {
      return "invalid";
    }

    const updatedAt = new Date(parsed.updatedAt);
    if (Number.isNaN(updatedAt.getTime())) return "invalid";

    return { updatedAt, id: parsed.id };
  } catch {
    return "invalid";
  }
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

  const cursor = decodeSearchCursor(request.nextUrl.searchParams.get("cursor"));
  if (cursor === "invalid") {
    return NextResponse.json({ error: "invalid_cursor" }, { status: 400 });
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
          NOT: {
            handle: { equals: RESERVED_SEARCH_HANDLE, mode: "insensitive" },
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
        ...(cursor ? [{
          OR: [
            { updatedAt: { lt: cursor.updatedAt } },
            { updatedAt: cursor.updatedAt, id: { lt: cursor.id } },
          ],
        }] : []),
      ],
    },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    take: SEARCH_PAGE_SIZE + 1,
    select: {
      ...userSearchSelect,
      updatedAt: true,
      followerRelations: {
        where: { followerId: userId },
        select: { followerId: true },
        take: 1,
      },
    },
  });

  const hasMore = users.length > SEARCH_PAGE_SIZE;
  const pageUsers = hasMore ? users.slice(0, SEARCH_PAGE_SIZE) : users;
  const lastUser = pageUsers[pageUsers.length - 1];
  const nextCursor = hasMore && lastUser
    ? encodeSearchCursor(lastUser.updatedAt, lastUser.id)
    : null;

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
        result_count: pageUsers.length,
        has_more: hasMore,
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
    users: pageUsers.map((user) => ({
      id: user.id,
      handle: user.handle,
      name: user.name,
      image: user.image,
      imageCropScale: user.imageCropScale,
      imageCropX: user.imageCropX,
      imageCropY: user.imageCropY,
      isFollowing: user.followerRelations.length > 0,
    })),
    nextCursor,
  }, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
