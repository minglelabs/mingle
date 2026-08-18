import { type NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { getAuthOptions } from "@/lib/auth-options";
import { sanitizeSttLanguageSelection } from "@/lib/stt-languages";
import {
  ConversationMessageError,
  getMemberDisplayLanguages,
  setMemberDisplayLanguages,
} from "@/server/conversation-messages";

export const runtime = "nodejs";

type DisplayLanguagesRouteProps = {
  params: Promise<{
    conversationId: string;
  }>;
};

const FAILURE_STATUS: Record<string, number> = {
  not_a_member: 403,
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

function failureResponse(error: unknown): NextResponse {
  if (error instanceof ConversationMessageError) {
    return responseJson(
      { error: error.reason },
      { status: FAILURE_STATUS[error.reason] ?? 400 },
    );
  }
  throw error;
}

export async function GET(_request: NextRequest, { params }: DisplayLanguagesRouteProps) {
  const userId = getSessionUserId(await getServerSession(getAuthOptions()));
  if (!userId) return responseJson({ error: "unauthorized" }, { status: 401 });

  const { conversationId } = await params;
  const normalizedId = conversationId.trim();
  if (!normalizedId) {
    return responseJson({ error: "invalid_conversation_id" }, { status: 400 });
  }

  try {
    const result = await getMemberDisplayLanguages({ conversationId: normalizedId, userId });
    return responseJson(result);
  } catch (error) {
    return failureResponse(error);
  }
}

export async function PATCH(request: NextRequest, { params }: DisplayLanguagesRouteProps) {
  const userId = getSessionUserId(await getServerSession(getAuthOptions()));
  if (!userId) return responseJson({ error: "unauthorized" }, { status: 401 });

  const { conversationId } = await params;
  const normalizedId = conversationId.trim();
  if (!normalizedId) {
    return responseJson({ error: "invalid_conversation_id" }, { status: 400 });
  }

  let body: { displayLanguages?: unknown };
  try {
    body = (await request.json()) as { displayLanguages?: unknown };
  } catch {
    return responseJson({ error: "invalid_json" }, { status: 400 });
  }

  // Empty is valid on purpose: it resets the member back to just their
  // signup language, so no minimum-selection fallback is applied here.
  const displayLanguages = sanitizeSttLanguageSelection(body.displayLanguages);

  try {
    await setMemberDisplayLanguages({ conversationId: normalizedId, userId, displayLanguages });
    const result = await getMemberDisplayLanguages({ conversationId: normalizedId, userId });
    return responseJson(result);
  } catch (error) {
    return failureResponse(error);
  }
}
