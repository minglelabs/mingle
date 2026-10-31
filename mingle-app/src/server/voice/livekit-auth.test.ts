import { createHash, createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { mintVoiceJoinToken, verifyHs256, verifyLiveKitWebhook } from "@/server/voice/livekit-auth";

const config = { url: "wss://voice.example.test", apiKey: "APItestkey", apiSecret: "test-secret-value-0123456789" };

function b64url(input: Buffer | string) {
  return Buffer.from(input).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function signWebhook(body: string, secret = config.apiSecret, iss = config.apiKey) {
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const nowSec = Math.floor(Date.now() / 1000);
  const payload = b64url(JSON.stringify({
    iss,
    nbf: nowSec,
    exp: nowSec + 600,
    sha256: createHash("sha256").update(body).digest("base64"),
  }));
  const signature = b64url(createHmac("sha256", secret).update(`${header}.${payload}`).digest());
  return `${header}.${payload}.${signature}`;
}

describe("mintVoiceJoinToken", () => {
  it("issues a LiveKit join token with the room grants and attributes", () => {
    const token = mintVoiceJoinToken({
      config,
      room: "voice-chan-1-abc",
      identity: "user-1",
      name: "Mia",
      attributes: { lang: "ko", interpret: "on", role: "speaker" },
      nowSec: Math.floor(Date.now() / 1000),
    });
    const claims = verifyHs256(token, config.apiSecret);

    expect(claims).toMatchObject({
      iss: "APItestkey",
      sub: "user-1",
      name: "Mia",
      attributes: { lang: "ko", interpret: "on", role: "speaker" },
      video: {
        room: "voice-chan-1-abc",
        roomJoin: true,
        canPublish: true,
        canSubscribe: true,
        canPublishData: true,
        canUpdateOwnMetadata: true,
      },
    });
    expect((claims!.exp as number) - (claims!.nbf as number)).toBe(6 * 60 * 60);
    expect(verifyHs256(token, "wrong-secret")).toBeNull();
  });

  it("rejects expired tokens", () => {
    const token = mintVoiceJoinToken({
      config, room: "voice-x", identity: "u", name: "", attributes: {}, nowSec: 1_000, ttlSec: 10,
    });
    expect(verifyHs256(token, config.apiSecret)).toBeNull();
  });
});

describe("verifyLiveKitWebhook", () => {
  const body = JSON.stringify({ event: "room_finished", room: { name: "voice-chan-1-abc" } });

  it("accepts a correctly signed body", () => {
    expect(verifyLiveKitWebhook({ config, rawBody: body, authorization: signWebhook(body) })).toBe(true);
  });

  it("rejects a bad signature, a wrong issuer, a tampered body, or no header", () => {
    expect(verifyLiveKitWebhook({ config, rawBody: body, authorization: signWebhook(body, "other-secret") })).toBe(false);
    expect(verifyLiveKitWebhook({ config, rawBody: body, authorization: signWebhook(body, config.apiSecret, "other") })).toBe(false);
    expect(verifyLiveKitWebhook({ config, rawBody: `${body} `, authorization: signWebhook(body) })).toBe(false);
    expect(verifyLiveKitWebhook({ config, rawBody: body, authorization: null })).toBe(false);
  });
});
