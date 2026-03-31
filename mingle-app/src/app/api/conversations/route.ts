import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { getAuthOptions } from "@/lib/auth-options";
import {
  createConversationChannelForUser,
  listConversationChannelsForUser,
} from "@/lib/app-conversations";

function resolveSessionUserId(session: { user?: { id?: unknown } } | null): string {
  return typeof session?.user?.id === "string" ? session.user.id.trim() : "";
}

export async function GET() {
  const session = await getServerSession(getAuthOptions());
  const userId = resolveSessionUserId(session);

  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const conversations = await listConversationChannelsForUser(userId);
  return NextResponse.json({ conversations });
}

export async function POST() {
  const session = await getServerSession(getAuthOptions());
  const userId = resolveSessionUserId(session);

  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const conversation = await createConversationChannelForUser(userId);
  return NextResponse.json({ conversation }, { status: 201 });
}
