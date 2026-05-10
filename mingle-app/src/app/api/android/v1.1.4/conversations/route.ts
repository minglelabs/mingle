import {
  getConversationChannelsForAndroidV1_1_4,
  postCreateConversationForAndroidV1_1_4,
} from "@/server/api/controllers/android/v1.1.4/conversations-controller";

export const runtime = "nodejs";
export const GET = getConversationChannelsForAndroidV1_1_4;
export const POST = postCreateConversationForAndroidV1_1_4;
