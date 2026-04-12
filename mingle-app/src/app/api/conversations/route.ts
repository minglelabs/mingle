import { type NextRequest } from "next/server";
import {
  getConversationsResponse,
  postConversationResponse,
} from "@/server/api/controllers/shared/conversations-controller";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  return getConversationsResponse(request);
}

export async function POST(request: NextRequest) {
  return postConversationResponse(request);
}
