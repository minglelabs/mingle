import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ADMIN_SESSION_COOKIE_NAME, verifyAdminSessionToken } from "@/lib/admin-auth";
import {
  ADMIN_DASHBOARD_CHART_HEIGHT,
  ADMIN_DASHBOARD_CHART_WIDTH,
  buildChartGeometry,
} from "@/lib/admin-dashboard-metrics";
import { MICRO_PER_COIN } from "@/lib/coin-units";
import {
  findCoinIntegrityMismatches,
  listCoinAdminCatalog,
  loadCoinAdminDashboard,
  loadCoinAdminUserDetail,
  searchCoinAdminUsers,
  type CoinAdminDailyRow,
} from "@/server/coins/admin";
import { resolveCoinBillingMode } from "@/server/coins/config";
import { COIN_PRICING_UNITS, COIN_USAGE_KINDS } from "@/server/coins/pricing";
import { LineChartCard } from "../dashboard/line-chart-card";
import { addPricingRateAction, adjustCoinsAction, updateProductAction } from "./actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Mingle Admin Coins",
};

type CoinsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const DATE_FORMATTER = new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Seoul" });
const NUMBER_FORMATTER = new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 2 });
const KIND_LABELS: Record<string, string> = { stt: "음성 인식", translation: "번역", tts: "음성 통역", image_text: "사진 번역" };
const SOURCE_LABELS: Record<string, string> = {
  daily_free: "일일 무료",
  purchase: "구매",
  admin_grant: "어드민 충전",
  signup_bonus: "가입 보너스",
  refund_reversal: "환불 보정",
};
const LEDGER_LABELS: Record<string, string> = {
  grant: "충전",
  spend: "사용",
  expire: "만료",
  refund_clawback: "환불 회수",
  admin_revoke: "어드민 회수",
  adjust: "조정",
};
const RESULT_MESSAGES: Record<string, string> = {
  invalid_adjustment: "입력값을 확인해 주세요. 수량, 사유(2자 이상), 만료일(미래)이 필요합니다.",
  adjustment_failed: "처리 중 오류가 발생했습니다.",
  product_updated: "상품을 수정했습니다.",
  invalid_product: "상품 입력값을 확인해 주세요.",
  rate_added: "새 단가를 추가했습니다. 같은 항목의 기존 단가는 종료 처리됩니다.",
  invalid_rate: "단가 입력값을 확인해 주세요. 마진은 1.0~10.0 사이입니다.",
};

function takeFirst(value: string | string[] | undefined): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value[0] ?? "";
  return "";
}

function coins(micro: bigint): string {
  const hundredths = Number((micro * 100n) / MICRO_PER_COIN) / 100;
  return NUMBER_FORMATTER.format(hundredths);
}

function usd(micro: bigint): string {
  return `$${(Number(micro) / 1_000_000).toFixed(2)}`;
}

function resultMessage(result: string): string | null {
  if (!result) return null;
  const [kind, amount] = result.split(":");
  if (kind === "granted") return `${NUMBER_FORMATTER.format(Number(amount))} 코인을 충전했습니다.`;
  if (kind === "revoked") return `${NUMBER_FORMATTER.format(Number(amount))} 코인을 회수했습니다. (남은 잔액까지만 회수됩니다)`;
  return RESULT_MESSAGES[result] ?? null;
}

async function isAdminAuthenticated(): Promise<boolean> {
  const cookieStore = await cookies();
  return verifyAdminSessionToken(cookieStore.get(ADMIN_SESSION_COOKIE_NAME)?.value);
}

const CARD = "rounded-lg border border-[#e5e3dc] bg-white";
const INPUT = "h-10 rounded-md border border-[#d6d3c9] bg-white px-3 text-sm";
const BUTTON = "inline-flex h-10 items-center justify-center rounded-md bg-[#0b0b0b] px-4 text-sm font-semibold text-white";
const TH = "px-3 py-2 text-left text-xs font-semibold text-[#52514e]";
const TD = "px-3 py-2 text-sm";

function Stat({ label, value, tone }: { label: string; value: string; tone?: "warn" }) {
  return (
    <div className={`${CARD} px-4 py-3`}>
      <p className="text-xs font-semibold text-[#52514e]">{label}</p>
      <p className={`mt-1 text-xl font-semibold ${tone === "warn" ? "text-rose-600" : ""}`}>{value}</p>
    </div>
  );
}

function CoinChart({ label, rows, pick, color }: {
  label: string;
  rows: CoinAdminDailyRow[];
  pick: (row: CoinAdminDailyRow) => number;
  color: string;
}) {
  const geometry = buildChartGeometry(
    rows.map((row) => ({ day: row.day, value: pick(row) })),
    ADMIN_DASHBOARD_CHART_WIDTH,
    ADMIN_DASHBOARD_CHART_HEIGHT,
  );
  return (
    <LineChartCard
      label={label}
      kind="count"
      ariaLabel={`${label} 일별 추이`}
      points={geometry.points}
      linePath={geometry.linePath}
      areaPath={geometry.areaPath}
      yMax={geometry.yMax}
      color={color}
    />
  );
}

async function DashboardTab() {
  const [rows, mismatches] = await Promise.all([loadCoinAdminDashboard(30), findCoinIntegrityMismatches()]);
  const sum = (pick: (row: CoinAdminDailyRow) => bigint) => rows.reduce((total, row) => total + pick(row), 0n);
  const spent = sum((row) => row.spentMicro);
  const cost = sum((row) => row.costUsdMicro);
  const revenueCents = rows.reduce((total, row) => total + row.revenueUsdCents, 0);
  const toCoins = (micro: bigint) => Number(micro / MICRO_PER_COIN);

  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="30일 매출 (USD 기준가)" value={`$${(revenueCents / 100).toFixed(2)}`} />
        <Stat label="30일 사용 코인" value={coins(spent)} />
        <Stat label="30일 추정 원가" value={usd(cost)} />
        <Stat label="30일 무료 지급" value={coins(sum((row) => row.freeGrantedMicro))} />
        <Stat label="구매 충전" value={coins(sum((row) => row.purchasedMicro))} />
        <Stat label="미수금 (잔액 부족)" value={coins(sum((row) => row.uncollectedMicro))} />
        <Stat label="환불" value={`${rows.reduce((total, row) => total + row.refundCount, 0)}건 · 회수 ${coins(sum((row) => row.clawedBackMicro))}`} />
        <Stat label="정합성 불일치" value={`${mismatches.length}건`} tone={mismatches.length ? "warn" : undefined} />
      </div>
      {sum((row) => row.shadowChargedMicro) > 0n ? (
        <p className="mt-3 text-sm text-[#52514e]">
          그림자 모드 기록: 30일간 {coins(sum((row) => row.shadowChargedMicro))} 코인이 차감됐을 분량입니다(실제 차감 없음).
        </p>
      ) : null}
      {mismatches.length ? (
        <div className={`${CARD} mt-4 border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700`}>
          <p className="font-semibold">원장 합계 · lot 잔량 · 지갑 스냅샷이 일치하지 않는 유저</p>
          <ul className="mt-1 space-y-0.5">
            {mismatches.map((row) => (
              <li key={row.user_id}>
                <Link className="underline" href={`/admin/coins?user=${row.user_id}`}>{row.user_id}</Link>
                {" "}지갑 {coins(row.wallet)} / 원장 {coins(row.ledger)} / lot {coins(row.lots)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <CoinChart label="사용 코인" rows={rows} pick={(row) => toCoins(row.spentMicro)} color="#2a78d6" />
        <CoinChart label="구매 충전 코인" rows={rows} pick={(row) => toCoins(row.purchasedMicro)} color="#1baf7a" />
        <CoinChart label="무료 지급 코인" rows={rows} pick={(row) => toCoins(row.freeGrantedMicro)} color="#eb6834" />
        <CoinChart label="매출 (USD)" rows={rows} pick={(row) => row.revenueUsdCents / 100} color="#7a4fd6" />
      </div>
      <div className={`${CARD} mt-6 overflow-x-auto`}>
        <table className="w-full min-w-[900px] border-collapse">
          <thead className="border-b border-[#e5e3dc] bg-[#f4f3ee]">
            <tr>
              {["날짜", "매출", "구매", "무료", "어드민", "사용", ...COIN_USAGE_KINDS.map((kind) => KIND_LABELS[kind]), "원가", "미수금", "환불"].map((head) => (
                <th key={head} className={TH}>{head}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[...rows].reverse().map((row) => (
              <tr key={row.day} className="border-b border-[#f0eee8]">
                <td className={TD}>{row.day}</td>
                <td className={TD}>${(row.revenueUsdCents / 100).toFixed(2)}</td>
                <td className={TD}>{coins(row.purchasedMicro)}</td>
                <td className={TD}>{coins(row.freeGrantedMicro)}</td>
                <td className={TD}>{coins(row.adminGrantedMicro)}</td>
                <td className={TD}>{coins(row.spentMicro)}</td>
                {COIN_USAGE_KINDS.map((kind) => <td key={kind} className={TD}>{coins(row.spentByKind[kind])}</td>)}
                <td className={TD}>{usd(row.costUsdMicro)}</td>
                <td className={TD}>{coins(row.uncollectedMicro)}</td>
                <td className={TD}>{row.refundCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

async function CatalogTab() {
  const { products, rates } = await listCoinAdminCatalog();
  return (
    <>
      <h2 className="mb-2 text-sm font-semibold text-[#52514e]">상품</h2>
      <div className={`${CARD} overflow-x-auto`}>
        <table className="w-full min-w-[760px] border-collapse">
          <thead className="border-b border-[#e5e3dc] bg-[#f4f3ee]">
            <tr>{["플랫폼", "상품 ID", "코인", "보너스", "기준가", "정렬", "뱃지", "판매", ""].map((head) => <th key={head} className={TH}>{head}</th>)}</tr>
          </thead>
          <tbody>
            {products.map((product) => (
              <tr key={product.id} className="border-b border-[#f0eee8]">
                <td className={TD}>{product.platform}</td>
                <td className={TD}>{product.storeProductId}</td>
                <td className={TD}>{coins(product.coinMicro)}</td>
                <td className={TD}>{coins(product.bonusMicro)}</td>
                <td className={TD}>${(product.priceUsdCents / 100).toFixed(2)}</td>
                <td className={TD} colSpan={4}>
                  <form action={updateProductAction} className="flex flex-wrap items-center gap-2">
                    <input type="hidden" name="id" value={product.id} />
                    <input className={`${INPUT} w-16`} name="sortOrder" type="number" defaultValue={product.sortOrder} aria-label="정렬" />
                    <input className={`${INPUT} w-32`} name="badge" defaultValue={product.badge ?? ""} placeholder="best_value" aria-label="뱃지" />
                    <label className="flex items-center gap-1 text-sm">
                      <input type="checkbox" name="isActive" defaultChecked={product.isActive} /> 판매 중
                    </label>
                    <button className={BUTTON} type="submit">저장</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="mb-2 mt-8 text-sm font-semibold text-[#52514e]">단가표 (현재 적용 중)</h2>
      <p className="mb-2 text-sm text-[#52514e]">
        차감 코인 = 원가(USD) × 1,000 × 마진. 기존 행은 수정하지 않습니다. 새 단가를 추가하면 같은 종류·모델·단위의 기존 행은 종료됩니다.
      </p>
      <div className={`${CARD} overflow-x-auto`}>
        <table className="w-full min-w-[760px] border-collapse">
          <thead className="border-b border-[#e5e3dc] bg-[#f4f3ee]">
            <tr>{["종류", "공급사", "모델", "단위", "USD / 100만 단위", "마진", "적용 시작", "메모"].map((head) => <th key={head} className={TH}>{head}</th>)}</tr>
          </thead>
          <tbody>
            {rates.map((rate) => (
              <tr key={rate.id} className={`border-b border-[#f0eee8] ${rate.note?.startsWith("ASSUMED") ? "bg-amber-50" : ""}`}>
                <td className={TD}>{KIND_LABELS[rate.kind] ?? rate.kind}</td>
                <td className={TD}>{rate.provider}</td>
                <td className={TD}>{rate.model}</td>
                <td className={TD}>{rate.unit}</td>
                <td className={TD}>${(Number(rate.usdMicroPerMillionUnits) / 1_000_000).toFixed(4)}</td>
                <td className={TD}>×{(rate.marginBps / 10_000).toFixed(2)}</td>
                <td className={TD}>{DATE_FORMATTER.format(rate.effectiveFrom)}</td>
                <td className={`${TD} text-[#52514e]`}>{rate.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <form action={addPricingRateAction} className={`${CARD} mt-4 flex flex-wrap items-end gap-2 px-4 py-4`}>
        <label className="text-xs font-semibold text-[#52514e]">종류<br />
          <select className={INPUT} name="kind">{COIN_USAGE_KINDS.map((kind) => <option key={kind} value={kind}>{KIND_LABELS[kind]}</option>)}</select>
        </label>
        <label className="text-xs font-semibold text-[#52514e]">공급사<br /><input className={`${INPUT} w-28`} name="provider" placeholder="google" /></label>
        <label className="text-xs font-semibold text-[#52514e]">모델 (* = 기본)<br /><input className={`${INPUT} w-48`} name="model" placeholder="*" /></label>
        <label className="text-xs font-semibold text-[#52514e]">단위<br />
          <select className={INPUT} name="unit">{COIN_PRICING_UNITS.map((unit) => <option key={unit} value={unit}>{unit}</option>)}</select>
        </label>
        <label className="text-xs font-semibold text-[#52514e]">USD / 100만 단위<br /><input className={`${INPUT} w-32`} name="usdPerMillionUnits" type="number" step="any" min="0" required /></label>
        <label className="text-xs font-semibold text-[#52514e]">마진 배수<br /><input className={`${INPUT} w-20`} name="margin" type="number" step="0.05" min="1" max="10" defaultValue="1.5" required /></label>
        <label className="text-xs font-semibold text-[#52514e]">적용 시작 (KST, 비우면 즉시)<br /><input className={INPUT} name="effectiveFrom" type="datetime-local" /></label>
        <label className="text-xs font-semibold text-[#52514e]">메모<br /><input className={`${INPUT} w-56`} name="note" /></label>
        <button className={BUTTON} type="submit">단가 추가</button>
      </form>
    </>
  );
}

async function UserTab({ query, userId, confirm }: {
  query: string;
  userId: string;
  confirm: { direction: string; coins: string; bucket: string; reason: string; expiresAt: string } | null;
}) {
  const [matches, detail] = await Promise.all([
    query && !userId ? searchCoinAdminUsers(query) : Promise.resolve([]),
    userId ? loadCoinAdminUserDetail(userId) : Promise.resolve(null),
  ]);

  return (
    <>
      <form className="flex flex-wrap gap-2" method="get">
        <input className={`${INPUT} w-80`} name="q" defaultValue={query} placeholder="이메일, 핸들 또는 유저 ID" />
        <button className={BUTTON} type="submit">검색</button>
      </form>

      {query && !userId ? (
        <ul className={`${CARD} mt-4 divide-y divide-[#f0eee8]`}>
          {matches.length === 0 ? <li className="px-4 py-4 text-sm text-[#52514e]">일치하는 유저가 없습니다.</li> : null}
          {matches.map((user) => (
            <li key={user.id}>
              <Link className="flex flex-wrap gap-x-4 px-4 py-3 text-sm hover:bg-[#f4f3ee]" href={`/admin/coins?user=${user.id}`}>
                <span className="font-semibold">@{user.handle}</span>
                <span>{user.name}</span>
                <span className="text-[#52514e]">{user.email}</span>
                <span className="text-[#8a887f]">{user.id}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}

      {userId && !detail ? <p className="mt-4 text-sm text-rose-600">유저를 찾을 수 없습니다.</p> : null}

      {detail ? (
        <>
          <div className="mt-6 flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <h2 className="text-lg font-semibold">@{detail.user.handle} {detail.user.name ? `· ${detail.user.name}` : ""}</h2>
            <span className="text-sm text-[#52514e]">{detail.user.email}</span>
            <span className="text-xs text-[#8a887f]">{detail.user.id}</span>
            {detail.refundCount >= 2 ? <span className="rounded bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-700">환불 {detail.refundCount}회</span> : null}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="잔액" value={coins(detail.wallet?.balanceMicro ?? 0n)} />
            <Stat label="무료" value={coins(detail.wallet?.freeBalanceMicro ?? 0n)} />
            <Stat label="유료" value={coins(detail.wallet?.paidBalanceMicro ?? 0n)} />
            <Stat label="마지막 일일 충전" value={detail.wallet?.lastDailyGrantAt ? DATE_FORMATTER.format(detail.wallet.lastDailyGrantAt) : "없음"} />
          </div>

          {confirm ? (
            <form action={adjustCoinsAction} className={`${CARD} mt-4 border-amber-300 bg-amber-50 px-4 py-4`}>
              <p className="text-sm font-semibold">
                @{detail.user.handle} 에게 {confirm.bucket === "paid" ? "유료" : "무료"} 코인 {NUMBER_FORMATTER.format(Number(confirm.coins))}개를
                {confirm.direction === "revoke" ? " 회수" : " 충전"}합니다. 맞습니까?
              </p>
              <p className="mt-1 text-sm text-[#52514e]">사유: {confirm.reason}{confirm.expiresAt ? ` · 만료 ${confirm.expiresAt}` : ""}</p>
              {(["direction", "coins", "bucket", "reason", "expiresAt"] as const).map((key) => (
                <input key={key} type="hidden" name={key} value={confirm[key]} />
              ))}
              <input type="hidden" name="userId" value={detail.user.id} />
              <div className="mt-3 flex gap-2">
                <button className={BUTTON} type="submit">실행</button>
                <Link className="inline-flex h-10 items-center rounded-md border border-[#d6d3c9] bg-white px-4 text-sm font-semibold" href={`/admin/coins?user=${detail.user.id}`}>취소</Link>
              </div>
            </form>
          ) : (
            <form method="get" className={`${CARD} mt-4 flex flex-wrap items-end gap-2 px-4 py-4`}>
              <input type="hidden" name="user" value={detail.user.id} />
              <input type="hidden" name="confirm" value="1" />
              <label className="text-xs font-semibold text-[#52514e]">작업<br />
                <select className={INPUT} name="direction"><option value="grant">충전</option><option value="revoke">회수</option></select>
              </label>
              <label className="text-xs font-semibold text-[#52514e]">구분<br />
                <select className={INPUT} name="bucket"><option value="free">무료</option><option value="paid">유료</option></select>
              </label>
              <label className="text-xs font-semibold text-[#52514e]">수량 (코인)<br /><input className={`${INPUT} w-32`} name="coins" type="number" min="1" required /></label>
              <label className="text-xs font-semibold text-[#52514e]">만료일 (선택, 충전만)<br /><input className={INPUT} name="expiresAt" type="date" /></label>
              <label className="text-xs font-semibold text-[#52514e]">사유 (필수)<br /><input className={`${INPUT} w-72`} name="reason" required minLength={2} /></label>
              <button className={BUTTON} type="submit">확인 단계로</button>
              <p className="w-full text-xs text-[#52514e]">
                무료로 충전하면 무료 잔액에 합산되어, 무료 잔액이 1,000 밑으로 내려갈 때까지 일일 무료 충전이 멈춥니다. 회수는 남은 잔액까지만 됩니다.
              </p>
            </form>
          )}

          <h3 className="mb-2 mt-6 text-sm font-semibold text-[#52514e]">최근 30일 사용량</h3>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {COIN_USAGE_KINDS.map((kind) => {
              const row = detail.usage.find((entry) => entry.kind === kind);
              return <Stat key={kind} label={KIND_LABELS[kind]} value={`${coins(row?._sum.chargedMicro ?? 0n)} · ${row?._count._all ?? 0}건`} />;
            })}
          </div>

          <h3 className="mb-2 mt-6 text-sm font-semibold text-[#52514e]">충전 건 (lot)</h3>
          <div className={`${CARD} overflow-x-auto`}>
            <table className="w-full min-w-[640px] border-collapse">
              <thead className="border-b border-[#e5e3dc] bg-[#f4f3ee]">
                <tr>{["일시", "출처", "구분", "최초", "잔여", "만료", "메모"].map((head) => <th key={head} className={TH}>{head}</th>)}</tr>
              </thead>
              <tbody>
                {detail.lots.map((lot) => (
                  <tr key={lot.id} className="border-b border-[#f0eee8]">
                    <td className={TD}>{DATE_FORMATTER.format(lot.createdAt)}</td>
                    <td className={TD}>{SOURCE_LABELS[lot.source] ?? lot.source}</td>
                    <td className={TD}>{lot.isFree ? "무료" : "유료"}</td>
                    <td className={TD}>{coins(lot.grantedMicro)}</td>
                    <td className={TD}>{coins(lot.remainingMicro)}</td>
                    <td className={TD}>{lot.expiresAt ? DATE_FORMATTER.format(lot.expiresAt) : "-"}</td>
                    <td className={`${TD} text-[#52514e]`}>{lot.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h3 className="mb-2 mt-6 text-sm font-semibold text-[#52514e]">원장</h3>
          <div className={`${CARD} overflow-x-auto`}>
            <table className="w-full min-w-[520px] border-collapse">
              <thead className="border-b border-[#e5e3dc] bg-[#f4f3ee]">
                <tr>{["일시", "종류", "변동", "변동 후 잔액", "키"].map((head) => <th key={head} className={TH}>{head}</th>)}</tr>
              </thead>
              <tbody>
                {detail.ledger.map((row) => (
                  <tr key={row.id.toString()} className="border-b border-[#f0eee8]">
                    <td className={TD}>{DATE_FORMATTER.format(row.createdAt)}</td>
                    <td className={TD}>{LEDGER_LABELS[row.type] ?? row.type}</td>
                    <td className={`${TD} ${row.amountMicro < 0n ? "text-rose-600" : "text-emerald-700"}`}>
                      {row.amountMicro < 0n ? "−" : "+"}{coins(row.amountMicro < 0n ? -row.amountMicro : row.amountMicro)}
                    </td>
                    <td className={TD}>{coins(row.balanceAfterMicro)}</td>
                    <td className={`${TD} max-w-[280px] truncate text-xs text-[#8a887f]`}>{row.idempotencyKey}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h3 className="mb-2 mt-6 text-sm font-semibold text-[#52514e]">결제</h3>
          <div className={`${CARD} overflow-x-auto`}>
            <table className="w-full min-w-[640px] border-collapse">
              <thead className="border-b border-[#e5e3dc] bg-[#f4f3ee]">
                <tr>{["일시", "플랫폼", "상태", "환경", "거래 ID"].map((head) => <th key={head} className={TH}>{head}</th>)}</tr>
              </thead>
              <tbody>
                {detail.purchases.length === 0 ? <tr><td className={`${TD} text-[#52514e]`} colSpan={5}>결제 내역이 없습니다.</td></tr> : null}
                {detail.purchases.map((purchase) => (
                  <tr key={purchase.id} className="border-b border-[#f0eee8]">
                    <td className={TD}>{DATE_FORMATTER.format(purchase.createdAt)}</td>
                    <td className={TD}>{purchase.platform}</td>
                    <td className={TD}>{purchase.status}</td>
                    <td className={TD}>{purchase.environment}</td>
                    <td className={`${TD} max-w-[320px] truncate text-xs text-[#8a887f]`}>{purchase.storeTransactionId}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h3 className="mb-2 mt-6 text-sm font-semibold text-[#52514e]">어드민 충전·회수 기록</h3>
          <div className={`${CARD} overflow-x-auto`}>
            <table className="w-full min-w-[640px] border-collapse">
              <thead className="border-b border-[#e5e3dc] bg-[#f4f3ee]">
                <tr>{["일시", "관리자", "요청", "적용", "구분", "사유", "IP"].map((head) => <th key={head} className={TH}>{head}</th>)}</tr>
              </thead>
              <tbody>
                {detail.adminGrants.length === 0 ? <tr><td className={`${TD} text-[#52514e]`} colSpan={7}>기록이 없습니다.</td></tr> : null}
                {detail.adminGrants.map((grant) => (
                  <tr key={grant.id} className="border-b border-[#f0eee8]">
                    <td className={TD}>{DATE_FORMATTER.format(grant.createdAt)}</td>
                    <td className={TD}>{grant.adminUsername}</td>
                    <td className={TD}>{grant.amountMicro < 0n ? "−" : "+"}{coins(grant.amountMicro < 0n ? -grant.amountMicro : grant.amountMicro)}</td>
                    <td className={TD}>{grant.appliedMicro < 0n ? "−" : "+"}{coins(grant.appliedMicro < 0n ? -grant.appliedMicro : grant.appliedMicro)}</td>
                    <td className={TD}>{grant.isFree ? "무료" : "유료"}</td>
                    <td className={TD}>{grant.reason}</td>
                    <td className={`${TD} text-xs text-[#8a887f]`}>{grant.requestIp}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </>
  );
}

export default async function AdminCoinsPage({ searchParams }: CoinsPageProps) {
  if (!(await isAdminAuthenticated())) redirect("/admin");

  const params = await searchParams;
  const userId = takeFirst(params.user).trim();
  const query = takeFirst(params.q).trim();
  const rawTab = takeFirst(params.tab);
  const tab = userId || query ? "users" : rawTab === "catalog" || rawTab === "users" ? rawTab : "dashboard";
  const message = resultMessage(takeFirst(params.result));
  const confirm = takeFirst(params.confirm) === "1" && takeFirst(params.coins)
    ? {
        direction: takeFirst(params.direction) === "revoke" ? "revoke" : "grant",
        coins: takeFirst(params.coins),
        bucket: takeFirst(params.bucket) === "paid" ? "paid" : "free",
        reason: takeFirst(params.reason).slice(0, 500),
        expiresAt: takeFirst(params.expiresAt),
      }
    : null;
  const mode = resolveCoinBillingMode();
  const tabs = [
    { key: "dashboard", label: "대시보드", href: "/admin/coins" },
    { key: "users", label: "유저 지갑", href: "/admin/coins?tab=users" },
    { key: "catalog", label: "상품 · 단가표", href: "/admin/coins?tab=catalog" },
  ];

  return (
    <main className="h-svh w-full overflow-y-auto bg-[#f9f9f7] text-[#0b0b0b]">
      <header className="border-b border-[#e5e3dc] bg-white">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-5">
          <div>
            <h1 className="text-2xl font-semibold">코인</h1>
            <p className="mt-1 text-sm text-[#52514e]">
              과금 상태: {mode === "enforce" ? "적용 중 (차감 · 잔액 0 차단)" : mode === "shadow" ? "그림자 모드 (기록만, 차감 없음)" : "꺼짐 (COIN_BILLING_ENABLED 미설정)"}
            </p>
          </div>
          <Link className="inline-flex h-10 items-center justify-center rounded-md border border-[#e5e3dc] bg-white px-4 text-sm font-semibold text-[#52514e] transition hover:bg-[#f4f3ee]" href="/admin">
            피드백함으로
          </Link>
        </div>
        <nav className="mx-auto flex w-full max-w-6xl gap-1 px-4">
          {tabs.map((entry) => (
            <Link
              key={entry.key}
              href={entry.href}
              className={`border-b-2 px-3 py-2 text-sm font-semibold ${tab === entry.key ? "border-[#0b0b0b]" : "border-transparent text-[#52514e]"}`}
            >
              {entry.label}
            </Link>
          ))}
        </nav>
      </header>

      <section className="mx-auto w-full max-w-6xl px-4 py-6">
        {message ? <p className={`${CARD} mb-4 px-4 py-3 text-sm font-semibold`} role="status">{message}</p> : null}
        {tab === "dashboard" ? <DashboardTab /> : null}
        {tab === "catalog" ? <CatalogTab /> : null}
        {tab === "users" ? <UserTab query={query} userId={userId} confirm={confirm} /> : null}
      </section>
    </main>
  );
}
