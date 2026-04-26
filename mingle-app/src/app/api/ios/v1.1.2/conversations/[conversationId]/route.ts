import {
  deleteConversationRouteForIosV1_1_2,
  getConversationRouteForIosV1_1_2,
  patchConversationRouteForIosV1_1_2,
} from "@/server/api/controllers/ios/v1.1.2/conversation-controller";

export const runtime = "nodejs";
export const DELETE = deleteConversationRouteForIosV1_1_2;
export const GET = getConversationRouteForIosV1_1_2;
export const PATCH = patchConversationRouteForIosV1_1_2;
