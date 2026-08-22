import type { Prisma } from "@prisma/client";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ADMIN_SESSION_COOKIE_NAME, verifyAdminSessionToken } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";

const MESSAGE_PAGE_SIZE = 200;
type DeletedFilter = "all" | "active" | "deleted";

function first(value: string | string[] | undefined): string {
  return typeof value === "string" ? value.trim() : Array.isArray(value) ? (value[0] ?? "").trim() : "";
}

function normalizePage(value: string): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 100_000) : 1;
}

function normalizeDeletedFilter(value: string): DeletedFilter {
  return value === "active" || value === "deleted" ? value : "all";
}

function messageDeletedWhere(filter: DeletedFilter): Prisma.AppMessageWhereInput {
  return filter === "deleted" ? { isDeleted: true } : filter === "active" ? { isDeleted: { not: true } } : {};
}

export async function GET(
  request: Request,
  context: { params: Promise<{ conversationId: string }> },
) {
  const store = await cookies();
  if (!verifyAdminSessionToken(store.get(ADMIN_SESSION_COOKIE_NAME)?.value)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { conversationId } = await context.params;
  const url = new URL(request.url);
  const externalUserId = first(url.searchParams.get("userId") ?? "");
  const messageDeleted = normalizeDeletedFilter(first(url.searchParams.get("messageDeleted") ?? ""));
  const page = normalizePage(first(url.searchParams.get("page") ?? ""));
  if (!externalUserId) return NextResponse.json({ error: "Missing userId" }, { status: 400 });

  const user = await prisma.user.findUnique({ where: { externalUserId }, select: { id: true } });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const channel = await prisma.appConversationChannel.findFirst({
    where: { id: conversationId, ownerUserId: user.id },
    select: { sessionKey: true },
  });
  if (!channel) return NextResponse.json({ error: "Conversation not found" }, { status: 404 });

  const where: Prisma.AppMessageWhereInput = {
    userId: user.id,
    sessionKey: channel.sessionKey,
    ...messageDeletedWhere(messageDeleted),
  };
  const messageCount = await prisma.appMessage.count({ where });
  const totalPages = Math.max(1, Math.ceil(messageCount / MESSAGE_PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const messages = await prisma.appMessage.findMany({
    where,
    orderBy: { createdAt: "desc" },
    skip: (safePage - 1) * MESSAGE_PAGE_SIZE,
    take: MESSAGE_PAGE_SIZE,
    select: {
      id: true,
      sourceLanguage: true,
      isDeleted: true,
      createdAt: true,
      contents: {
        where: messageDeleted === "deleted" ? { isDeleted: true } : messageDeleted === "active" ? { isDeleted: { not: true } } : {},
        orderBy: { createdAt: "asc" },
        select: { contentType: true, language: true, text: true, isDeleted: true },
      },
    },
  });

  return NextResponse.json({
    messages: messages.map((message) => ({ ...message, createdAt: message.createdAt.toISOString() })),
    messageCount,
    page: safePage,
    totalPages,
    hasNext: safePage < totalPages,
  });
}
