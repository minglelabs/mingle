import { type NextRequest } from "next/server";
import { getConversationListRealtimeTokenResponse } from "@/server/api/controllers/shared/conversations-controller";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  return getConversationListRealtimeTokenResponse(request);
}
