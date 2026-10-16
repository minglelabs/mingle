// Web side of the coin store purchase bridge (docs/coin-iap-spec.md 6.2).
// The native shell (rn/src/nativeIap.ts) talks to the store; this module only
// posts commands and listens for `mingle:native-iap` events.

export const NATIVE_IAP_EVENT = "mingle:native-iap";

export type NativeIapProduct = { productId: string; displayPrice: string; currency: string };

export type NativeIapEvent =
  | { type: "products"; requestId?: string; platform: string; products: NativeIapProduct[] }
  | { type: "purchase_pending"; productId: string }
  | {
      type: "purchase_success";
      platform: string;
      productId: string;
      transactionId: string;
      purchaseToken: string;
      restored: boolean;
    }
  | { type: "purchase_cancelled"; productId: string }
  | { type: "purchase_error"; productId: string; code: string; requestId?: string };

type NativeIapWindow = Window & { ReactNativeWebView?: { postMessage?: (message: string) => void } };

function post(type: string, payload: Record<string, unknown> = {}): boolean {
  if (typeof window === "undefined") return false;
  const bridge = (window as NativeIapWindow).ReactNativeWebView;
  if (typeof bridge?.postMessage !== "function") return false;
  try {
    bridge.postMessage(JSON.stringify({ type, payload }));
    return true;
  } catch {
    return false;
  }
}

export function isNativeIapBridgeAvailable(): boolean {
  return typeof window !== "undefined" && typeof (window as NativeIapWindow).ReactNativeWebView?.postMessage === "function";
}

export function postNativeIapGetProducts(productIds: string[], requestId: string): boolean {
  return post("iap_get_products", { productIds, requestId });
}

export function postNativeIapPurchase(productId: string): boolean {
  return post("iap_purchase", { productId });
}

export function postNativeIapFinish(transactionId: string): boolean {
  return post("iap_finish", { transactionId });
}

export function postNativeIapRestore(): boolean {
  return post("iap_restore");
}

export function subscribeNativeIap(handler: (event: NativeIapEvent) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const listener = (event: Event) => {
    const detail = (event as CustomEvent<unknown>).detail;
    if (detail && typeof detail === "object" && typeof (detail as { type?: unknown }).type === "string") {
      handler(detail as NativeIapEvent);
    }
  };
  window.addEventListener(NATIVE_IAP_EVENT, listener);
  return () => window.removeEventListener(NATIVE_IAP_EVENT, listener);
}
