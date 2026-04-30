import {
  deleteConversationRouteForIosV1_1_3,
  getConversationRouteForIosV1_1_3,
  patchConversationRouteForIosV1_1_3,
} from "@/server/api/controllers/ios/v1.1.3/conversation-controller";

export const runtime = "nodejs";
export const DELETE = deleteConversationRouteForIosV1_1_3;
export const GET = getConversationRouteForIosV1_1_3;
export const PATCH = patchConversationRouteForIosV1_1_3;
