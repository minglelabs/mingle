import { NextRequest } from "next/server";
import { postHashRushPublicTicketResponse } from "@/server/api/controllers/shared/hash-rush-controller";

type HashRushPublicTicketRouteProps = {
  params: Promise<{
    room: string;
  }>;
};

export const runtime = "nodejs";

// A ticket into a listed room for the app player (from the app's room list).
export async function POST(request: NextRequest, { params }: HashRushPublicTicketRouteProps) {
  const { room } = await params;
  return postHashRushPublicTicketResponse(request, room);
}
