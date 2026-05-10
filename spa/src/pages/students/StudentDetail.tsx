import { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Breadcrumbs,
  Chip,
  CircularProgress,
  Link as MuiLink,
  MenuItem,
  Paper,
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

// Flag rows on the At-A-Glance card. The shape lets the renderer
// decide whether a conditional input shows under the chip, and which
// column on the student record it binds to.
type FlagKey =
  | "has_504"
  | "has_iep"
  | "has_learning_disability"
  | "has_adhd"
  | "has_intellectual_disability"
  | "has_health_impairment"
  | "has_emotional_disturbance";

interface FlagRow {
  key: FlagKey;
  label: string;
  notesKey?: keyof StudentDetail; // null = no conditional notes
}

const FLAGS: FlagRow[] = [
  { key: "has_504", label: "504 Plan" },
  { key: "has_iep", label: "IEP" },
  { key: "has_learning_disability", label: "Learning disability", notesKey: "learning_disability_notes" },
  // Autism handled separately — it carries an integer level, not text.
  { key: "has_adhd", label: "ADHD / ADD" },
  { key: "has_intellectual_disability", label: "Intellectual disability", notesKey: "intellectual_disability_notes" },
  { key: "has_health_impairment", label: "Health impairment", notesKey: "health_impairment_notes" },
  { key: "has_emotional_disturbance", label: "Emotional disturbance", notesKey: "emotional_disturbance_notes" },
];

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
      <Stack spacing={1.5}>
        {/* The plain flags come first, autism is interleaved at its
            original PDF position (after learning disability). */}
        <FlagControl
          flag={FLAGS[0]}
          on={student.has_504}
          notes={null}
          onToggle={(v) => onPatch({ has_504: v })}
          onNotes={() => {}}
        />
        <FlagControl
          flag={FLAGS[1]}
          on={student.has_iep}
          notes={null}
          onToggle={(v) => onPatch({ has_iep: v })}
          onNotes={() => {}}
        />
        <FlagControl
          flag={FLAGS[2]}
          on={student.has_learning_disability}
          notes={student.learning_disability_notes}
          onToggle={(v) => onPatch({ has_learning_disability: v })}
          onNotes={(v) => onPatch({ learning_disability_notes: v })}
        />
        <AutismControl
          on={student.autism_level != null}
          level={student.autism_level}
          onToggle={(v) =>
            onPatch(v ? { autism_level: 1 } : { autism_level: null })
          }
          onLevel={(lvl) => onPatch({ autism_level: lvl })}
        />
        <FlagControl
          flag={FLAGS[3]}
          on={student.has_adhd}
          notes={null}
          onToggle={(v) => onPatch({ has_adhd: v })}
          onNotes={() => {}}
        />
        <FlagControl
          flag={FLAGS[4]}
          on={student.has_intellectual_disability}
          notes={student.intellectual_disability_notes}
          onToggle={(v) => onPatch({ has_intellectual_disability: v })}
          onNotes={(v) => onPatch({ intellectual_disability_notes: v })}
        />
        <FlagControl
          flag={FLAGS[5]}
          on={student.has_health_impairment}
          notes={student.health_impairment_notes}
          onToggle={(v) => onPatch({ has_health_impairment: v })}
          onNotes={(v) => onPatch({ health_impairment_notes: v })}
        />
        <FlagControl
          flag={FLAGS[6]}
          on={student.has_emotional_disturbance}
          notes={student.emotional_disturbance_notes}
          onToggle={(v) => onPatch({ has_emotional_disturbance: v })}
          onNotes={(v) => onPatch({ emotional_disturbance_notes: v })}
        />
        <OtherControl
          on={!!student.diagnosis_other}
          notes={student.diagnosis_other}
          onToggle={(v) =>
            onPatch(v ? { diagnosis_other: "(describe)" } : { diagnosis_other: null })
          }
          onNotes={(v) => onPatch({ diagnosis_other: v })}
        />
      </Stack>
    </Paper>
  );
}

function FlagControl({
  flag,
  on,
  notes,
  onToggle,
  onNotes,
}: {
  flag: FlagRow;
  on: boolean;
  notes: string | null;
  onToggle: (v: boolean) => void;
  onNotes: (v: string | null) => void;
}) {
  return (
    <Box>
      <Chip
        label={flag.label}
        clickable
        onClick={() => onToggle(!on)}
        color={on ? "primary" : "default"}
        variant={on ? "filled" : "outlined"}
        sx={{ fontWeight: 500 }}
      />
      {on && flag.notesKey && (
        <Box sx={{ mt: 0.75, ml: 2 }}>
          <DebouncedTextField
            initial={notes ?? ""}
            placeholder="Brief description, evaluator's note, etc."
            onCommit={(v) => onNotes(v || null)}
          />
        </Box>
      )}
    </Box>
  );
}

function AutismControl({
  on,
  level,
  onToggle,
  onLevel,
}: {
  on: boolean;
  level: 1 | 2 | 3 | null;
  onToggle: (v: boolean) => void;
  onLevel: (lvl: 1 | 2 | 3) => void;
}) {
  return (
    <Stack direction="row" spacing={1.5} alignItems="center">
      <Chip
        label="Autism"
        clickable
        onClick={() => onToggle(!on)}
        color={on ? "primary" : "default"}
        variant={on ? "filled" : "outlined"}
        sx={{ fontWeight: 500 }}
      />
      {on && (
        <Select
          size="small"
          value={level ?? 1}
          onChange={(e) => onLevel(Number(e.target.value) as 1 | 2 | 3)}
          sx={{ minWidth: 110 }}
        >
          <MenuItem value={1}>Level 1</MenuItem>
          <MenuItem value={2}>Level 2</MenuItem>
          <MenuItem value={3}>Level 3</MenuItem>
        </Select>
      )}
    </Stack>
  );
}

function OtherControl({
  on,
  notes,
  onToggle,
  onNotes,
}: {
  on: boolean;
  notes: string | null;
  onToggle: (v: boolean) => void;
  onNotes: (v: string | null) => void;
}) {
  return (
    <Box>
      <Chip
        label="Other"
        clickable
        onClick={() => onToggle(!on)}
        color={on ? "primary" : "default"}
        variant={on ? "filled" : "outlined"}
        sx={{ fontWeight: 500 }}
      />
      {on && (
        <Box sx={{ mt: 0.75, ml: 2 }}>
          <DebouncedTextField
            initial={notes ?? ""}
            placeholder="Describe the diagnosis."
            onCommit={(v) => onNotes(v || null)}
          />
        </Box>
      )}
    </Box>
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
