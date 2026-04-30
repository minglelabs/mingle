import {
  getConversationChannelsForAndroidV2_0_0,
  postCreateConversationForAndroidV2_0_0,
} from "@/server/api/controllers/android/v2.0.0/conversations-controller";

export const runtime = "nodejs";
export const GET = getConversationChannelsForAndroidV2_0_0;
export const POST = postCreateConversationForAndroidV2_0_0;
