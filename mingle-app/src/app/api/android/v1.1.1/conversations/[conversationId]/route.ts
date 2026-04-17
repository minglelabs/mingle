import {
  deleteConversationRouteForAndroidV1_1_1,
  getConversationRouteForAndroidV1_1_1,
  patchConversationRouteForAndroidV1_1_1,
} from "@/server/api/controllers/android/v1.1.1/conversation-controller";

export const runtime = "nodejs";
export const DELETE = deleteConversationRouteForAndroidV1_1_1;
export const GET = getConversationRouteForAndroidV1_1_1;
export const PATCH = patchConversationRouteForAndroidV1_1_1;
