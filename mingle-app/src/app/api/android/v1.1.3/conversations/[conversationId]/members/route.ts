import {
  getConversationMembersRouteForAndroidV1_1_3,
  postConversationMembersRouteForAndroidV1_1_3,
} from "@/server/api/controllers/android/v1.1.3/conversation-controller";

export const runtime = "nodejs";
export const GET = getConversationMembersRouteForAndroidV1_1_3;
export const POST = postConversationMembersRouteForAndroidV1_1_3;
