"use client";

import { pickLoadingMessage } from "@/i18n/loading-messages";
import { useMemo, useState, useSyncExternalStore } from "react";

const subscribeToNothing = () => () => {};
const getServerLocale = () => null;

function resolveBrowserLocale(): string {
  const pathSegment = window.location.pathname.split("/")[1] ?? "";
  return pathSegment || document.documentElement.lang || navigator.language || "en";
}

/**
 * The random line shown under a spinner on a loading screen, with its source
 * ("— 한국 속담") on a smaller line below. It inherits the text color.
 *
 * Nothing is rendered on the server or during hydration, so the markup
 * matches; the line appears right after.
 */
export function LoadingMessage(props: { locale?: string; className?: string }) {
  const { locale } = props;
  // One roll per mount; the line stays put across re-renders.
  const [roll] = useState(() => Math.random());
  const resolvedLocale = useSyncExternalStore(
    subscribeToNothing,
    () => locale || resolveBrowserLocale(),
    getServerLocale,
  );
  const message = useMemo(
    () => (resolvedLocale === null ? null : pickLoadingMessage(resolvedLocale, () => roll)),
    [resolvedLocale, roll],
  );

  return (
    <div
      data-testid="loading-message"
      className={props.className ?? "min-h-10 max-w-[18rem] px-2 text-center text-[13px] leading-5"}
    >
      {message ? (
        <>
          <p className="break-keep">{message.text}</p>
          {message.source ? <p className="mt-1 text-[11px] opacity-75">— {message.source}</p> : null}
        </>
      ) : null}
    </div>
  );
}
