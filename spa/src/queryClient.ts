import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Modest staleTime so navigating between pages doesn't refetch
      // everything; tweak per-query for state that changes more often.
      staleTime: 30_000,
      retry: (failureCount, error) => {
        // Never retry 401s — that means we lost the session and the
        // user needs to log in, not that the server is flaky.
        if (
          error &&
          typeof error === "object" &&
          "status" in error &&
          (error as { status?: number }).status === 401
        ) {
          return false;
        }
        return failureCount < 2;
      },
    },
  },
});
