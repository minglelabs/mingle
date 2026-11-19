"use client";

import { Component, type ReactNode } from "react";
import { isChunkLoadError, reloadAfterChunkLoadError } from "@/lib/chunk-load-recovery";

type LazyOverlayBoundaryProps = {
  children: ReactNode;
  /** Called after a failure so the owner can close the overlay. */
  onFail?: () => void;
};

/**
 * Wraps an overlay that is loaded with next/dynamic and mounted on demand.
 * Without it, a failed chunk (WebView left open across a deploy) or a throw in
 * the overlay takes down the whole page with "Application error". A chunk
 * failure reloads the page once; anything else just closes the overlay.
 */
export default class LazyOverlayBoundary extends Component<LazyOverlayBoundaryProps, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  componentDidCatch(error: unknown): void {
    console.error("[mingle] overlay failed", error);
    if (isChunkLoadError(error) && reloadAfterChunkLoadError()) return;
    this.props.onFail?.();
  }

  render(): ReactNode {
    return this.state.failed ? null : this.props.children;
  }
}
