import { NextRequest } from "next/server";
import { getHashRushPublicRedirect } from "@/server/api/controllers/shared/hash-rush-controller";

type HashRushPublicRoomRouteProps = {
  params: Promise<{
    room: string;
  }>;
};

export const runtime = "nodejs";

// The web room list's Join for a listed HashChat room, opened in any browser.
export async function GET(request: NextRequest, { params }: HashRushPublicRoomRouteProps) {
  const { room } = await params;
  return getHashRushPublicRedirect(request, room);
}
