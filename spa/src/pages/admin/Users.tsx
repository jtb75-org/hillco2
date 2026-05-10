import {
  Alert,
  Chip,
  Paper,
  Skeleton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { useQuery } from "@tanstack/react-query";

import { api } from "../../api/client";
import type { components } from "../../api/schema";

dayjs.extend(relativeTime);

type AdminUser = components["schemas"]["AdminUser"];

export function AdminUsers() {
  const { data, isPending, error } = useQuery<AdminUser[], Error>({
    queryKey: ["admin", "users"],
    queryFn: async () => {
      const { data, error: respError } = await api.GET("/api/admin/users");
      if (respError || !data) throw new Error("users fetch failed");
      return data;
    },
  });

  if (error) {
    return <Alert severity="error">Failed to load users: {error.message}</Alert>;
  }

  return (
    <Stack spacing={2}>
      <Typography variant="body2" color="text.secondary">
        Everyone with a session in the cluster. Listed sorted by active-status,
        then name. Role is the consultant/assistant attribute the audit
        attribution and engagement assignment routes read.
      </Typography>
      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell>Email</TableCell>
              <TableCell>Role</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Last login</TableCell>
              <TableCell>Joined</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {isPending ? (
              Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 6 }).map((_, j) => (
                    <TableCell key={j}>
                      <Skeleton width="80%" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              data?.map((u) => (
                <TableRow key={u.id} hover>
                  <TableCell>{u.name}</TableCell>
                  <TableCell>{u.email}</TableCell>
                  <TableCell>{u.role}</TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      label={u.is_active ? "active" : "inactive"}
                      color={u.is_active ? "success" : "default"}
                      variant={u.is_active ? "filled" : "outlined"}
                    />
                  </TableCell>
                  <TableCell>
                    {u.last_login_at ? dayjs(u.last_login_at).fromNow() : "—"}
                  </TableCell>
                  <TableCell>{dayjs(u.created_at).format("MMM D, YYYY")}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Stack>
  );
}
