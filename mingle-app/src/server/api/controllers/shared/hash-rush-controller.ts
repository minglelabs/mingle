import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { getAuthOptions } from "@/lib/auth-options";
import { getConversationSessionKeyForMember } from "@/lib/app-conversations";
import { resolveOrCreateUserIdForRequest } from "@/lib/request-user-identity";
import { prisma } from "@/lib/prisma";
import { hashRushRoomId, issueHashRushTicket } from "@/server/hash-rush/ticket";

export const runtime = "nodejs";

// A member of the chat room gets a short-lived ticket into that room's game.
export async function postHashRushTicketResponse(request: NextRequest, conversationId: string) {
  const secret = (process.env.HASH_RUSH_TICKET_SECRET || "").trim();
  if (!secret) return NextResponse.json({ error: "hash_rush_unavailable" }, { status: 503 });

  const session = await getServerSession(getAuthOptions());
  const resolvedUser = await resolveOrCreateUserIdForRequest({ request, session });
  if (!resolvedUser.userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const sessionKey = await getConversationSessionKeyForMember({ conversationId, userId: resolvedUser.userId });
  if (!sessionKey) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const user = await prisma.user.findUnique({ where: { id: resolvedUser.userId }, select: { name: true } });
  const name = (user?.name || "").trim().slice(0, 8);
  const room = hashRushRoomId(conversationId);
  const { ticket, exp, expiresIn } = issueHashRushTicket({ room, userId: resolvedUser.userId, name }, secret);
  return NextResponse.json({ ticket, room, name, exp, expiresIn });
}
