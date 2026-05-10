import { createContext, useContext, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";

// `me` is the raw shape returned by GET /api/me; once the generated
// types land you can swap this for the codegen'd Me type.
export interface User {
  id: string;
  email: string;
  name: string;
  role: string;
}

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextValue>({ user: null, isLoading: true });

async function fetchMe(): Promise<User | null> {
  // Hand-rolled rather than via the generated client because we need
  // the 401 to resolve to `null` instead of throwing — the rest of the
  // app branches on logged-in vs logged-out from there.
  const res = await fetch("/api/me", { credentials: "include" });
  if (res.status === 401) return null;
  if (!res.ok) throw new Error(`/api/me returned ${res.status}`);
  return (await res.json()) as User;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const { data, isLoading } = useQuery({
    queryKey: ["auth", "me"],
    queryFn: fetchMe,
    staleTime: 60_000,
    retry: false,
  });

  return (
    <AuthContext.Provider value={{ user: data ?? null, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

export function redirectToLogin() {
  // Full-page navigation — Google OAuth redirects can't be inside an
  // SPA route. After /auth/callback the backend sends us back to /,
  // where this hook will pick up the new session via /api/me.
  window.location.href = "/auth/login";
}
