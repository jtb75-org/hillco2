import { useState } from "react";
import {
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
  Link as MuiLink,
  MenuItem,
  Paper,
  Select,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
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
        grade="6"
        dobLabel="Aug 30, 2015"
      />
      <StudentDiscoveryCard
        name="Anna Ballard"
        grade="9"
        dobLabel="Mar 4, 2011"
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
          <LabeledField label="Consultant">
            <TextField size="small" fullWidth defaultValue="Joe Buhr" />
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
  const [decisionMakers, setDecisionMakers] = useState<string[]>(["Kevin", "Lisa"]);
  const [constraints, setConstraints] = useState<string[]>([
    "Within 30 min drive",
    "Tuition under $40k",
  ]);
  return (
    <Card variant="outlined">
      <CardContent>
        <SectionHeader title="Family context" hint="Who, why, and the constraints." />
        <Grid container spacing={2}>
          <Grid item xs={12} md={6}>
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
          </Grid>
          <Grid item xs={12} md={6}>
            <LabeledField label="First contact">
              <DatePicker
                value={dayjs("2026-05-08")}
                onChange={() => undefined}
                slotProps={{ textField: { size: "small", fullWidth: true } }}
              />
            </LabeledField>
          </Grid>

          <Grid item xs={12}>
            <LabeledField label="Decision-makers in the household">
              <ChipInput
                value={decisionMakers}
                onChange={setDecisionMakers}
                placeholder="Add a name…"
              />
            </LabeledField>
          </Grid>

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

// ---- Card 2: Student Discovery (per student) --------------------------------

function StudentDiscoveryCard({
  name,
  grade,
  dobLabel,
}: {
  name: string;
  grade: string;
  dobLabel: string;
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
          <Box sx={{ flex: 1 }} />
          <Button size="small" variant="text">
            Open full editor
          </Button>
        </Stack>

        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
          Diagnosis flags + needs/goals live on the student record (kept as-is). These prompts
          are the meeting-time discovery layer.
        </Typography>

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
