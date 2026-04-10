import {
  deleteConversationRouteForAndroidV1_1_0,
  getConversationRouteForAndroidV1_1_0,
  patchConversationRouteForAndroidV1_1_0,
} from "@/server/api/controllers/android/v1.1.0/conversation-controller";

export const runtime = "nodejs";
export const DELETE = deleteConversationRouteForAndroidV1_1_0;
export const GET = getConversationRouteForAndroidV1_1_0;
export const PATCH = patchConversationRouteForAndroidV1_1_0;
