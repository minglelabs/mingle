import {
  getConversationChannelsForIosV1_1_0,
  postCreateConversationForIosV1_1_0,
} from "@/server/api/controllers/ios/v1.1.0/conversations-controller";

export const runtime = "nodejs";
export const GET = getConversationChannelsForIosV1_1_0;
export const POST = postCreateConversationForIosV1_1_0;
