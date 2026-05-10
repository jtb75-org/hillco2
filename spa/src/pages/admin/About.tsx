import {
  Alert,
  Card,
  CardContent,
  Grid,
  Skeleton,
  Stack,
  Typography,
} from "@mui/material";
import { useQuery } from "@tanstack/react-query";

import { api } from "../../api/client";
import type { components } from "../../api/schema";

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
      <Card variant="outlined">
        <CardContent>
          <Typography variant="overline" color="text.secondary">
            Build
          </Typography>
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
        </CardContent>
      </Card>

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
              <Card variant="outlined">
                <CardContent>
                  <Typography variant="body2" color="text.secondary">
                    {COUNT_LABELS[key] ?? key}
                  </Typography>
                  {isPending || !data ? (
                    <Skeleton width={80} />
                  ) : (
                    <Typography variant="h5" sx={{ fontWeight: 600 }}>
                      {data.counts[key].toLocaleString()}
                    </Typography>
                  )}
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      </Stack>
    </Stack>
  );
}
