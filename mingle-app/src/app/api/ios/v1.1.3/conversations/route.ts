import {
  getConversationChannelsForIosV1_1_3,
  postCreateConversationForIosV1_1_3,
} from "@/server/api/controllers/ios/v1.1.3/conversations-controller";

export const runtime = "nodejs";
export const GET = getConversationChannelsForIosV1_1_3;
export const POST = postCreateConversationForIosV1_1_3;
