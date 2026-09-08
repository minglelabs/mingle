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

  it.each(["ios", "android"])("hides tabs until the %s keyboard finishes closing and cleans up", (platform) => {
    const viewport = Object.assign(new EventTarget(), { height: 800, offsetTop: 0 });
    const runtime = Object.assign(new EventTarget(), {
      visualViewport: viewport,
      innerHeight: 800,
      innerWidth: 400,
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
    const searchInput = {};
    const document = { activeElement: searchInput };
    vi.stubGlobal("document", document);
    const attributes = new Map<string, string>();
    const frame = {
      clientHeight: 800,
      offsetWidth: 400,
      getBoundingClientRect: () => ({ top: 0, width: 400 }),
    };
    const element = Object.assign(new EventTarget(), {
      querySelector: () => searchInput,
      getAttribute: (name: string) => attributes.get(name) ?? null,
      setAttribute: (name: string, value: string) => attributes.set(name, value),
      removeAttribute: (name: string) => attributes.delete(name),
      style: { height: "" },
      parentElement: frame,
    }) as unknown as HTMLElement;

    const dispose = observeConnectViewport(element);
    expect(element.style.height).toBe("800px");
    expect(element.getAttribute("data-keyboard-open")).toBe("false");
    viewport.height = 480;
    if (platform === "android") {
      runtime.innerHeight = 480;
      frame.clientHeight = 480;
    }
    viewport.dispatchEvent(new Event("resize"));
    viewport.dispatchEvent(new Event("scroll"));
    expect(runtime.requestAnimationFrame).toHaveBeenCalledTimes(1);
    scheduled?.();
    expect(element.style.height).toBe("480px");
    expect(element.getAttribute("data-keyboard-open")).toBe("true");
    document.activeElement = {};
    element.dispatchEvent(new Event("focusout"));
    scheduled?.();
    expect(element.getAttribute("data-keyboard-open")).toBe("true");
    viewport.height = 800;
    runtime.innerHeight = 800;
    frame.clientHeight = 800;
    viewport.dispatchEvent(new Event("resize"));
    scheduled?.();
    expect(element.style.height).toBe("800px");
    expect(element.getAttribute("data-keyboard-open")).toBe("false");
    // A focused input with a hardware keyboard / toolbar resize keeps tabs.
    document.activeElement = searchInput;
    viewport.height = 750;
    runtime.dispatchEvent(new Event("resize"));
    scheduled?.();
    expect(element.getAttribute("data-keyboard-open")).toBe("false");
    runtime.dispatchEvent(new Event("resize"));
    dispose();
    expect(element.style.height).toBe("");
    expect(element.getAttribute("data-keyboard-open")).toBeNull();
    expect(disconnect).toHaveBeenCalledOnce();
    expect(runtime.cancelAnimationFrame).toHaveBeenCalledWith(1);
    runtime.requestAnimationFrame.mockClear();
    viewport.dispatchEvent(new Event("resize"));
    runtime.dispatchEvent(new Event("resize"));
    expect(runtime.requestAnimationFrame).not.toHaveBeenCalled();
  });
});
