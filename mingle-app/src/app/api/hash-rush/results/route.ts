import { NextRequest } from "next/server";
import { postHashRushResultsResponse } from "@/server/api/controllers/shared/hash-rush-controller";

export const runtime = "nodejs";

// The game server reports each finished round here (server to server).
export async function POST(request: NextRequest) {
  return postHashRushResultsResponse(request);
}
