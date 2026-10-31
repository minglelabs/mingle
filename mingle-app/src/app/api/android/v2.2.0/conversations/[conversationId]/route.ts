import {
  deleteConversationRouteForAndroidV1_1_4,
  getConversationRouteForAndroidV1_1_4,
  patchConversationRouteForAndroidV1_1_4,
} from "@/server/api/controllers/android/v1.1.4/conversation-controller";

export const runtime = "nodejs";
export const DELETE = deleteConversationRouteForAndroidV1_1_4;
export const GET = getConversationRouteForAndroidV1_1_4;
export const PATCH = patchConversationRouteForAndroidV1_1_4;
