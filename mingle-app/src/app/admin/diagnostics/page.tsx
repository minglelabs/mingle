import type { Metadata } from "next";
import os from "node:os";
import { Prisma } from "@prisma/client";
import { HAMZZI_USER_ID } from "@/lib/hamzzi";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/server/admin/guard";
import { findHamzziCandidates } from "@/server/hamzzi/worker";
import { countOperatorActivityUnread, getOperatorActivitySummary } from "@/server/operator-activity/activity";
import {
  clearOperatorInboxCaches,
  countOperatorInboxUnread,
  getOperatorInboxSummary,
  listOperatorInboxRooms,
} from "@/server/operator-inbox/inbox";
import { AdminCard, AdminPage, AdminPageHeader } from "../_components/ui";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "속도 진단" };

type Probe = { name: string; ms: number; note: string };

async function timed(name: string, run: () => Promise<unknown>): Promise<Probe> {
  const startedAt = performance.now();
  try {
    const result = await run();
    return { name, ms: Math.round(performance.now() - startedAt), note: typeof result === "string" ? result : "" };
  } catch (error) {
    return { name, ms: Math.round(performance.now() - startedAt), note: `실패: ${error instanceof Error ? error.name : "unknown"}` };
  }
}

/** How late a zero-delay timer fires: high when the server process is busy with other work. */
async function eventLoopLagMs(): Promise<string> {
  let worst = 0;
  let total = 0;
  const samples = 20;
  for (let index = 0; index < samples; index += 1) {
    const startedAt = performance.now();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const lag = performance.now() - startedAt;
    worst = Math.max(worst, lag);
    total += lag;
  }
  return `평균 ${(total / samples).toFixed(1)}ms, 최대 ${worst.toFixed(1)}ms`;
}

async function count(sql: Prisma.Sql): Promise<string> {
  const rows = await prisma.$queryRaw<Array<{ n: bigint | number }>>(sql);
  return `${Number(rows[0]?.n ?? 0).toLocaleString("ko-KR")}건`;
}

/**
 * Times, one after another and without the shared caches, the work every
 * admin screen depends on: a database round trip, the inbox and activity
 * counts the tab bar polls, the inbox list, and Hamzzi's 10 s reply search.
 * Read-only.
 */
export default async function AdminDiagnosticsPage() {
  await requireAdmin("/admin/diagnostics");
  clearOperatorInboxCaches();
  const probes: Probe[] = [];
  const add = async (name: string, run: () => Promise<unknown>) => { probes.push(await timed(name, run)); };

  await add("서버 여유 (이벤트 루프 지연)", eventLoopLagMs);
  await add("DB 왕복 1회 (SELECT 1)", async () => { await prisma.$queryRaw`SELECT 1`; });
  await add("DB 왕복 5회 연속", async () => { for (let index = 0; index < 5; index += 1) await prisma.$queryRaw`SELECT 1`; });
  await add("DB 왕복 5회 동시", async () => { await Promise.all(Array.from({ length: 5 }, () => prisma.$queryRaw`SELECT 1`)); });
  await add("인박스: 안 읽음 합계 (탭바가 모든 화면에서 부름)", async () => `${await countOperatorInboxUnread()}개`);
  await add("인박스: 계정별 합계", async () => `${(await getOperatorInboxSummary()).operators.length}개 계정`);
  await add("인박스: 목록 첫 페이지", async () => `${(await listOperatorInboxRooms({ limit: 20 })).rooms.length}개 방`);
  await add("알림: 안 읽음 합계 (탭바가 모든 화면에서 부름)", async () => `${await countOperatorActivityUnread()}개`);
  await add("알림: 계정별 합계", async () => `${(await getOperatorActivitySummary()).operators.length}개 계정`);
  await add("Hamzzi 자동 답장 검색 (10초마다 실행)", async () => `${(await findHamzziCandidates({ now: new Date() })).length}개 방`);
  await add("규모: 전체 유저", () => count(Prisma.sql`SELECT COUNT(*) AS n FROM app.app_users`));
  await add("규모: Hamzzi가 들어간 방", () => count(Prisma.sql`SELECT COUNT(*) AS n FROM app.app_conversation_channel_members WHERE user_id = ${HAMZZI_USER_ID} AND left_at IS NULL`));
  await add("규모: 운영 계정이 들어간 방", () => count(Prisma.sql`SELECT COUNT(*) AS n FROM app.app_conversation_channel_members AS m JOIN app.app_users AS u ON u.id = m.user_id WHERE u.is_operator = true AND m.left_at IS NULL`));
  await add("규모: 전체 메시지 (추정)", () => count(Prisma.sql`SELECT reltuples::bigint AS n FROM pg_class WHERE oid = 'app.app_messages'::regclass`));

  const load = os.loadavg().map((value) => value.toFixed(2)).join(" / ");
  const memoryMb = Math.round(process.memoryUsage().rss / 1024 / 1024);

  return (
    <AdminPage>
      <AdminPageHeader title="속도 진단" description="캐시 없이 하나씩 실행해서 잰 시간입니다. 읽기만 합니다." />
      <AdminCard className="overflow-hidden p-0">
        <table className="w-full text-left text-sm">
          <tbody className="divide-y divide-slate-100">
            {probes.map((probe) => (
              <tr key={probe.name}>
                <td className="px-3 py-2.5 text-slate-700 break-words">{probe.name}</td>
                <td className={`whitespace-nowrap px-3 py-2.5 text-right font-semibold tabular-nums ${probe.ms >= 1000 ? "text-rose-600" : probe.ms >= 300 ? "text-amber-600" : "text-slate-900"}`}>
                  {probe.ms.toLocaleString("ko-KR")}ms
                </td>
                <td className="px-3 py-2.5 text-right text-xs text-slate-500 break-words">{probe.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </AdminCard>
      <p className="mt-3 text-xs leading-5 text-slate-500 break-words">
        서버: CPU {os.cpus().length}개 · 부하 {load} · 메모리 {memoryMb.toLocaleString("ko-KR")}MB · 가동 {Math.round(process.uptime() / 60)}분
      </p>
    </AdminPage>
  );
}
