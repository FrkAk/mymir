"use client";

import { createContext, useContext } from "react";
import { useSession } from "@/lib/auth-client";

type SessionState = ReturnType<typeof useSession>;

const SessionContext = createContext<SessionState | null>(null);

/**
 * Provides reactive auth session state to client components.
 * @param props - Provider props with children.
 * @returns Context provider wrapping children with session data.
 */
export function SessionProvider({ children }: { children: React.ReactNode }) {
  const session = useSession();
  return (
    <SessionContext.Provider value={session}>
      {children}
    </SessionContext.Provider>
  );
}

/**
 * Access the current auth session from any client component.
 * Must be used within a SessionProvider.
 * @returns Current session context with data, isPending, and error.
 * @throws Error if used outside SessionProvider.
 */
export function useAuth() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useAuth must be used within SessionProvider");
  return ctx;
}
