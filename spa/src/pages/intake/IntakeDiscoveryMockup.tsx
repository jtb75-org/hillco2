import { useState } from "react";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Breadcrumbs,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
  FormControlLabel,
  Grid,
  IconButton,
  Link as MuiLink,
  MenuItem,
  Paper,
  Popover,
  Select,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import CloseIcon from "@mui/icons-material/Close";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { DatePicker } from "@mui/x-date-pickers";
import dayjs from "dayjs";
import { Link as RouterLink } from "react-router-dom";

import { LabeledField } from "../../components/LabeledField";
import { PageHeader } from "../../components/PageHeader";

/**
 * MOCKUP — not wired to any API. Renders the proposed three-card
 * Discovery layout for an intake. Lives at /mockup/intake-discovery
 * so we can iterate on shape before committing to the data model and
 * the real form. Throw away when the live form is built.
 */
export function IntakeDiscoveryMockup() {
  return (
    <Stack spacing={3}>
      <Alert severity="info" variant="outlined">
        <Typography variant="body2">
          <strong>Mockup —</strong> nothing on this page saves. Inputs are
          interactive so the shape is realistic, but the data is dummy and
          throws away on reload. Reachable at <code>/mockup/intake-discovery</code>.
        </Typography>
      </Alert>

      <Breadcrumbs>
        <MuiLink component={RouterLink} to="/intakes" color="inherit" underline="hover">
          Intakes
        </MuiLink>
        <Typography color="text.primary">Ballard family — May 15, 2026</Typography>
      </Breadcrumbs>

      <PageHeader
        title="Ballard family"
        subtitle="Discovery — populates Family + Contacts. No fee."
      />

      <HeaderStrip />

      <FamilyContextCard />

      <StudentDiscoveryCard
        name="Peter Ballard"
        firstName="Peter"
        lastName="Ballard"
        grade="6"
        dobLabel="Aug 30, 2015"
        schoolLabel="Clayton Middle"
        reach={{
          name: "Kevin Ballard",
          email: "kballard@email.test",
          phone: "555-555-5555",
        }}
        flags={{
          has_504: false,
          has_iep: true,
          has_learning_disability: true,
          learning_disability_notes:
            "Written-output disorder; school grants extended time on essays.",
          has_adhd: true,
          autism_level: 1,
          has_intellectual_disability: false,
          has_health_impairment: false,
          has_emotional_disturbance: false,
          intellectual_disability_notes: null,
          health_impairment_notes: null,
          emotional_disturbance_notes: null,
          diagnosis_other: null,
        }}
      />
      <StudentDiscoveryCard
        name="Anna Ballard"
        firstName="Anna"
        lastName="Ballard"
        grade="9"
        dobLabel="Mar 4, 2011"
        schoolLabel="Crossroads High"
        reach={{
          name: "Lisa Ballard",
          email: "lballard@email.test",
          phone: "555-555-5522",
        }}
        flags={{
          has_504: true,
          has_iep: false,
          has_learning_disability: false,
          learning_disability_notes: null,
          has_adhd: false,
          autism_level: null,
          has_intellectual_disability: false,
          has_health_impairment: false,
          has_emotional_disturbance: false,
          intellectual_disability_notes: null,
          health_impairment_notes: null,
          emotional_disturbance_notes: null,
          diagnosis_other: null,
        }}
      />

      <FitOutcomeCard />

      <NotesCard />
    </Stack>
  );
}

// ---- Header -----------------------------------------------------------------

function HeaderStrip() {
  return (
    <Paper variant="outlined" sx={{ p: 2.5 }}>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems="flex-start">
        <Box sx={{ flex: 1 }}>
          <LabeledField label="Intake date">
            <DatePicker
              value={dayjs("2026-05-15")}
              onChange={() => undefined}
              slotProps={{ textField: { size: "small", fullWidth: true } }}
            />
          </LabeledField>
        </Box>
        <Box sx={{ flex: 1 }}>
          <LabeledField label="Referral source">
            <Select size="small" fullWidth defaultValue="word_of_mouth">
              <MenuItem value="word_of_mouth">Word of mouth — friend / family</MenuItem>
              <MenuItem value="pediatrician">Pediatrician</MenuItem>
              <MenuItem value="therapist">Therapist / psychologist</MenuItem>
              <MenuItem value="school">School counselor</MenuItem>
              <MenuItem value="search">Google / web search</MenuItem>
              <MenuItem value="returning">Returning client</MenuItem>
              <MenuItem value="other">Other</MenuItem>
            </Select>
          </LabeledField>
        </Box>
        <Box sx={{ flex: 1 }}>
          <LabeledField label="Status">
            <Stack direction="row" spacing={1} alignItems="center" sx={{ pt: 0.5 }}>
              <Chip size="small" label="In progress" color="primary" />
              <Button size="small" variant="text">
                Mark complete
              </Button>
            </Stack>
          </LabeledField>
        </Box>
      </Stack>
    </Paper>
  );
}

// ---- Card 1: Family Context -------------------------------------------------

function FamilyContextCard() {
  const [constraints, setConstraints] = useState<string[]>([
    "Within 30 min drive",
    "Tuition under $40k",
  ]);
  return (
    <Card variant="outlined">
      <CardContent>
        <SectionHeader title="Family context" hint="Who, why, and the constraints." />

        <Box sx={{ mb: 2 }}>
          <DecisionMakersAccordion />
        </Box>

        <Grid container spacing={2}>
          <Grid item xs={12} md={6}>
            <LabeledField label="Desired outcome (in parents' words)">
              <TextField
                multiline
                minRows={3}
                fullWidth
                defaultValue="A school where Peter feels seen and gets the social-emotional structure he's missing. Anna wants more rigor."
              />
            </LabeledField>
          </Grid>
          <Grid item xs={12} md={6}>
            <LabeledField label="Constraints (commute, budget, schedule)">
              <ChipInput
                value={constraints}
                onChange={setConstraints}
                placeholder="Add a constraint…"
              />
            </LabeledField>
          </Grid>

          <Grid item xs={12}>
            <Divider sx={{ my: 1 }} />
            <Stack
              direction={{ xs: "column", sm: "row" }}
              spacing={2}
              alignItems={{ sm: "center" }}
              justifyContent="space-between"
            >
              <Box>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  Consent to retain education + health information
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Verbal consent obtained at start of meeting; signed release to follow.
                </Typography>
              </Box>
              <FormControlLabel
                control={<Switch defaultChecked />}
                label="Granted"
              />
            </Stack>
          </Grid>

          <Grid item xs={12}>
            <LabeledField label="Additional family notes">
              <TextField
                multiline
                minRows={2}
                fullWidth
                placeholder="Free-form context that doesn't fit above."
                defaultValue=""
              />
            </LabeledField>
          </Grid>
        </Grid>
      </CardContent>
    </Card>
  );
}

interface DecisionMaker {
  id: string;
  name: string;
  relation: string;
}

function DecisionMakersAccordion() {
  const [people, setPeople] = useState<DecisionMaker[]>([
    { id: "1", name: "Kevin Ballard", relation: "Dad" },
    { id: "2", name: "Lisa Ballard", relation: "Mom" },
  ]);
  return (
    <Accordion variant="outlined" disableGutters defaultExpanded>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ width: "100%" }}>
          <Typography variant="overline" color="text.secondary" sx={{ flex: 1 }}>
            Decision-makers
            <Box component="span" sx={{ ml: 1, color: "text.disabled", fontWeight: 400 }}>
              ({people.length})
            </Box>
          </Typography>
          <Box
            role="button"
            onClick={(e) => {
              e.stopPropagation();
            }}
            sx={{
              display: "inline-flex",
              alignItems: "center",
              gap: 0.5,
              fontSize: 13,
              color: "primary.main",
              cursor: "pointer",
              px: 1,
              py: 0.25,
              borderRadius: 1,
              "&:hover": { bgcolor: "action.hover" },
            }}
          >
            <AddIcon fontSize="small" />
            Add decision-maker
          </Box>
        </Stack>
      </AccordionSummary>
      <AccordionDetails>
        <Stack direction="row" useFlexGap flexWrap="wrap" sx={{ gap: 2 }}>
          {people.map((p) => (
            <Box key={p.id} sx={{ flex: "1 1 260px", maxWidth: 360 }}>
              <DecisionMakerCard
                person={p}
                onRemove={() => setPeople(people.filter((x) => x.id !== p.id))}
              />
            </Box>
          ))}
        </Stack>
      </AccordionDetails>
    </Accordion>
  );
}

function DecisionMakerCard({
  person,
  onRemove,
}: {
  person: DecisionMaker;
  onRemove: () => void;
}) {
  return (
    <Card
      variant="outlined"
      sx={{
        height: "100%",
        position: "relative",
        transition: (t) => t.transitions.create(["border-color", "background-color"]),
        "&:hover": { borderColor: "primary.light", bgcolor: "action.hover" },
      }}
    >
      <IconButton
        size="small"
        aria-label="Remove decision-maker"
        onClick={onRemove}
        sx={{
          position: "absolute",
          top: 4,
          right: 4,
          zIndex: 1,
          color: "text.disabled",
          "&:hover": { color: "error.main" },
        }}
      >
        <CloseIcon fontSize="small" />
      </IconButton>
      <CardContent>
        <Typography variant="subtitle1" sx={{ fontWeight: 600, pr: 4 }}>
          {person.name}
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
          {person.relation}
        </Typography>
      </CardContent>
    </Card>
  );
}

// ---- Card 2: Student Discovery (per student) --------------------------------

// Mock-only flag state shape — mirrors the live StudentEditorData
// shape for the at-a-glance + needs/goals panels, minus IDs and the
// fields the mockup doesn't display.
interface StudentFlagState {
  has_504: boolean;
  has_iep: boolean;
  has_learning_disability: boolean;
  learning_disability_notes: string | null;
  has_adhd: boolean;
  autism_level: 1 | 2 | 3 | null;
  has_intellectual_disability: boolean;
  has_health_impairment: boolean;
  has_emotional_disturbance: boolean;
  intellectual_disability_notes: string | null;
  health_impairment_notes: string | null;
  emotional_disturbance_notes: string | null;
  diagnosis_other: string | null;
}

/** Static replica of the StudentDrawer/StudentEditor surface, wrapped
 *  in an accordion so the consultant can twirl it open during the
 *  meeting to update demographics + flags without losing the
 *  discovery prompts below. Not wired to the API — the real version
 *  will reuse <StudentEditor>. */
function StudentEditorAccordion({
  firstName,
  lastName,
  grade,
  dobLabel,
  schoolLabel,
  reach,
  flags,
}: {
  firstName: string;
  lastName: string;
  grade: string;
  dobLabel: string;
  schoolLabel: string;
  reach: { name: string; email: string; phone: string };
  flags: StudentFlagState;
}) {
  return (
    <Accordion variant="outlined" disableGutters>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Typography variant="overline" color="text.secondary">
          Edit student details
          <Box component="span" sx={{ ml: 1, color: "text.disabled", fontWeight: 400 }}>
            (name, DOB, school, at-a-glance)
          </Box>
        </Typography>
      </AccordionSummary>
      <AccordionDetails>
        <Stack spacing={2}>
          <MockHeaderStrip
            firstName={firstName}
            lastName={lastName}
            grade={grade}
            dobLabel={dobLabel}
            schoolLabel={schoolLabel}
            reach={reach}
          />
          <MockAtAGlance flags={flags} />
        </Stack>
      </AccordionDetails>
    </Accordion>
  );
}

function MockHeaderStrip({
  firstName,
  lastName,
  grade,
  dobLabel,
  schoolLabel,
  reach,
}: {
  firstName: string;
  lastName: string;
  grade: string;
  dobLabel: string;
  schoolLabel: string;
  reach: { name: string; email: string; phone: string };
}) {
  return (
    <Paper variant="outlined" sx={{ p: 2.5 }}>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
        <Box sx={{ flex: 1 }}>
          <LabeledField label="First name" required>
            <TextField fullWidth size="small" defaultValue={firstName} />
          </LabeledField>
        </Box>
        <Box sx={{ flex: 1 }}>
          <LabeledField label="Last name" required>
            <TextField fullWidth size="small" defaultValue={lastName} />
          </LabeledField>
        </Box>
        <Box sx={{ width: { xs: "100%", sm: 140 } }}>
          <LabeledField label="Grade">
            <TextField fullWidth size="small" defaultValue={grade} />
          </LabeledField>
        </Box>
      </Stack>
      <Box
        sx={{
          mt: 2,
          display: "grid",
          gridTemplateColumns: "auto 1fr auto 1fr",
          columnGap: 2,
          rowGap: 1,
        }}
      >
        <SmallLabel>DOB</SmallLabel>
        <SmallValue>{dobLabel}</SmallValue>
        <SmallLabel>School</SmallLabel>
        <SmallValue>{schoolLabel}</SmallValue>
        <SmallLabel>Reach</SmallLabel>
        <Box sx={{ gridColumn: "2 / 5" }}>
          <Stack direction="row" spacing={2} flexWrap="wrap" alignItems="baseline">
            <Typography variant="body2">{reach.name}</Typography>
            <Typography variant="body2" color="text.secondary">
              {reach.email}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {reach.phone}
            </Typography>
          </Stack>
        </Box>
      </Box>
    </Paper>
  );
}

const CHIP_WIDTH = 200;

function MockAtAGlance({ flags }: { flags: StudentFlagState }) {
  // Local state so toggles work without touching real data.
  const [state, setState] = useState(flags);
  const set = <K extends keyof StudentFlagState>(key: K, value: StudentFlagState[K]) =>
    setState((s) => ({ ...s, [key]: value }));
  return (
    <Paper variant="outlined" sx={{ p: 2.5 }}>
      <Typography
        variant="overline"
        color="text.secondary"
        sx={{ display: "block", mb: 1.5 }}
      >
        At a glance
      </Typography>
      <Grid container columnSpacing={3} rowSpacing={1.25}>
        <FlagCell>
          <FlagRow
            label="504 Plan"
            on={state.has_504}
            onToggle={(v) => set("has_504", v)}
          />
        </FlagCell>
        <FlagCell>
          <FlagRow
            label="ADHD / ADD"
            on={state.has_adhd}
            onToggle={(v) => set("has_adhd", v)}
          />
        </FlagCell>
        <FlagCell>
          <FlagRow
            label="IEP"
            on={state.has_iep}
            onToggle={(v) => set("has_iep", v)}
          />
        </FlagCell>
        <FlagCell>
          <FlagRow
            label="Intellectual disability"
            on={state.has_intellectual_disability}
            onToggle={(v) => set("has_intellectual_disability", v)}
            notes={state.intellectual_disability_notes}
            onNotes={(v) => set("intellectual_disability_notes", v)}
          />
        </FlagCell>
        <FlagCell>
          <FlagRow
            label="Learning disability"
            on={state.has_learning_disability}
            onToggle={(v) => set("has_learning_disability", v)}
            notes={state.learning_disability_notes}
            onNotes={(v) => set("learning_disability_notes", v)}
          />
        </FlagCell>
        <FlagCell>
          <FlagRow
            label="Health impairment"
            on={state.has_health_impairment}
            onToggle={(v) => set("has_health_impairment", v)}
            notes={state.health_impairment_notes}
            onNotes={(v) => set("health_impairment_notes", v)}
          />
        </FlagCell>
        <FlagCell>
          <AutismRow
            level={state.autism_level}
            onSet={(lvl) => set("autism_level", lvl)}
          />
        </FlagCell>
        <FlagCell>
          <FlagRow
            label="Emotional disturbance"
            on={state.has_emotional_disturbance}
            onToggle={(v) => set("has_emotional_disturbance", v)}
            notes={state.emotional_disturbance_notes}
            onNotes={(v) => set("emotional_disturbance_notes", v)}
          />
        </FlagCell>
        <FlagCell>
          <OtherRow
            text={state.diagnosis_other}
            onSet={(v) => set("diagnosis_other", v)}
          />
        </FlagCell>
      </Grid>
    </Paper>
  );
}

function FlagCell({ children }: { children: React.ReactNode }) {
  return (
    <Grid item xs={12} sm={6}>
      {children}
    </Grid>
  );
}

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
        <SnippetButton
          text={`Level ${level}`}
          onClick={() => onSet(level === 3 ? 1 : ((level! + 1) as 1 | 2 | 3))}
        />
      )}
    </Stack>
  );
}

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
        <SnippetButton text={text!} onClick={(e) => setAnchor(e.currentTarget)} />
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
  return (
    <Popover
      open={!!anchor}
      anchorEl={anchor}
      onClose={onClose}
      anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
    >
      <Box sx={{ p: 2, width: 360 }}>
        <Typography
          variant="overline"
          color="text.secondary"
          sx={{ display: "block", mb: 1 }}
        >
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

function SmallLabel({ children }: { children: React.ReactNode }) {
  return (
    <Typography
      variant="caption"
      color="text.secondary"
      sx={{
        textTransform: "uppercase",
        letterSpacing: 0.5,
        alignSelf: "center",
      }}
    >
      {children}
    </Typography>
  );
}

function SmallValue({ children }: { children: React.ReactNode }) {
  return <Typography variant="body2">{children}</Typography>;
}

function StudentDiscoveryCard({
  name,
  firstName,
  lastName,
  grade,
  dobLabel,
  schoolLabel,
  reach,
  flags,
}: {
  name: string;
  firstName: string;
  lastName: string;
  grade: string;
  dobLabel: string;
  schoolLabel: string;
  reach: { name: string; email: string; phone: string };
  flags: StudentFlagState;
}) {
  return (
    <Card variant="outlined">
      <CardContent>
        <Stack
          direction="row"
          spacing={2}
          alignItems="baseline"
          sx={{ mb: 1.5, flexWrap: "wrap" }}
        >
          <Typography variant="overline" color="text.secondary">
            Student discovery
          </Typography>
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            {name}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Grade {grade} · DOB {dobLabel}
          </Typography>
        </Stack>

        <Box sx={{ mb: 2 }}>
          <StudentEditorAccordion
            firstName={firstName}
            lastName={lastName}
            grade={grade}
            dobLabel={dobLabel}
            schoolLabel={schoolLabel}
            reach={reach}
            flags={flags}
          />
        </Box>

        <Grid container spacing={2}>
          <Grid item xs={12} md={6}>
            <LabeledField label="What's working">
              <TextField
                multiline
                minRows={3}
                fullWidth
                placeholder="Current supports, classes, relationships, routines that are landing."
              />
            </LabeledField>
          </Grid>
          <Grid item xs={12} md={6}>
            <LabeledField label="What's not working">
              <TextField
                multiline
                minRows={3}
                fullWidth
                placeholder="Friction points, gaps, recent regressions, accommodations being denied."
              />
            </LabeledField>
          </Grid>

          <Grid item xs={12}>
            <LabeledField label="History / timeline">
              <TextField
                multiline
                minRows={3}
                fullWidth
                placeholder="School history, evaluations, diagnoses, prior placements — chronological if possible."
              />
            </LabeledField>
          </Grid>

          <Grid item xs={12} md={6}>
            <LabeledField label="School-fit concerns">
              <TextField
                multiline
                minRows={2}
                fullWidth
                placeholder="What's their current school not delivering? Class size? Curriculum? Peer group?"
              />
            </LabeledField>
          </Grid>
          <Grid item xs={12} md={6}>
            <LabeledField label="Supports tried">
              <TextField
                multiline
                minRows={2}
                fullWidth
                placeholder="Tutors, therapists, accommodations, programs — what worked, what didn't."
              />
            </LabeledField>
          </Grid>

          <Grid item xs={12}>
            <Divider />
          </Grid>

          <Grid item xs={12}>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
              Mentioned during discovery — promote to real records later
            </Typography>
            <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ gap: 0.5 }}>
              <Chip label="Dr. Hoffman — neuropsych" variant="outlined" />
              <Chip label="Clayton HS — considered" variant="outlined" />
              <Chip label="Wyman Center — summer camp" variant="outlined" />
              <Chip label="+ Add mention" variant="outlined" color="primary" />
            </Stack>
          </Grid>
        </Grid>
      </CardContent>
    </Card>
  );
}

// ---- Card 3: Fit, Outcome & Next Steps --------------------------------------

function FitOutcomeCard() {
  return (
    <Card variant="outlined">
      <CardContent>
        <SectionHeader
          title="Fit, outcome & next steps"
          hint="The decision point at the end of intake."
        />

        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
          Per-student candidacy
        </Typography>
        <Stack spacing={1.5} sx={{ mb: 2 }}>
          <StudentCandidacyRow name="Peter Ballard" />
          <StudentCandidacyRow name="Anna Ballard" />
        </Stack>

        <Divider sx={{ mb: 2 }} />

        <Grid container spacing={2}>
          <Grid item xs={12} md={6}>
            <LabeledField label="Intake outcome">
              <Select size="small" fullWidth defaultValue="converting">
                <MenuItem value="converting">Converting to engagement</MenuItem>
                <MenuItem value="nurture">Nurture / follow up later</MenuItem>
                <MenuItem value="declined_by_family">Declined — family passed</MenuItem>
                <MenuItem value="declined_by_hillco">Declined — not a fit (HillCo)</MenuItem>
                <MenuItem value="no_response">No response after intake</MenuItem>
                <MenuItem value="duplicate">Duplicate / test record</MenuItem>
              </Select>
            </LabeledField>
          </Grid>
          <Grid item xs={12} md={6}>
            <LabeledField label="Disposition reason / context">
              <TextField
                multiline
                minRows={2}
                fullWidth
                placeholder="Free text — useful for declined / nurture outcomes."
              />
            </LabeledField>
          </Grid>

          <Grid item xs={12} md={4}>
            <LabeledField label="Next step owner">
              <Select size="small" fullWidth defaultValue="consultant">
                <MenuItem value="consultant">Consultant (us)</MenuItem>
                <MenuItem value="family">Family</MenuItem>
                <MenuItem value="awaiting_records">Awaiting external records</MenuItem>
              </Select>
            </LabeledField>
          </Grid>
          <Grid item xs={12} md={4}>
            <LabeledField label="Next step due">
              <DatePicker
                value={dayjs("2026-05-22")}
                onChange={() => undefined}
                slotProps={{ textField: { size: "small", fullWidth: true } }}
              />
            </LabeledField>
          </Grid>
          <Grid item xs={12} md={4}>
            <LabeledField label="Blocker (if any)">
              <TextField
                size="small"
                fullWidth
                placeholder="e.g. waiting on IEP from Clayton"
              />
            </LabeledField>
          </Grid>

          <Grid item xs={12}>
            <Stack
              direction="row"
              spacing={1.5}
              justifyContent="flex-end"
              sx={{ mt: 1 }}
            >
              <Button variant="outlined">Save outcome</Button>
              <Button variant="contained">Convert to engagement →</Button>
            </Stack>
          </Grid>
        </Grid>
      </CardContent>
    </Card>
  );
}

function StudentCandidacyRow({ name }: { name: string }) {
  const [candidate, setCandidate] = useState(true);
  return (
    <Stack
      direction={{ xs: "column", sm: "row" }}
      spacing={2}
      alignItems={{ sm: "center" }}
      sx={{
        p: 1.5,
        border: 1,
        borderColor: "divider",
        borderRadius: 1,
        bgcolor: candidate ? "action.hover" : "transparent",
      }}
    >
      <FormControlLabel
        control={
          <Switch
            checked={candidate}
            onChange={(e) => setCandidate(e.target.checked)}
          />
        }
        label={
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {name}
          </Typography>
        }
        sx={{ minWidth: 240 }}
      />
      <Box sx={{ flex: 1 }}>
        <LabeledField label="Recommended engagement type">
          <Select
            size="small"
            fullWidth
            defaultValue="placement"
            disabled={!candidate}
          >
            <MenuItem value="placement">School placement search</MenuItem>
            <MenuItem value="iep_support">IEP / 504 advocacy</MenuItem>
            <MenuItem value="evaluation_coordination">Evaluation coordination</MenuItem>
            <MenuItem value="transition_planning">Transition planning</MenuItem>
          </Select>
        </LabeledField>
      </Box>
    </Stack>
  );
}

// ---- Notes (kept) -----------------------------------------------------------

function NotesCard() {
  return (
    <Card variant="outlined">
      <CardContent>
        <SectionHeader
          title="Intake notes"
          hint="Free-form narrative, quotes, judgment. Kept as-is from today's form."
        />
        <TextField
          multiline
          minRows={6}
          fullWidth
          placeholder="Anything the structured prompts missed. Direct quotes are helpful here."
        />
      </CardContent>
    </Card>
  );
}

// ---- Shared helpers ---------------------------------------------------------

function SectionHeader({ title, hint }: { title: string; hint?: string }) {
  return (
    <Stack spacing={0.25} sx={{ mb: 2 }}>
      <Typography variant="h6" sx={{ fontWeight: 600 }}>
        {title}
      </Typography>
      {hint && (
        <Typography variant="caption" color="text.secondary">
          {hint}
        </Typography>
      )}
    </Stack>
  );
}

/**
 * Lightweight Autocomplete-style chip input — kept inline instead of
 * pulling MUI Autocomplete to keep the mockup small. Press Enter to
 * commit, click × to remove. */
function ChipInput({
  value,
  onChange,
  placeholder,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState("");
  return (
    <Box
      sx={{
        border: 1,
        borderColor: "divider",
        borderRadius: 1,
        p: 0.75,
        display: "flex",
        flexWrap: "wrap",
        gap: 0.5,
        minHeight: 40,
      }}
    >
      {value.map((v) => (
        <Chip
          key={v}
          label={v}
          size="small"
          onDelete={() => onChange(value.filter((x) => x !== v))}
        />
      ))}
      <TextField
        variant="standard"
        InputProps={{ disableUnderline: true }}
        size="small"
        placeholder={placeholder}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && draft.trim()) {
            e.preventDefault();
            onChange([...value, draft.trim()]);
            setDraft("");
          }
        }}
        sx={{ flex: 1, minWidth: 120, ml: 0.5 }}
      />
    </Box>
  );
}
