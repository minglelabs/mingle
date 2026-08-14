import { type NextRequest } from "next/server";
import { getProfileFollowList } from "@/server/profile-follow-list";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  return getProfileFollowList(request, "followers");
}
