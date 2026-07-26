import { useEffect, useState } from "react";
import { DrawerSection } from "../../components/DrawerSection";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Stack,
  Typography,
} from "@mui/material";
import { useMutation, useQuery } from "@tanstack/react-query";

import { api } from "../../api/client";
import type { components } from "../../api/schema";

type DeletionImpact = components["schemas"]["DeletionImpact"];

interface FamilyTarget {
  id: string;
  household_name: string;
}

/**
 * Hard-delete confirmation that surfaces what cascades. Guardians and
 * students each get a checkbox; unchecked = preserve in the address
 * book (lose their family link but stay as people). Default state has
 * every row checked (operator's "I want this gone" intent).
 *
 * Engagements ON DELETE RESTRICT — if any reference the family, we
 * disable the Delete button and explain. The operator must archive /
 * remove engagements first.
 */
export function DeleteFamilyDialog({
  target,
  onClose,
  onDeleted,
}: {
  target: FamilyTarget | null;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const open = !!target;
  const familyId = target?.id ?? null;

  const impact = useQuery<DeletionImpact, Error>({
    queryKey: ["families", familyId, "deletion-impact"],
    enabled: !!familyId,
    queryFn: async () => {
      const { data, error } = await api.GET(
        "/api/families/{family_id}/deletion-impact",
        { params: { path: { family_id: familyId! } } },
      );
      if (error || !data) throw new Error("Failed to compute impact.");
      return data;
    },
  });

  // Selection state — checked = will be deleted; unchecked = preserve.
  // Initialize from impact once it loads; reset when the dialog opens
  // for a different family.
  const [killGuardians, setKillGuardians] = useState<Set<string>>(new Set());
  const [killStudents, setKillStudents] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open || !impact.data) return;
    setKillGuardians(new Set(impact.data.guardians.map((g) => g.id)));
    setKillStudents(new Set(impact.data.students.map((s) => s.id)));
  }, [open, impact.data]);

  const del = useMutation({
    mutationFn: async () => {
      if (!familyId || !impact.data) throw new Error("not ready");
      // Convert "delete these" -> "preserve those NOT in delete set".
      const preserveGuardianIds = impact.data.guardians
        .filter((g) => !killGuardians.has(g.id))
        .map((g) => g.id);
      const preserveStudentIds = impact.data.students
        .filter((s) => !killStudents.has(s.id))
        .map((s) => s.id);
      const { error } = await api.POST(
        "/api/families/{family_id}/hard-delete",
        {
          params: { path: { family_id: familyId } },
          body: {
            preserve_guardian_ids: preserveGuardianIds,
            preserve_student_ids: preserveStudentIds,
          },
        },
      );
      if (error) {
        const msg = (error as { detail?: string }).detail ?? "Delete failed.";
        throw new Error(msg);
      }
    },
    onSuccess: onDeleted,
  });

  const activeEng = impact.data?.active_engagement_count ?? 0;
  const archivedEng = impact.data?.deleted_engagement_count ?? 0;
  // Only active engagements block. Archived ones get swept inside
  // the family hard-delete transaction (their CASCADE dependents go
  // with them); we just inform the operator so it's not a surprise.
  const blocked = activeEng > 0;

  return (
    <Dialog open={open} onClose={() => !del.isPending && onClose()} maxWidth="sm" fullWidth>
      <DialogTitle>
        Delete {target?.household_name ?? "family"} permanently?
      </DialogTitle>
      <DialogContent dividers>
        {impact.isPending ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
            <CircularProgress size={28} />
          </Box>
        ) : impact.error ? (
          <Alert severity="error">{impact.error.message}</Alert>
        ) : impact.data ? (
          <Stack spacing={2}>
            <Typography variant="body2" color="text.secondary">
              Hard-deleting the family removes the household record and
              every junction row. Check what you also want to soft-delete
              from the address book; uncheck to preserve them as
              standalone people.
            </Typography>

            {blocked && (
              <Alert severity="warning">
                {activeEng} active engagement(s) still reference this
                family. Close or remove them before hard-deleting.
              </Alert>
            )}
            {!blocked && archivedEng > 0 && (
              <Alert severity="info">
                {archivedEng} archived engagement(s) on this family will
                be cleaned up alongside the delete.
              </Alert>
            )}

            {impact.data.guardians.length > 0 && (
              <Section title="Guardians">
                {impact.data.guardians.map((g) => (
                  <FormControlLabel
                    key={g.id}
                    control={
                      <Checkbox
                        checked={killGuardians.has(g.id)}
                        onChange={(e) =>
                          toggle(setKillGuardians, g.id, e.target.checked)
                        }
                      />
                    }
                    label={
                      <Box>
                        <Typography variant="body2">{g.name}</Typography>
                        {g.email && (
                          <Typography variant="caption" color="text.secondary">
                            {g.email}
                          </Typography>
                        )}
                      </Box>
                    }
                  />
                ))}
              </Section>
            )}

            {impact.data.students.length > 0 && (
              <Section title="Students">
                {impact.data.students.map((s) => (
                  <FormControlLabel
                    key={s.id}
                    control={
                      <Checkbox
                        checked={killStudents.has(s.id)}
                        onChange={(e) =>
                          toggle(setKillStudents, s.id, e.target.checked)
                        }
                      />
                    }
                    label={
                      <Box>
                        <Typography variant="body2">{s.name}</Typography>
                        {s.current_grade && (
                          <Typography variant="caption" color="text.secondary">
                            Grade {s.current_grade}
                          </Typography>
                        )}
                      </Box>
                    }
                  />
                ))}
              </Section>
            )}

            {impact.data.guardians.length === 0 &&
              impact.data.students.length === 0 && (
                <Typography variant="body2" color="text.secondary">
                  No attached guardians or students — just the family
                  record itself will go.
                </Typography>
              )}

            {del.error && <Alert severity="error">{del.error.message}</Alert>}
          </Stack>
        ) : null}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={del.isPending}>Cancel</Button>
        <Button
          color="error"
          variant="contained"
          disabled={del.isPending || impact.isPending || blocked}
          onClick={() => del.mutate()}
        >
          {del.isPending ? "Deleting…" : "Delete family"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <DrawerSection title={title}>
      <Stack>{children}</Stack>
    </DrawerSection>
  );
}

function toggle(
  setter: React.Dispatch<React.SetStateAction<Set<string>>>,
  id: string,
  on: boolean,
) {
  setter((prev) => {
    const next = new Set(prev);
    if (on) next.add(id);
    else next.delete(id);
    return next;
  });
}
