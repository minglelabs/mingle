import { NextRequest } from "next/server";
import { getRoomByCodeResponse } from "@/server/api/controllers/shared/public-room-controller";

type RouteProps = { params: Promise<{ code: string }> };

export const runtime = "nodejs";

export async function GET(request: NextRequest, { params }: RouteProps) {
  const { code } = await params;
  return getRoomByCodeResponse(request, code);
}
