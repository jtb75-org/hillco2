import { useEffect, useState } from "react";
import {
  Autocomplete,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Typography,
  createFilterOptions,
} from "@mui/material";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "../../api/client";
import { AddFamilyDialog } from "../families/AddFamilyDialog";

/** Two-stage modal: pick an existing family OR add a new one, then
 *  hand the chosen family id back via onContinue. Used to gate the
 *  intake flow — every intake needs a family before the detail page
 *  can open. */
export interface FamilyPickerOption {
  id: string;
  household_name: string;
  primary_parent_name: string | null;
  student_names?: string[] | null;
}

type FamilyEntry =
  | { kind: "family"; family: FamilyPickerOption }
  | { kind: "add"; label: string };

const filterFamilies = createFilterOptions<FamilyEntry>({
  stringify: (entry) => {
    if (entry.kind === "add") return entry.label;
    const f = entry.family;
    return [
      f.household_name,
      f.primary_parent_name ?? "",
      ...(f.student_names ?? []),
    ].join(" ");
  },
});

export function PickOrCreateFamilyDialog({
  open,
  title,
  continueLabel,
  onClose,
  onContinue,
}: {
  open: boolean;
  title: string;
  continueLabel: string;
  onClose: () => void;
  onContinue: (familyId: string) => void;
}) {
  const qc = useQueryClient();
  const [picked, setPicked] = useState<FamilyPickerOption | null>(null);
  const [input, setInput] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [prefillName, setPrefillName] = useState("");
  // After creating inline, auto-select once the refetched list
  // contains the new row.
  const [pendingSelectId, setPendingSelectId] = useState<string | null>(null);

  const families = useQuery<FamilyPickerOption[], Error>({
    queryKey: ["families", "intake-picker"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await api.GET("/api/families", {
        params: { query: { include_archived: false } },
      });
      if (error || !data) throw new Error("families fetch failed");
      return data as unknown as FamilyPickerOption[];
    },
  });

  useEffect(() => {
    if (!pendingSelectId || !families.data) return;
    const match = families.data.find((f) => f.id === pendingSelectId);
    if (match) {
      setPicked(match);
      setInput(match.household_name);
      setPendingSelectId(null);
    }
  }, [pendingSelectId, families.data]);

  // Reset state each time the dialog opens.
  useEffect(() => {
    if (open) {
      setPicked(null);
      setInput("");
      setAddOpen(false);
      setPrefillName("");
      setPendingSelectId(null);
    }
  }, [open]);

  const options: FamilyEntry[] = (families.data ?? []).map((f) => ({
    kind: "family",
    family: f,
  }));

  return (
    <>
      <Dialog open={open && !addOpen} onClose={onClose} maxWidth="sm" fullWidth>
        <DialogTitle>{title}</DialogTitle>
        <DialogContent>
          <Stack spacing={1.5} sx={{ mt: 1 }}>
            <Autocomplete<FamilyEntry, false, false, false>
              size="small"
              options={options}
              loading={families.isPending}
              value={picked ? { kind: "family", family: picked } : null}
              inputValue={input}
              onInputChange={(_e, v, reason) => {
                if (reason !== "reset") setInput(v);
              }}
              onChange={(_e, entry) => {
                if (!entry) {
                  setPicked(null);
                  return;
                }
                if (entry.kind === "family") {
                  setPicked(entry.family);
                  setInput(entry.family.household_name);
                  return;
                }
                setPrefillName(entry.label);
                setAddOpen(true);
              }}
              getOptionLabel={(entry) =>
                entry.kind === "family" ? entry.family.household_name : entry.label
              }
              isOptionEqualToValue={(a, b) =>
                a.kind === "family" &&
                b.kind === "family" &&
                a.family.id === b.family.id
              }
              filterOptions={(opts, state) => {
                const filtered = filterFamilies(opts, state);
                const q = state.inputValue.trim();
                if (q) filtered.push({ kind: "add", label: q });
                return filtered;
              }}
              renderOption={(props, entry) => {
                if (entry.kind === "add") {
                  return (
                    <li {...props} key="__add__">
                      <Typography variant="body2" color="primary">
                        + Add "{entry.label}" as a new family
                      </Typography>
                    </li>
                  );
                }
                const f = entry.family;
                return (
                  <li {...props} key={f.id}>
                    <Stack spacing={0.25} sx={{ py: 0.25 }}>
                      <Box component="span" sx={{ fontWeight: 500 }}>
                        {f.household_name}
                      </Box>
                      <Box
                        component="span"
                        sx={{ color: "text.secondary", fontSize: 12 }}
                      >
                        {f.primary_parent_name
                          ? `Primary: ${f.primary_parent_name}`
                          : "No primary parent"}
                        {(f.student_names?.length ?? 0) > 0 &&
                          ` · ${f.student_names!.join(", ")}`}
                      </Box>
                    </Stack>
                  </li>
                );
              }}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Family"
                  required
                  placeholder="Type a household, parent, or student name"
                  autoFocus
                />
              )}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="contained"
            disabled={!picked}
            onClick={() => picked && onContinue(picked.id)}
          >
            {continueLabel}
          </Button>
        </DialogActions>
      </Dialog>

      <AddFamilyDialog
        key={addOpen ? `add-${prefillName}` : "add-closed"}
        open={addOpen}
        onClose={() => setAddOpen(false)}
        initialHouseholdName={prefillName}
        navigateOnSuccess={false}
        onCreated={(id) => {
          setPendingSelectId(id);
          qc.invalidateQueries({ queryKey: ["families", "intake-picker"] });
        }}
      />
    </>
  );
}
