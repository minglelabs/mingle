import {
  getConversationRouteForIosV1_1_0,
  patchConversationRouteForIosV1_1_0,
} from "@/server/api/controllers/ios/v1.1.0/conversation-controller";

export const runtime = "nodejs";
export const GET = getConversationRouteForIosV1_1_0;
export const PATCH = patchConversationRouteForIosV1_1_0;
