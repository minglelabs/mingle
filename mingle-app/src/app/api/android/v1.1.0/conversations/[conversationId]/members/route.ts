import {
  getConversationMembersRouteForAndroidV1_1_0,
  postConversationMembersRouteForAndroidV1_1_0,
} from "@/server/api/controllers/android/v1.1.0/conversation-controller";

export const runtime = "nodejs";
export const GET = getConversationMembersRouteForAndroidV1_1_0;
export const POST = postConversationMembersRouteForAndroidV1_1_0;
