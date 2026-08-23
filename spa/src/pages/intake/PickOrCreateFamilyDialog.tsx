import { useEffect, useMemo, useState } from "react";
import {
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import SearchIcon from "@mui/icons-material/Search";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "../../api/client";
import { NewFamilyStepper } from "../families/NewFamilyStepper";

/** Two-stage modal: see every family and pick one (filter as you type),
 *  OR create a new one via the New Family stepper — then hand the chosen
 *  family id back via onContinue. Used to gate the intake flow: every
 *  intake needs a family before the detail page can open. */
export interface FamilyPickerOption {
  id: string;
  household_name: string;
  primary_parent_name: string | null;
  student_names?: string[] | null;
}

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
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<FamilyPickerOption | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [prefillName, setPrefillName] = useState("");
  // After creating inline, auto-select once the refetched list contains
  // the new row (covers a mid-stepper cancel).
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
      setPendingSelectId(null);
    }
  }, [pendingSelectId, families.data]);

  // Reset each time the dialog opens.
  useEffect(() => {
    if (open) {
      setQuery("");
      setPicked(null);
      setAddOpen(false);
      setPrefillName("");
      setPendingSelectId(null);
    }
  }, [open]);

  const all = families.data ?? [];
  const q = query.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!q) return all;
    return all.filter((f) => {
      const hay = [
        f.household_name,
        f.primary_parent_name ?? "",
        ...(f.student_names ?? []),
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [all, q]);

  return (
    <>
      <Dialog open={open && !addOpen} onClose={onClose} maxWidth="sm" fullWidth>
        <DialogTitle>{title}</DialogTitle>
        <DialogContent>
          <Stack spacing={1} sx={{ mt: 0.5 }}>
            <TextField
              autoFocus
              size="small"
              fullWidth
              placeholder="Filter by household, parent, or student…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              InputProps={{
                startAdornment: (
                  <SearchIcon
                    fontSize="small"
                    sx={{ color: "text.disabled", mr: 1 }}
                  />
                ),
                endAdornment: families.isPending ? (
                  <CircularProgress size={16} />
                ) : null,
              }}
            />
            {/* Fixed height so the dialog doesn't resize as the filter
                narrows the list. */}
            <Paper variant="outlined" sx={{ height: 320, overflowY: "auto" }}>
              <List dense disablePadding>
                <ListItemButton
                  onClick={() => {
                    setPrefillName(query.trim());
                    setAddOpen(true);
                  }}
                >
                  <ListItemIcon sx={{ minWidth: 32, color: "primary.main" }}>
                    <AddIcon fontSize="small" />
                  </ListItemIcon>
                  <ListItemText
                    primaryTypographyProps={{
                      color: "primary.main",
                      fontWeight: 600,
                    }}
                    primary={
                      q ? `Create "${query.trim()}" as a new family` : "Create new family"
                    }
                  />
                </ListItemButton>
                <Divider />
                {filtered.length === 0 ? (
                  <ListItem>
                    <ListItemText
                      secondary={
                        families.isPending
                          ? "Loading…"
                          : all.length === 0
                            ? "No families yet — create one above."
                            : "No matches — create above, or clear the filter."
                      }
                    />
                  </ListItem>
                ) : (
                  filtered.map((f) => (
                    <ListItemButton
                      key={f.id}
                      selected={picked?.id === f.id}
                      onClick={() => setPicked(f)}
                    >
                      <ListItemText
                        primary={f.household_name}
                        secondary={familySubtitle(f)}
                        secondaryTypographyProps={{ variant: "caption" }}
                      />
                    </ListItemButton>
                  ))
                )}
              </List>
            </Paper>
            {all.length > 0 && (
              <Box sx={{ px: 0.5 }}>
                <Typography variant="caption" color="text.secondary">
                  {q
                    ? `${filtered.length} of ${all.length} shown`
                    : `${all.length} famil${all.length === 1 ? "y" : "ies"} — pick one, or filter above`}
                </Typography>
              </Box>
            )}
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

      <NewFamilyStepper
        key={addOpen ? `add-${prefillName}` : "add-closed"}
        open={addOpen}
        initialHouseholdName={prefillName}
        navigateOnDone={false}
        onClose={() => setAddOpen(false)}
        onCreated={(id) => {
          // Family row exists after step 1 of the wizard — capture it so a
          // mid-wizard cancel still leaves it selected in the picker.
          setPicked({
            id,
            household_name: prefillName,
            primary_parent_name: null,
            student_names: [],
          });
          setPendingSelectId(id);
          qc.invalidateQueries({ queryKey: ["families", "intake-picker"] });
        }}
        onDone={(id) => {
          // Finished the wizard (family + guardians + children) — drop
          // straight into the intake for it; the detail page's roster then
          // lets you pick which of those members are on this intake.
          onContinue(id);
        }}
      />
    </>
  );
}

function familySubtitle(f: FamilyPickerOption): string {
  const bits: string[] = [
    f.primary_parent_name ? `Primary: ${f.primary_parent_name}` : "No primary parent",
  ];
  if ((f.student_names?.length ?? 0) > 0) bits.push(f.student_names!.join(", "));
  return bits.join(" · ");
}
