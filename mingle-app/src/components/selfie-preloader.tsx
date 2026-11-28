"use client";

import { useEffect } from "react";
import { preloadSelfieModels } from "@/lib/selfie-human";

/**
 * Starts loading the selfie check's face models while it is on screen (it
 * draws nothing). Load it with next/dynamic and ssr: false: the face library
 * must never be bundled for the server (its Node build needs tfjs-node).
 */
export default function SelfiePreloader() {
  useEffect(() => {
    preloadSelfieModels();
  }, []);
  return null;
}
