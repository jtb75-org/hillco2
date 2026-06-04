import { useState } from "react";
import {
  Alert,
  Box,
  Button,
  Divider,
  Grid,
  IconButton,
  List,
  ListItem,
  ListItemText,
  Skeleton,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import AssignmentOutlinedIcon from "@mui/icons-material/AssignmentOutlined";
import AutoStoriesOutlinedIcon from "@mui/icons-material/AutoStoriesOutlined";
import CheckIcon from "@mui/icons-material/Check";
import ContentCopyOutlinedIcon from "@mui/icons-material/ContentCopyOutlined";
import GroupsIcon from "@mui/icons-material/Groups";
import HistoryOutlinedIcon from "@mui/icons-material/HistoryOutlined";
import PeopleAltOutlinedIcon from "@mui/icons-material/PeopleAltOutlined";
import SchoolIcon from "@mui/icons-material/School";
import VerifiedUserOutlinedIcon from "@mui/icons-material/VerifiedUserOutlined";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { Link as RouterLink } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import { api } from "../../api/client";
import type { components } from "../../api/schema";
import { SectionPanel } from "../../components/SectionPanel";
import { StatCard } from "../../components/StatCard";
import { StatusChip } from "../../components/StatusChip";

dayjs.extend(relativeTime);

type AboutInfo = components["schemas"]["AboutInfo"];
type AuditLogPage = components["schemas"]["AuditLogPage"];
type AuditLogEntry = components["schemas"]["AuditLogEntry"];

const COUNT_CARDS: Array<{
  key: string;
  label: string;
  subtitle: string;
  icon: JSX.Element;
}> = [
  {
    key: "users",
    label: "Users",
    subtitle: "Portal accounts",
    icon: <VerifiedUserOutlinedIcon />,
  },
  {
    key: "families",
    label: "Families",
    subtitle: "Active households",
    icon: <GroupsIcon />,
  },
  {
    key: "students",
    label: "Students",
    subtitle: "Student records",
    icon: <PeopleAltOutlinedIcon />,
  },
  {
    key: "engagements",
    label: "Engagements",
    subtitle: "Open client work",
    icon: <AssignmentOutlinedIcon />,
  },
  {
    key: "schools",
    label: "Schools",
    subtitle: "Reference catalog",
    icon: <SchoolIcon />,
  },
  {
    key: "service_items",
    label: "Catalog items",
    subtitle: "Billable services",
    icon: <AutoStoriesOutlinedIcon />,
  },
  {
    key: "audit_log_entries",
    label: "Audit entries",
    subtitle: "Recorded changes",
    icon: <HistoryOutlinedIcon />,
  },
];

function formatCount(value: number | undefined) {
  return value === undefined ? "0" : value.toLocaleString();
}

function actionTone(action: string): "neutral" | "info" | "success" | "warning" | "danger" {
  if (action === "DELETE") return "danger";
  if (action === "INSERT") return "info";
  return "neutral";
}

export function AdminAbout() {
  const {
    data,
    isPending,
    error,
    refetch: refetchAbout,
  } = useQuery<AboutInfo, Error>({
    queryKey: ["admin", "about"],
    queryFn: async () => {
      const { data, error: respError } = await api.GET("/api/admin/about");
      if (respError || !data) throw new Error("about fetch failed");
      return data;
    },
  });

  const {
    data: auditData,
    isPending: auditPending,
    error: auditError,
    refetch: refetchAudit,
  } = useQuery<AuditLogPage, Error>({
    queryKey: ["admin", "audit-log", "recent"],
    queryFn: async () => {
      const { data, error: respError } = await api.GET("/api/admin/audit-log", {
        params: { query: { limit: 5, offset: 0 } },
      });
      if (respError || !data) throw new Error("audit-log fetch failed");
      return data;
    },
  });

  if (error) {
    return (
      <Alert
        severity="error"
        action={
          <Button color="inherit" size="small" onClick={() => refetchAbout()}>
            Retry
          </Button>
        }
      >
        Failed to load info: {error.message}
      </Alert>
    );
  }

  const counts = data?.counts ?? {};
  const auditItems = auditData?.items ?? [];

  return (
    <Stack spacing={3}>
      <Box
        sx={{
          display: "grid",
          gap: 2,
          gridTemplateColumns: {
            xs: "1fr",
            sm: "repeat(2, minmax(0, 1fr))",
            lg: "repeat(4, minmax(0, 1fr))",
          },
        }}
      >
        {COUNT_CARDS.map((card, index) => (
          <StatCard
            key={card.key}
            label={card.label}
            value={
              isPending ? (
                <Skeleton width={72} />
              ) : (
                formatCount(counts[card.key])
              )
            }
            subtitle={isPending ? <Skeleton width={120} /> : card.subtitle}
            icon={card.icon}
            sx={{
              minHeight: 142,
              // Seven cards in a four-column grid: the trailing wide card
              // fills the second row. Revisit if this grows beyond 4n+3.
              gridColumn: {
                lg: index === COUNT_CARDS.length - 1 ? "span 2" : "span 1",
              },
            }}
          />
        ))}
      </Box>

      <Grid container spacing={2}>
        <Grid item xs={12} lg={7}>
          <RecentAuditStrip
            items={auditItems}
            loading={auditPending}
            error={auditError}
            onRetry={() => refetchAudit()}
          />
        </Grid>
        <Grid item xs={12} lg={5}>
          <Stack spacing={2} sx={{ height: "100%" }}>
            <BuildPanel data={data} loading={isPending} />
            <MigrationPanel data={data} loading={isPending} />
          </Stack>
        </Grid>
      </Grid>
    </Stack>
  );
}

function RecentAuditStrip({
  items,
  loading,
  error,
  onRetry,
}: {
  items: AuditLogEntry[];
  loading: boolean;
  error: Error | null;
  onRetry: () => void;
}) {
  return (
    <SectionPanel
      title="Recent audit log"
      subtitle="Latest recorded data changes"
      actions={
        <Button component={RouterLink} to="/admin/audit-log" size="small">
          View all
        </Button>
      }
      empty={!loading && !error && items.length === 0}
      emptyTitle="No audit entries"
    >
      {error ? (
        <Box sx={{ p: 2 }}>
          <Alert
            severity="error"
            action={
              <Button color="inherit" size="small" onClick={onRetry}>
                Retry
              </Button>
            }
          >
            Failed to load recent audit entries.
          </Alert>
        </Box>
      ) : loading ? (
        <List dense disablePadding>
          {Array.from({ length: 5 }).map((_, index) => (
            <ListItem key={index} divider>
              <ListItemText
                primary={<Skeleton width="50%" />}
                secondary={<Skeleton width="35%" />}
              />
              <Skeleton variant="rounded" width={72} height={24} />
            </ListItem>
          ))}
        </List>
      ) : (
        <List dense disablePadding>
          {items.map((row) => (
            <ListItem
              key={row.id}
              divider
              secondaryAction={
                <StatusChip
                  size="small"
                  label={row.action}
                  tone={actionTone(row.action)}
                  variant="soft"
                  sx={{ fontFamily: "monospace", fontSize: 11 }}
                />
              }
            >
              <ListItemText
                primary={
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Typography variant="body2" sx={{ fontWeight: 650 }}>
                      {row.table_name}
                    </Typography>
                    <Typography
                      variant="caption"
                      color="text.disabled"
                      sx={{ fontFamily: "monospace" }}
                    >
                      {row.row_id ? row.row_id.slice(0, 8) : "system"}
                    </Typography>
                  </Stack>
                }
                secondary={
                  <>
                    {dayjs(row.ts).fromNow()}
                    {" · "}
                    {row.user_name ?? row.user_email ?? "system"}
                  </>
                }
              />
            </ListItem>
          ))}
        </List>
      )}
    </SectionPanel>
  );
}

function BuildPanel({
  data,
  loading,
}: {
  data: AboutInfo | undefined;
  loading: boolean;
}) {
  return (
    <SectionPanel title="Build">
      <Stack spacing={1.5} sx={{ p: 2 }}>
        <Box>
          <Typography variant="overline" color="text.secondary">
            Commit
          </Typography>
          {loading || !data ? (
            <Skeleton width={140} sx={{ mt: 0.25 }} />
          ) : (
            <Stack
              direction="row"
              spacing={0.5}
              alignItems="center"
              sx={{ mt: 0.25, "&:hover .copy-btn": { opacity: 1 } }}
            >
              <Typography
                variant="h5"
                sx={{
                  fontFamily: "monospace",
                  fontWeight: 650,
                  wordBreak: "break-all",
                }}
              >
                {data.build_commit}
              </Typography>
              <CopyButton value={data.build_commit} />
            </Stack>
          )}
        </Box>
        <Divider />
        <Box>
          <Typography variant="overline" color="text.secondary">
            API title
          </Typography>
          <Typography variant="body2">
            {loading || !data ? <Skeleton width={180} /> : data.api_title}
          </Typography>
        </Box>
      </Stack>
    </SectionPanel>
  );
}

function MigrationPanel({
  data,
  loading,
}: {
  data: AboutInfo | undefined;
  loading: boolean;
}) {
  const inSync = Boolean(data?.migration_in_sync);
  return (
    <SectionPanel
      title="Schema migration"
      actions={
        !loading && data ? (
          <StatusChip
            size="small"
            label={inSync ? "in sync" : "drift"}
            tone={inSync ? "success" : "warning"}
            variant="soft"
          />
        ) : undefined
      }
    >
      <Stack spacing={1.5} sx={{ p: 2 }}>
        {loading || !data ? (
          <>
            <Skeleton width="80%" />
            <Skeleton width="72%" />
          </>
        ) : (
          <>
            <RevisionRow label="DB revision" value={data.db_revision} />
            <RevisionRow label="Image head" value={data.image_head_revision} />
            {!inSync && (
              <Alert severity="warning" variant="outlined">
                The deployed image and database revision differ.
              </Alert>
            )}
          </>
        )}
      </Stack>
    </SectionPanel>
  );
}

function RevisionRow({ label, value }: { label: string; value: string | null }) {
  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: { xs: "1fr", sm: "112px minmax(0, 1fr)" },
        columnGap: 1.5,
        rowGap: 0.25,
        alignItems: "baseline",
      }}
    >
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
      <Typography
        variant="body2"
        sx={{ fontFamily: "monospace", wordBreak: "break-all" }}
      >
        {value ?? (
          <Box component="span" sx={{ color: "text.disabled" }}>
            unknown
          </Box>
        )}
      </Typography>
    </Box>
  );
}

// Tiny clipboard-copy affordance — fades in on parent hover, flips to
// a checkmark for ~1.2s after a successful copy.
function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      // Clipboard write can be blocked (e.g. http context); fail silently
      // — the value is still on screen for a manual copy.
    }
  };
  return (
    <Tooltip title={copied ? "Copied!" : "Copy"} placement="top">
      <IconButton
        size="small"
        onClick={onCopy}
        className="copy-btn"
        sx={{
          opacity: copied ? 1 : 0,
          transition: "opacity 0.15s",
          "&:focus-visible": { opacity: 1 },
        }}
      >
        {copied ? (
          <CheckIcon fontSize="inherit" sx={{ fontSize: 16, color: "success.main" }} />
        ) : (
          <ContentCopyOutlinedIcon fontSize="inherit" sx={{ fontSize: 16 }} />
        )}
      </IconButton>
    </Tooltip>
  );
}
