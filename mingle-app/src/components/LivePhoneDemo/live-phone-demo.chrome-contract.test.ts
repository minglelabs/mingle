import { describe, expect, it } from "vitest";
import {
  LIVE_DEMO_LANGUAGE_BUTTON_DATA_QA,
  LIVE_DEMO_LANGUAGE_CHEVRON_DATA_QA,
  LIVE_DEMO_LANGUAGE_TRIGGER_ARIA_HASPOPUP,
  LIVE_DEMO_LANGUAGE_TRIGGER_CLASSNAME,
  LIVE_DEMO_MENU_OVERLAY_CLASSNAME,
  LIVE_DEMO_MENU_PANEL_BASE_CLASSNAME,
  LIVE_DEMO_MENU_SCROLL_CONTAINER_CLASSNAME,
  resolveLiveDemoMenuPanelClassName,
  resolveLiveDemoMenuTriggerClassName,
} from "@/components/LivePhoneDemo/live-phone-demo.chrome-contract";

describe("live-phone-demo chrome contracts", () => {
  it("keeps the language control visually recognizable as a selector dialog", () => {
    expect(LIVE_DEMO_LANGUAGE_BUTTON_DATA_QA).toBe("live-demo-language-button");
    expect(LIVE_DEMO_LANGUAGE_CHEVRON_DATA_QA).toBe("live-demo-language-chevron");
    expect(LIVE_DEMO_LANGUAGE_TRIGGER_ARIA_HASPOPUP).toBe("dialog");
    expect(LIVE_DEMO_LANGUAGE_TRIGGER_CLASSNAME).toContain("min-h-[38px]");
    expect(LIVE_DEMO_LANGUAGE_TRIGGER_CLASSNAME).toContain("border border-gray-200");
  });

  it("keeps the menu trigger on the shared top-bar surface without extra chrome", () => {
    const className = resolveLiveDemoMenuTriggerClassName("bg-white");

    expect(className).toContain("inline-flex h-11 min-w-[44px]");
    expect(className).toContain("focus-visible:ring-2");
    expect(className).toContain("bg-white");
    expect(className).not.toContain("border");
  });

  it("opens the drawer inside a full-screen overlay and restores the container border on the panel", () => {
    expect(LIVE_DEMO_MENU_OVERLAY_CLASSNAME).toBe(
      "absolute inset-0 z-50 overflow-hidden bg-transparent",
    );
    expect(LIVE_DEMO_MENU_PANEL_BASE_CLASSNAME).toContain(
      "sm:border-x sm:border-gray-200",
    );
    expect(resolveLiveDemoMenuPanelClassName("bg-white")).toContain("bg-white");
  });

  it("keeps internal drawer surfaces scroll-contained instead of leaking body scroll", () => {
    expect(LIVE_DEMO_MENU_SCROLL_CONTAINER_CLASSNAME).toBe(
      "min-h-0 flex-1 overflow-y-auto overscroll-contain",
    );
  });
});
