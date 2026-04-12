import {
  getConversationChannelsForAndroidV1_1_0,
  postCreateConversationForAndroidV1_1_0,
} from "@/server/api/controllers/android/v1.1.0/conversations-controller";

export const runtime = "nodejs";
export const GET = getConversationChannelsForAndroidV1_1_0;
export const POST = postCreateConversationForAndroidV1_1_0;
