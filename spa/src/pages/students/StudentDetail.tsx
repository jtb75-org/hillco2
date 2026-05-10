import { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Breadcrumbs,
  Button,
  Chip,
  CircularProgress,
  Grid,
  Link as MuiLink,
  MenuItem,
  Paper,
  Popover,
  Select,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";
import { Link as RouterLink, useParams } from "react-router-dom";

import { api } from "../../api/client";

// /api/students/{id} returns a plain dict — hand-typed here for the
// fields we render. Documented in app/routes/students.py:student_detail.
interface StudentDetail {
  id: string;
  name: string;
  dob: string | null;
  current_grade: string | null;
  current_school_id: string | null;
  autism_level: 1 | 2 | 3 | null;
  has_504: boolean;
  has_iep: boolean;
  has_learning_disability: boolean;
  has_adhd: boolean;
  has_intellectual_disability: boolean;
  has_health_impairment: boolean;
  has_emotional_disturbance: boolean;
  diagnosis_other: string | null;
  needs_goals: string | null;
  learning_disability_notes: string | null;
  intellectual_disability_notes: string | null;
  health_impairment_notes: string | null;
  emotional_disturbance_notes: string | null;
  family: { id: string; household_name: string } | null;
  school: { id: string; name: string } | null;
  primary_parent: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
  } | null;
}

export function StudentDetail() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();

  const { data, isPending, error } = useQuery<StudentDetail, Error>({
    queryKey: ["students", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error: respError, response } = await api.GET(
        "/api/students/{student_id}",
        { params: { path: { student_id: id! } } },
      );
      if (response.status === 404) throw new Error("Student not found.");
      if (respError || !data) throw new Error("Failed to load student.");
      return data as unknown as StudentDetail;
    },
  });

  // Single shared mutation for the whole page; the SPA fires PATCH on
  // chip toggles, autism level changes, text-input blurs, etc. Each
  // call is idempotent and small.
  const patch = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const { error: respError } = await api.PATCH(
        "/api/students/{student_id}",
        { params: { path: { student_id: id! } }, body: body as never },
      );
      if (respError) {
        const msg = (respError as { detail?: string }).detail ?? "Save failed.";
        throw new Error(msg);
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["students", id] }),
  });

  if (error) return <Alert severity="error">{error.message}</Alert>;
  if (isPending || !data) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Stack spacing={3}>
      <Breadcrumbs>
        <MuiLink component={RouterLink} to="/families" color="inherit" underline="hover">
          Families
        </MuiLink>
        {data.family && (
          <MuiLink
            component={RouterLink}
            to={`/families/${data.family.id}`}
            color="inherit"
            underline="hover"
          >
            {data.family.household_name}
          </MuiLink>
        )}
        <Typography color="text.primary">{data.name}</Typography>
      </Breadcrumbs>

      <HeaderStrip student={data} />
      {patch.error && (
        <Alert severity="error" onClose={() => patch.reset()}>
          {patch.error.message}
        </Alert>
      )}
      <AtAGlanceCard student={data} onPatch={(body) => patch.mutate(body)} />
      <NeedsGoalsCard student={data} onPatch={(body) => patch.mutate(body)} />
    </Stack>
  );
}

function HeaderStrip({ student }: { student: StudentDetail }) {
  const reach = student.primary_parent;
  return (
    <Paper variant="outlined" sx={{ p: 2.5 }}>
      <Typography variant="h4" sx={{ fontWeight: 600, mb: 0.5 }}>
        {student.name}
      </Typography>
      {student.current_grade && (
        <Typography variant="caption" color="text.secondary">
          Grade {student.current_grade}
        </Typography>
      )}
      <Box
        sx={{
          mt: 2,
          display: "grid",
          gridTemplateColumns: "auto 1fr auto 1fr",
          columnGap: 2,
          rowGap: 1,
        }}
      >
        <Label>DOB</Label>
        <Value>{student.dob ? dayjs(student.dob).format("MMM D, YYYY") : "—"}</Value>
        <Label>School</Label>
        <Value>{student.school?.name ?? "—"}</Value>
        <Label>Reach</Label>
        <Box sx={{ gridColumn: "2 / 5" }}>
          {reach ? (
            <Stack direction="row" spacing={2} flexWrap="wrap" alignItems="baseline">
              <Typography variant="body2">{reach.name}</Typography>
              {reach.email && (
                <Typography variant="body2" color="text.secondary">
                  {reach.email}
                </Typography>
              )}
              {reach.phone && (
                <Typography variant="body2" color="text.secondary">
                  {reach.phone}
                </Typography>
              )}
            </Stack>
          ) : (
            <Typography variant="body2" color="text.disabled">
              No primary parent on this family.
            </Typography>
          )}
        </Box>
      </Box>
    </Paper>
  );
}

// Width every chip ends up at. Tuned to fit the longest label
// ("Emotional disturbance") plus a little breathing room.
const CHIP_WIDTH = 200;

function AtAGlanceCard({
  student,
  onPatch,
}: {
  student: StudentDetail;
  onPatch: (body: Record<string, unknown>) => void;
}) {
  return (
    <Paper variant="outlined" sx={{ p: 2.5 }}>
      <Typography variant="overline" color="text.secondary" sx={{ display: "block", mb: 1.5 }}>
        At a glance
      </Typography>
      <Grid container columnSpacing={3} rowSpacing={1.25}>
        <FlagCell>
          <FlagRow
            label="504 Plan"
            on={student.has_504}
            onToggle={(v) => onPatch({ has_504: v })}
          />
        </FlagCell>
        <FlagCell>
          <FlagRow
            label="ADHD / ADD"
            on={student.has_adhd}
            onToggle={(v) => onPatch({ has_adhd: v })}
          />
        </FlagCell>
        <FlagCell>
          <FlagRow
            label="IEP"
            on={student.has_iep}
            onToggle={(v) => onPatch({ has_iep: v })}
          />
        </FlagCell>
        <FlagCell>
          <FlagRow
            label="Intellectual disability"
            on={student.has_intellectual_disability}
            onToggle={(v) => onPatch({ has_intellectual_disability: v })}
            notes={student.intellectual_disability_notes}
            onNotes={(v) => onPatch({ intellectual_disability_notes: v })}
          />
        </FlagCell>
        <FlagCell>
          <FlagRow
            label="Learning disability"
            on={student.has_learning_disability}
            onToggle={(v) => onPatch({ has_learning_disability: v })}
            notes={student.learning_disability_notes}
            onNotes={(v) => onPatch({ learning_disability_notes: v })}
          />
        </FlagCell>
        <FlagCell>
          <FlagRow
            label="Health impairment"
            on={student.has_health_impairment}
            onToggle={(v) => onPatch({ has_health_impairment: v })}
            notes={student.health_impairment_notes}
            onNotes={(v) => onPatch({ health_impairment_notes: v })}
          />
        </FlagCell>
        <FlagCell>
          <AutismRow
            level={student.autism_level}
            onSet={(lvl) => onPatch({ autism_level: lvl })}
          />
        </FlagCell>
        <FlagCell>
          <FlagRow
            label="Emotional disturbance"
            on={student.has_emotional_disturbance}
            onToggle={(v) => onPatch({ has_emotional_disturbance: v })}
            notes={student.emotional_disturbance_notes}
            onNotes={(v) => onPatch({ emotional_disturbance_notes: v })}
          />
        </FlagCell>
        <FlagCell>
          <OtherRow
            text={student.diagnosis_other}
            onSet={(v) => onPatch({ diagnosis_other: v })}
          />
        </FlagCell>
      </Grid>
    </Paper>
  );
}

// One column of the At-A-Glance grid: full width on narrow viewports,
// two-up on sm and above. Keeps chip widths consistent because every
// cell renders the same shape.
function FlagCell({ children }: { children: React.ReactNode }) {
  return (
    <Grid item xs={12} sm={6}>
      {children}
    </Grid>
  );
}

/**
 * The common row: fixed-width Chip on the left toggles the boolean
 * flag; when on AND the flag has associated notes, a truncated snippet
 * appears to the right and opens an edit Popover on click.
 */
function FlagRow({
  label,
  on,
  onToggle,
  notes,
  onNotes,
}: {
  label: string;
  on: boolean;
  onToggle: (v: boolean) => void;
  // Notes-bearing flags pass these; plain-toggle flags omit them.
  notes?: string | null;
  onNotes?: (v: string | null) => void;
}) {
  return (
    <Stack direction="row" spacing={1} alignItems="center" sx={{ minHeight: 36 }}>
      <Chip
        label={label}
        clickable
        onClick={() => onToggle(!on)}
        color={on ? "primary" : "default"}
        variant={on ? "filled" : "outlined"}
        sx={{
          width: CHIP_WIDTH,
          justifyContent: "flex-start",
          // Right-align some "breathing room" for the toggle hint.
          "& .MuiChip-label": { width: "100%" },
        }}
      />
      {on && onNotes && (
        <NotesSnippet
          label={label}
          value={notes ?? ""}
          onSave={(v) => onNotes(v || null)}
        />
      )}
    </Stack>
  );
}

/**
 * Autism is a special case — no boolean column, just `autism_level`
 * (1/2/3 or NULL). Chip click cycles into level 1 if currently null;
 * the snippet shows "Level N" and opens a Popover with a level Select.
 */
function AutismRow({
  level,
  onSet,
}: {
  level: 1 | 2 | 3 | null;
  onSet: (lvl: 1 | 2 | 3 | null) => void;
}) {
  const on = level != null;
  return (
    <Stack direction="row" spacing={1} alignItems="center" sx={{ minHeight: 36 }}>
      <Chip
        label="Autism"
        clickable
        onClick={() => onSet(on ? null : 1)}
        color={on ? "primary" : "default"}
        variant={on ? "filled" : "outlined"}
        sx={{
          width: CHIP_WIDTH,
          justifyContent: "flex-start",
          "& .MuiChip-label": { width: "100%" },
        }}
      />
      {on && (
        <LevelSnippet
          level={level!}
          onSet={(lvl) => onSet(lvl)}
        />
      )}
    </Stack>
  );
}

/**
 * "Other" has no boolean column either — its on-ness is derived from
 * whether `diagnosis_other` has text. Click the chip → popover opens
 * for entry. Saving empty text turns the chip off.
 */
function OtherRow({
  text,
  onSet,
}: {
  text: string | null;
  onSet: (v: string | null) => void;
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const on = !!text;
  return (
    <Stack direction="row" spacing={1} alignItems="center" sx={{ minHeight: 36 }}>
      <Chip
        label="Other"
        clickable
        onClick={(e) => setAnchor(e.currentTarget)}
        color={on ? "primary" : "default"}
        variant={on ? "filled" : "outlined"}
        sx={{
          width: CHIP_WIDTH,
          justifyContent: "flex-start",
          "& .MuiChip-label": { width: "100%" },
        }}
      />
      {on && (
        <SnippetButton
          text={text!}
          onClick={(e) => setAnchor(e.currentTarget)}
        />
      )}
      <NotesPopover
        anchor={anchor}
        title="Other diagnosis"
        initial={text ?? ""}
        placeholder="Describe the diagnosis."
        onClose={() => setAnchor(null)}
        onSave={(v) => {
          onSet(v.trim() || null);
          setAnchor(null);
        }}
      />
    </Stack>
  );
}

/** Notes-flag snippet + popover trigger. */
function NotesSnippet({
  label,
  value,
  onSave,
}: {
  label: string;
  value: string;
  onSave: (v: string) => void;
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  return (
    <>
      <SnippetButton
        text={value || "Add note…"}
        muted={!value}
        onClick={(e) => setAnchor(e.currentTarget)}
      />
      <NotesPopover
        anchor={anchor}
        title={label}
        initial={value}
        placeholder="Brief description, evaluator's note, etc."
        onClose={() => setAnchor(null)}
        onSave={(v) => {
          onSave(v);
          setAnchor(null);
        }}
      />
    </>
  );
}

/** Autism-level snippet + popover trigger. */
function LevelSnippet({
  level,
  onSet,
}: {
  level: 1 | 2 | 3;
  onSet: (lvl: 1 | 2 | 3) => void;
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  return (
    <>
      <SnippetButton
        text={`Level ${level}`}
        onClick={(e) => setAnchor(e.currentTarget)}
      />
      <Popover
        open={!!anchor}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
      >
        <Box sx={{ p: 2, minWidth: 180 }}>
          <Typography variant="overline" color="text.secondary" sx={{ display: "block", mb: 1 }}>
            Autism level
          </Typography>
          <Select
            size="small"
            fullWidth
            value={level}
            onChange={(e) => {
              onSet(Number(e.target.value) as 1 | 2 | 3);
              setAnchor(null);
            }}
          >
            <MenuItem value={1}>Level 1 — requiring support</MenuItem>
            <MenuItem value={2}>Level 2 — substantial support</MenuItem>
            <MenuItem value={3}>Level 3 — very substantial support</MenuItem>
          </Select>
        </Box>
      </Popover>
    </>
  );
}

/** Shared truncated-text button used as the snippet affordance. */
function SnippetButton({
  text,
  muted,
  onClick,
}: {
  text: string;
  muted?: boolean;
  onClick: (e: React.MouseEvent<HTMLElement>) => void;
}) {
  return (
    <Box
      component="button"
      type="button"
      onClick={onClick}
      sx={{
        all: "unset",
        flex: 1,
        minWidth: 0,
        cursor: "pointer",
        fontSize: 13,
        color: muted ? "text.disabled" : "text.secondary",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
        px: 1,
        py: 0.25,
        borderRadius: 1,
        "&:hover": { bgcolor: "action.hover", color: "text.primary" },
        fontStyle: muted ? "italic" : "normal",
      }}
    >
      {text}
    </Box>
  );
}

/** Notes-editing popover for the notes-bearing flags. */
function NotesPopover({
  anchor,
  title,
  initial,
  placeholder,
  onClose,
  onSave,
}: {
  anchor: HTMLElement | null;
  title: string;
  initial: string;
  placeholder: string;
  onClose: () => void;
  onSave: (v: string) => void;
}) {
  const [value, setValue] = useState(initial);
  useEffect(() => {
    if (anchor) setValue(initial);
  }, [anchor, initial]);
  return (
    <Popover
      open={!!anchor}
      anchorEl={anchor}
      onClose={() => {
        // Auto-save on click-away so people don't lose typed notes
        // by missing the Save button.
        if (value !== initial) onSave(value);
        else onClose();
      }}
      anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
    >
      <Box sx={{ p: 2, width: 360 }}>
        <Typography variant="overline" color="text.secondary" sx={{ display: "block", mb: 1 }}>
          {title}
        </Typography>
        <TextField
          autoFocus
          fullWidth
          multiline
          minRows={3}
          maxRows={8}
          placeholder={placeholder}
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <Stack direction="row" spacing={1} justifyContent="flex-end" sx={{ mt: 1.5 }}>
          <Button size="small" onClick={onClose}>
            Cancel
          </Button>
          <Button size="small" variant="contained" onClick={() => onSave(value)}>
            Save
          </Button>
        </Stack>
      </Box>
    </Popover>
  );
}

function NeedsGoalsCard({
  student,
  onPatch,
}: {
  student: StudentDetail;
  onPatch: (body: Record<string, unknown>) => void;
}) {
  return (
    <Paper variant="outlined" sx={{ p: 2.5 }}>
      <Typography variant="overline" color="text.secondary" sx={{ display: "block", mb: 1.5 }}>
        Needs &amp; goals
      </Typography>
      <DebouncedTextField
        initial={student.needs_goals ?? ""}
        placeholder="What is this student working toward? Skills, accommodations, supports, fit factors."
        multiline
        minRows={4}
        onCommit={(v) => onPatch({ needs_goals: v || null })}
      />
    </Paper>
  );
}

/**
 * Text input that holds local state while typing and commits the value
 * on blur. Keeps every keystroke from triggering a PATCH.
 */
function DebouncedTextField({
  initial,
  placeholder,
  multiline,
  minRows,
  onCommit,
}: {
  initial: string;
  placeholder?: string;
  multiline?: boolean;
  minRows?: number;
  onCommit: (v: string) => void;
}) {
  const [value, setValue] = useState(initial);
  useEffect(() => {
    setValue(initial);
  }, [initial]);
  return (
    <TextField
      fullWidth
      size="small"
      placeholder={placeholder}
      multiline={multiline}
      minRows={minRows}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => {
        if (value !== initial) onCommit(value);
      }}
    />
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <Typography variant="caption" color="text.secondary" sx={{ textTransform: "uppercase", letterSpacing: 0.5, alignSelf: "center" }}>
      {children}
    </Typography>
  );
}

function Value({ children }: { children: React.ReactNode }) {
  return <Typography variant="body2">{children}</Typography>;
}
