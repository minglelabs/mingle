"use client";

import type { Session } from "next-auth";
import { useEffect, useRef, type ReactNode } from "react";
import { getSession, SessionProvider, useSession } from "next-auth/react";

/**
 * SessionProvider with an initial session never fetches on mount, so the session cookie is
 * never re-signed. One fetch per launch makes /api/auth/session re-issue it with the current
 * lifetime, which upgrades tokens issued under the old 30-day default.
 */
function SessionCookieRefresher() {
  const { status } = useSession();
  const refreshedRef = useRef(false);
  useEffect(() => {
    if (status !== "authenticated" || refreshedRef.current) return;
    refreshedRef.current = true;
    void getSession().catch(() => {});
  }, [status]);
  return null;
}

export function AuthSessionProvider({
  children,
  session,
}: {
  children: ReactNode;
  session: Session | null;
}) {
  return (
    <SessionProvider session={session} refetchOnWindowFocus={false}>
      <SessionCookieRefresher />
      {children}
    </SessionProvider>
  );
}
