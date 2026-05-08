import {
  getConversationChannelsForIosV1_1_4,
  postCreateConversationForIosV1_1_4,
} from "@/server/api/controllers/ios/v1.1.4/conversations-controller";

export const runtime = "nodejs";
export const GET = getConversationChannelsForIosV1_1_4;
export const POST = postCreateConversationForIosV1_1_4;
