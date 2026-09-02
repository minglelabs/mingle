import {
  getConversationMembersRouteForIosV1_1_3,
  postConversationMembersRouteForIosV1_1_3,
} from "@/server/api/controllers/ios/v1.1.3/conversation-controller";

export const runtime = "nodejs";
export const GET = getConversationMembersRouteForIosV1_1_3;
export const POST = postConversationMembersRouteForIosV1_1_3;
