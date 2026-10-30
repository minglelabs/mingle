import { NextRequest } from "next/server";
import { getConversationExportResponse } from "@/server/api/controllers/shared/conversation-controller";

type ExportRouteProps = {
  params: Promise<{
    conversationId: string;
  }>;
};

export const runtime = "nodejs";

export async function GET(request: NextRequest, { params }: ExportRouteProps) {
  const { conversationId } = await params;
  return getConversationExportResponse(request, conversationId);
}
