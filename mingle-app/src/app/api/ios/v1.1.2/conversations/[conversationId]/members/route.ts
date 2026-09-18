import {
  getConversationMembersRouteForIosV1_1_2,
  postConversationMembersRouteForIosV1_1_2,
} from "@/server/api/controllers/ios/v1.1.2/conversation-controller";

export const runtime = "nodejs";
export const GET = getConversationMembersRouteForIosV1_1_2;
export const POST = postConversationMembersRouteForIosV1_1_2;
