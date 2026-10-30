import { readConversationCoinUsage } from "@/server/api/controllers/shared/coins-controller";

type CoinUsageRouteProps = {
  params: Promise<{
    conversationId: string;
  }>;
};

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: CoinUsageRouteProps) {
  const { conversationId } = await params;
  return readConversationCoinUsage(conversationId);
}
