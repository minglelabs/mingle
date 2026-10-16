import { afterEach, describe, expect, it, vi } from "vitest";
import { postNativeFirstScreenReady } from "@/lib/native-first-screen-ready";

function installWindow(postMessage?: (message: string) => void) {
  const frames: FrameRequestCallback[] = [];
  vi.stubGlobal("window", {
    ReactNativeWebView: postMessage ? { postMessage } : undefined,
    requestAnimationFrame: (callback: FrameRequestCallback) => frames.push(callback),
    cancelAnimationFrame: (id: number) => {
      frames[id - 1] = () => {};
    },
  });
  return () => {
    while (frames.length > 0) frames.shift()?.(0);
  };
}

describe("postNativeFirstScreenReady", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts the ready command after two frames", () => {
    const postMessage = vi.fn();
    const flushFrames = installWindow(postMessage);

    postNativeFirstScreenReady();
    expect(postMessage).not.toHaveBeenCalled();

    flushFrames();
    expect(postMessage).toHaveBeenCalledWith(JSON.stringify({ type: "native_first_screen_ready" }));
  });

  it("does not post when cancelled before the frames run", () => {
    const postMessage = vi.fn();
    const flushFrames = installWindow(postMessage);

    const cancel = postNativeFirstScreenReady();
    cancel();
    flushFrames();

    expect(postMessage).not.toHaveBeenCalled();
  });

  it("does nothing outside the native app", () => {
    const flushFrames = installWindow();
    expect(() => {
      postNativeFirstScreenReady();
      flushFrames();
    }).not.toThrow();
  });
});
