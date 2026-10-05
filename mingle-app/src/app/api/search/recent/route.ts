import { type NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { getAuthOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import {
  clearRecentSearches,
  deleteRecentSearch,
  listRecentSearches,
  normalizeRecentSearchQuery,
  recordRecentSearch,
} from "@/server/posts/recent-search-service";

export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "private, no-store" } as const;

function getSessionUserId(session: { user?: { id?: unknown } } | null): string {
  return typeof session?.user?.id === "string" ? session.user.id.trim() : "";
}

async function readJsonBody(request: NextRequest): Promise<Record<string, unknown> | null> {
  try {
    const parsed = await request.json();
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return null;
  }
}

/** List the account's recent searches (newest first, <=10, within 30 days). */
export async function GET() {
  const userId = getSessionUserId(await getServerSession(getAuthOptions()));
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const searches = await listRecentSearches(prisma, userId);
  return NextResponse.json({ searches }, { headers: NO_STORE });
}

/** Record a term the user searched. Body: { query: string }. */
export async function POST(request: NextRequest) {
  const userId = getSessionUserId(await getServerSession(getAuthOptions()));
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await readJsonBody(request);
  if (!body) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const query = normalizeRecentSearchQuery(body.query);
  if (!query) {
    return NextResponse.json({ error: "invalid_query" }, { status: 400 });
  }

  await recordRecentSearch(prisma, userId, query);
  const searches = await listRecentSearches(prisma, userId);
  return NextResponse.json({ searches }, { headers: NO_STORE });
}

/**
 * Delete recent searches. With `?q=<term>` (or a { query } body) removes one;
 * with `?all=true` removes every term for the account.
 */
export async function DELETE(request: NextRequest) {
  const userId = getSessionUserId(await getServerSession(getAuthOptions()));
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const clearAll = request.nextUrl.searchParams.get("all") === "true";
  if (clearAll) {
    await clearRecentSearches(prisma, userId);
    return NextResponse.json({ searches: [] }, { headers: NO_STORE });
  }

  const queryParam = request.nextUrl.searchParams.get("q");
  const rawQuery = queryParam != null
    ? queryParam
    : ((await readJsonBody(request))?.query as string | undefined) ?? "";
  const query = normalizeRecentSearchQuery(rawQuery);
  if (!query) {
    return NextResponse.json({ error: "invalid_query" }, { status: 400 });
  }

  await deleteRecentSearch(prisma, userId, query);
  const searches = await listRecentSearches(prisma, userId);
  return NextResponse.json({ searches }, { headers: NO_STORE });
}
