import { NextRequest } from "next/server";
import { getHashRushInviteRedirect } from "@/server/api/controllers/shared/hash-rush-controller";

type HashRushInviteLinkRouteProps = {
  params: Promise<{
    code: string;
  }>;
};

export const runtime = "nodejs";

// The invite link itself, opened in any browser (no app needed).
export async function GET(request: NextRequest, { params }: HashRushInviteLinkRouteProps) {
  const { code } = await params;
  return getHashRushInviteRedirect(request, code);
}
