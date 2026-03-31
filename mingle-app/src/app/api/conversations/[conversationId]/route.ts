import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { getAuthOptions } from "@/lib/auth-options";
import {
  APP_CONVERSATION_STATUS_ACTIVE,
  APP_CONVERSATION_STATUS_PAUSED,
  normalizeConversationChannelStatus,
  updateConversationChannelStatus,
} from "@/lib/app-conversations";

type ConversationRouteProps = {
  params: Promise<{
    conversationId: string;
  }>;
};

function resolveSessionUserId(session: { user?: { id?: unknown } } | null): string {
  return typeof session?.user?.id === "string" ? session.user.id.trim() : "";
}

export async function PATCH(request: NextRequest, { params }: ConversationRouteProps) {
  const session = await getServerSession(getAuthOptions());
  const userId = resolveSessionUserId(session);

  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { status?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (typeof body.status !== "string") {
    return NextResponse.json({ error: "invalid_status" }, { status: 400 });
  }

  const normalizedStatus = normalizeConversationChannelStatus(body.status);
  const requestedStatus = body.status.trim().toLowerCase();
  if (
    requestedStatus !== APP_CONVERSATION_STATUS_ACTIVE
    && requestedStatus !== APP_CONVERSATION_STATUS_PAUSED
  ) {
    return NextResponse.json({ error: "invalid_status" }, { status: 400 });
  }

  const { conversationId } = await params;
  const conversation = await updateConversationChannelStatus({
    conversationId,
    userId,
    status: normalizedStatus,
  });

  if (!conversation) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  return NextResponse.json({ conversation });
}
