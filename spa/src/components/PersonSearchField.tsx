import { useMemo, useState } from "react";
import {
  Box,
  CircularProgress,
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
import { useQuery } from "@tanstack/react-query";

import { api } from "../api/client";
import type { components } from "../api/schema";

type PersonRow = components["schemas"]["PersonListRow"];
type PersonKind = "guardian" | "student" | "school_worker" | "other";

/**
 * Inline person selector: loads the whole contact list up front so the
 * operator can *see* everyone and pick, or type to filter the list as
 * they go — with a persistent "Create new" action at the top for the
 * common first-time case. Replaces the old type-2-chars-to-search
 * dropdown. The parent owns the result (pick vs. create); this component
 * just emits one of two events, so both Add-parent and Add-student get
 * the new UX with no change on their side.
 */
export function PersonSearchField({
  kind,
  onPickExisting,
  onCreateNew,
  placeholder = "Filter by name or email…",
  autoFocus = false,
}: {
  /** Optional kind filter — biases the list but doesn't constrain the
   *  caller's create-new flow. Pass undefined to show all kinds. */
  kind?: PersonKind;
  onPickExisting: (person: PersonRow) => void;
  onCreateNew: (typedText: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const [query, setQuery] = useState("");

  // Load everyone once (server returns up to 500, alphabetical). Filtering
  // is then instant and client-side — the list is small at practice scale.
  const { data: people = [], isFetching } = useQuery<PersonRow[]>({
    queryKey: ["people-all", kind ?? "any"],
    queryFn: async () => {
      const { data, error } = await api.GET("/api/people", {
        params: { query: { search: "", kind: kind ?? null } },
      });
      if (error || !data) return [];
      return data;
    },
    staleTime: 30_000,
  });

  const q = query.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!q) return people;
    return people.filter((p) => {
      const name = `${p.first_name} ${p.last_name ?? ""}`.toLowerCase();
      return name.includes(q) || (p.email?.toLowerCase().includes(q) ?? false);
    });
  }, [people, q]);

  return (
    <Stack spacing={1}>
      <TextField
        autoFocus={autoFocus}
        size="small"
        fullWidth
        placeholder={placeholder}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        InputProps={{
          startAdornment: (
            <SearchIcon fontSize="small" sx={{ color: "text.disabled", mr: 1 }} />
          ),
          endAdornment: isFetching ? <CircularProgress size={16} /> : null,
        }}
      />
      {/* Fixed height (not maxHeight) so the dialog doesn't resize as the
          filter narrows the list — it scrolls when long, holds its size
          when short. */}
      <Paper variant="outlined" sx={{ height: 264, overflowY: "auto" }}>
        <List dense disablePadding>
          {/* Create-new sits on top — the common case when the person
              isn't in the system yet. Carries whatever's been typed. */}
          <ListItemButton onClick={() => onCreateNew(query.trim())}>
            <ListItemIcon sx={{ minWidth: 32, color: "primary.main" }}>
              <AddIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText
              primaryTypographyProps={{ color: "primary.main", fontWeight: 600 }}
              primary={q ? `Create "${query.trim()}"` : "Create new person"}
            />
          </ListItemButton>
          <Divider />
          {filtered.length === 0 ? (
            <ListItem>
              <ListItemText
                secondary={
                  isFetching
                    ? "Loading…"
                    : people.length === 0
                      ? "No contacts yet — create one above."
                      : "No matches — create above, or clear the filter."
                }
              />
            </ListItem>
          ) : (
            filtered.map((p) => (
              <ListItemButton key={p.id} onClick={() => onPickExisting(p)}>
                <ListItemText
                  primary={formatName(p)}
                  secondary={personSubtitle(p)}
                  secondaryTypographyProps={{ variant: "caption" }}
                />
              </ListItemButton>
            ))
          )}
        </List>
      </Paper>
      {people.length > 0 && (
        <Box sx={{ px: 0.5 }}>
          <Typography variant="caption" color="text.secondary">
            {q
              ? `${filtered.length} of ${people.length} shown`
              : `${people.length} contact${people.length === 1 ? "" : "s"} — pick one, or filter above`}
          </Typography>
        </Box>
      )}
    </Stack>
  );
}

function formatName(p: PersonRow): string {
  const last = p.last_name ? ` ${p.last_name}` : "";
  return `${p.first_name}${last}`.trim();
}

function personSubtitle(p: PersonRow): string {
  const bits: string[] = [p.kind];
  if (p.family_household_name) bits.push(`${p.family_household_name} family`);
  if (p.school_name) bits.push(`@ ${p.school_name}`);
  if (p.email) bits.push(p.email);
  return bits.join(" · ");
}
