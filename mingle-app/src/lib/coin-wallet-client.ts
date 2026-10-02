"use client";

import { useSyncExternalStore } from "react";
import { buildClientApiPath } from "@/lib/api-contract";

// Client-side coin wallet (docs/coin-iap-spec.md 9). One module-level store so
// the balance chip, the store panel and the conversation screen stay in sync.
// Nothing here is shown unless the server says billing is enforced.

export type CoinWallet = {
  billingMode: "off" | "shadow" | "enforce";
  balance: number;
  freeBalance: number;
  paidBalance: number;
  nextDailyGrantAt: string;
  dailyFreeFull: boolean;
  dailyFreeCap: number;
  lowBalance: boolean;
  exhausted: boolean;
  // Absent while billing is off.
  rates?: { sttCoinsPerMinute: number; ttsCoinsPerAudioMinute: number };
};

export type CoinWalletState = {
  status: "idle" | "loading" | "ready" | "error";
  wallet: CoinWallet | null;
};

export type CoinUiEvent =
  | { type: "open_store" }
  // The balance just hit zero, or a paid feature was tapped with no coins.
  | { type: "exhausted" };

export const COIN_UI_EVENT = "mingle:coin-ui";
export const COIN_LOW_BALANCE_THRESHOLD = 200;
const MIN_REFRESH_INTERVAL_MS = 3_000;

let state: CoinWalletState = { status: "idle", wallet: null };
let sttBillingToken: string | null = null;
let inFlight: Promise<void> | null = null;
let lastLoadedAt = 0;
const listeners = new Set<() => void>();

function setState(next: CoinWalletState) {
  state = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const SERVER_STATE: CoinWalletState = { status: "idle", wallet: null };

export function getCoinWalletState(): CoinWalletState {
  return state;
}

export function useCoinWallet(): CoinWalletState {
  return useSyncExternalStore(subscribe, getCoinWalletState, () => SERVER_STATE);
}

/** Coin UI is only shown, and features only blocked, once billing is enforced. */
export function isCoinBillingActive(wallet: CoinWallet | null = state.wallet): wallet is CoinWallet {
  return wallet?.billingMode === "enforce";
}

function dispatchCoinUiEvent(event: CoinUiEvent) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<CoinUiEvent>(COIN_UI_EVENT, { detail: event }));
}

export function subscribeCoinUi(handler: (event: CoinUiEvent) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const listener = (event: Event) => {
    const detail = (event as CustomEvent<CoinUiEvent>).detail;
    if (detail && typeof detail === "object") handler(detail);
  };
  window.addEventListener(COIN_UI_EVENT, listener);
  return () => window.removeEventListener(COIN_UI_EVENT, listener);
}

export function openCoinStore() {
  dispatchCoinUiEvent({ type: "open_store" });
}

/** Loads the wallet (which also pays the daily free refill server-side). Throttled unless forced. */
export function refreshCoinWallet(options: { force?: boolean } = {}): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (inFlight) return inFlight;
  if (!options.force && Date.now() - lastLoadedAt < MIN_REFRESH_INTERVAL_MS) return Promise.resolve();
  if (state.status === "idle") setState({ ...state, status: "loading" });
  inFlight = fetch(buildClientApiPath("/coins/wallet"), { cache: "no-store" })
    .then(async (response) => {
      if (response.status === 401) {
        sttBillingToken = null;
        setState({ status: "idle", wallet: null });
        return;
      }
      if (!response.ok) throw new Error("coin_wallet_load_failed");
      const data = await response.json() as CoinWallet & { sttBillingToken?: string | null };
      sttBillingToken = typeof data.sttBillingToken === "string" ? data.sttBillingToken : null;
      lastLoadedAt = Date.now();
      lastIdentityCheckAt = lastLoadedAt;
      setState({ status: "ready", wallet: data });
    })
    .catch(() => {
      setState({ status: state.wallet ? "ready" : "error", wallet: state.wallet });
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

/** A server response reported the new whole-coin balance (translation, TTS). */
export function applyCoinBalance(balance: number) {
  const wallet = state.wallet;
  if (!wallet || !Number.isFinite(balance) || balance === wallet.balance) return;
  const next = Math.max(0, Math.floor(balance));
  // Free coins are spent first, so a drop comes out of the free part.
  const freeBalance = Math.max(0, Math.min(wallet.freeBalance, wallet.freeBalance - (wallet.balance - next)));
  setState({
    status: "ready",
    wallet: {
      ...wallet,
      balance: next,
      freeBalance: next >= wallet.balance ? wallet.freeBalance : freeBalance,
      paidBalance: next >= wallet.balance ? wallet.paidBalance : next - freeBalance,
      lowBalance: next < COIN_LOW_BALANCE_THRESHOLD,
      // Whole coins can read 0 while a fraction is left; only the server declares exhaustion.
      exhausted: next > 0 ? false : wallet.exhausted,
      dailyFreeFull: wallet.dailyFreeFull && next >= wallet.balance,
    },
  });
}

/** TTS responses carry the balance in headers (the body is audio). */
export function applyCoinBalanceFromHeaders(headers: Headers) {
  const balance = headers.get("x-coin-balance");
  if (balance !== null && balance !== "") applyCoinBalance(Number(balance));
  if (headers.get("x-coin-exhausted") === "1") notifyCoinsExhausted();
}

/**
 * The server cut an AI feature for lack of coins. The sheet is raised when the
 * balance has just hit zero, or when the user tapped a paid feature
 * (userInitiated). A background refusal while already at zero, such as an
 * untranslated text message, only keeps the room banner: sending text with no
 * coins must not pop a sheet on every message.
 */
export function notifyCoinsExhausted(options: { userInitiated?: boolean } = {}) {
  const alreadyExhausted = state.wallet?.exhausted === true;
  if (state.wallet && isCoinBillingActive(state.wallet)) {
    setState({ status: "ready", wallet: { ...state.wallet, balance: 0, freeBalance: 0, paidBalance: 0, lowBalance: true, exhausted: true } });
  }
  if (!alreadyExhausted || options.userInitiated) dispatchCoinUiEvent({ type: "exhausted" });
  void refreshCoinWallet({ force: true });
}

/**
 * Gate for starting the mic, TTS or photo translation. With no coins it raises
 * the "out of coins" sheet and returns false. Unknown balance never blocks:
 * the server is the authority.
 */
export function ensureCoinsForPaidFeature(): boolean {
  const wallet = state.wallet;
  if (!isCoinBillingActive(wallet) || !wallet.exhausted) return true;
  // The daily refill may have become due since the last load.
  if (Date.parse(wallet.nextDailyGrantAt) <= Date.now()) {
    void refreshCoinWallet({ force: true });
    return true;
  }
  dispatchCoinUiEvent({ type: "exhausted" });
  return false;
}

const BILLING_IDENTITY_MAX_AGE_MS = 6 * 60 * 60 * 1000;
let lastIdentityCheckAt = 0;

/**
 * Speech recognition is refused without a billing identity once billing is
 * enforced, so the first mic start waits for the wallet (which carries the
 * token) instead of racing it. Also renews a token that is hours old.
 */
export async function ensureCoinBillingIdentity(): Promise<void> {
  // One attempt is enough when it fails or the user is signed out: the mic must not wait on every start.
  const stale = Date.now() - lastIdentityCheckAt > BILLING_IDENTITY_MAX_AGE_MS;
  if (lastIdentityCheckAt > 0 && !stale) return;
  lastIdentityCheckAt = Date.now();
  await refreshCoinWallet({ force: true });
}

/** Adds the billing identity to the STT socket URL (read by mingle-stt). */
export function appendCoinBillingToWsUrl(wsUrl: string, sessionKey: string): string {
  if (!sttBillingToken) return wsUrl;
  try {
    const url = new URL(wsUrl);
    url.searchParams.set("coin_token", sttBillingToken);
    if (sessionKey) url.searchParams.set("coin_session", sessionKey);
    return url.toString();
  } catch {
    return wsUrl;
  }
}
