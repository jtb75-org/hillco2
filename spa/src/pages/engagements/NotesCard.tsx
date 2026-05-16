import { useState } from "react";
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import dayjs from "dayjs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { RichTextEditor } from "../../components/RichTextEditor";
import { useSnackbar } from "../../components/Snackbar";

type NoteKind =
  | "parent_intake"
  | "student_interview"
  | "second_parent"
  | "call"
  | "followup"
  | "general";

interface Note {
  id: string;
  engagement_id: string;
  kind: NoteKind;
  occurred_on: string | null;
  title: string | null;
  body: string | null;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
}

const KIND_LABEL: Record<NoteKind, string> = {
  parent_intake: "Parent intake",
  student_interview: "Student interview",
  second_parent: "Second parent",
  call: "Call",
  followup: "Follow-up",
  general: "General",
};

const KIND_OPTIONS: NoteKind[] = [
  "general",
  "call",
  "followup",
  "parent_intake",
  "student_interview",
  "second_parent",
];

export function NotesCard({ engagementId }: { engagementId: string }) {
  const qc = useQueryClient();
  const snackbar = useSnackbar();
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<Note | null>(null);

  const notes = useQuery<Note[], Error>({
    queryKey: ["engagements", engagementId, "notes"],
    queryFn: async () => {
      const res = await fetch(`/api/engagements/${engagementId}/notes`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to load notes.");
      return res.json();
    },
  });

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ["engagements", engagementId, "notes"] });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/notes/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok && res.status !== 204) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { detail?: string }).detail ?? "Delete failed.");
      }
    },
    onSuccess: invalidate,
    onError: (e: Error) => snackbar.show(e.message, "error"),
  });

  const rows = notes.data ?? [];

  return (
    <Paper variant="outlined" sx={{ p: 2.5 }}>
      <Stack direction="row" alignItems="baseline" spacing={1} sx={{ mb: 1.5 }}>
        <Typography variant="overline" color="text.secondary" sx={{ flex: 1 }}>
          Notes
        </Typography>
        <Button size="small" startIcon={<AddIcon />} onClick={() => setAddOpen(true)}>
          Add note
        </Button>
      </Stack>

      {notes.isPending ? (
        <Typography variant="body2" color="text.disabled">Loading…</Typography>
      ) : rows.length === 0 ? (
        <Typography variant="body2" color="text.disabled">
          No notes yet.
        </Typography>
      ) : (
        <Stack divider={<Box sx={{ borderTop: 1, borderColor: "divider" }} />} spacing={0}>
          {rows.map((n) => (
            <NoteRow
              key={n.id}
              note={n}
              onEdit={() => setEditing(n)}
              onDelete={() => remove.mutate(n.id)}
            />
          ))}
        </Stack>
      )}

      <NoteDialog
        mode={addOpen ? "create" : editing ? "edit" : null}
        engagementId={engagementId}
        note={editing}
        onClose={() => {
          setAddOpen(false);
          setEditing(null);
        }}
        onSaved={() => {
          setAddOpen(false);
          setEditing(null);
          invalidate();
        }}
      />
    </Paper>
  );
}

function NoteRow({
  note,
  onEdit,
  onDelete,
}: {
  note: Note;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <Box
      sx={{
        py: 1.5,
        cursor: "pointer",
        "&:hover": { bgcolor: "action.hover" },
      }}
      onClick={onEdit}
    >
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
        <Chip
          size="small"
          variant="outlined"
          label={KIND_LABEL[note.kind]}
          sx={{ height: 20, fontSize: 11 }}
        />
        <Typography variant="caption" color="text.secondary">
          {note.occurred_on
            ? dayjs(note.occurred_on).format("MMM D, YYYY")
            : dayjs(note.created_at).format("MMM D, YYYY")}
        </Typography>
        {note.created_by_name && (
          <Typography variant="caption" color="text.disabled">
            · {note.created_by_name}
          </Typography>
        )}
        <Box sx={{ ml: "auto" }} />
        <IconButton
          size="small"
          aria-label="Delete note"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          sx={{ color: "text.disabled", "&:hover": { color: "error.main" } }}
        >
          <DeleteOutlineIcon fontSize="small" />
        </IconButton>
      </Stack>
      {note.title && (
        <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 0.5 }}>
          {note.title}
        </Typography>
      )}
      {note.body && <NoteBodyPreview html={note.body} />}
    </Box>
  );
}

function NoteBodyPreview({ html }: { html: string }) {
  // Truncate-by-CSS so the row stays manageable; click row to expand
  // (opens edit dialog where the full body lives).
  return (
    <Box
      sx={{
        fontSize: 13,
        color: "text.secondary",
        display: "-webkit-box",
        WebkitLineClamp: 3,
        WebkitBoxOrient: "vertical",
        overflow: "hidden",
        "& p": { m: 0, mb: 0.5 },
        "& p:last-child": { mb: 0 },
        "& ul, & ol": { my: 0.5, pl: 3 },
      }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function NoteDialog({
  mode,
  engagementId,
  note,
  onClose,
  onSaved,
}: {
  mode: "create" | "edit" | null;
  engagementId: string;
  note: Note | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const snackbar = useSnackbar();
  const [kind, setKind] = useState<NoteKind>(note?.kind ?? "general");
  const [occurredOn, setOccurredOn] = useState<string>(
    note?.occurred_on ?? new Date().toISOString().slice(0, 10),
  );
  const [title, setTitle] = useState(note?.title ?? "");
  const [body, setBody] = useState(note?.body ?? "");

  // Re-seed local state on open. Tracked via the note ref + mode so the
  // dialog doesn't carry stale text between consecutive opens.
  const seedKey = `${mode}-${note?.id ?? ""}`;
  const [lastSeed, setLastSeed] = useState<string>(seedKey);
  if (mode && lastSeed !== seedKey) {
    setKind(note?.kind ?? "general");
    setOccurredOn(note?.occurred_on ?? new Date().toISOString().slice(0, 10));
    setTitle(note?.title ?? "");
    setBody(note?.body ?? "");
    setLastSeed(seedKey);
  }

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        kind,
        occurred_on: occurredOn || null,
        title: title.trim() || null,
        body: body || null,
      };
      const url =
        mode === "edit" && note
          ? `/api/notes/${note.id}`
          : `/api/engagements/${engagementId}/notes`;
      const method = mode === "edit" ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { detail?: string }).detail ?? "Save failed.");
      }
    },
    onSuccess: onSaved,
    onError: (e: Error) => snackbar.show(e.message, "error"),
  });

  return (
    <Dialog
      open={mode !== null}
      onClose={() => {
        if (save.isPending) return;
        onClose();
      }}
      maxWidth="md"
      fullWidth
    >
      <DialogTitle>{mode === "edit" ? "Edit note" : "Add note"}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
            <Select
              size="small"
              value={kind}
              onChange={(e) => setKind(e.target.value as NoteKind)}
              sx={{ flex: 1 }}
            >
              {KIND_OPTIONS.map((k) => (
                <MenuItem key={k} value={k}>
                  {KIND_LABEL[k]}
                </MenuItem>
              ))}
            </Select>
            <TextField
              label="Date"
              type="date"
              size="small"
              value={occurredOn}
              onChange={(e) => setOccurredOn(e.target.value)}
              sx={{ flex: 1 }}
            />
          </Stack>
          <TextField
            label="Title (optional)"
            size="small"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
              Body
            </Typography>
            <RichTextEditor
              value={body}
              onChange={setBody}
              placeholder="Capture the conversation, decisions, follow-ups…"
              minRows={6}
            />
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={save.isPending}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={() => save.mutate()}
          disabled={save.isPending || (!title.trim() && !body)}
        >
          {save.isPending ? "Saving…" : "Save"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
