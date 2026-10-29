"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { writeAdminAudit } from "@/server/admin/audit";
import { requireAdmin, type AdminContext } from "@/server/admin/guard";
import { MICRO_PER_COIN } from "@/lib/coin-units";
import { addCoinPricingRate, createMissingPolarProducts, updateCoinProduct } from "@/server/coins/admin";
import type { CoinPricingUnit, CoinUsageKind } from "@/server/coins/pricing";
import { adjustCoinsAsAdmin } from "@/server/coins/wallet";

const MAX_ADMIN_COINS = 10_000_000;

function read(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

/** The admin session (for the audit log) and the login id stored on coin rows (one env-configured account). */
async function requireCoinAdmin(returnTo: string): Promise<{ ctx: AdminContext; adminUsername: string }> {
  const ctx = await requireAdmin(returnTo);
  return { ctx, adminUsername: (process.env.MINGLE_ADMIN_USERNAME || "admin").trim() };
}

function withResult(path: string, result: string): string {
  return `${path}${path.includes("?") ? "&" : "?"}result=${encodeURIComponent(result)}`;
}

/** Grant (direction=grant) or revoke (direction=revoke) coins. The form is only reachable from the confirm step. */
export async function adjustCoinsAction(formData: FormData) {
  const userId = read(formData, "userId");
  const returnTo = `/admin/coins?user=${encodeURIComponent(userId)}`;
  const { ctx, adminUsername } = await requireCoinAdmin(returnTo);

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

  let result: string;
  try {
    const outcome = await adjustCoinsAsAdmin({
      userId,
      amountMicro: BigInt(coins) * MICRO_PER_COIN * (direction === "revoke" ? -1n : 1n),
      isFree,
      reason,
      expiresAt: direction === "grant" ? expiresAt : null,
      adminUsername,
      requestIp: ctx.ip,
      userAgent: ctx.userAgent,
    });
    const applied = outcome.appliedMicro < 0n ? -outcome.appliedMicro : outcome.appliedMicro;
    result = `${direction === "revoke" ? "revoked" : "granted"}:${(applied / MICRO_PER_COIN).toString()}`;
    await writeAdminAudit(ctx, {
      action: "coins.adjust",
      targetType: "user",
      targetId: userId,
      metadata: { direction, coins: (applied / MICRO_PER_COIN).toString(), isFree, reason },
    });
  } catch (error) {
    console.error("[admin/coins] adjustment failed", error);
    result = "adjustment_failed";
  }
  revalidatePath("/admin/coins");
  redirect(withResult(returnTo, result));
}

export async function updateProductAction(formData: FormData) {
  const { ctx } = await requireCoinAdmin("/admin/coins?tab=catalog");
  const id = read(formData, "id");
  const sortOrder = Number.parseInt(read(formData, "sortOrder"), 10);
  if (!id || !Number.isFinite(sortOrder)) redirect(withResult("/admin/coins?tab=catalog", "invalid_product"));
  await updateCoinProduct({
    id,
    isActive: read(formData, "isActive") === "on",
    sortOrder,
    badge: read(formData, "badge").slice(0, 32) || null,
    ...(formData.has("providerProductId")
      ? { providerProductId: read(formData, "providerProductId").slice(0, 64) || null }
      : {}),
  });
  await writeAdminAudit(ctx, { action: "coins.product", targetType: "coin_product", targetId: id });
  revalidatePath("/admin/coins");
  redirect(withResult("/admin/coins?tab=catalog", "product_updated"));
}

export async function createPolarProductsAction() {
  const { ctx } = await requireCoinAdmin("/admin/coins?tab=catalog");
  let result: string;
  try {
    result = `polar_created:${await createMissingPolarProducts()}`;
    await writeAdminAudit(ctx, { action: "coins.polar_products", metadata: { result } });
  } catch (error) {
    console.error("[admin/coins] polar product creation failed", error);
    result = "polar_failed";
  }
  revalidatePath("/admin/coins");
  redirect(withResult("/admin/coins?tab=catalog", result));
}

export async function addPricingRateAction(formData: FormData) {
  const { ctx, adminUsername } = await requireCoinAdmin("/admin/coins?tab=catalog");
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
    await writeAdminAudit(ctx, {
      action: "coins.pricing_rate",
      targetType: "coin_pricing_rate",
      metadata: { kind: read(formData, "kind"), model: read(formData, "model"), usdPerMillion, margin },
    });
  } catch {
    result = "invalid_rate";
  }
  revalidatePath("/admin/coins");
  redirect(withResult("/admin/coins?tab=catalog", result));
}
