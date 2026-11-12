import { NextRequest } from "next/server";
import { postRoomByCodeJoinResponse } from "@/server/api/controllers/shared/public-room-controller";

type RouteProps = { params: Promise<{ code: string }> };

export const runtime = "nodejs";

export async function POST(request: NextRequest, { params }: RouteProps) {
  const { code } = await params;
  return postRoomByCodeJoinResponse(request, code);
}
