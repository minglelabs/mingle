export const MOBILE_CANVAS_WIDTH_PX = 400;

export const MOBILE_CANVAS_CSS_PROPERTIES = {
  scaledWidth: "--mingle-mobile-canvas-scaled-width",
  frameHeight: "--mingle-mobile-canvas-frame-height",
  transform: "--mingle-mobile-canvas-transform",
  willChange: "--mingle-mobile-canvas-will-change",
} as const;

export function buildMobileCanvasBootstrapScript(
  canvasWidthPx: number = MOBILE_CANVAS_WIDTH_PX,
): string {
  const normalizedCanvasWidth = Number.isFinite(canvasWidthPx) && canvasWidthPx > 0
    ? canvasWidthPx
    : MOBILE_CANVAS_WIDTH_PX;

  return `(function(){var canvasWidth=${JSON.stringify(normalizedCanvasWidth)};var sync=function(){var root=document.documentElement;var viewportWidth=Math.max(1,Number(window.innerWidth)||Number(root.clientWidth)||canvasWidth);var scale=Math.min(1,viewportWidth/canvasWidth);root.style.setProperty(${JSON.stringify(MOBILE_CANVAS_CSS_PROPERTIES.scaledWidth)},Math.min(canvasWidth,viewportWidth)+"px");root.style.setProperty(${JSON.stringify(MOBILE_CANVAS_CSS_PROPERTIES.frameHeight)},scale<1?(100/scale)+"svh":"100svh");root.style.setProperty(${JSON.stringify(MOBILE_CANVAS_CSS_PROPERTIES.transform)},scale<1?"scale("+scale+")":"none");root.style.setProperty(${JSON.stringify(MOBILE_CANVAS_CSS_PROPERTIES.willChange)},scale<1?"transform":"auto");};if(typeof window.__MINGLE_SYNC_MOBILE_CANVAS__==="function"){window.__MINGLE_SYNC_MOBILE_CANVAS__();return;}window.__MINGLE_SYNC_MOBILE_CANVAS__=sync;sync();window.addEventListener("resize",sync,{passive:true});window.addEventListener("orientationchange",sync,{passive:true});})();`;
}

export const MOBILE_CANVAS_BOOTSTRAP_SCRIPT = buildMobileCanvasBootstrapScript();
