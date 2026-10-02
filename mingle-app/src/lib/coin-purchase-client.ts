"use client";

import { useSyncExternalStore } from "react";
import { buildClientApiPath } from "@/lib/api-contract";
import { refreshCoinWallet } from "@/lib/coin-wallet-client";
import {
  postNativeIapFinish,
  postNativeIapGetProducts,
  postNativeIapPurchase,
  postNativeIapRestore,
  subscribeNativeIap,
  type NativeIapEvent,
  type NativeIapProduct,
} from "@/lib/native-iap";

// Purchase flow for the coin store (docs/coin-iap-spec.md 6.2, 6.3):
//   store payment (native) -> POST /coins/purchases (server verifies and grants)
//   -> iap_finish (native finishes/consumes the transaction).
// A purchase the server has not confirmed is never finished, so it is replayed
// by iap_restore on the next launch and granted then.

export type CoinProduct = {
  productId: string;
  coins: number;
  bonusCoins: number;
  totalCoins: number;
  priceUsdCents: number;
  badge: string | null;
  // Localized price string from the store; null until the store answers.
  displayPrice: string | null;
};

export type CoinStoreState = {
  // loading | ready | error (server or store unreachable) | unavailable (web, or an app build without purchases)
  status: "idle" | "loading" | "ready" | "error" | "unavailable";
  products: CoinProduct[];
  sttCoinsPerMinute: number;
  // The product whose purchase sheet is open or being verified.
  purchasingProductId: string | null;
  // Paid by a method that still needs approval (e.g. Ask to Buy).
  pendingProductIds: string[];
  lastResult: { kind: "success"; coins: number } | { kind: "failed" } | null;
};

const STORE_PRICE_TIMEOUT_MS = 6_000;

let state: CoinStoreState = {
  status: "idle",
  products: [],
  sttCoinsPerMinute: 0,
  purchasingProductId: null,
  pendingProductIds: [],
  lastResult: null,
};
const listeners = new Set<() => void>();
let requestSequence = 0;
let activeRequestId = "";
let priceTimer: ReturnType<typeof setTimeout> | null = null;
const verifying = new Set<string>();

function setState(patch: Partial<CoinStoreState>) {
  state = { ...state, ...patch };
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const SERVER_STATE = state;

export function useCoinStore(): CoinStoreState {
  return useSyncExternalStore(subscribe, () => state, () => SERVER_STATE);
}

export function clearCoinPurchaseResult() {
  if (state.lastResult) setState({ lastResult: null });
}

/** Loads the catalog from the server, then asks the store for localized prices. */
export async function loadCoinProducts(): Promise<void> {
  setState({ status: "loading" });
  try {
    const response = await fetch(buildClientApiPath("/coins/products"), { cache: "no-store" });
    if (!response.ok) throw new Error("coin_products_load_failed");
    const data = await response.json() as {
      platform: string | null;
      products: Omit<CoinProduct, "displayPrice">[];
      sttCoinsPerMinute?: number;
    };
    const products = data.products.map((product) => ({ ...product, displayPrice: null }));
    const sttCoinsPerMinute = typeof data.sttCoinsPerMinute === "number" ? data.sttCoinsPerMinute : 0;
    const requestId = `p${++requestSequence}`;
    activeRequestId = requestId;
    if (!data.platform || !products.length
      || !postNativeIapGetProducts(products.map((product) => product.productId), requestId)) {
      setState({ status: "unavailable", products, sttCoinsPerMinute });
      return;
    }
    setState({ products, sttCoinsPerMinute });
    if (priceTimer) clearTimeout(priceTimer);
    // An app build from before the store never answers: tell the user to update.
    priceTimer = setTimeout(() => {
      if (activeRequestId === requestId && state.status === "loading") setState({ status: "unavailable" });
    }, STORE_PRICE_TIMEOUT_MS);
  } catch {
    setState({ status: "error" });
  }
}

function applyStorePrices(prices: NativeIapProduct[]) {
  if (priceTimer) clearTimeout(priceTimer);
  priceTimer = null;
  const byId = new Map(prices.map((price) => [price.productId, price.displayPrice]));
  // Only products the store actually sells can be bought.
  const products = state.products
    .map((product) => ({ ...product, displayPrice: byId.get(product.productId) ?? null }))
    .filter((product) => product.displayPrice);
  setState({ status: products.length ? "ready" : "error", products });
}

export function startCoinPurchase(productId: string) {
  if (state.purchasingProductId) return;
  if (!postNativeIapPurchase(productId)) {
    setState({ status: "unavailable" });
    return;
  }
  setState({ purchasingProductId: productId, lastResult: null });
}

export function restoreCoinPurchases() {
  postNativeIapRestore();
}

async function verifyWithServer(event: Extract<NativeIapEvent, { type: "purchase_success" }>) {
  if (verifying.has(event.transactionId)) return;
  verifying.add(event.transactionId);
  try {
    const response = await fetch(buildClientApiPath("/coins/purchases"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(event.platform === "ios"
        ? { jws: event.purchaseToken }
        : { productId: event.productId, purchaseToken: event.purchaseToken }),
    });
    if (response.status === 202) {
      setState({
        purchasingProductId: null,
        pendingProductIds: [...new Set([...state.pendingProductIds, event.productId])],
      });
      return;
    }
    if (!response.ok) {
      // 4xx: the server will never grant this transaction (invalid proof, or already
      // granted to another account), so finishing it is the only way to stop the
      // replay and unblock the product. 5xx/network: keep it for the next restore.
      if (response.status >= 400 && response.status < 500) postNativeIapFinish(event.transactionId);
      setState({ purchasingProductId: null, lastResult: event.restored ? state.lastResult : { kind: "failed" } });
      return;
    }
    const data = await response.json() as { status: string; grantedCoins: number };
    postNativeIapFinish(event.transactionId);
    setState({
      purchasingProductId: null,
      pendingProductIds: state.pendingProductIds.filter((id) => id !== event.productId),
      lastResult: data.status === "granted" ? { kind: "success", coins: data.grantedCoins } : state.lastResult,
    });
    await refreshCoinWallet({ force: true });
  } catch {
    setState({ purchasingProductId: null, lastResult: event.restored ? state.lastResult : { kind: "failed" } });
  } finally {
    verifying.delete(event.transactionId);
  }
}

/** Mounted once for the whole app, so a restored purchase is granted even while the store is closed. */
export function startCoinPurchaseListener(): () => void {
  return subscribeNativeIap((event) => {
    if (event.type === "products") {
      if (!event.requestId || event.requestId === activeRequestId) applyStorePrices(event.products);
      return;
    }
    if (event.type === "purchase_success") {
      void verifyWithServer(event);
      return;
    }
    if (event.type === "purchase_pending") {
      setState({
        purchasingProductId: null,
        pendingProductIds: [...new Set([...state.pendingProductIds, event.productId])],
      });
      return;
    }
    if (event.type === "purchase_cancelled") {
      setState({ purchasingProductId: null });
      return;
    }
    if (event.code === "products_unavailable") {
      if (!event.requestId || event.requestId === activeRequestId) {
        if (priceTimer) clearTimeout(priceTimer);
        setState({ status: "error" });
      }
      return;
    }
    setState({ purchasingProductId: null, lastResult: { kind: "failed" } });
  });
}
