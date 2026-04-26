import {
  getConversationChannelsForAndroidV1_1_2,
  postCreateConversationForAndroidV1_1_2,
} from "@/server/api/controllers/android/v1.1.2/conversations-controller";

export const runtime = "nodejs";
export const GET = getConversationChannelsForAndroidV1_1_2;
export const POST = postCreateConversationForAndroidV1_1_2;
