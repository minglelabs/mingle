// Convert visible viewport pixels into the fixed-width mobile canvas's CSS pixels.
export function resolveConnectViewportHeight({
  frameHeight,
  frameTop,
  frameScale,
  viewportHeight,
  viewportOffsetTop,
}: {
  frameHeight: number;
  frameTop: number;
  frameScale: number;
  viewportHeight: number;
  viewportOffsetTop: number;
}): number {
  const scale = frameScale > 0 ? frameScale : 1;
  return Math.max(0, Math.min(frameHeight,
    (viewportHeight + viewportOffsetTop - frameTop) / scale));
}

export function observeConnectViewport(element: HTMLElement): () => void {
  const frame = element.parentElement;
  if (!frame) return () => {};

  const viewport = window.visualViewport;
  const previousHeight = element.style.height;
  let animationFrame = 0;
  const sync = () => {
    animationFrame = 0;
    const rect = frame.getBoundingClientRect();
    const height = resolveConnectViewportHeight({
      frameHeight: frame.clientHeight,
      frameTop: rect.top,
      frameScale: frame.offsetWidth > 0 ? rect.width / frame.offsetWidth : 1,
      viewportHeight: viewport?.height ?? window.innerHeight,
      viewportOffsetTop: viewport?.offsetTop ?? 0,
    });
    element.style.height = `${height}px`;
  };
  const scheduleSync = () => {
    if (!animationFrame) animationFrame = window.requestAnimationFrame(sync);
  };
  const observer = new ResizeObserver(scheduleSync);
  observer.observe(frame);
  viewport?.addEventListener("resize", scheduleSync);
  viewport?.addEventListener("scroll", scheduleSync);
  window.addEventListener("resize", scheduleSync);
  sync();

  return () => {
    observer.disconnect();
    viewport?.removeEventListener("resize", scheduleSync);
    viewport?.removeEventListener("scroll", scheduleSync);
    window.removeEventListener("resize", scheduleSync);
    if (animationFrame) window.cancelAnimationFrame(animationFrame);
    element.style.height = previousHeight;
  };
}
