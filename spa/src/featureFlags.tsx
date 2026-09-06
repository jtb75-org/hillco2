import { useQuery } from "@tanstack/react-query";

import { api } from "./api/client";
import type { components } from "./api/schema";

export type FeatureFlag = components["schemas"]["FeatureFlag"];

// All feature flags, keyed for the admin toggles and any UI that gates
// on them. Cached broadly — flags change rarely, and a toggle in the
// admin page invalidates ["feature-flags"] to refetch.
export function useFeatureFlags() {
  return useQuery<FeatureFlag[], Error>({
    queryKey: ["feature-flags"],
    queryFn: async () => {
      const { data, error } = await api.GET("/api/feature-flags");
      if (error || !data) throw new Error("Failed to load feature flags.");
      return data;
    },
    staleTime: 5 * 60_000,
  });
}

/** Whether a single flag is on. While flags are still loading (or the
 *  key is unknown), falls back to `fallback` — default `true` so a
 *  "show X" flag renders X rather than flashing it hidden. */
export function useFeatureFlag(key: string, fallback = true): boolean {
  const { data } = useFeatureFlags();
  if (!data) return fallback;
  return data.find((f) => f.key === key)?.enabled ?? fallback;
}
