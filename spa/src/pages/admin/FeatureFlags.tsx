import { Box, Stack, Switch, Typography } from "@mui/material";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { api } from "../../api/client";
import { useSnackbar } from "../../components/Snackbar";
import { DataTableContainer } from "../../components/DataTableContainer";
import { useFeatureFlags, type FeatureFlag } from "../../featureFlags";

export function AdminFeatureFlags() {
  const qc = useQueryClient();
  const snackbar = useSnackbar();
  const flags = useFeatureFlags();

  const toggle = useMutation({
    mutationFn: async ({ key, enabled }: { key: string; enabled: boolean }) => {
      const { error } = await api.PATCH("/api/feature-flags/{key}", {
        params: { path: { key } },
        body: { enabled },
      });
      if (error) throw new Error("Update failed.");
    },
    // Optimistic: flip the switch immediately, roll back on error.
    onMutate: async ({ key, enabled }) => {
      await qc.cancelQueries({ queryKey: ["feature-flags"] });
      const prev = qc.getQueryData<FeatureFlag[]>(["feature-flags"]);
      qc.setQueryData<FeatureFlag[]>(["feature-flags"], (old) =>
        (old ?? []).map((f) => (f.key === key ? { ...f, enabled } : f)),
      );
      return { prev };
    },
    onError: (_e, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(["feature-flags"], ctx.prev);
      snackbar.show("Could not update the flag.", "error");
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["feature-flags"] }),
  });

  const rows = flags.data ?? [];

  return (
    <Box>
      <Typography variant="h6" sx={{ mb: 0.5 }}>
        Feature flags
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Show or hide optional parts of the portal. Changes apply to everyone and
        take effect immediately.
      </Typography>

      <DataTableContainer
        loading={flags.isPending}
        loadingColumns={2}
        empty={rows.length === 0}
        emptyTitle="No feature flags"
        emptyDescription="Toggleable features will appear here."
      >
        <Stack divider={<Box sx={{ borderTop: 1, borderColor: "divider" }} />}>
          {rows.map((f) => (
            <Stack
              key={f.key}
              direction="row"
              alignItems="center"
              spacing={2}
              sx={{ p: 2 }}
            >
              <Box sx={{ flex: 1 }}>
                <Typography sx={{ fontWeight: 600 }}>{f.label}</Typography>
                <Typography variant="body2" color="text.secondary">
                  {f.description}
                </Typography>
              </Box>
              <Switch
                checked={f.enabled}
                onChange={(e) =>
                  toggle.mutate({ key: f.key, enabled: e.target.checked })
                }
                inputProps={{ "aria-label": `Toggle ${f.label}` }}
              />
            </Stack>
          ))}
        </Stack>
      </DataTableContainer>
    </Box>
  );
}
