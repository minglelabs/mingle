import { describe, expect, it } from "vitest";
import {
  resolveNativeRuntimePlatform,
  resolveNativeRuntimePlatformFromSearchParam,
  resolveNativeRuntimePlatformFromUserAgent,
  takeFirstSearchParamValue,
} from "@/lib/native-runtime-platform";

describe("native runtime platform helpers", () => {
  it("takes the first search param value", () => {
    expect(takeFirstSearchParamValue(["android", "ios"])).toBe("android");
    expect(takeFirstSearchParamValue("ios")).toBe("ios");
    expect(takeFirstSearchParamValue(undefined)).toBe("");
  });

  it("parses explicit native platform values", () => {
    expect(resolveNativeRuntimePlatform("ios")).toBe("ios");
    expect(resolveNativeRuntimePlatform(" android ")).toBe("android");
    expect(resolveNativeRuntimePlatform("web")).toBeNull();
  });

  it("parses native platform from search params", () => {
    expect(resolveNativeRuntimePlatformFromSearchParam(["ios"])).toBe("ios");
    expect(resolveNativeRuntimePlatformFromSearchParam("android")).toBe("android");
    expect(resolveNativeRuntimePlatformFromSearchParam(undefined)).toBeNull();
  });

  it("detects native runtime from the user agent", () => {
    expect(resolveNativeRuntimePlatformFromUserAgent(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)",
    )).toBe("ios");
    expect(resolveNativeRuntimePlatformFromUserAgent(
      "Mozilla/5.0 (Linux; Android 14; Pixel 8)",
    )).toBe("android");
    expect(resolveNativeRuntimePlatformFromUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X)")).toBeNull();
  });
});
