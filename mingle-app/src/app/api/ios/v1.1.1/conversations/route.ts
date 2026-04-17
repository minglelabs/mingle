import {
  getConversationChannelsForIosV1_1_1,
  postCreateConversationForIosV1_1_1,
} from "@/server/api/controllers/ios/v1.1.1/conversations-controller";

export const runtime = "nodejs";
export const GET = getConversationChannelsForIosV1_1_1;
export const POST = postCreateConversationForIosV1_1_1;
