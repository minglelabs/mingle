"use client";

import { useEffect, useRef, useState } from "react";
import { ROUTE_TRANSITION_CURTAIN_EVENT } from "@/lib/route-transition-curtain";

type CurtainPhase = "hidden" | "shown" | "hiding";

const CURTAIN_FADE_MS = 140;

export default function RouteTransitionCurtain() {
  const [phase, setPhase] = useState<CurtainPhase>("hidden");
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const handleShow = () => {
      if (hideTimeoutRef.current !== null) {
        clearTimeout(hideTimeoutRef.current);
        hideTimeoutRef.current = null;
      }
      setPhase("shown");
      // Two rAFs, not one: the first fires before the browser's next paint
      // (so the destination route's commit may not have painted yet), the
      // second is only scheduled once that paint has actually happened.
      // Only then is it safe to start lifting the curtain.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setPhase("hiding");
          hideTimeoutRef.current = setTimeout(() => {
            hideTimeoutRef.current = null;
            setPhase("hidden");
          }, CURTAIN_FADE_MS);
        });
      });
    };

    window.addEventListener(ROUTE_TRANSITION_CURTAIN_EVENT, handleShow);
    return () => {
      window.removeEventListener(ROUTE_TRANSITION_CURTAIN_EVENT, handleShow);
      if (hideTimeoutRef.current !== null) clearTimeout(hideTimeoutRef.current);
    };
  }, []);

  if (phase === "hidden") return null;

  return (
    <div
      aria-hidden="true"
      className={`fixed inset-0 z-[999] bg-white transition-opacity ${
        phase === "hiding" ? "opacity-0" : "opacity-100"
      }`}
      style={{ transitionDuration: `${CURTAIN_FADE_MS}ms` }}
    />
  );
}
