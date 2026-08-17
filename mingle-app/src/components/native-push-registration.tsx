"use client";

import { useSession } from "next-auth/react";
import { useEffect, useRef } from "react";
import { buildClientApiPath, clientApiNamespace } from "@/lib/api-contract";
import {
  NATIVE_PUSH_TOKEN_EVENT,
  isNativePushBridgeAvailable,
  normalizeNativePushRegistration,
  postNativePushRegister,
  rememberNativePushRegistration,
  type NativePushRegistration,
} from "@/lib/native-push";

type NativePushWindow = Window & {
  __MINGLE_LAST_NATIVE_PUSH_TOKEN?: unknown;
};

async function registerPushToken(
  registration: NativePushRegistration,
): Promise<boolean> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (registration.appVersion) headers["x-mingle-app-version"] = registration.appVersion;
  if (registration.apiNamespace || clientApiNamespace) {
    headers["x-mingle-api-namespace"] = registration.apiNamespace || clientApiNamespace;
  }

  const response = await fetch(buildClientApiPath("/push-tokens"), {
    method: "POST",
    headers,
    cache: "no-store",
    body: JSON.stringify({
      token: registration.token,
      installationId: registration.installationId,
      platform: registration.platform,
      environment: registration.environment,
      appVersion: registration.appVersion,
      apiNamespace: registration.apiNamespace || clientApiNamespace,
    }),
  });
  return response.ok;
}

export default function NativePushRegistration() {
  const { data: session, status } = useSession();
  const userId = typeof session?.user?.id === "string" ? session.user.id.trim() : "";
  const registeredKeyRef = useRef("");
  const inFlightKeyRef = useRef("");

  useEffect(() => {
    if (!isNativePushBridgeAvailable() || status !== "authenticated" || !userId) return;

    const handleRegistration = (value: unknown) => {
      const registration = normalizeNativePushRegistration(value);
      if (!registration) return;

      const key = `${userId}:${registration.platform}:${registration.installationId}:${registration.token}`;
      if (registeredKeyRef.current === key || inFlightKeyRef.current === key) return;
      inFlightKeyRef.current = key;
      void registerPushToken(registration)
        .then((registered) => {
          if (registered) {
            registeredKeyRef.current = key;
            rememberNativePushRegistration(registration);
          }
        })
        .catch(() => {
          // A later foreground or session refresh retries registration.
        })
        .finally(() => {
          if (inFlightKeyRef.current === key) inFlightKeyRef.current = "";
        });
    };

    const handleEvent = (event: Event) => {
      handleRegistration((event as CustomEvent<unknown>).detail);
    };
    window.addEventListener(NATIVE_PUSH_TOKEN_EVENT, handleEvent);

    const cached = (window as NativePushWindow).__MINGLE_LAST_NATIVE_PUSH_TOKEN;
    if (cached) handleRegistration(cached);
    postNativePushRegister();

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") postNativePushRegister();
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener(NATIVE_PUSH_TOKEN_EVENT, handleEvent);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [status, userId]);

  return null;
}
