export const LIVE_DEMO_LANGUAGE_BUTTON_DATA_QA = "live-demo-language-button";
export const LIVE_DEMO_LANGUAGE_CHEVRON_DATA_QA = "live-demo-language-chevron";
export const LIVE_DEMO_LANGUAGE_TRIGGER_ARIA_HASPOPUP = "dialog";
export const LIVE_DEMO_LANGUAGE_TRIGGER_CLASSNAME =
  "inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1 text-gray-700 transition-colors";

export const LIVE_DEMO_MENU_OVERLAY_CLASSNAME =
  "absolute inset-0 z-50 overflow-hidden bg-black/42";
export const LIVE_DEMO_MENU_PANEL_BASE_CLASSNAME =
  "relative flex h-full w-full flex-col overflow-hidden will-change-transform sm:max-w-[400px] sm:border-x sm:border-gray-200";
export const LIVE_DEMO_MENU_SCROLL_CONTAINER_CLASSNAME =
  "min-h-0 flex-1 overflow-y-auto overscroll-contain";

export function resolveLiveDemoMenuTriggerClassName(
  navSurfaceClassName: string,
): string {
  return [
    "inline-flex h-11 min-w-[44px] items-center justify-center px-2 text-gray-700 transition-colors hover:text-gray-900 active:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 disabled:cursor-not-allowed disabled:opacity-60",
    navSurfaceClassName,
  ]
    .filter(Boolean)
    .join(" ");
}

export function resolveLiveDemoMenuPanelClassName(
  navSurfaceClassName: string,
): string {
  return [
    LIVE_DEMO_MENU_PANEL_BASE_CLASSNAME,
    navSurfaceClassName,
  ]
    .filter(Boolean)
    .join(" ");
}

export function resolveLiveDemoMenuPanelShadow(
  isCenteredMenuLayout: boolean,
): string {
  return isCenteredMenuLayout
    ? "0 22px 64px rgba(15, 23, 42, 0.24)"
    : "-18px 0 40px rgba(15, 23, 42, 0.22)";
}
