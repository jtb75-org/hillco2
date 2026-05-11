import {
  Alert,
  Box,
  Grid,
  Skeleton,
  Stack,
  Typography,
} from "@mui/material";
import { useQuery } from "@tanstack/react-query";

import { api } from "../../api/client";
import type { components } from "../../api/schema";
import { MetricCard } from "../../components/MetricCard";
import { SectionPanel } from "../../components/SectionPanel";
import { StatusChip } from "../../components/StatusChip";

type AboutInfo = components["schemas"]["AboutInfo"];

const COUNT_LABELS: Record<string, string> = {
  users: "Users",
  families: "Families",
  students: "Students",
  engagements: "Engagements",
  schools: "Schools",
  service_items: "Catalog items",
  audit_log_entries: "Audit log entries",
};

export function AdminAbout() {
  const { data, isPending, error } = useQuery<AboutInfo, Error>({
    queryKey: ["admin", "about"],
    queryFn: async () => {
      const { data, error: respError } = await api.GET("/api/admin/about");
      if (respError || !data) throw new Error("about fetch failed");
      return data;
    },
  });

  if (error) {
    return <Alert severity="error">Failed to load info: {error.message}</Alert>;
  }

  return (
    <Stack spacing={3}>
      <SectionPanel title="Build">
        <Box sx={{ p: 2 }}>
          {isPending || !data ? (
            <Skeleton width={140} height={32} />
          ) : (
            <Typography
              variant="h6"
              sx={{ fontFamily: "monospace", fontWeight: 500 }}
            >
              {data.build_commit}
            </Typography>
          )}
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            {isPending ? <Skeleton width={200} /> : data?.api_title}
          </Typography>
        </Box>
      </SectionPanel>

      <SectionPanel
        title="Schema migration"
        actions={
          !isPending && data ? (
            <StatusChip
              size="small"
              label={data.migration_in_sync ? "in sync" : "drift"}
              tone={data.migration_in_sync ? "success" : "warning"}
              variant={data.migration_in_sync ? "outlined" : "filled"}
            />
          ) : undefined
        }
      >
        <Box sx={{ p: 2 }}>
          {isPending || !data ? (
            <Skeleton width={240} height={48} />
          ) : (
            <Box sx={{ display: "grid", gridTemplateColumns: "auto 1fr", columnGap: 2, rowGap: 0.5 }}>
              <Typography variant="body2" color="text.secondary">DB revision</Typography>
              <Typography variant="body2" sx={{ fontFamily: "monospace" }}>
                {data.db_revision ?? <Box component="span" sx={{ color: "text.disabled" }}>unknown</Box>}
              </Typography>
              <Typography variant="body2" color="text.secondary">Image head</Typography>
              <Typography variant="body2" sx={{ fontFamily: "monospace" }}>
                {data.image_head_revision ?? <Box component="span" sx={{ color: "text.disabled" }}>unknown</Box>}
              </Typography>
            </Box>
          )}
          {!isPending && data && !data.migration_in_sync && (
            <Alert severity="warning" sx={{ mt: 2 }}>
              The image bundles a different alembic head than the DB is stamped
              at. New code may be running against an unmigrated schema —
              check the schema-bootstrap Job logs.
            </Alert>
          )}
        </Box>
      </SectionPanel>

      <Stack spacing={1}>
        <Typography variant="overline" color="text.secondary">
          Database snapshot
        </Typography>
        <Grid container spacing={2}>
          {(isPending || !data
            ? Object.keys(COUNT_LABELS)
            : Object.keys(data.counts)
          ).map((key) => (
            <Grid key={key} item xs={6} sm={4} md={3}>
              <MetricCard
                label={COUNT_LABELS[key] ?? key}
                value={
                  isPending || !data ? (
                    <Skeleton width={80} />
                  ) : (
                    data.counts[key].toLocaleString()
                  )
                }
              />
            </Grid>
          ))}
        </Grid>
      </Stack>
    </Stack>
  );
}
