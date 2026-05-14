import { useQuery } from "@tanstack/react-query";

import { api } from "../api/client";

export interface EngagementType {
  id: string;
  code: string;
  label: string;
  description: string | null;
  sort_order: number;
  deleted_at: string | null;
}

/** All engagement types (including soft-deleted) keyed by code → label.
 *  Soft-deleted entries still need to render correctly on historical
 *  engagements, so we don't filter them out here. */
export function useEngagementTypes() {
  const query = useQuery<EngagementType[], Error>({
    queryKey: ["engagement-types"],
    queryFn: async () => {
      const { data, error } = await api.GET("/api/engagement-types", {
        params: { query: { include_deleted: true } },
      });
      if (error || !data) throw new Error("Failed to load engagement types.");
      return data as unknown as EngagementType[];
    },
    staleTime: 60_000,
  });

  const byCode = new Map<string, EngagementType>();
  for (const t of query.data ?? []) byCode.set(t.code, t);

  const labelFor = (code: string): string =>
    byCode.get(code)?.label ??
    // Fall back to a humanized code so a row never renders blank for
    // a freshly-added or fetched-late type.
    code.replace(/_/g, " ");

  return { ...query, byCode, labelFor };
}
