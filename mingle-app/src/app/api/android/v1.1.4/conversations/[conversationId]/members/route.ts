import {
  getConversationMembersRouteForAndroidV1_1_4,
  postConversationMembersRouteForAndroidV1_1_4,
} from "@/server/api/controllers/android/v1.1.4/conversation-controller";

export const runtime = "nodejs";
export const GET = getConversationMembersRouteForAndroidV1_1_4;
export const POST = postConversationMembersRouteForAndroidV1_1_4;
