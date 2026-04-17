import {
  getConversationChannelsForAndroidV1_1_1,
  postCreateConversationForAndroidV1_1_1,
} from "@/server/api/controllers/android/v1.1.1/conversations-controller";

export const runtime = "nodejs";
export const GET = getConversationChannelsForAndroidV1_1_1;
export const POST = postCreateConversationForAndroidV1_1_1;
