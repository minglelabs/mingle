import { type NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { getAuthOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import {
  buildPeopleSearchSql,
  decodePeopleSearchCursor,
  encodePeopleSearchCursor,
  type PeopleSearchRow,
} from "./people-search-query";
import { buildPostHogRequestContext } from "@/lib/posthog-request-context";
import { buildSearchAnalyticsProperties } from "@/lib/search-analytics";
import { captureMingleEvent } from "@/lib/posthog-server";

export const runtime = "nodejs";

const MAX_SEARCH_LENGTH = 80;
const SEARCH_PAGE_SIZE = 20;

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

  const cursor = decodePeopleSearchCursor(request.nextUrl.searchParams.get("cursor"));
  if (cursor === "invalid") {
    return NextResponse.json({ error: "invalid_cursor" }, { status: 400 });
  }

  // Ranking (exact → prefix → contains) and pagination run in SQL over the
  // whole match set, so page order is consistent across pages.
  const rankedRows = await prisma.$queryRaw<PeopleSearchRow[]>(buildPeopleSearchSql({
    viewerId: userId,
    query,
    handleQuery,
    cursor,
    take: SEARCH_PAGE_SIZE + 1,
  }));

  const hasMore = rankedRows.length > SEARCH_PAGE_SIZE;
  const pageRows = hasMore ? rankedRows.slice(0, SEARCH_PAGE_SIZE) : rankedRows;
  const lastRow = pageRows[pageRows.length - 1];
  const nextCursor = hasMore && lastRow
    ? encodePeopleSearchCursor({ tier: Number(lastRow.tier), updatedAt: new Date(lastRow.updatedAt), id: lastRow.id })
    : null;

  const pageIds = pageRows.map((row) => row.id);
  const details = pageIds.length > 0
    ? await prisma.user.findMany({
      where: { id: { in: pageIds } },
      select: {
        ...userSearchSelect,
        followerRelations: {
          where: { followerId: userId },
          select: { followerId: true },
          take: 1,
        },
      },
    })
    : [];
  const detailById = new Map(details.map((user) => [user.id, user]));
  // Keep the SQL order; a row that vanished between the two reads is skipped.
  const pageUsers = pageIds
    .map((id) => detailById.get(id))
    .filter((user): user is NonNullable<typeof user> => Boolean(user));

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
