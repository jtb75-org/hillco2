import { DrawerSection } from "../../components/DrawerSection";
import {
  Alert,
  Box,
  Chip,
  CircularProgress,
  Drawer,
  IconButton,
  Stack,
  Toolbar,
  Tooltip,
  Typography,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import dayjs from "dayjs";
import { useQuery } from "@tanstack/react-query";

import { api } from "../../api/client";
import type { components } from "../../api/schema";

type AuditLogDetail = components["schemas"]["AuditLogDetail"];

const ACTION_COLORS: Record<string, "default" | "primary" | "warning" | "error"> = {
  INSERT: "primary",
  UPDATE: "default",
  DELETE: "error",
};

interface FieldChange {
  key: string;
  before: unknown;
  after: unknown;
  // INSERT → only "after"; DELETE → only "before"; UPDATE → both.
  kind: "added" | "removed" | "changed" | "unchanged";
}

/**
 * Side drawer for a single audit_log row. The body normalizes
 * before/after JSON into one diff view so every action type lays out
 * the same:
 *   INSERT → every column shown as added
 *   DELETE → every column shown as removed
 *   UPDATE → only columns where the value changed; unchanged keys are
 *            collapsed under a counter
 */
export function AuditLogDrawer({
  auditId,
  onClose,
}: {
  auditId: number | null;
  onClose: () => void;
}) {
  const { data, isPending, error } = useQuery<AuditLogDetail, Error>({
    queryKey: ["admin", "audit-log", "detail", auditId],
    enabled: auditId != null,
    queryFn: async () => {
      const { data, error: respError } = await api.GET(
        "/api/admin/audit-log/{audit_id}",
        { params: { path: { audit_id: auditId! } } },
      );
      if (respError || !data) throw new Error("Failed to load audit entry.");
      return data;
    },
  });

  return (
    <Drawer
      anchor="right"
      open={auditId != null}
      onClose={onClose}
      PaperProps={{ sx: { width: { xs: "100%", sm: 520 } } }}
    >
      <Toolbar />
      <Box sx={{ p: 3, flex: 1, display: "flex", flexDirection: "column", overflow: "auto" }}>
        <Stack direction="row" alignItems="center" sx={{ mb: 2 }}>
          <Typography variant="overline" color="text.secondary" sx={{ flex: 1 }}>
            Audit entry {data?.id ? `#${data.id}` : ""}
          </Typography>
          <IconButton onClick={onClose} size="small" aria-label="Close">
            <CloseIcon />
          </IconButton>
        </Stack>

        {error && <Alert severity="error">{error.message}</Alert>}
        {isPending ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
            <CircularProgress size={28} />
          </Box>
        ) : data ? (
          <>
            <HeaderBlock entry={data} />
            <DiffBlock entry={data} />
          </>
        ) : null}
      </Box>
    </Drawer>
  );
}

function HeaderBlock({ entry }: { entry: AuditLogDetail }) {
  return (
    <Box sx={{ mb: 3 }}>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
        <Chip
          size="small"
          label={entry.action}
          color={ACTION_COLORS[entry.action] ?? "default"}
          variant="outlined"
          sx={{ fontFamily: "monospace" }}
        />
        <Typography variant="body1" sx={{ fontFamily: "monospace" }}>
          {entry.table_name}
        </Typography>
      </Stack>
      <DefinitionList
        rows={[
          {
            label: "When",
            value: (
              <Tooltip title={dayjs(entry.ts).format("YYYY-MM-DD HH:mm:ss")}>
                <span>
                  {dayjs(entry.ts).fromNow()} ·{" "}
                  <Box component="span" sx={{ color: "text.secondary" }}>
                    {dayjs(entry.ts).format("MMM D, YYYY h:mm A")}
                  </Box>
                </span>
              </Tooltip>
            ),
          },
          {
            label: "By",
            value: entry.user_name ? (
              <>
                {entry.user_name}{" "}
                {entry.user_email && (
                  <Box component="span" sx={{ color: "text.secondary", fontSize: 12 }}>
                    · {entry.user_email}
                  </Box>
                )}
              </>
            ) : (
              <Box component="span" sx={{ color: "text.disabled" }}>system</Box>
            ),
          },
          {
            label: "Row",
            value: entry.row_id ? (
              <Box component="span" sx={{ fontFamily: "monospace", fontSize: 12 }}>
                {entry.row_id}
              </Box>
            ) : (
              <Box component="span" sx={{ color: "text.disabled" }}>—</Box>
            ),
          },
        ]}
      />
    </Box>
  );
}

function DiffBlock({ entry }: { entry: AuditLogDetail }) {
  const changes = computeChanges(entry);
  if (changes.length === 0) {
    return (
      <Typography variant="body2" color="text.disabled">
        No payload captured.
      </Typography>
    );
  }
  const visible = changes.filter((c) => c.kind !== "unchanged");
  const unchangedCount = changes.length - visible.length;
  return (
    <DrawerSection title={entry.action === "UPDATE" ? "Changes" : "Fields"}>
      <Stack spacing={1.25}>
        {visible.map((c) => (
          <ChangeRow key={c.key} change={c} action={entry.action} />
        ))}
      </Stack>
      {unchangedCount > 0 && (
        <Typography variant="caption" color="text.disabled" sx={{ display: "block", mt: 2 }}>
          {unchangedCount} unchanged field{unchangedCount === 1 ? "" : "s"} hidden.
        </Typography>
      )}
    </DrawerSection>
  );
}

function ChangeRow({ change, action }: { change: FieldChange; action: string }) {
  return (
    <Box>
      <Typography
        variant="caption"
        sx={{ fontFamily: "monospace", color: "text.secondary", display: "block" }}
      >
        {change.key}
      </Typography>
      {action === "INSERT" || change.kind === "added" ? (
        <Value v={change.after} tone="added" />
      ) : action === "DELETE" || change.kind === "removed" ? (
        <Value v={change.before} tone="removed" />
      ) : (
        <Stack direction="row" alignItems="center" spacing={1} sx={{ flexWrap: "wrap" }}>
          <Value v={change.before} tone="removed" />
          <Box component="span" sx={{ color: "text.disabled" }}>→</Box>
          <Value v={change.after} tone="added" />
        </Stack>
      )}
    </Box>
  );
}

function Value({ v, tone }: { v: unknown; tone: "added" | "removed" | "neutral" }) {
  const text = formatValue(v);
  const bg =
    tone === "added"
      ? "success.50"
      : tone === "removed"
      ? "error.50"
      : "transparent";
  const color =
    tone === "added"
      ? "success.dark"
      : tone === "removed"
      ? "error.dark"
      : "text.primary";
  return (
    <Box
      component="code"
      sx={{
        display: "inline-block",
        bgcolor: bg,
        color,
        px: 0.75,
        py: 0.25,
        borderRadius: 0.5,
        fontFamily: "monospace",
        fontSize: 12,
        wordBreak: "break-word",
        whiteSpace: "pre-wrap",
        maxWidth: "100%",
      }}
    >
      {text}
    </Box>
  );
}

function formatValue(v: unknown): string {
  if (v === null || v === undefined) return "null";
  if (typeof v === "string") {
    return v.length === 0 ? '""' : v;
  }
  if (typeof v === "object") {
    return JSON.stringify(v, null, 2);
  }
  return String(v);
}

function DefinitionList({
  rows,
}: {
  rows: Array<{ label: string; value: React.ReactNode }>;
}) {
  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: "auto 1fr",
        columnGap: 2,
        rowGap: 0.75,
      }}
    >
      {rows.map((r) => (
        <Box key={r.label} sx={{ display: "contents" }}>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ textTransform: "uppercase", letterSpacing: 0.5 }}
          >
            {r.label}
          </Typography>
          <Box component="div">
            <Typography variant="body2" component="span">
              {r.value}
            </Typography>
          </Box>
        </Box>
      ))}
    </Box>
  );
}

function computeChanges(entry: AuditLogDetail): FieldChange[] {
  const before = entry.before_json ?? {};
  const after = entry.after_json ?? {};
  const keys = Array.from(
    new Set([...Object.keys(before), ...Object.keys(after)]),
  ).sort();
  return keys.map<FieldChange>((key) => {
    const b = (before as Record<string, unknown>)[key];
    const a = (after as Record<string, unknown>)[key];
    const inBefore = key in before;
    const inAfter = key in after;
    if (!inBefore) return { key, before: undefined, after: a, kind: "added" };
    if (!inAfter) return { key, before: b, after: undefined, kind: "removed" };
    if (JSON.stringify(b) === JSON.stringify(a)) {
      return { key, before: b, after: a, kind: "unchanged" };
    }
    return { key, before: b, after: a, kind: "changed" };
  });
}
