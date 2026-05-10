import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
  Grid,
  List,
  ListItem,
  ListItemText,
  Paper,
  Skeleton,
  Stack,
  Typography,
} from "@mui/material";
import AddCircleOutlineIcon from "@mui/icons-material/AddCircleOutline";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { useQuery } from "@tanstack/react-query";
import { Link as RouterLink } from "react-router-dom";

import { api } from "../api/client";
import type { components } from "../api/schema";
import { useAuth } from "../auth";

dayjs.extend(relativeTime);

type DashboardData = components["schemas"]["DashboardResponse"];

// ---- Formatters ------------------------------------------------------------

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

function formatDueDate(d: string, today: string): { label: string; overdue: boolean } {
  const due = dayjs(d);
  const todayD = dayjs(today);
  const overdue = due.isBefore(todayD, "day");
  if (due.isSame(todayD, "day")) return { label: "today", overdue: false };
  if (due.diff(todayD, "day") < 7) return { label: due.format("ddd"), overdue };
  return { label: due.format("MMM D"), overdue };
}

// ---- Stat card -------------------------------------------------------------

function StatCard({
  label,
  value,
  emphasis,
}: {
  label: string;
  value: string;
  emphasis?: "alert" | "muted" | "default";
}) {
  return (
    <Card variant="outlined">
      <CardContent>
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{ textTransform: "uppercase", letterSpacing: 0.5, fontSize: 11, mb: 0.5 }}
        >
          {label}
        </Typography>
        <Typography
          variant="h4"
          sx={{
            fontWeight: 600,
            color:
              emphasis === "alert"
                ? "error.main"
                : emphasis === "muted"
                ? "text.disabled"
                : "text.primary",
          }}
        >
          {value}
        </Typography>
      </CardContent>
    </Card>
  );
}

// ---- Section card ----------------------------------------------------------

function SectionCard({
  title,
  count,
  empty,
  children,
}: {
  title: string;
  count?: number;
  empty?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Paper variant="outlined">
      <Box sx={{ px: 2, pt: 1.5, pb: 1, display: "flex", alignItems: "center", gap: 1 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 600, flexGrow: 1 }}>
          {title}
        </Typography>
        {count !== undefined && (
          <Chip size="small" label={count} variant="outlined" />
        )}
      </Box>
      <Divider />
      {empty ? (
        <Box sx={{ p: 3, color: "text.disabled", fontSize: 13 }}>Nothing here.</Box>
      ) : (
        children
      )}
    </Paper>
  );
}

// ---- Page ------------------------------------------------------------------

export function Dashboard() {
  const { user } = useAuth();
  const { data, isPending, error } = useQuery<DashboardData, Error>({
    queryKey: ["dashboard"],
    queryFn: async () => {
      const { data, error: respError } = await api.GET("/api/dashboard");
      if (respError || !data) throw new Error("dashboard fetch failed");
      return data;
    },
  });

  if (error) {
    return <Alert severity="error">Failed to load dashboard: {error.message}</Alert>;
  }

  const stats = data?.stats;
  const today = data?.today ?? dayjs().format("YYYY-MM-DD");

  return (
    <Stack spacing={3}>
      <Stack direction="row" alignItems="flex-start" sx={{ gap: 2 }}>
        <Box sx={{ flex: 1 }}>
          <Typography variant="h4" gutterBottom>
            Welcome{user ? `, ${user.name.split(" ")[0]}` : ""}.
          </Typography>
          <Typography color="text.secondary" variant="body2">
            {dayjs().format("dddd, MMMM D, YYYY")}
          </Typography>
        </Box>
        <Button
          component={RouterLink}
          to="/intake"
          variant="contained"
          startIcon={<AddCircleOutlineIcon />}
          sx={{ flexShrink: 0 }}
        >
          Start an intake
        </Button>
      </Stack>

      {/* Stats row */}
      <Grid container spacing={2}>
        {isPending || !stats ? (
          Array.from({ length: 6 }).map((_, i) => (
            <Grid key={i} item xs={12} sm={6} md={4} lg={2}>
              <Skeleton variant="rounded" height={88} />
            </Grid>
          ))
        ) : (
          <>
            <Grid item xs={12} sm={6} md={4} lg={2}>
              <StatCard
                label="My Followups"
                value={String(stats.my_open_followups)}
              />
            </Grid>
            <Grid item xs={12} sm={6} md={4} lg={2}>
              <StatCard
                label="Overdue Followups"
                value={String(stats.my_overdue_followups)}
                emphasis={stats.my_overdue_followups > 0 ? "alert" : "muted"}
              />
            </Grid>
            <Grid item xs={12} sm={6} md={4} lg={2}>
              <StatCard
                label="Active Engagements"
                value={String(stats.active_engagements)}
              />
            </Grid>
            <Grid item xs={12} sm={6} md={4} lg={2}>
              <StatCard
                label="Outstanding"
                value={usd.format(Number(stats.outstanding_total))}
              />
            </Grid>
            <Grid item xs={12} sm={6} md={4} lg={2}>
              <StatCard
                label="Overdue Invoices"
                value={String(stats.overdue_invoice_count)}
                emphasis={stats.overdue_invoice_count > 0 ? "alert" : "muted"}
              />
            </Grid>
            <Grid item xs={12} sm={6} md={4} lg={2}>
              <StatCard
                label="Uninvoiced"
                value={usd.format(Number(stats.uninvoiced_total))}
              />
            </Grid>
          </>
        )}
      </Grid>

      {/* Two-column lists */}
      <Grid container spacing={2}>
        <Grid item xs={12} md={6}>
          <Stack spacing={2}>
            <SectionCard
              title="My open followups"
              count={data?.my_followups.length}
              empty={data?.my_followups.length === 0}
            >
              <List dense disablePadding>
                {data?.my_followups.map((f) => {
                  const due = formatDueDate(f.due_date, today);
                  return (
                    <ListItem key={f.id} divider>
                      <ListItemText
                        primary={f.title}
                        secondary={f.household_name}
                      />
                      <Chip
                        size="small"
                        label={due.label}
                        color={due.overdue ? "error" : "default"}
                        variant={due.overdue ? "filled" : "outlined"}
                      />
                    </ListItem>
                  );
                })}
              </List>
            </SectionCard>

            <SectionCard
              title="Recent notes"
              count={data?.recent_notes.length}
              empty={data?.recent_notes.length === 0}
            >
              <List dense disablePadding>
                {data?.recent_notes.map((n) => (
                  <ListItem key={n.id} divider>
                    <ListItemText
                      primary={n.title || `(${n.kind.replace(/_/g, " ")})`}
                      secondary={
                        <>
                          {n.household_name}
                          {n.created_by_name ? ` · ${n.created_by_name}` : ""}
                          {" · "}
                          {dayjs(n.created_at).fromNow()}
                        </>
                      }
                    />
                  </ListItem>
                ))}
              </List>
            </SectionCard>
          </Stack>
        </Grid>

        <Grid item xs={12} md={6}>
          <Stack spacing={2}>
            <SectionCard
              title="Outstanding invoices"
              count={data?.outstanding_invoices.length}
              empty={data?.outstanding_invoices.length === 0}
            >
              <List dense disablePadding>
                {data?.outstanding_invoices.map((inv) => {
                  const due = inv.due_date
                    ? formatDueDate(inv.due_date, today)
                    : null;
                  return (
                    <ListItem key={inv.id} divider>
                      <ListItemText
                        primary={
                          <>
                            {inv.invoice_number}
                            {" · "}
                            <Box component="span" sx={{ fontWeight: 600 }}>
                              {usd.format(Number(inv.total))}
                            </Box>
                          </>
                        }
                        secondary={inv.household_name}
                      />
                      {due && (
                        <Chip
                          size="small"
                          label={due.label}
                          color={
                            inv.status === "overdue" || due.overdue
                              ? "error"
                              : "default"
                          }
                          variant={inv.status === "overdue" ? "filled" : "outlined"}
                        />
                      )}
                    </ListItem>
                  );
                })}
              </List>
            </SectionCard>

            <SectionCard
              title="Recent activity"
              empty={data?.audit.length === 0}
            >
              <List dense disablePadding>
                {data?.audit.map((a, i) => (
                  <ListItem key={i} divider>
                    <ListItemText
                      primary={
                        <>
                          <Box
                            component="span"
                            sx={{
                              fontFamily: "monospace",
                              fontSize: 12,
                              mr: 1,
                              color: "text.secondary",
                            }}
                          >
                            {a.action}
                          </Box>
                          {a.table_name}
                        </>
                      }
                      secondary={
                        <>
                          {a.user_email ?? "system"}
                          {" · "}
                          {dayjs(a.ts).fromNow()}
                        </>
                      }
                    />
                  </ListItem>
                ))}
              </List>
            </SectionCard>
          </Stack>
        </Grid>
      </Grid>
    </Stack>
  );
}
