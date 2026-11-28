"use client";

import { useEffect } from "react";
import { resolveKeyboardViewportInsetPx } from "@/components/LivePhoneDemo/keyboard-viewport-inset";

/**
 * Publishes how much of the screen the on-screen keyboard covers as the
 * `--keyboard-inset` CSS variable on <html>. Full-screen sheets and dialogs
 * with the `keyboard-safe` class end above the keyboard, so their bottom
 * button (Continue, Save, Send) stays visible and tappable while typing.
 *
 * Android's adjustResize already shrinks the page (the inset is 0 there); the
 * iOS WebView does not, which hid bottom buttons under the keyboard.
 */
export default function KeyboardInsetVar() {
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const root = document.documentElement;
    let current = Number.NaN; // the first measure always writes the variable
    const measure = () => {
      const inset = resolveKeyboardViewportInsetPx(viewport);
      if (Math.abs(inset - current) < 2) return;
      current = inset;
      root.style.setProperty("--keyboard-inset", `${inset}px`);
      root.toggleAttribute("data-keyboard-inset", inset > 0);
    };
    // iOS keeps animating after focus; measure again once it settles.
    const onFocusIn = () => {
      window.setTimeout(measure, 60);
      window.setTimeout(measure, 320);
    };
    const onFocusOut = () => window.setTimeout(measure, 320);
    measure();
    viewport.addEventListener("resize", measure);
    viewport.addEventListener("scroll", measure);
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    return () => {
      viewport.removeEventListener("resize", measure);
      viewport.removeEventListener("scroll", measure);
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
      root.style.removeProperty("--keyboard-inset");
      root.removeAttribute("data-keyboard-inset");
    };
  }, []);
  return null;
}
