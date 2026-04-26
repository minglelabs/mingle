import {
  getConversationChannelsForIosV1_1_2,
  postCreateConversationForIosV1_1_2,
} from "@/server/api/controllers/ios/v1.1.2/conversations-controller";

export const runtime = "nodejs";
export const GET = getConversationChannelsForIosV1_1_2;
export const POST = postCreateConversationForIosV1_1_2;
