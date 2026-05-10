import { createContext, useContext, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";

import { api } from "./api/client";

// /api/me returns a plain dict in the FastAPI route, not a Pydantic
// model, so its OpenAPI response schema is empty and we can't derive
// the type from `paths`. Hand-typed here; if it ever grows we can
// give it a Pydantic response_model and pull the type from schema.ts
// instead.
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
  // Use the typed openapi client so a future schema change to /api/me
  // breaks tsc here instead of silently returning the wrong shape.
  // Anything other than 200 -> null so AuthGate routes to the login UI;
  // we don't distinguish 401 from other errors at this layer.
  const { data, response } = await api.GET("/api/me");
  if (response.status === 401) return null;
  if (!response.ok || !data) {
    throw new Error(`/api/me returned ${response.status}`);
  }
  return data as User;
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
