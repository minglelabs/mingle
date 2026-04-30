import {
  getConversationChannelsForIosV2_0_0,
  postCreateConversationForIosV2_0_0,
} from "@/server/api/controllers/ios/v2.0.0/conversations-controller";

export const runtime = "nodejs";
export const GET = getConversationChannelsForIosV2_0_0;
export const POST = postCreateConversationForIosV2_0_0;
