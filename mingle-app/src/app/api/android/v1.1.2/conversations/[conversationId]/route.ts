import {
  deleteConversationRouteForAndroidV1_1_2,
  getConversationRouteForAndroidV1_1_2,
  patchConversationRouteForAndroidV1_1_2,
} from "@/server/api/controllers/android/v1.1.2/conversation-controller";

export const runtime = "nodejs";
export const DELETE = deleteConversationRouteForAndroidV1_1_2;
export const GET = getConversationRouteForAndroidV1_1_2;
export const PATCH = patchConversationRouteForAndroidV1_1_2;
