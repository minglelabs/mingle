"use client";

import { useSession } from "next-auth/react";
import { useEffect } from "react";
import { commitPendingSignInMethod } from "@/lib/last-sign-in-method";

/** Turns the Apple / Google button pressed before a sign-in into the device's last used method once it succeeds. */
export default function LastSignInMethodRecorder() {
  const { status } = useSession();
  useEffect(() => {
    if (status === "authenticated") commitPendingSignInMethod();
  }, [status]);
  return null;
}
