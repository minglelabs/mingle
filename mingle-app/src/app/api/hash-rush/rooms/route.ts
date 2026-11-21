import { NextRequest } from "next/server";
import { getHashRushPublicRoomsResponse } from "@/server/api/controllers/shared/hash-rush-controller";

export const runtime = "nodejs";

// The listed Hash Rush rooms (any chat room's game whose host made it public).
export async function GET(request: NextRequest) {
  return getHashRushPublicRoomsResponse(request);
}
