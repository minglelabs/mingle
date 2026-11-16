"use client";

import { pickLoadingMessage } from "@/i18n/loading-messages";
import { useState, useSyncExternalStore } from "react";

const subscribeToNothing = () => () => {};
const getServerMessage = () => "";

function resolveBrowserLocale(): string {
  const pathSegment = window.location.pathname.split("/")[1] ?? "";
  return pathSegment || document.documentElement.lang || navigator.language || "en";
}

/**
 * The random line shown next to a spinner on a loading screen. Put it beside
 * (or under) any page-level spinner; it inherits the spinner's text color.
 *
 * The line is empty on the server and during hydration so the markup matches, and the
 * element keeps its height while empty so the spinner does not jump.
 */
export function LoadingMessage(props: { locale?: string; className?: string }) {
  const { locale } = props;
  // One roll per mount; the line stays put across re-renders.
  const [roll] = useState(() => Math.random());
  const message = useSyncExternalStore(
    subscribeToNothing,
    () => pickLoadingMessage(locale || resolveBrowserLocale(), () => roll),
    getServerMessage,
  );

  return (
    <p
      data-testid="loading-message"
      className={props.className ?? "min-h-5 px-6 text-center text-[13px] leading-5"}
    >
      {message}
    </p>
  );
}
