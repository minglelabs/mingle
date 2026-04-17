import { describe, expect, it } from "vitest";

import {
  readNativeQaBridgeAuthority,
  shouldExposeNativeQaBridge,
} from "./native-qa-bridge";

describe("native QA bridge guards", () => {
  it("requires the native-injected runtime authority flag", () => {
    expect(readNativeQaBridgeAuthority(null)).toBe(false);
    expect(readNativeQaBridgeAuthority({ __MINGLE_NATIVE_QA_BRIDGE_ENABLED__: false })).toBe(false);
    expect(readNativeQaBridgeAuthority({ __MINGLE_NATIVE_QA_BRIDGE_ENABLED__: true })).toBe(true);
  });

  it("opens only for native runtime pages with both URL params and runtime authority", () => {
    const search = "?qa=1&nativeQa=1&sttDebug=1&ttsDebug=1";

    expect(shouldExposeNativeQaBridge({
      search,
      isNativeAppRuntime: true,
      runtimeQaBridgeAuthorized: true,
    })).toBe(true);

    expect(shouldExposeNativeQaBridge({
      search,
      isNativeAppRuntime: true,
      runtimeQaBridgeAuthorized: false,
    })).toBe(false);

    expect(shouldExposeNativeQaBridge({
      search,
      isNativeAppRuntime: false,
      runtimeQaBridgeAuthorized: true,
    })).toBe(false);
  });
});
