import {
  getConversationMembersRouteForIosV1_1_0,
  postConversationMembersRouteForIosV1_1_0,
} from "@/server/api/controllers/ios/v1.1.0/conversation-controller";

export const runtime = "nodejs";
export const GET = getConversationMembersRouteForIosV1_1_0;
export const POST = postConversationMembersRouteForIosV1_1_0;
