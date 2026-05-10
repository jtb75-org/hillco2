import { useState } from "react";
import {
  Alert,
  Box,
  Chip,
  Paper,
  Skeleton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  Typography,
} from "@mui/material";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { useQuery } from "@tanstack/react-query";

import { api } from "../../api/client";
import type { components } from "../../api/schema";
import { AuditLogDrawer } from "./AuditLogDrawer";

dayjs.extend(relativeTime);

type AuditLogPage = components["schemas"]["AuditLogPage"];

const ACTION_COLORS: Record<string, "default" | "primary" | "warning" | "error"> = {
  INSERT: "primary",
  UPDATE: "default",
  DELETE: "error",
};

export function AdminAuditLog() {
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(50);
  const [openId, setOpenId] = useState<number | null>(null);

  const { data, isPending, error, isFetching } = useQuery<AuditLogPage, Error>({
    queryKey: ["admin", "audit-log", page, rowsPerPage],
    queryFn: async () => {
      const { data, error: respError } = await api.GET("/api/admin/audit-log", {
        params: {
          query: {
            limit: rowsPerPage,
            offset: page * rowsPerPage,
          },
        },
      });
      if (respError || !data) throw new Error("audit-log fetch failed");
      return data;
    },
    placeholderData: (prev) => prev, // keep page on screen while next loads
  });

  if (error) {
    return <Alert severity="error">Failed to load audit log: {error.message}</Alert>;
  }

  const items = data?.items ?? [];
  const total = data?.total ?? 0;

  return (
    <Stack spacing={2}>
      <Typography variant="body2" color="text.secondary">
        Every INSERT/UPDATE/DELETE on a data table flows through the audit_trigger
        and lands here. {total > 0 && `${total.toLocaleString()} entries total.`}
      </Typography>

      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>When</TableCell>
              <TableCell>Action</TableCell>
              <TableCell>Table</TableCell>
              <TableCell>Row</TableCell>
              <TableCell>By</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {isPending ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 5 }).map((_, j) => (
                    <TableCell key={j}>
                      <Skeleton width="80%" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              items.map((row) => (
                <TableRow
                  key={row.id}
                  hover
                  onClick={() => setOpenId(row.id)}
                  sx={{ cursor: "pointer" }}
                >
                  <TableCell title={dayjs(row.ts).format()}>
                    {dayjs(row.ts).fromNow()}
                  </TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      label={row.action}
                      color={ACTION_COLORS[row.action] ?? "default"}
                      variant="outlined"
                      sx={{ fontFamily: "monospace", fontSize: 11 }}
                    />
                  </TableCell>
                  <TableCell sx={{ fontFamily: "monospace", fontSize: 12 }}>
                    {row.table_name}
                  </TableCell>
                  <TableCell sx={{ fontFamily: "monospace", fontSize: 12, color: "text.secondary" }}>
                    {row.row_id ? row.row_id.slice(0, 8) : "—"}
                  </TableCell>
                  <TableCell>
                    {row.user_name ?? row.user_email ?? (
                      <Box component="span" sx={{ color: "text.disabled" }}>system</Box>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        <TablePagination
          component="div"
          count={total}
          page={page}
          onPageChange={(_, p) => setPage(p)}
          rowsPerPage={rowsPerPage}
          onRowsPerPageChange={(e) => {
            setRowsPerPage(Number(e.target.value));
            setPage(0);
          }}
          rowsPerPageOptions={[25, 50, 100, 200]}
          // Subtle visual: when a fetch is in flight after pagination, dim the
          // pagination row so the user knows something is happening without
          // blocking the table contents.
          sx={{ opacity: isFetching ? 0.7 : 1 }}
        />
      </TableContainer>
      <AuditLogDrawer auditId={openId} onClose={() => setOpenId(null)} />
    </Stack>
  );
}
