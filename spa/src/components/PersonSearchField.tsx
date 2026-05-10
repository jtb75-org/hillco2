import { useEffect, useState } from "react";
import { Autocomplete, Box, CircularProgress, TextField, Typography } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import { useQuery } from "@tanstack/react-query";

import { api } from "../api/client";
import type { components } from "../api/schema";

type PersonRow = components["schemas"]["PersonListRow"];
type PersonKind = "guardian" | "student" | "school_worker" | "other";

const CREATE_OPTION_ID = "__create_new__";

type Option =
  | { id: string; kind: "person"; row: PersonRow }
  | { id: typeof CREATE_OPTION_ID; kind: "create"; typed: string };

/**
 * Autocomplete over /api/people that lets the operator either pick an
 * existing record or fall through to "+ Add new" with the text they
 * typed. Search runs server-side, debounced. The parent owns the result
 * (which mode was picked); this component just emits one of two events.
 */
export function PersonSearchField({
  kind,
  onPickExisting,
  onCreateNew,
  placeholder = "Search by name or email…",
  autoFocus = false,
}: {
  /** Optional kind filter — biases search but doesn't constrain the
   *  caller's create-new flow. Pass undefined to search all kinds. */
  kind?: PersonKind;
  onPickExisting: (person: PersonRow) => void;
  onCreateNew: (typedText: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const [input, setInput] = useState("");
  const [debounced, setDebounced] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebounced(input.trim()), 200);
    return () => clearTimeout(t);
  }, [input]);

  const { data: people, isFetching } = useQuery<PersonRow[]>({
    queryKey: ["people-search", debounced, kind ?? "any"],
    queryFn: async () => {
      const { data, error } = await api.GET("/api/people", {
        params: { query: { search: debounced, kind: kind ?? null } },
      });
      if (error || !data) return [];
      return data;
    },
    enabled: debounced.length >= 2,
    staleTime: 30_000,
  });

  const options: Option[] = [
    ...((people ?? []).map<Option>((p) => ({ id: p.id, kind: "person", row: p }))),
    // Always offer "create new" when the user has typed something. Two
    // shapes serve different intents: the operator either recognizes a
    // hit in the dropdown, or types the full name and falls through.
    ...(input.trim().length >= 1
      ? [{ id: CREATE_OPTION_ID, kind: "create", typed: input.trim() } as Option]
      : []),
  ];

  return (
    <Autocomplete<Option, false, false, false>
      options={options}
      filterOptions={(x) => x}  // server-side already filtered
      getOptionLabel={(o) =>
        o.kind === "person" ? formatName(o.row) : `Add new "${o.typed}"`
      }
      isOptionEqualToValue={(a, b) => a.id === b.id}
      inputValue={input}
      onInputChange={(_, v) => setInput(v)}
      value={null}
      onChange={(_, picked) => {
        if (!picked) return;
        if (picked.kind === "person") {
          onPickExisting(picked.row);
        } else {
          onCreateNew(picked.typed);
        }
        // Clear the search input — once a pick is made, the parent flips
        // out of search mode and the input would otherwise dangle.
        setInput("");
      }}
      noOptionsText={
        debounced.length < 2 ? "Type 2+ characters to search…" : "No matches"
      }
      loading={isFetching && debounced.length >= 2}
      renderOption={(props, option) => {
        if (option.kind === "create") {
          // Use props.key explicitly — MUI v6 emits a console warning
          // when key is spread via {...props}.
          const { key, ...rest } = props as typeof props & { key: string };
          return (
            <Box
              component="li"
              key={key}
              {...rest}
              sx={{ display: "flex", alignItems: "center", gap: 1, color: "primary.main", fontWeight: 500 }}
            >
              <AddIcon fontSize="small" />
              <span>Add new "{option.typed}"</span>
            </Box>
          );
        }
        const { key, ...rest } = props as typeof props & { key: string };
        return (
          <Box component="li" key={key} {...rest}>
            <Box>
              <Typography variant="body2">{formatName(option.row)}</Typography>
              <Typography variant="caption" color="text.secondary">
                {personSubtitle(option.row)}
              </Typography>
            </Box>
          </Box>
        );
      }}
      renderInput={(params) => (
        <TextField
          {...params}
          autoFocus={autoFocus}
          placeholder={placeholder}
          fullWidth
          InputProps={{
            ...params.InputProps,
            endAdornment: (
              <>
                {isFetching && debounced.length >= 2 ? (
                  <CircularProgress size={16} />
                ) : null}
                {params.InputProps.endAdornment}
              </>
            ),
          }}
        />
      )}
    />
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
