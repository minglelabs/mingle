import { NextRequest } from "next/server";
import { postOpenRoomReportResponse } from "@/server/api/controllers/shared/public-room-controller";

type RouteProps = { params: Promise<{ conversationId: string }> };

export const runtime = "nodejs";

export async function POST(request: NextRequest, { params }: RouteProps) {
  const { conversationId } = await params;
  return postOpenRoomReportResponse(request, conversationId);
}
