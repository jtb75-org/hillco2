import { useState } from "react";
import {
  Alert,
  Box,
  Button,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import dayjs from "dayjs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";

import { api } from "../../api/client";
import { DataTableContainer } from "../../components/DataTableContainer";
import { DataToolbar } from "../../components/DataToolbar";
import { PageHeader } from "../../components/PageHeader";
import { StatusChip } from "../../components/StatusChip";
import { useSnackbar } from "../../components/Snackbar";

import { PickOrCreateFamilyDialog } from "./PickOrCreateFamilyDialog";

// GET /api/intakes returns plain dicts; hand-typed for the columns we
// render. Backend joins family + consultant so the list renders in one
// request.
interface IntakeRow {
  id: string;
  family_id: string;
  household_name: string;
  intake_date: string;
  consultant_id: string | null;
  consultant_name: string | null;
  notes: string | null;
  completed_at: string | null;
  created_at: string;
}

type StatusFilter = "active" | "completed" | "all";

export function IntakesList() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const snackbar = useSnackbar();
  const [pickOpen, setPickOpen] = useState(false);
  const [status, setStatus] = useState<StatusFilter>("active");

  const { data, isPending, error } = useQuery<IntakeRow[], Error>({
    queryKey: ["intakes", "list", status],
    queryFn: async () => {
      const { data, error: respError } = await api.GET("/api/intakes", {
        params: { query: { status } },
      });
      if (respError || !data) throw new Error("intakes fetch failed");
      return data as unknown as IntakeRow[];
    },
  });

  const create = useMutation({
    mutationFn: async (familyId: string) => {
      const { data, error } = await api.POST("/api/intakes", {
        body: { family_id: familyId } as never,
      });
      if (error || !data) {
        const msg =
          (error as { detail?: string } | undefined)?.detail ??
          "Failed to create intake.";
        throw new Error(msg);
      }
      return data as { id: string };
    },
    onSuccess: (intake) => {
      qc.invalidateQueries({ queryKey: ["intakes", "list"] });
      navigate(`/intakes/${intake.id}`);
    },
    onError: (e: Error) => snackbar.show(e.message, "error"),
  });

  if (error) {
    return <Alert severity="error">Failed to load intakes: {error.message}</Alert>;
  }

  return (
    <Stack spacing={2}>
      <PageHeader
        title="Intakes"
        subtitle="Initial family meetings, newest first. Each intake can spawn one or more engagements."
        actions={
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setPickOpen(true)}
          >
            New intake
          </Button>
        }
      />

      <DataToolbar>
        <TextField
          size="small"
          select
          label="Status"
          value={status}
          onChange={(e) => setStatus(e.target.value as StatusFilter)}
          sx={{ minWidth: 160 }}
        >
          <MenuItem value="active">Active</MenuItem>
          <MenuItem value="completed">Completed</MenuItem>
          <MenuItem value="all">All</MenuItem>
        </TextField>
      </DataToolbar>

      <DataTableContainer
        loading={isPending}
        loadingColumns={4}
        loadingRows={5}
        empty={!isPending && (data?.length ?? 0) === 0}
        emptyTitle="No intakes yet"
        emptyDescription="Start the first intake to capture a family meeting."
        emptyAction={
          <Button
            variant="text"
            startIcon={<AddIcon />}
            onClick={() => setPickOpen(true)}
          >
            New intake
          </Button>
        }
      >
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell>Family</TableCell>
              <TableCell>Intake date</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Consultant</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {(data ?? []).map((row) => (
              <TableRow
                key={row.id}
                hover
                sx={{
                  cursor: "pointer",
                  // Visually deprioritize completed intakes so the
                  // active list reads first.
                  opacity: row.completed_at ? 0.7 : 1,
                }}
                onClick={() => navigate(`/intakes/${row.id}`)}
              >
                <TableCell sx={{ fontWeight: 500 }}>{row.household_name}</TableCell>
                <TableCell>
                  {dayjs(row.intake_date).format("MMM D, YYYY")}
                </TableCell>
                <TableCell>
                  <StatusChip
                    size="small"
                    label={row.completed_at ? "completed" : "in progress"}
                    tone={row.completed_at ? "success" : "info"}
                    variant="outlined"
                  />
                </TableCell>
                <TableCell>
                  {row.consultant_name ?? (
                    <Box component="span" sx={{ color: "text.disabled" }}>—</Box>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </DataTableContainer>

      <PickOrCreateFamilyDialog
        open={pickOpen}
        title="Start intake"
        continueLabel={create.isPending ? "Creating…" : "Continue"}
        onClose={() => setPickOpen(false)}
        onContinue={(familyId) => {
          setPickOpen(false);
          create.mutate(familyId);
        }}
      />
    </Stack>
  );
}

