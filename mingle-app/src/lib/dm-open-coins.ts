/**
 * Before a man opens a new room with a woman the server may answer
 * `402 { error: "dm_open_price" | "dm_open_coins_short", coins, refundHours, balance }`
 * (see @/server/dm-open-charge). The caller awaits `requestDmOpenCoins(answer)`:
 * for a price it resolves true when the user agrees (the caller sends again
 * with `acceptDmOpenCoins: coins`); when the balance is short it shows the way
 * to the Hash store and resolves false.
 *
 * The sheet is `DmOpenCoinsGate`, mounted once in the root layout. With none
 * mounted the action is dropped.
 */
export type DmOpenAnswer = { kind: "price" | "short"; coins: number; refundHours: number; balance: number };

type Handler = (answer: DmOpenAnswer) => Promise<boolean>;
let handler: Handler | null = null;

export function registerDmOpenCoinsHandler(next: Handler): () => void {
  handler = next;
  return () => {
    if (handler === next) handler = null;
  };
}

export function requestDmOpenCoins(answer: DmOpenAnswer): Promise<boolean> {
  return handler ? handler(answer) : Promise.resolve(false);
}

/** The price question from a refused first room, or null when the answer is something else. */
export function parseDmOpenAnswer(status: number, body: unknown): DmOpenAnswer | null {
  if (status !== 402 || typeof body !== "object" || body === null) return null;
  const record = body as Record<string, unknown>;
  const kind = record.error === "dm_open_price" ? "price" : record.error === "dm_open_coins_short" ? "short" : null;
  if (!kind || typeof record.coins !== "number" || record.coins <= 0) return null;
  return {
    kind,
    coins: record.coins,
    refundHours: typeof record.refundHours === "number" ? record.refundHours : 48,
    balance: typeof record.balance === "number" ? record.balance : 0,
  };
}

/**
 * Sends the first-room request again after the user agreed to the price.
 * `send` takes the extra body fields. Returns the response to go on with, or
 * null when the user said no (or had too little Hash).
 */
export async function passDmOpenCoins(response: Response, send: (extra: { acceptDmOpenCoins: number }) => Promise<Response>): Promise<Response | null> {
  if (response.status !== 402) return response;
  const answer = parseDmOpenAnswer(response.status, await response.clone().json().catch(() => null));
  if (!answer) return response;
  if (!(await requestDmOpenCoins(answer))) return null;
  return send({ acceptDmOpenCoins: answer.coins });
}
