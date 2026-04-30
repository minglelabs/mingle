import {
  deleteConversationRouteForAndroidV1_1_3,
  getConversationRouteForAndroidV1_1_3,
  patchConversationRouteForAndroidV1_1_3,
} from "@/server/api/controllers/android/v1.1.3/conversation-controller";

export const runtime = "nodejs";
export const DELETE = deleteConversationRouteForAndroidV1_1_3;
export const GET = getConversationRouteForAndroidV1_1_3;
export const PATCH = patchConversationRouteForAndroidV1_1_3;
