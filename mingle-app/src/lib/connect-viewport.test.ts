import { afterEach, describe, expect, it, vi } from "vitest";
import { observeConnectViewport, resolveConnectViewportHeight } from "./connect-viewport";

afterEach(() => vi.unstubAllGlobals());

describe("search viewport", () => {
  it.each([
    [800, 800, 1, 0, 0, 800],
    [800, 500, 1, 0, 0, 500], // Keyboard overlays the iOS layout viewport.
    [500, 500, 1, 0, 0, 500], // Android has already resized the WebView.
    [800, 450, 0.9, 0, 0, 500], // 360px screen uses a scaled 400px canvas.
    [800, 500, 1, 50, 50, 500], // Viewport and frame offset cancel out.
    [800, 900, 1, 0, 0, 800], // Never grow beyond the containing canvas.
  ])("fits frame %s to viewport %s at scale %s", (
    frameHeight, viewportHeight, frameScale, frameTop, viewportOffsetTop, expected,
  ) => {
    expect(resolveConnectViewportHeight({
      frameHeight, viewportHeight, frameScale, frameTop, viewportOffsetTop,
    })).toBe(expected);
  });

  it("updates on keyboard opening/closing and removes observers on unmount", () => {
    const viewport = Object.assign(new EventTarget(), { height: 800, offsetTop: 0 });
    const runtime = Object.assign(new EventTarget(), {
      visualViewport: viewport,
      innerHeight: 800,
      requestAnimationFrame: vi.fn(),
      cancelAnimationFrame: vi.fn(),
    });
    let scheduled: (() => void) | undefined;
    runtime.requestAnimationFrame.mockImplementation((callback: () => void) => {
      scheduled = callback;
      return 1;
    });
    const disconnect = vi.fn();
    vi.stubGlobal("window", runtime);
    vi.stubGlobal("ResizeObserver", class {
      observe() {}
      disconnect = disconnect;
    });
    const element = {
      style: { height: "" },
      parentElement: {
        clientHeight: 800,
        offsetWidth: 400,
        getBoundingClientRect: () => ({ top: 0, width: 400 }),
      },
    } as unknown as HTMLElement;

    const dispose = observeConnectViewport(element);
    expect(element.style.height).toBe("800px");
    viewport.height = 480;
    viewport.dispatchEvent(new Event("resize"));
    viewport.dispatchEvent(new Event("scroll"));
    expect(runtime.requestAnimationFrame).toHaveBeenCalledTimes(1);
    scheduled?.();
    expect(element.style.height).toBe("480px");
    viewport.height = 800;
    viewport.dispatchEvent(new Event("resize"));
    scheduled?.();
    expect(element.style.height).toBe("800px");
    runtime.dispatchEvent(new Event("resize"));
    dispose();
    expect(element.style.height).toBe("");
    expect(disconnect).toHaveBeenCalledOnce();
    expect(runtime.cancelAnimationFrame).toHaveBeenCalledWith(1);
    runtime.requestAnimationFrame.mockClear();
    viewport.dispatchEvent(new Event("resize"));
    runtime.dispatchEvent(new Event("resize"));
    expect(runtime.requestAnimationFrame).not.toHaveBeenCalled();
  });
});
