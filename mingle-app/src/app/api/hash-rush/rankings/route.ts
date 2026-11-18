import { NextRequest } from "next/server";
import { getHashRushRankingsResponse } from "@/server/api/controllers/shared/hash-rush-controller";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  return getHashRushRankingsResponse(request);
}
