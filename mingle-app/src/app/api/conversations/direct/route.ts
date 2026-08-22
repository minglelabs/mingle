import { type NextRequest } from "next/server";
import { postDirectConversationResponse } from "@/server/api/controllers/shared/conversations-controller";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  return postDirectConversationResponse(request);
}
