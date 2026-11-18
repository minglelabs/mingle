import { NextRequest } from "next/server";
import { getOpenRoomInfoResponse, patchOpenRoomSettingsResponse } from "@/server/api/controllers/shared/public-room-controller";

type RouteProps = { params: Promise<{ conversationId: string }> };

export const runtime = "nodejs";

export async function GET(request: NextRequest, { params }: RouteProps) {
  const { conversationId } = await params;
  return getOpenRoomInfoResponse(request, conversationId);
}

export async function PATCH(request: NextRequest, { params }: RouteProps) {
  const { conversationId } = await params;
  return patchOpenRoomSettingsResponse(request, conversationId);
}
