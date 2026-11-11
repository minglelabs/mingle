import type { NextRequest } from "next/server";
import { createCoinGift, readCoinGiftInfo } from "@/server/api/controllers/shared/coins-controller";

export const runtime = "nodejs";

export async function GET() {
  return readCoinGiftInfo();
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  return createCoinGift(request, (await params).userId);
}
