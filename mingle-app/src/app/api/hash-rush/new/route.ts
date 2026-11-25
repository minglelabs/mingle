import { NextRequest } from "next/server";
import { getHashRushNewRoomRedirect } from "@/server/api/controllers/shared/hash-rush-controller";

export const runtime = "nodejs";

// The web page's "make a room": a new room on the game server, opened in the browser.
export async function GET(request: NextRequest) {
  return getHashRushNewRoomRedirect(request);
}
