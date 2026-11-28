import { type NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { getAuthOptions } from "@/lib/auth-options";
import { addPostCallLine, listPostCallLines } from "@/server/post-call-lines";

export const runtime = "nodejs";

type LinesRouteProps = { params: Promise<{ callId: string }> };
const NO_STORE = { headers: { "Cache-Control": "private, no-store" } };

async function viewer(): Promise<string> {
  const session = await getServerSession(getAuthOptions()) as { user?: { id?: unknown } } | null;
  return typeof session?.user?.id === "string" ? session.user.id.trim() : "";
}

/** The api prefix this request came in on (an app namespace or none), for photo addresses. */
function apiPrefix(request: NextRequest): string {
  const match = request.nextUrl.pathname.match(/^(\/api(?:\/(?:ios|android)\/v\d+\.\d+\.\d+)?)\/post-calls\//);
  return match?.[1] ?? "/api";
}

/** GET ?lang=: what the two wrote (and sent as photos) on the call screen (see @/server/post-call-lines). */
export async function GET(request: NextRequest, { params }: LinesRouteProps) {
  const userId = await viewer();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { callId } = await params;
  const lines = await listPostCallLines({ callId: callId.trim(), userId, apiPrefix: apiPrefix(request), lang: request.nextUrl.searchParams.get("lang") });
  if (!lines) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ lines }, NO_STORE);
}

/** POST { text, clientId? }: a typed line, translated into the other person's language. */
export async function POST(request: NextRequest, { params }: LinesRouteProps) {
  const userId = await viewer();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null) as { text?: unknown; clientId?: unknown } | null;
  if (typeof body?.text !== "string") return NextResponse.json({ error: "invalid_text" }, { status: 400 });
  const { callId } = await params;
  const outcome = await addPostCallLine({ callId: callId.trim(), userId, text: body.text, clientId: typeof body.clientId === "string" ? body.clientId : undefined });
  if (!outcome.ok) return NextResponse.json({ error: outcome.error }, { status: outcome.error === "not_found" ? 404 : 400 });
  return NextResponse.json({ line: outcome.line }, NO_STORE);
}
