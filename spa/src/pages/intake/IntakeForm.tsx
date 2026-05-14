import { useEffect, useState } from "react";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Grid,
  Link as MuiLink,
  Paper,
  Stack,
  TextField,
  Typography,
  createFilterOptions,
} from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link as RouterLink, useNavigate } from "react-router-dom";

import { api } from "../../api/client";
import { PageHeader } from "../../components/PageHeader";
import { useSnackbar } from "../../components/Snackbar";
import { AddFamilyDialog } from "../families/AddFamilyDialog";

/** Single-page intake form. Sibling to the multi-step IntakeWizard at
 *  /intake — we leave the wizard untouched and build this out section
 *  by section. */
export function IntakeForm() {
  const navigate = useNavigate();
  const snackbar = useSnackbar();
  const [family, setFamily] = useState<FamilyOption | null>(null);
  // Held in local state until submit. On submit we create an intake
  // row (family-level, family_id=family.id) with these notes; later
  // engagement(s) link back via engagements.intake_id.
  const [intakeNotes, setIntakeNotes] = useState("");

  const submit = useMutation({
    mutationFn: async () => {
      if (!family) throw new Error("Pick a family first.");
      const { data, error } = await api.POST("/api/intakes", {
        body: {
          family_id: family.id,
          notes: intakeNotes.trim() || null,
        } as never,
      });
      if (error || !data) {
        const msg =
          (error as { detail?: string } | undefined)?.detail ??
          "Failed to save intake.";
        throw new Error(msg);
      }
      return data as { id: string; family_id: string };
    },
    onSuccess: (created) => {
      snackbar.show("Intake saved");
      navigate(`/families/${created.family_id}`);
    },
    onError: (e: Error) => snackbar.show(e.message, "error"),
  });

  return (
    <Stack spacing={3}>
      <PageHeader
        title="Intake form"
        subtitle="Family-level intake — save once you've picked the family and captured notes. Engagements get created from the family page after."
        actions={
          <Button
            variant="contained"
            disabled={!family || submit.isPending}
            onClick={() => submit.mutate()}
          >
            {submit.isPending ? "Saving…" : "Save intake"}
          </Button>
        }
      />

      <Grid container spacing={2} alignItems="stretch">
        <Grid item xs={12} md={6}>
          <Stack spacing={2}>
            <FamilySection selected={family} onSelect={setFamily} />
            {/* Other left-column sections (parents, student, …) drop
                in here as we build them out. */}
          </Stack>
        </Grid>
        <Grid item xs={12} md={6}>
          <IntakeNotesSection value={intakeNotes} onChange={setIntakeNotes} />
        </Grid>
      </Grid>
    </Stack>
  );
}

// ---- Intake notes section --------------------------------------------------

function IntakeNotesSection({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <Paper variant="outlined" sx={{ p: 2, height: "100%", display: "flex", flexDirection: "column" }}>
      <Typography variant="overline" color="text.secondary" sx={{ display: "block", mb: 1 }}>
        Intake notes
      </Typography>
      <Typography variant="caption" color="text.disabled" sx={{ display: "block", mb: 1 }}>
        Free-form notes captured during the intake meeting. Saved to
        the family-level intake record; any engagements spun up from
        this intake will link back via intake_id.
      </Typography>
      <TextField
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="What did the family say? What stood out? Anything to follow up on."
        multiline
        minRows={12}
        fullWidth
        sx={{ flex: 1, "& .MuiInputBase-root": { height: "100%" } }}
      />
    </Paper>
  );
}

// ---- Family section --------------------------------------------------------

interface FamilyOption {
  id: string;
  household_name: string;
  primary_parent_name: string | null;
  student_names?: string[] | null;
}

type FamilyEntry =
  | { kind: "family"; family: FamilyOption }
  | { kind: "add"; label: string };

const filterFamilies = createFilterOptions<FamilyEntry>({
  // Custom matcher so typing a parent or student narrows the list too.
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

function FamilySection({
  selected,
  onSelect,
}: {
  selected: FamilyOption | null;
  onSelect: (family: FamilyOption | null) => void;
}) {
  const qc = useQueryClient();
  const [input, setInput] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  // After we create a family inline, we want to auto-select it once
  // the refetched list contains the new row. Stash the id here and
  // pick it up via the useEffect below.
  const [pendingSelectId, setPendingSelectId] = useState<string | null>(null);

  const families = useQuery<FamilyOption[], Error>({
    queryKey: ["families", "intake-picker"],
    queryFn: async () => {
      const { data, error } = await api.GET("/api/families", {
        params: { query: { include_archived: false } },
      });
      if (error || !data) throw new Error("families fetch failed");
      return data as unknown as FamilyOption[];
    },
  });

  useEffect(() => {
    if (!pendingSelectId || !families.data) return;
    const match = families.data.find((f) => f.id === pendingSelectId);
    if (match) {
      onSelect(match);
      setInput(match.household_name);
      setPendingSelectId(null);
    }
  }, [pendingSelectId, families.data, onSelect]);

  // Wrap families as discriminated entries; the "+ Add" entry is
  // appended in the filter when the typed input doesn't exactly match
  // an existing household_name.
  const baseOptions: FamilyEntry[] = (families.data ?? []).map((f) => ({
    kind: "family",
    family: f,
  }));

  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Typography variant="overline" color="text.secondary" sx={{ display: "block", mb: 1 }}>
        Family
      </Typography>

      {families.error && (
        <Alert severity="error" sx={{ mb: 1 }}>
          {families.error.message}
        </Alert>
      )}

      <Autocomplete<FamilyEntry, false, false, false>
        size="small"
        options={baseOptions}
        loading={families.isPending}
        value={selected ? { kind: "family", family: selected } : null}
        inputValue={input}
        onInputChange={(_e, v, reason) => {
          // Don't clear the input field after selecting; we want it
          // to display the chosen family's household name.
          if (reason !== "reset") setInput(v);
        }}
        onChange={(_e, entry) => {
          if (!entry) {
            onSelect(null);
            return;
          }
          if (entry.kind === "family") {
            onSelect(entry.family);
            setInput(entry.family.household_name);
            return;
          }
          // "+ Add" entry — open the create dialog prefilled with what
          // the user typed.
          setAddOpen(true);
        }}
        getOptionLabel={(entry) =>
          entry.kind === "family" ? entry.family.household_name : entry.label
        }
        isOptionEqualToValue={(a, b) =>
          a.kind === "family" && b.kind === "family" && a.family.id === b.family.id
        }
        filterOptions={(options, state) => {
          const filtered = filterFamilies(options, state);
          const q = state.inputValue.trim();
          // Append a synthetic "Add" entry when there's text and no
          // existing household exactly matches it (case-insensitive).
          if (q) {
            const exact = options.some(
              (o) =>
                o.kind === "family" &&
                o.family.household_name.toLowerCase() === q.toLowerCase(),
            );
            if (!exact) {
              filtered.push({ kind: "add", label: q });
            }
          }
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
            placeholder="Type a household, parent, or student name"
            autoFocus
          />
        )}
      />

      {selected && (
        <Box sx={{ mt: 1 }}>
          <Typography variant="caption" color="text.secondary">
            Selected{" "}
            <MuiLink
              component={RouterLink}
              to={`/families/${selected.id}`}
              target="_blank"
              underline="hover"
            >
              {selected.household_name}
            </MuiLink>
            .
          </Typography>
        </Box>
      )}

      <AddFamilyDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        initialHouseholdName={input}
        navigateOnSuccess={false}
        onCreated={(id) => {
          // Refetch the picker list and auto-select the new family
          // once it shows up. The effect above watches for it.
          setPendingSelectId(id);
          qc.invalidateQueries({ queryKey: ["families", "intake-picker"] });
        }}
      />
    </Paper>
  );
}
