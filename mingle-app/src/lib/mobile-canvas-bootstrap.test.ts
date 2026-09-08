import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import {
  MOBILE_CANVAS_BOOTSTRAP_SCRIPT,
  MOBILE_CANVAS_CSS_PROPERTIES,
  buildMobileCanvasBootstrapScript,
} from "@/lib/mobile-canvas-bootstrap";

type RuntimeWindow = {
  innerWidth: number;
  __MINGLE_SYNC_MOBILE_CANVAS__?: () => void;
  addEventListener: (type: string, listener: () => void) => void;
};

function runBootstrap(initialWidth: number) {
  const properties = new Map<string, string>();
  const listeners = new Map<string, () => void>();
  const runtimeWindow: RuntimeWindow = {
    innerWidth: initialWidth,
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
  };
  const documentElement = {
    clientWidth: initialWidth,
    style: {
      setProperty(name: string, value: string) {
        properties.set(name, value);
      },
    },
  };

  runInNewContext(MOBILE_CANVAS_BOOTSTRAP_SCRIPT, {
    window: runtimeWindow,
    document: { documentElement },
  });

  return { listeners, properties, runtimeWindow };
}

describe("mobile canvas bootstrap", () => {
  it("fits the fixed canvas before React hydration on a narrow viewport", () => {
    const { properties } = runBootstrap(390);

    expect(properties.get(MOBILE_CANVAS_CSS_PROPERTIES.scaledWidth)).toBe("390px");
    expect(properties.get(MOBILE_CANVAS_CSS_PROPERTIES.transform)).toBe("scale(0.975)");
    expect(properties.get(MOBILE_CANVAS_CSS_PROPERTIES.frameHeight)).toBe(`${100 / 0.975}svh`);
    expect(properties.get(MOBILE_CANVAS_CSS_PROPERTIES.willChange)).toBe("transform");
  });

  it("removes the transform when a resize makes the viewport wide enough", () => {
    const { listeners, properties, runtimeWindow } = runBootstrap(360);

    runtimeWindow.innerWidth = 430;
    listeners.get("resize")?.();

    expect(properties.get(MOBILE_CANVAS_CSS_PROPERTIES.scaledWidth)).toBe("400px");
    expect(properties.get(MOBILE_CANVAS_CSS_PROPERTIES.transform)).toBe("none");
    expect(properties.get(MOBILE_CANVAS_CSS_PROPERTIES.frameHeight)).toBe("100svh");
    expect(properties.get(MOBILE_CANVAS_CSS_PROPERTIES.willChange)).toBe("auto");
  });

  it("falls back to the supported canvas width for an invalid input", () => {
    expect(buildMobileCanvasBootstrapScript(Number.NaN)).toContain("var canvasWidth=400");
  });
});
