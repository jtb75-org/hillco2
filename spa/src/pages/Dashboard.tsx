import {
  Alert,
  Box,
  Button,
  Grid,
  List,
  ListItem,
  ListItemText,
  Skeleton,
  Stack,
} from "@mui/material";
import AddCircleOutlineIcon from "@mui/icons-material/AddCircleOutline";
import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { useQuery } from "@tanstack/react-query";
import { Link as RouterLink } from "react-router-dom";

import { api } from "../api/client";
import type { components } from "../api/schema";
import { useAuth } from "../auth";
import { MetricCard } from "../components/MetricCard";
import { PageHeader } from "../components/PageHeader";
import { SectionPanel } from "../components/SectionPanel";
import { StatusChip } from "../components/StatusChip";

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
      <PageHeader
        title={`Welcome${user ? `, ${user.name.split(" ")[0]}` : ""}.`}
        subtitle={dayjs().format("dddd, MMMM D, YYYY")}
        actions={
          <Stack direction="row" spacing={1} sx={{ flexShrink: 0 }}>
            <Button
              component={RouterLink}
              to="/intake"
              variant="contained"
              startIcon={<AddCircleOutlineIcon />}
            >
              Start an intake
            </Button>
            <Button
              component={RouterLink}
              to="/intake-form"
              variant="outlined"
              startIcon={<DescriptionOutlinedIcon />}
            >
              Intake form
            </Button>
          </Stack>
        }
      />

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
              <MetricCard
                label="My Followups"
                value={String(stats.my_open_followups)}
              />
            </Grid>
            <Grid item xs={12} sm={6} md={4} lg={2}>
              <MetricCard
                label="Overdue Followups"
                value={String(stats.my_overdue_followups)}
                emphasis={stats.my_overdue_followups > 0 ? "alert" : "muted"}
              />
            </Grid>
            <Grid item xs={12} sm={6} md={4} lg={2}>
              <MetricCard
                label="Active Engagements"
                value={String(stats.active_engagements)}
              />
            </Grid>
            <Grid item xs={12} sm={6} md={4} lg={2}>
              <MetricCard
                label="Outstanding"
                value={usd.format(Number(stats.outstanding_total))}
              />
            </Grid>
            <Grid item xs={12} sm={6} md={4} lg={2}>
              <MetricCard
                label="Overdue Invoices"
                value={String(stats.overdue_invoice_count)}
                emphasis={stats.overdue_invoice_count > 0 ? "alert" : "muted"}
              />
            </Grid>
            <Grid item xs={12} sm={6} md={4} lg={2}>
              <MetricCard
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
            <SectionPanel
              title="My open followups"
              count={data?.my_followups.length}
              empty={data?.my_followups.length === 0}
              emptyTitle="No open followups"
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
                      <StatusChip
                        size="small"
                        label={due.label}
                        tone={due.overdue ? "danger" : "neutral"}
                        variant={due.overdue ? "filled" : "outlined"}
                      />
                    </ListItem>
                  );
                })}
              </List>
            </SectionPanel>

            <SectionPanel
              title="Recent notes"
              count={data?.recent_notes.length}
              empty={data?.recent_notes.length === 0}
              emptyTitle="No recent notes"
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
            </SectionPanel>
          </Stack>
        </Grid>

        <Grid item xs={12} md={6}>
          <Stack spacing={2}>
            <SectionPanel
              title="Outstanding invoices"
              count={data?.outstanding_invoices.length}
              empty={data?.outstanding_invoices.length === 0}
              emptyTitle="No outstanding invoices"
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
                        <StatusChip
                          size="small"
                          label={due.label}
                          tone={
                            inv.status === "overdue" || due.overdue
                              ? "danger"
                              : "neutral"
                          }
                          variant={inv.status === "overdue" ? "filled" : "outlined"}
                        />
                      )}
                    </ListItem>
                  );
                })}
              </List>
            </SectionPanel>

            <SectionPanel
              title="Recent activity"
              empty={data?.audit.length === 0}
              emptyTitle="No recent activity"
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
            </SectionPanel>
          </Stack>
        </Grid>
      </Grid>
    </Stack>
  );
}
