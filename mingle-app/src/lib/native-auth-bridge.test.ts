import { describe, expect, it } from "vitest";
import {
  resolveNativeAuthRequestId,
  resolveNativeOAuthProvider,
  resolveSafeCallbackPath,
} from "@/lib/native-auth-bridge";

describe("native-auth-bridge", () => {
  it("accepts only the supported native OAuth providers", () => {
    expect(resolveNativeOAuthProvider("apple")).toBe("apple");
    expect(resolveNativeOAuthProvider(" GOOGLE ")).toBe("google");
    expect(resolveNativeOAuthProvider("email")).toBeNull();
    expect(resolveNativeOAuthProvider("")).toBeNull();
  });

  it("keeps callback paths on-origin and falls back when the input is unsafe", () => {
    expect(resolveSafeCallbackPath("/api/native-auth/complete?requestId=req_123")).toBe(
      "/api/native-auth/complete?requestId=req_123",
    );
    expect(resolveSafeCallbackPath("https://example.com/escape", "/ko")).toBe("/ko");
    expect(resolveSafeCallbackPath("//evil.example.com", "/ko")).toBe("/ko");
  });

  it("accepts only bounded request ids for native auth polling", () => {
    expect(resolveNativeAuthRequestId("rq_1234567890ab")).toBe("rq_1234567890ab");
    expect(resolveNativeAuthRequestId("short")).toBeNull();
    expect(resolveNativeAuthRequestId("bad space request")).toBeNull();
  });
});
