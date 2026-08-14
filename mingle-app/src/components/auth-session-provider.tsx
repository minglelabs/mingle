"use client";

import type { Session } from "next-auth";
import type { ReactNode } from "react";
import { SessionProvider } from "next-auth/react";

export function AuthSessionProvider({
  children,
  session,
}: {
  children: ReactNode;
  session: Session | null;
}) {
  return (
    <SessionProvider session={session} refetchOnWindowFocus={false}>
      {children}
    </SessionProvider>
  );
}
