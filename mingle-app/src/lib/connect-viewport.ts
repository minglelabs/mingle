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
  const previousKeyboardState = element.getAttribute("data-keyboard-open");
  // Android adjustResize shrinks both innerHeight and visualViewport. Remember
  // the unobscured height instead of relying on their difference alone.
  let unobscuredHeight = Math.max(window.innerHeight, viewport?.height ?? 0);
  let viewportWidth = window.innerWidth;
  const unobscuredHeights = new Map<number, number>([[viewportWidth, unobscuredHeight]]);
  let keyboardOpen = false;
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
    const visibleHeight = viewport?.height ?? window.innerHeight;
    if (window.innerWidth !== viewportWidth) {
      // adjustResize can already include the keyboard in the first resize after
      // rotation. Reuse a known height for this width; for a new orientation,
      // the previous width estimates its unobscured height (within system bars).
      // Never carry the old portrait height into landscape, or closing the
      // keyboard there would leave the tabs hidden.
      const rotatedHeight = unobscuredHeights.get(window.innerWidth) ?? viewportWidth;
      viewportWidth = window.innerWidth;
      unobscuredHeight = Math.max(
        window.innerHeight, visibleHeight, keyboardOpen ? rotatedHeight : 0,
      );
    }
    unobscuredHeight = Math.max(unobscuredHeight, window.innerHeight, visibleHeight);
    const searchFocused = element.querySelector('input[type="search"]') === document.activeElement;
    // Ignore small browser-toolbar changes. Keep tabs hidden during keyboard
    // dismissal even if blur arrives before the viewport expands again.
    keyboardOpen = (searchFocused || keyboardOpen) && unobscuredHeight - visibleHeight > 100;
    if (!keyboardOpen) {
      unobscuredHeights.set(viewportWidth, unobscuredHeight);
    }
    element.setAttribute("data-keyboard-open", String(keyboardOpen));
  };
  const scheduleSync = () => {
    if (!animationFrame) animationFrame = window.requestAnimationFrame(sync);
  };
  const observer = new ResizeObserver(scheduleSync);
  observer.observe(frame);
  viewport?.addEventListener("resize", scheduleSync);
  viewport?.addEventListener("scroll", scheduleSync);
  window.addEventListener("resize", scheduleSync);
  element.addEventListener("focusin", scheduleSync);
  element.addEventListener("focusout", scheduleSync);
  sync();

  return () => {
    observer.disconnect();
    viewport?.removeEventListener("resize", scheduleSync);
    viewport?.removeEventListener("scroll", scheduleSync);
    window.removeEventListener("resize", scheduleSync);
    element.removeEventListener("focusin", scheduleSync);
    element.removeEventListener("focusout", scheduleSync);
    if (animationFrame) window.cancelAnimationFrame(animationFrame);
    element.style.height = previousHeight;
    if (previousKeyboardState === null) element.removeAttribute("data-keyboard-open");
    else element.setAttribute("data-keyboard-open", previousKeyboardState);
  };
}
