"use server";

import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { ADMIN_SESSION_COOKIE_NAME, verifyAdminSessionToken } from "@/lib/admin-auth";
import { MICRO_PER_COIN } from "@/lib/coin-units";
import { addCoinPricingRate, updateCoinProduct } from "@/server/coins/admin";
import type { CoinPricingUnit, CoinUsageKind } from "@/server/coins/pricing";
import { adjustCoinsAsAdmin } from "@/server/coins/wallet";

const MAX_ADMIN_COINS = 10_000_000;

function read(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

async function requireAdmin(): Promise<string> {
  const cookieStore = await cookies();
  if (!verifyAdminSessionToken(cookieStore.get(ADMIN_SESSION_COOKIE_NAME)?.value)) redirect("/admin");
  // main has a single env-configured admin account; its login id is the actor.
  return (process.env.MINGLE_ADMIN_USERNAME || "admin").trim();
}

function withResult(path: string, result: string): string {
  return `${path}${path.includes("?") ? "&" : "?"}result=${encodeURIComponent(result)}`;
}

/** Grant (direction=grant) or revoke (direction=revoke) coins. The form is only reachable from the confirm step. */
export async function adjustCoinsAction(formData: FormData) {
  const userId = read(formData, "userId");
  const returnTo = `/admin/coins?user=${encodeURIComponent(userId)}`;
  const adminUsername = await requireAdmin();

  const coins = Number.parseInt(read(formData, "coins"), 10);
  const reason = read(formData, "reason").slice(0, 500);
  const direction = read(formData, "direction") === "revoke" ? "revoke" : "grant";
  const isFree = read(formData, "bucket") !== "paid";
  const expiresRaw = read(formData, "expiresAt");
  const expiresAt = expiresRaw ? new Date(`${expiresRaw}T23:59:59+09:00`) : null;
  if (!userId || !Number.isFinite(coins) || coins <= 0 || coins > MAX_ADMIN_COINS || reason.length < 2
    || (expiresAt && (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()))) {
    redirect(withResult(returnTo, "invalid_adjustment"));
  }

  const requestHeaders = await headers();
  let result: string;
  try {
    const outcome = await adjustCoinsAsAdmin({
      userId,
      amountMicro: BigInt(coins) * MICRO_PER_COIN * (direction === "revoke" ? -1n : 1n),
      isFree,
      reason,
      expiresAt: direction === "grant" ? expiresAt : null,
      adminUsername,
      requestIp: (requestHeaders.get("x-forwarded-for") || "").split(",")[0].trim().slice(0, 64) || null,
      userAgent: (requestHeaders.get("user-agent") || "").slice(0, 300) || null,
    });
    const applied = outcome.appliedMicro < 0n ? -outcome.appliedMicro : outcome.appliedMicro;
    result = `${direction === "revoke" ? "revoked" : "granted"}:${(applied / MICRO_PER_COIN).toString()}`;
  } catch (error) {
    console.error("[admin/coins] adjustment failed", error);
    result = "adjustment_failed";
  }
  revalidatePath("/admin/coins");
  redirect(withResult(returnTo, result));
}

export async function updateProductAction(formData: FormData) {
  await requireAdmin();
  const id = read(formData, "id");
  const sortOrder = Number.parseInt(read(formData, "sortOrder"), 10);
  if (!id || !Number.isFinite(sortOrder)) redirect(withResult("/admin/coins?tab=catalog", "invalid_product"));
  await updateCoinProduct({
    id,
    isActive: read(formData, "isActive") === "on",
    sortOrder,
    badge: read(formData, "badge").slice(0, 32) || null,
  });
  revalidatePath("/admin/coins");
  redirect(withResult("/admin/coins?tab=catalog", "product_updated"));
}

export async function addPricingRateAction(formData: FormData) {
  const adminUsername = await requireAdmin();
  const usdPerMillion = Number(read(formData, "usdPerMillionUnits"));
  const margin = Number(read(formData, "margin"));
  const effectiveRaw = read(formData, "effectiveFrom");
  const effectiveFrom = effectiveRaw ? new Date(`${effectiveRaw}:00+09:00`) : new Date();
  if (!Number.isFinite(usdPerMillion) || usdPerMillion < 0 || !Number.isFinite(margin) || Number.isNaN(effectiveFrom.getTime())) {
    redirect(withResult("/admin/coins?tab=catalog", "invalid_rate"));
  }
  let result = "rate_added";
  try {
    await addCoinPricingRate({
      kind: read(formData, "kind") as CoinUsageKind,
      provider: read(formData, "provider").slice(0, 64),
      model: read(formData, "model").slice(0, 128),
      unit: read(formData, "unit") as CoinPricingUnit,
      // Entered as USD per 1M units, stored as micro-USD per 1M units.
      usdMicroPerMillionUnits: BigInt(Math.round(usdPerMillion * 1_000_000)),
      marginBps: Math.round(margin * 10_000),
      effectiveFrom,
      note: read(formData, "note").slice(0, 300) || null,
      adminUsername,
    });
  } catch {
    result = "invalid_rate";
  }
  revalidatePath("/admin/coins");
  redirect(withResult("/admin/coins?tab=catalog", result));
}
