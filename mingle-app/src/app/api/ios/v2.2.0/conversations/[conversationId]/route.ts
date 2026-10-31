import {
  deleteConversationRouteForIosV1_1_4,
  getConversationRouteForIosV1_1_4,
  patchConversationRouteForIosV1_1_4,
} from "@/server/api/controllers/ios/v1.1.4/conversation-controller";

export const runtime = "nodejs";
export const DELETE = deleteConversationRouteForIosV1_1_4;
export const GET = getConversationRouteForIosV1_1_4;
export const PATCH = patchConversationRouteForIosV1_1_4;
