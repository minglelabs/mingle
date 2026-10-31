import { createHash, createHmac, timingSafeEqual } from "node:crypto";

// Minimal LiveKit auth helpers built on node:crypto, so the app server needs no
// extra SDK. LiveKit access tokens and webhook signatures are both HS256 JWTs
// signed with the API secret and issued by the API key.

export type LiveKitConfig = {
  url: string;
  apiKey: string;
  apiSecret: string;
};

export function readLiveKitConfig(env: NodeJS.ProcessEnv = process.env): LiveKitConfig | null {
  const url = (env.LIVEKIT_URL || "").trim();
  const apiKey = (env.LIVEKIT_API_KEY || "").trim();
  const apiSecret = (env.LIVEKIT_API_SECRET || "").trim();
  if (!url || !apiKey || !apiSecret) return null;
  return { url, apiKey, apiSecret };
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function fromBase64url(input: string): Buffer {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(padded + "=".repeat((4 - (padded.length % 4)) % 4), "base64");
}

function signHs256(payload: Record<string, unknown>, secret: string): string {
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = base64url(JSON.stringify(payload));
  const signature = base64url(createHmac("sha256", secret).update(`${header}.${body}`).digest());
  return `${header}.${body}.${signature}`;
}

export function verifyHs256(token: string, secret: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [header, body, signature] = parts;
  let parsedHeader: { alg?: unknown };
  try {
    parsedHeader = JSON.parse(fromBase64url(header).toString("utf8"));
  } catch {
    return null;
  }
  if (parsedHeader.alg !== "HS256") return null;
  const expected = createHmac("sha256", secret).update(`${header}.${body}`).digest();
  const actual = fromBase64url(signature);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  try {
    const claims = JSON.parse(fromBase64url(body).toString("utf8")) as Record<string, unknown>;
    const nowSec = Math.floor(Date.now() / 1000);
    if (typeof claims.exp === "number" && claims.exp < nowSec) return null;
    if (typeof claims.nbf === "number" && claims.nbf > nowSec + 60) return null;
    return claims;
  } catch {
    return null;
  }
}

export type VoiceJoinTokenInput = {
  config: LiveKitConfig;
  room: string;
  identity: string;
  name: string;
  attributes: Record<string, string>;
  ttlSec?: number;
  nowSec?: number;
};

// Same grants as the POC's createJoinToken (mingle-voice-agent/token.ts).
export function mintVoiceJoinToken(input: VoiceJoinTokenInput): string {
  const nowSec = input.nowSec ?? Math.floor(Date.now() / 1000);
  const ttlSec = input.ttlSec ?? 6 * 60 * 60;
  return signHs256(
    {
      iss: input.config.apiKey,
      sub: input.identity,
      nbf: nowSec,
      exp: nowSec + ttlSec,
      name: input.name,
      attributes: input.attributes,
      video: {
        room: input.room,
        roomJoin: true,
        canPublish: true,
        canSubscribe: true,
        canPublishData: true,
        canUpdateOwnMetadata: true,
      },
    },
    input.config.apiSecret,
  );
}

// LiveKit signs each webhook with a JWT in the Authorization header whose
// `sha256` claim is the base64 SHA-256 of the raw request body.
export function verifyLiveKitWebhook(args: {
  config: LiveKitConfig;
  rawBody: string;
  authorization: string | null;
}): boolean {
  const token = (args.authorization || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return false;
  const claims = verifyHs256(token, args.config.apiSecret);
  if (!claims || claims.iss !== args.config.apiKey) return false;
  const bodyHash = createHash("sha256").update(args.rawBody).digest("base64");
  return typeof claims.sha256 === "string" && claims.sha256 === bodyHash;
}
