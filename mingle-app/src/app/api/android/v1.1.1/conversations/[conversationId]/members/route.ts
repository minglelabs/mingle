import {
  getConversationMembersRouteForAndroidV1_1_1,
  postConversationMembersRouteForAndroidV1_1_1,
} from "@/server/api/controllers/android/v1.1.1/conversation-controller";

export const runtime = "nodejs";
export const GET = getConversationMembersRouteForAndroidV1_1_1;
export const POST = postConversationMembersRouteForAndroidV1_1_1;
