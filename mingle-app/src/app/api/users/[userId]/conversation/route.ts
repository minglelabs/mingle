import { type NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { getAuthOptions } from "@/lib/auth-options";
import { isSupportedLocale } from "@/i18n/config";
import { ConversationMessageError, getOrCreateDirectConversation } from "@/server/conversation-messages";

export const runtime = "nodejs";

type ConversationRouteProps = {
  params: Promise<{
    userId: string;
  }>;
};

const FAILURE_STATUS: Record<string, number> = {
  user_not_found: 404,
  user_blocked: 409,
  cannot_message_self: 400,
  conversation_not_found: 404,
  not_a_member: 403,
  no_participants: 400,
  too_many_participants: 400,
};

function getSessionUserId(session: { user?: { id?: unknown } } | null): string {
  return typeof session?.user?.id === "string" ? session.user.id.trim() : "";
}

export async function POST(request: NextRequest, { params }: ConversationRouteProps) {
  const viewerId = getSessionUserId(await getServerSession(getAuthOptions()));
  if (!viewerId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { userId } = await params;
  const partnerId = userId.trim();
  if (!partnerId) {
    return NextResponse.json({ error: "invalid_user_id" }, { status: 400 });
  }

  let locale = "en";
  try {
    const body = (await request.json()) as { locale?: unknown };
    if (typeof body?.locale === "string" && isSupportedLocale(body.locale.trim())) {
      locale = body.locale.trim();
    }
  } catch {
    // A body is optional here; the locale only affects the generated room title.
  }

  try {
    const conversation = await getOrCreateDirectConversation({ viewerId, partnerId, locale });
    return NextResponse.json({ conversation }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    if (error instanceof ConversationMessageError) {
      return NextResponse.json(
        { error: error.reason },
        { status: FAILURE_STATUS[error.reason] ?? 400 },
      );
    }
    throw error;
  }
}
