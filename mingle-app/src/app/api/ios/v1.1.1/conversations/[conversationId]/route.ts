import {
  deleteConversationRouteForIosV1_1_1,
  getConversationRouteForIosV1_1_1,
  patchConversationRouteForIosV1_1_1,
} from "@/server/api/controllers/ios/v1.1.1/conversation-controller";

export const runtime = "nodejs";
export const DELETE = deleteConversationRouteForIosV1_1_1;
export const GET = getConversationRouteForIosV1_1_1;
export const PATCH = patchConversationRouteForIosV1_1_1;
