import { useMemo, useState } from "react";
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
  Grid,
  IconButton,
  Link as MuiLink,
  Menu,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import AttachFileIcon from "@mui/icons-material/AttachFile";
import BlockIcon from "@mui/icons-material/Block";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import CloseIcon from "@mui/icons-material/Close";
import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import FileDownloadOutlinedIcon from "@mui/icons-material/FileDownloadOutlined";
import FileUploadOutlinedIcon from "@mui/icons-material/FileUploadOutlined";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import RadioButtonUncheckedIcon from "@mui/icons-material/RadioButtonUnchecked";
import SendOutlinedIcon from "@mui/icons-material/SendOutlined";
import { DatePicker } from "@mui/x-date-pickers";
import dayjs from "dayjs";
import { Link as RouterLink } from "react-router-dom";

import { LabeledField } from "../../components/LabeledField";
import { PageHeader } from "../../components/PageHeader";
import { RichTextEditor } from "../../components/RichTextEditor";
import { ghostFieldSx } from "../../components/ghostFieldSx";

/**
 * MOCKUP — not wired to any API. Renders the proposed engagement
 * detail layout for review at /mockup/engagement-detail. Throw away
 * when the live engagement page is built.
 *
 * v2 incorporates vera + halo's review notes:
 *
 *   - Activities are a UI wrapper, not 1:1 with engagement_tasks.
 *     Each activity has a `kind` discriminator. Campus visits are
 *     backed by school_visits; recommendations by
 *     school_recommendations; everything else by engagement_tasks.
 *   - Status enum matches backend: not_started / in_progress /
 *     completed / blocked / not_applicable.
 *   - Catalog-seeded activities get a "Skip" affordance (sets
 *     not_applicable, keeps the row). Bespoke activities can be
 *     hard-deleted.
 *   - Contracts use a 4-state lifecycle: Not started → Draft → Sent
 *     → Signed. The intermediate Sent state matters in a solo
 *     practice — "I made the PDF" and "I emailed it" are different.
 *   - Requirements section added (engagement_requirements).
 *   - Time entries surface billable flag + invoice-locked rows.
 *   - Expenses gain category + receipt upload affordance.
 */
export function EngagementMockup() {
  return (
    <Stack spacing={3}>
      <Alert severity="info" variant="outlined">
        <Typography variant="body2">
          <strong>Mockup —</strong> nothing on this page saves. Reachable at{" "}
          <code>/mockup/engagement-detail</code>.
        </Typography>
      </Alert>

      <Breadcrumbs>
        <MuiLink component={RouterLink} to="/engagements" color="inherit" underline="hover">
          Engagements
        </MuiLink>
        <MuiLink component={RouterLink} to="/families" color="inherit" underline="hover">
          Ballard family
        </MuiLink>
        <Typography color="text.primary">Peter — School placement search</Typography>
      </Breadcrumbs>

      <PageHeader
        title="Peter Ballard — School placement search"
        subtitle="Ballard family · started Apr 28, 2026 · in progress"
      />

      <HeaderStrip />
      <IntakeContextCard />
      <ContractCard />
      <RequirementsCard />
      <ActivitiesCard />
      <TimeEntriesCard />
      <ExpensesCard />
      <NotesCard />
    </Stack>
  );
}

// ---- Header strip -------------------------------------------------------

function HeaderStrip() {
  return (
    <Paper variant="outlined" sx={{ p: 2.5 }}>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems="flex-start">
        <Box sx={{ flex: 1 }}>
          <LabeledField label="Status">
            <TextField select size="small" fullWidth sx={ghostFieldSx} defaultValue="in_progress">
              <MenuItem value="in_progress">In progress</MenuItem>
              <MenuItem value="on_hold">On hold</MenuItem>
              <MenuItem value="completed">Completed</MenuItem>
              <MenuItem value="cancelled">Cancelled</MenuItem>
            </TextField>
          </LabeledField>
        </Box>
        <Box sx={{ flex: 1 }}>
          <LabeledField label="Start date">
            <DatePicker
              value={dayjs("2026-04-28")}
              onChange={() => undefined}
              slotProps={{ textField: { size: "small", fullWidth: true, sx: ghostFieldSx } }}
            />
          </LabeledField>
        </Box>
        <Box sx={{ flex: 1 }}>
          <LabeledField label="Target end">
            <DatePicker
              value={dayjs("2026-09-30")}
              onChange={() => undefined}
              slotProps={{ textField: { size: "small", fullWidth: true, sx: ghostFieldSx } }}
            />
          </LabeledField>
        </Box>
        <Box sx={{ flex: 1 }}>
          <LabeledField label="Lead consultant">
            <TextField size="small" fullWidth sx={ghostFieldSx} defaultValue="Joe Buhr" />
          </LabeledField>
        </Box>
        <Box sx={{ width: { xs: "100%", sm: 130 } }}>
          <LabeledField label="Hourly rate">
            <TextField size="small" fullWidth sx={ghostFieldSx} defaultValue="$150" />
          </LabeledField>
        </Box>
      </Stack>
    </Paper>
  );
}

// ---- Intake context -----------------------------------------------------

function IntakeContextCard() {
  return (
    <Card variant="outlined">
      <CardContent>
        <Stack direction="row" alignItems="baseline" spacing={1.5} sx={{ mb: 1.5 }}>
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            Intake context
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Snapshotted Apr 28, 2026
          </Typography>
          <Box sx={{ flex: 1 }} />
          <MuiLink
            component={RouterLink}
            to="/intakes/abc"
            variant="body2"
            sx={{ display: "inline-flex", alignItems: "center", gap: 0.5 }}
          >
            View full intake <OpenInNewIcon fontSize="inherit" />
          </MuiLink>
        </Stack>
        <Grid container spacing={2}>
          <Grid item xs={12} md={6}>
            <Typography variant="overline" color="text.secondary">
              Desired outcome
            </Typography>
            <Typography variant="body2">
              A school where Peter feels seen and gets the social-emotional
              structure he's missing. Mom emphasized peer-group continuity.
            </Typography>
          </Grid>
          <Grid item xs={12} md={6}>
            <Typography variant="overline" color="text.secondary">
              Constraints
            </Typography>
            <Stack direction="row" spacing={0.5} flexWrap="wrap" sx={{ gap: 0.5, mt: 0.5 }}>
              <Chip size="small" label="Within 30 min drive" variant="outlined" />
              <Chip size="small" label="Tuition under $40k" variant="outlined" />
              <Chip size="small" label="Start fall 2026" variant="outlined" />
            </Stack>
          </Grid>
          <Grid item xs={12} md={6}>
            <Typography variant="overline" color="text.secondary">
              Decision-makers
            </Typography>
            <Stack spacing={0.25} sx={{ mt: 0.5 }}>
              <Typography variant="body2">Kevin Ballard · Dad</Typography>
              <Typography variant="body2">Lisa Ballard · Mom</Typography>
            </Stack>
          </Grid>
          <Grid item xs={12} md={6}>
            <Typography variant="overline" color="text.secondary">
              What's not working (from intake)
            </Typography>
            <Typography
              variant="body2"
              sx={{ fontStyle: "italic", color: "text.secondary" }}
            >
              Lost in unstructured time. Written-output meltdowns 2–3×/week
              despite extended-time accommodation. Peer group has thinned out
              after two close friends moved schools.
            </Typography>
          </Grid>
        </Grid>
      </CardContent>
    </Card>
  );
}

// ---- Contract & releases ------------------------------------------------

type ContractStage = "not_started" | "draft" | "sent" | "signed";

const CONTRACT_STAGE_DISPLAY: Record<
  ContractStage,
  { label: string; color: "default" | "primary" | "warning" | "success" }
> = {
  not_started: { label: "Not started", color: "default" },
  draft: { label: "Draft", color: "primary" },
  sent: { label: "Awaiting signature", color: "warning" },
  signed: { label: "Signed", color: "success" },
};

function ContractCard() {
  return (
    <Card variant="outlined">
      <CardContent>
        <Stack spacing={0.25} sx={{ mb: 2 }}>
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            Contract & releases
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Draft → send to family → upload signed PDF.
          </Typography>
        </Stack>
        <Stack spacing={2}>
          <AgreementRow
            title="Services agreement"
            description="Representative services + contracted hourly rate. Renders from this engagement's catalog activities and rate."
          />
          <AgreementRow
            title="Medical-records release"
            description="Standard release covering the duration of this engagement so the consultant can request school + provider records on the family's behalf."
          />
        </Stack>
      </CardContent>
    </Card>
  );
}

function AgreementRow({ title, description }: { title: string; description: string }) {
  const [stage, setStage] = useState<ContractStage>("not_started");
  const display = CONTRACT_STAGE_DISPLAY[stage];
  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems="flex-start">
        <DescriptionOutlinedIcon sx={{ mt: 0.5, color: "text.secondary" }} />
        <Box sx={{ flex: 1 }}>
          <Stack direction="row" spacing={1} alignItems="baseline">
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
              {title}
            </Typography>
            <Chip
              size="small"
              label={display.label}
              color={display.color}
              variant={stage === "signed" ? "filled" : "outlined"}
            />
          </Stack>
          <Typography variant="body2" color="text.secondary">
            {description}
          </Typography>
        </Box>
        <Stack direction="row" spacing={1} sx={{ flexShrink: 0 }}>
          {stage === "not_started" && (
            <Button
              variant="contained"
              size="small"
              startIcon={<DescriptionOutlinedIcon />}
              onClick={() => setStage("draft")}
            >
              Create draft
            </Button>
          )}
          {stage === "draft" && (
            <>
              <Button
                variant="outlined"
                size="small"
                startIcon={<FileDownloadOutlinedIcon />}
              >
                Download draft
              </Button>
              <Button
                variant="contained"
                size="small"
                startIcon={<SendOutlinedIcon />}
                onClick={() => setStage("sent")}
              >
                Mark sent
              </Button>
            </>
          )}
          {stage === "sent" && (
            <>
              <Button
                variant="text"
                size="small"
                startIcon={<FileDownloadOutlinedIcon />}
              >
                Sent PDF
              </Button>
              <Button
                variant="contained"
                size="small"
                startIcon={<FileUploadOutlinedIcon />}
                onClick={() => setStage("signed")}
              >
                Upload signed
              </Button>
            </>
          )}
          {stage === "signed" && (
            <>
              <Button
                variant="text"
                size="small"
                startIcon={<FileDownloadOutlinedIcon />}
              >
                Signed PDF
              </Button>
              <Button
                size="small"
                color="warning"
                onClick={() => setStage("not_started")}
              >
                Supersede
              </Button>
            </>
          )}
        </Stack>
      </Stack>
    </Paper>
  );
}

// ---- Requirements -------------------------------------------------------

type RequirementStatus = "needed" | "requested" | "received" | "waived";

interface Requirement {
  id: string;
  kind: string;
  status: RequirementStatus;
  notes: string;
}

const REQUIREMENT_KINDS = [
  "IEP / current",
  "504 plan",
  "Psychoeducational report",
  "Recent report cards",
  "Standardized test scores",
  "Pediatrician note",
  "Other",
];

const SEED_REQUIREMENTS: Requirement[] = [
  {
    id: "r1",
    kind: "IEP / current",
    status: "received",
    notes: "PDF in family folder.",
  },
  {
    id: "r2",
    kind: "Psychoeducational report",
    status: "received",
    notes: "Dr. Hoffman, 2024-11-04.",
  },
  {
    id: "r3",
    kind: "Recent report cards",
    status: "requested",
    notes: "Asked mom 5/8. Following up next week.",
  },
];

const REQUIREMENT_STATUS_DISPLAY: Record<
  RequirementStatus,
  { label: string; color: "default" | "primary" | "success" | "warning" }
> = {
  needed: { label: "Needed", color: "warning" },
  requested: { label: "Requested", color: "primary" },
  received: { label: "Received", color: "success" },
  waived: { label: "Waived", color: "default" },
};

function RequirementsCard() {
  const [items, setItems] = useState<Requirement[]>(SEED_REQUIREMENTS);
  const [adding, setAdding] = useState(false);

  const update = (id: string, patch: Partial<Requirement>) =>
    setItems((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const remove = (id: string) =>
    setItems((prev) => prev.filter((r) => r.id !== id));

  return (
    <Card variant="outlined">
      <CardContent>
        <Stack direction="row" alignItems="baseline" spacing={1.5} sx={{ mb: 1.5 }}>
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            Records needed
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {items.filter((r) => r.status === "received").length} of {items.length} received
          </Typography>
          <Box sx={{ flex: 1 }} />
          <Button size="small" startIcon={<AddIcon />} onClick={() => setAdding(true)}>
            Add requirement
          </Button>
        </Stack>
        <Stack
          divider={<Divider flexItem />}
          sx={{ border: 1, borderColor: "divider", borderRadius: 1 }}
        >
          <Stack
            direction="row"
            sx={{ px: 1.5, py: 1, bgcolor: "action.hover", fontSize: 12, color: "text.secondary" }}
          >
            <Box sx={{ flex: 1 }}>KIND</Box>
            <Box sx={{ width: 130 }}>STATUS</Box>
            <Box sx={{ flex: 2 }}>NOTES</Box>
            <Box sx={{ width: 40 }} />
          </Stack>
          {items.map((r) => (
            <Stack
              key={r.id}
              direction="row"
              alignItems="center"
              sx={{ px: 1.5, py: 0.5 }}
            >
              <Box sx={{ flex: 1, pr: 1 }}>
                <TextField
                  size="small"
                  select
                  fullWidth
                  variant="standard"
                  InputProps={{ disableUnderline: true }}
                  value={r.kind}
                  onChange={(e) => update(r.id, { kind: e.target.value })}
                >
                  {REQUIREMENT_KINDS.map((k) => (
                    <MenuItem key={k} value={k}>
                      {k}
                    </MenuItem>
                  ))}
                </TextField>
              </Box>
              <Box sx={{ width: 130 }}>
                <TextField
                  select
                  size="small"
                  variant="standard"
                  InputProps={{ disableUnderline: true }}
                  value={r.status}
                  onChange={(e) => update(r.id, { status: e.target.value as RequirementStatus })}
                  SelectProps={{
                    renderValue: (v) => (
                      <Chip
                        size="small"
                        label={REQUIREMENT_STATUS_DISPLAY[v as RequirementStatus].label}
                        color={REQUIREMENT_STATUS_DISPLAY[v as RequirementStatus].color}
                        variant={r.status === "received" ? "filled" : "outlined"}
                      />
                    ),
                  }}
                >
                  {Object.entries(REQUIREMENT_STATUS_DISPLAY).map(([k, v]) => (
                    <MenuItem key={k} value={k}>
                      {v.label}
                    </MenuItem>
                  ))}
                </TextField>
              </Box>
              <Box sx={{ flex: 2, pr: 1 }}>
                <TextField
                  size="small"
                  fullWidth
                  variant="standard"
                  InputProps={{ disableUnderline: true }}
                  value={r.notes}
                  onChange={(e) => update(r.id, { notes: e.target.value })}
                  placeholder="When asked, who has it, etc."
                />
              </Box>
              <Box sx={{ width: 40, textAlign: "right" }}>
                <IconButton
                  size="small"
                  onClick={() => remove(r.id)}
                  sx={{ color: "text.disabled", "&:hover": { color: "error.main" } }}
                >
                  <CloseIcon fontSize="small" />
                </IconButton>
              </Box>
            </Stack>
          ))}
          {adding && (
            <RequirementAddRow
              onSave={(req) => {
                setItems([...items, { ...req, id: `r${Date.now()}` }]);
                setAdding(false);
              }}
              onCancel={() => setAdding(false)}
            />
          )}
        </Stack>
      </CardContent>
    </Card>
  );
}

function RequirementAddRow({
  onSave,
  onCancel,
}: {
  onSave: (r: Omit<Requirement, "id">) => void;
  onCancel: () => void;
}) {
  const [kind, setKind] = useState(REQUIREMENT_KINDS[0]);
  const [status, setStatus] = useState<RequirementStatus>("needed");
  const [notes, setNotes] = useState("");
  return (
    <Stack
      direction="row"
      alignItems="center"
      sx={{ px: 1.5, py: 1, bgcolor: "action.hover" }}
      spacing={1}
    >
      <Box sx={{ flex: 1 }}>
        <TextField
          select
          size="small"
          fullWidth
          value={kind}
          onChange={(e) => setKind(e.target.value)}
        >
          {REQUIREMENT_KINDS.map((k) => (
            <MenuItem key={k} value={k}>
              {k}
            </MenuItem>
          ))}
        </TextField>
      </Box>
      <Box sx={{ width: 130 }}>
        <TextField
          select
          size="small"
          fullWidth
          value={status}
          onChange={(e) => setStatus(e.target.value as RequirementStatus)}
        >
          {Object.entries(REQUIREMENT_STATUS_DISPLAY).map(([k, v]) => (
            <MenuItem key={k} value={k}>
              {v.label}
            </MenuItem>
          ))}
        </TextField>
      </Box>
      <Box sx={{ flex: 2 }}>
        <TextField
          size="small"
          fullWidth
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Notes"
        />
      </Box>
      <Box sx={{ width: 40 }}>
        <IconButton size="small" onClick={onCancel}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </Box>
      <Button
        size="small"
        variant="contained"
        onClick={() => onSave({ kind, status, notes })}
      >
        Save
      </Button>
    </Stack>
  );
}

// ---- Activities ---------------------------------------------------------

type ActivityStatus =
  | "not_started"
  | "in_progress"
  | "completed"
  | "blocked"
  | "not_applicable";

// kind names mirror the backend table that backs each activity body.
// `task` rows live in engagement_tasks; `school_visit` rows hydrate
// school_visits; `school_recommendation` rows hydrate
// school_recommendations. UI is unified, storage is delegated.
type ActivityKind =
  | "task" // generic engagement_tasks row (default)
  | "document_review" // task with sub-form for educational + medical docs
  | "best_environment" // task with sub-form for the 4 BEE prompts
  | "feedback_meeting" // task with sub-form for recs/admissions/follow-on
  | "school_visit" // backed by school_visits
  | "school_recommendation" // backed by school_recommendations
  | "bespoke"; // engagement_tasks row, free-form

interface Activity {
  id: string;
  name: string;
  kind: ActivityKind;
  status: ActivityStatus;
  fromCatalog: boolean;
  expectedHours: number | null;
  notes: string;
}

const SEED_ACTIVITIES: Activity[] = [
  {
    id: "a1",
    name: "Review of documents",
    kind: "document_review",
    status: "completed",
    fromCatalog: true,
    expectedHours: 2,
    notes: "",
  },
  {
    id: "a2",
    name: "Best educational environment profile",
    kind: "best_environment",
    status: "completed",
    fromCatalog: true,
    expectedHours: 0.5,
    notes: "",
  },
  {
    id: "a3",
    name: "Campus visit — Clayton HS",
    kind: "school_visit",
    status: "completed",
    fromCatalog: true,
    expectedHours: 4.5,
    notes: "",
  },
  {
    id: "a4",
    name: "Campus visit — Crossroads HS",
    kind: "school_visit",
    status: "completed",
    fromCatalog: true,
    expectedHours: 2,
    notes: "",
  },
  {
    id: "a5",
    name: "Recommendation: Clayton HS",
    kind: "school_recommendation",
    status: "in_progress",
    fromCatalog: false,
    expectedHours: null,
    notes: "",
  },
  {
    id: "a6",
    name: "Feedback & next steps meeting",
    kind: "feedback_meeting",
    status: "in_progress",
    fromCatalog: true,
    expectedHours: 1,
    notes: "",
  },
  {
    id: "a7",
    name: "Phone consultation with Dr. Hoffman",
    kind: "bespoke",
    status: "not_started",
    fromCatalog: false,
    expectedHours: null,
    notes: "",
  },
];

const ACTIVITY_STATUS_DISPLAY: Record<
  ActivityStatus,
  { label: string; color: "default" | "primary" | "success" | "warning" | "error" }
> = {
  not_started: { label: "Not started", color: "default" },
  in_progress: { label: "In progress", color: "primary" },
  completed: { label: "Completed", color: "success" },
  blocked: { label: "Blocked", color: "error" },
  not_applicable: { label: "Skipped", color: "default" },
};

function ActivitiesCard() {
  const [activities, setActivities] = useState<Activity[]>(SEED_ACTIVITIES);
  const [addMenuAnchor, setAddMenuAnchor] = useState<HTMLElement | null>(null);

  const updateActivity = (id: string, patch: Partial<Activity>) =>
    setActivities((prev) =>
      prev.map((a) => (a.id === id ? { ...a, ...patch } : a)),
    );

  const removeActivity = (id: string) =>
    setActivities((prev) => prev.filter((a) => a.id !== id));

  const addActivity = (kind: ActivityKind, fromCatalog: boolean) => {
    const defaults: Record<ActivityKind, { name: string; expectedHours: number | null }> = {
      task: { name: "New task", expectedHours: null },
      document_review: { name: "Review of documents", expectedHours: 2 },
      best_environment: { name: "Best educational environment profile", expectedHours: 0.5 },
      feedback_meeting: { name: "Feedback & next steps meeting", expectedHours: 1 },
      school_visit: { name: "Campus visit — ", expectedHours: 4 },
      school_recommendation: { name: "Recommendation: ", expectedHours: null },
      bespoke: { name: "New activity", expectedHours: null },
    };
    setActivities((prev) => [
      ...prev,
      {
        id: `a${Date.now()}`,
        name: defaults[kind].name,
        kind,
        status: "not_started",
        fromCatalog,
        expectedHours: defaults[kind].expectedHours,
        notes: "",
      },
    ]);
  };

  const counts = useMemo(() => {
    const total = activities.filter((a) => a.status !== "not_applicable").length;
    const done = activities.filter((a) => a.status === "completed").length;
    return { total, done };
  }, [activities]);

  return (
    <Card variant="outlined">
      <CardContent>
        <Stack direction="row" alignItems="baseline" spacing={1.5} sx={{ mb: 2 }}>
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            Activities
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {counts.done} of {counts.total} complete (skipped not counted)
          </Typography>
          <Box sx={{ flex: 1 }} />
          <Button
            size="small"
            startIcon={<AddIcon />}
            onClick={(e) => setAddMenuAnchor(e.currentTarget)}
          >
            Add activity
          </Button>
          <Menu
            anchorEl={addMenuAnchor}
            open={!!addMenuAnchor}
            onClose={() => setAddMenuAnchor(null)}
          >
            <MenuItem disabled sx={{ fontSize: 12, opacity: 0.6 }}>
              From catalog
            </MenuItem>
            <MenuItem
              onClick={() => {
                addActivity("document_review", true);
                setAddMenuAnchor(null);
              }}
            >
              Review of documents
            </MenuItem>
            <MenuItem
              onClick={() => {
                addActivity("best_environment", true);
                setAddMenuAnchor(null);
              }}
            >
              Best educational environment
            </MenuItem>
            <MenuItem
              onClick={() => {
                addActivity("feedback_meeting", true);
                setAddMenuAnchor(null);
              }}
            >
              Feedback meeting
            </MenuItem>
            <Divider />
            <MenuItem disabled sx={{ fontSize: 12, opacity: 0.6 }}>
              Backed by another table
            </MenuItem>
            <MenuItem
              onClick={() => {
                addActivity("school_visit", true);
                setAddMenuAnchor(null);
              }}
            >
              Campus visit (creates a school_visits row)
            </MenuItem>
            <MenuItem
              onClick={() => {
                addActivity("school_recommendation", false);
                setAddMenuAnchor(null);
              }}
            >
              School recommendation (creates a school_recommendations row)
            </MenuItem>
            <Divider />
            <MenuItem
              onClick={() => {
                addActivity("bespoke", false);
                setAddMenuAnchor(null);
              }}
            >
              + Bespoke activity (free-form)
            </MenuItem>
          </Menu>
        </Stack>

        <Stack spacing={1}>
          {activities.map((a) => (
            <ActivityRow
              key={a.id}
              activity={a}
              onUpdate={(patch) => updateActivity(a.id, patch)}
              onRemove={() => removeActivity(a.id)}
              onSkip={() => updateActivity(a.id, { status: "not_applicable" })}
              onUnskip={() => updateActivity(a.id, { status: "not_started" })}
            />
          ))}
        </Stack>
      </CardContent>
    </Card>
  );
}

function ActivityRow({
  activity,
  onUpdate,
  onRemove,
  onSkip,
  onUnskip,
}: {
  activity: Activity;
  onUpdate: (patch: Partial<Activity>) => void;
  onRemove: () => void;
  onSkip: () => void;
  onUnskip: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const skipped = activity.status === "not_applicable";
  const completed = activity.status === "completed";
  const display = ACTIVITY_STATUS_DISPLAY[activity.status];

  return (
    <Accordion
      variant="outlined"
      disableGutters
      expanded={expanded}
      onChange={(_e, v) => setExpanded(v)}
      sx={{
        bgcolor: completed ? "action.hover" : "transparent",
        opacity: skipped ? 0.55 : 1,
      }}
    >
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Stack direction="row" alignItems="center" spacing={1.5} sx={{ width: "100%" }}>
          <ActivityStatusButton
            status={activity.status}
            onChange={(s) => onUpdate({ status: s })}
          />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography
              variant="body2"
              sx={{
                fontWeight: 600,
                textDecoration: skipped ? "line-through" : "none",
                color: skipped ? "text.disabled" : "text.primary",
              }}
            >
              {activity.name}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {activity.fromCatalog ? "Catalog" : "Bespoke"}
              {activity.expectedHours != null
                ? ` · ≈${activity.expectedHours} hr expected`
                : ""}
              {activity.kind === "school_visit" && " · linked to school_visits"}
              {activity.kind === "school_recommendation" &&
                " · linked to school_recommendations"}
            </Typography>
          </Box>
          <Chip
            size="small"
            label={display.label}
            color={display.color}
            variant={completed ? "filled" : "outlined"}
          />
          <Box
            component="span"
            role="button"
            tabIndex={0}
            aria-label="Activity menu"
            onClick={(e) => {
              e.stopPropagation();
              setMenuAnchor(e.currentTarget as HTMLElement);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.stopPropagation();
                setMenuAnchor(e.currentTarget as HTMLElement);
              }
            }}
            sx={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 28,
              height: 28,
              borderRadius: "50%",
              cursor: "pointer",
              color: "text.secondary",
              "&:hover": { bgcolor: "action.hover" },
            }}
          >
            <MoreVertIcon fontSize="small" />
          </Box>
          <Menu
            anchorEl={menuAnchor}
            open={!!menuAnchor}
            onClose={() => setMenuAnchor(null)}
            onClick={(e) => e.stopPropagation()}
          >
            <MenuItem
              onClick={() => {
                onUpdate({ status: "blocked" });
                setMenuAnchor(null);
              }}
              disabled={activity.status === "blocked"}
            >
              <BlockIcon fontSize="small" sx={{ mr: 1 }} />
              Mark blocked
            </MenuItem>
            {!skipped && activity.fromCatalog && (
              <MenuItem
                onClick={() => {
                  onSkip();
                  setMenuAnchor(null);
                }}
              >
                <RadioButtonUncheckedIcon fontSize="small" sx={{ mr: 1 }} />
                Skip (mark not applicable)
              </MenuItem>
            )}
            {skipped && (
              <MenuItem
                onClick={() => {
                  onUnskip();
                  setMenuAnchor(null);
                }}
              >
                <RadioButtonUncheckedIcon fontSize="small" sx={{ mr: 1 }} />
                Un-skip
              </MenuItem>
            )}
            {!activity.fromCatalog && (
              <MenuItem
                onClick={() => {
                  onRemove();
                  setMenuAnchor(null);
                }}
                sx={{ color: "error.main" }}
              >
                <CloseIcon fontSize="small" sx={{ mr: 1 }} />
                Delete (bespoke only)
              </MenuItem>
            )}
          </Menu>
        </Stack>
      </AccordionSummary>
      <AccordionDetails>
        <Stack spacing={2}>
          <LabeledField label="Activity name">
            <TextField
              size="small"
              fullWidth
              sx={ghostFieldSx}
              value={activity.name}
              onChange={(e) => onUpdate({ name: e.target.value })}
            />
          </LabeledField>

          <ActivityTypeContent activity={activity} />

          <LabeledField label="Notes">
            <MockRichText
              initial={activity.notes}
              placeholder="What was done. What was learned. What to follow up on."
              minRows={3}
            />
          </LabeledField>
        </Stack>
      </AccordionDetails>
    </Accordion>
  );
}

function ActivityStatusButton({
  status,
  onChange,
}: {
  status: ActivityStatus;
  onChange: (next: ActivityStatus) => void;
}) {
  const cycle = () => {
    if (status === "not_started") onChange("in_progress");
    else if (status === "in_progress") onChange("completed");
    else if (status === "completed") onChange("not_started");
    else onChange("not_started");
  };
  const color =
    status === "completed"
      ? "success.main"
      : status === "in_progress"
        ? "primary.main"
        : status === "blocked"
          ? "error.main"
          : "text.disabled";
  // Rendered as <Box role="button"> rather than IconButton because
  // we live inside an AccordionSummary, which is itself a <button>;
  // nesting two real <button>s trips validateDOMNesting.
  const handle = (e: React.SyntheticEvent) => {
    e.stopPropagation();
    cycle();
  };
  return (
    <Box
      component="span"
      role="button"
      tabIndex={0}
      aria-label="Cycle status"
      onClick={handle}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") handle(e);
      }}
      sx={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 28,
        height: 28,
        borderRadius: "50%",
        cursor: "pointer",
        color,
        "&:hover": { bgcolor: "action.hover" },
      }}
    >
      {status === "completed" ? (
        <CheckCircleOutlineIcon fontSize="small" />
      ) : status === "blocked" ? (
        <BlockIcon fontSize="small" />
      ) : (
        <RadioButtonUncheckedIcon fontSize="small" />
      )}
    </Box>
  );
}

function ActivityTypeContent({ activity }: { activity: Activity }) {
  if (activity.kind === "document_review") return <DocumentReviewContent />;
  if (activity.kind === "best_environment") return <BestEnvironmentContent />;
  if (activity.kind === "school_visit") return <CampusVisitContent />;
  if (activity.kind === "school_recommendation") return <RecommendationContent />;
  if (activity.kind === "feedback_meeting") return <FeedbackContent />;
  return null;
}

function DocumentReviewContent() {
  return (
    <Stack spacing={2}>
      <Box>
        <Typography
          variant="overline"
          color="text.secondary"
          sx={{ display: "block", mb: 0.5 }}
        >
          Educational documents
        </Typography>
        <SimpleDocList
          initial={[
            "Current IEP — Clayton Middle (2025-09-12)",
            "Neuropsych report — Dr. Hoffman (2024-11-04)",
          ]}
        />
      </Box>
      <Box>
        <Typography
          variant="overline"
          color="text.secondary"
          sx={{ display: "block", mb: 0.5 }}
        >
          Medical documents
        </Typography>
        <SimpleDocList initial={["Pediatrician summary — Dr. Park (2025-08-15)"]} />
      </Box>
    </Stack>
  );
}

function BestEnvironmentContent() {
  return (
    <Grid container spacing={2}>
      <Grid item xs={12} md={6}>
        <LabeledField label="Curriculum">
          <MockRichText
            placeholder="Strengths-based academic profile + areas of stretch."
            minRows={3}
            initial="<p>Reading + math at grade level. Needs <strong>structured writing instruction</strong>.</p>"
          />
        </LabeledField>
      </Grid>
      <Grid item xs={12} md={6}>
        <LabeledField label="Placement & size">
          <MockRichText
            placeholder="Class size, mix of mainstream vs supported."
            minRows={3}
            initial="<p>Small (under 16). Co-teaching model preferred.</p>"
          />
        </LabeledField>
      </Grid>
      <Grid item xs={12} md={6}>
        <LabeledField label="Social / emotional environment">
          <MockRichText
            placeholder="Peer group, advisory, lunch, transitions."
            minRows={3}
            initial="<p>Structured lunch + advisory time critical.</p>"
          />
        </LabeledField>
      </Grid>
      <Grid item xs={12} md={6}>
        <LabeledField label="Extra support services">
          <MockRichText
            placeholder="OT / speech / executive-function coaching."
            minRows={3}
            initial="<ul><li>Continue social-skills group.</li><li>Executive-function coaching.</li></ul>"
          />
        </LabeledField>
      </Grid>
    </Grid>
  );
}

function CampusVisitContent() {
  return (
    <Stack spacing={2}>
      <Alert severity="info" variant="outlined" sx={{ py: 0.5 }}>
        <Typography variant="caption">
          This activity creates a record on the school's page. Visits show up
          both here and on /schools/clayton-hs.
        </Typography>
      </Alert>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
        <Box sx={{ flex: 2 }}>
          <LabeledField label="School">
            <TextField
              size="small"
              fullWidth
              sx={ghostFieldSx}
              defaultValue="Clayton HS"
            />
          </LabeledField>
        </Box>
        <Box sx={{ flex: 1 }}>
          <LabeledField label="Visit date">
            <DatePicker
              value={dayjs("2026-04-30")}
              onChange={() => undefined}
              slotProps={{
                textField: { size: "small", fullWidth: true, sx: ghostFieldSx },
              }}
            />
          </LabeledField>
        </Box>
        <Box sx={{ width: { xs: "100%", sm: 120 } }}>
          <LabeledField label="Time">
            <TextField
              size="small"
              fullWidth
              sx={ghostFieldSx}
              defaultValue="9–12"
            />
          </LabeledField>
        </Box>
      </Stack>
      <LabeledField label="Met with">
        <TextField
          size="small"
          fullWidth
          sx={ghostFieldSx}
          defaultValue="Mary C. (principal), Jane S. (SSD coordinator)"
        />
      </LabeledField>
      <LabeledField label="Facts">
        <MockRichText
          initial="<p>Class size avg 14. Learning specialist embedded per grade. $38k tuition + $4k extras.</p>"
          placeholder="What we observed."
          minRows={3}
        />
      </LabeledField>
      <LabeledField label="Opinions / fit">
        <MockRichText
          initial="<p>Strong cultural fit on the structured-social piece.</p>"
          placeholder="Your read."
          minRows={3}
        />
      </LabeledField>
    </Stack>
  );
}

function RecommendationContent() {
  return (
    <Stack spacing={2}>
      <Alert severity="info" variant="outlined" sx={{ py: 0.5 }}>
        <Typography variant="caption">
          This activity creates a record on the school's page and on the
          family's recommendation list.
        </Typography>
      </Alert>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
        <Box sx={{ flex: 2 }}>
          <LabeledField label="School">
            <TextField
              size="small"
              fullWidth
              sx={ghostFieldSx}
              defaultValue="Clayton HS"
            />
          </LabeledField>
        </Box>
        <Box sx={{ width: { xs: "100%", sm: 120 } }}>
          <LabeledField label="Rank">
            <TextField size="small" fullWidth sx={ghostFieldSx} defaultValue="1" />
          </LabeledField>
        </Box>
        <Box sx={{ flex: 1 }}>
          <LabeledField label="Status">
            <TextField
              select
              size="small"
              fullWidth
              sx={ghostFieldSx}
              defaultValue="suggested"
            >
              <MenuItem value="suggested">Suggested</MenuItem>
              <MenuItem value="considering">Considering</MenuItem>
              <MenuItem value="applied">Applied</MenuItem>
              <MenuItem value="accepted">Accepted</MenuItem>
              <MenuItem value="rejected">Rejected</MenuItem>
            </TextField>
          </LabeledField>
        </Box>
      </Stack>
      <LabeledField label="Why this school">
        <MockRichText
          initial="<p>Best match on the structured-social environment Peter needs. Mary's approach to LD students is unusually intentional.</p>"
          placeholder="Why you're recommending."
          minRows={3}
        />
      </LabeledField>
    </Stack>
  );
}

function FeedbackContent() {
  return (
    <Grid container spacing={2}>
      <Grid item xs={12} md={6}>
        <LabeledField label="Recommendations">
          <MockRichText
            initial="<p>I encourage you to look at <strong>Clayton HS</strong>.</p>"
            minRows={3}
          />
        </LabeledField>
      </Grid>
      <Grid item xs={12} md={6}>
        <LabeledField label="Admissions / tuition discussion">
          <MockRichText
            initial="<p>Rolling applications through May. $500 deposit.</p>"
            minRows={3}
          />
        </LabeledField>
      </Grid>
      <Grid item xs={12}>
        <LabeledField label="Offered follow-on services">
          <MockRichText
            initial="<ul><li>Tour with the family once accepted.</li><li>IEP meeting attendance.</li></ul>"
            minRows={2}
          />
        </LabeledField>
      </Grid>
    </Grid>
  );
}

function SimpleDocList({ initial }: { initial: string[] }) {
  const [items, setItems] = useState(initial);
  const [draft, setDraft] = useState("");
  return (
    <Stack spacing={0.5}>
      {items.map((it, i) => (
        <Stack
          key={`${it}-${i}`}
          direction="row"
          alignItems="center"
          sx={{ borderBottom: 1, borderColor: "divider", py: 0.5 }}
        >
          <DescriptionOutlinedIcon fontSize="small" sx={{ mr: 1, color: "text.disabled" }} />
          <Typography variant="body2" sx={{ flex: 1 }}>
            {it}
          </Typography>
          <IconButton
            size="small"
            onClick={() => setItems(items.filter((_, idx) => idx !== i))}
            sx={{ color: "text.disabled", "&:hover": { color: "error.main" } }}
          >
            <CloseIcon fontSize="small" />
          </IconButton>
        </Stack>
      ))}
      <Stack direction="row" spacing={1} sx={{ mt: 0.5 }}>
        <TextField
          size="small"
          fullWidth
          placeholder='Document title — e.g. "Latest IEP (2025-09-12)"'
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && draft.trim()) {
              e.preventDefault();
              setItems([...items, draft.trim()]);
              setDraft("");
            }
          }}
        />
        <Button
          variant="outlined"
          size="small"
          disabled={!draft.trim()}
          onClick={() => {
            setItems([...items, draft.trim()]);
            setDraft("");
          }}
        >
          Add
        </Button>
      </Stack>
    </Stack>
  );
}

// ---- Time entries -------------------------------------------------------

interface TimeEntry {
  id: string;
  date: string;
  description: string;
  hours: number;
  rateOverride: number | null;
  billable: boolean;
  invoiceId: string | null;
}

const HOURLY = 150;

const SEED_TIME: TimeEntry[] = [
  {
    id: "t1",
    date: "2026-04-29",
    description: "Initial review of IEP + neuropsych report",
    hours: 2,
    rateOverride: null,
    billable: true,
    invoiceId: "INV-042",
  },
  {
    id: "t2",
    date: "2026-04-30",
    description: "Clayton HS visit + drive time",
    hours: 4.5,
    rateOverride: null,
    billable: true,
    invoiceId: "INV-042",
  },
  {
    id: "t3",
    date: "2026-05-08",
    description: "Best-environment profile + research on candidate schools",
    hours: 0.5,
    rateOverride: null,
    billable: true,
    invoiceId: null,
  },
  {
    id: "t4",
    date: "2026-05-12",
    description: "Crossroads HS visit",
    hours: 2,
    rateOverride: null,
    billable: true,
    invoiceId: null,
  },
  {
    id: "t5",
    date: "2026-05-15",
    description: "Internal: catching up on engagement notes",
    hours: 0.5,
    rateOverride: null,
    billable: false,
    invoiceId: null,
  },
];

function TimeEntriesCard() {
  const [entries, setEntries] = useState<TimeEntry[]>(SEED_TIME);
  const [adding, setAdding] = useState(false);

  const totalBillable = entries
    .filter((e) => e.billable)
    .reduce((s, e) => s + e.hours * (e.rateOverride ?? HOURLY), 0);
  const totalHours = entries.reduce((s, e) => s + e.hours, 0);
  const unbilled = entries
    .filter((e) => e.billable && !e.invoiceId)
    .reduce((s, e) => s + e.hours * (e.rateOverride ?? HOURLY), 0);

  return (
    <Card variant="outlined">
      <CardContent>
        <Stack direction="row" alignItems="baseline" spacing={1.5} sx={{ mb: 1.5 }}>
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            Time entries
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {totalHours} hr · ${totalBillable.toFixed(0)} billable ·{" "}
            <Box component="span" sx={{ color: unbilled > 0 ? "warning.main" : "text.disabled" }}>
              ${unbilled.toFixed(0)} unbilled
            </Box>
          </Typography>
          <Box sx={{ flex: 1 }} />
          <Button
            size="small"
            startIcon={<AddIcon />}
            onClick={() => setAdding(true)}
          >
            Log time
          </Button>
        </Stack>

        <Stack
          divider={<Divider flexItem />}
          sx={{ border: 1, borderColor: "divider", borderRadius: 1 }}
        >
          <Stack
            direction="row"
            sx={{
              px: 1.5,
              py: 1,
              bgcolor: "action.hover",
              fontSize: 12,
              color: "text.secondary",
            }}
          >
            <Box sx={{ width: 110 }}>DATE</Box>
            <Box sx={{ flex: 1 }}>DESCRIPTION</Box>
            <Box sx={{ width: 70, textAlign: "right" }}>HOURS</Box>
            <Box sx={{ width: 85, textAlign: "right" }}>RATE</Box>
            <Box sx={{ width: 80, textAlign: "right" }}>TOTAL</Box>
            <Box sx={{ width: 100, textAlign: "center" }}>BILLABLE</Box>
            <Box sx={{ width: 40 }} />
          </Stack>
          {entries.map((e) => (
            <TimeEntryRow
              key={e.id}
              entry={e}
              onChange={(patch) =>
                setEntries((prev) =>
                  prev.map((x) => (x.id === e.id ? { ...x, ...patch } : x)),
                )
              }
              onRemove={() => setEntries(entries.filter((x) => x.id !== e.id))}
            />
          ))}
          {adding && (
            <TimeEntryEditor
              onSave={(entry) => {
                setEntries([...entries, { ...entry, id: `t${Date.now()}` }]);
                setAdding(false);
              }}
              onCancel={() => setAdding(false)}
            />
          )}
        </Stack>
      </CardContent>
    </Card>
  );
}

function TimeEntryRow({
  entry,
  onChange,
  onRemove,
}: {
  entry: TimeEntry;
  onChange: (patch: Partial<TimeEntry>) => void;
  onRemove: () => void;
}) {
  const rate = entry.rateOverride ?? HOURLY;
  const total = entry.hours * rate;
  const locked = !!entry.invoiceId;
  return (
    <Stack
      direction="row"
      alignItems="center"
      sx={{
        px: 1.5,
        py: 0.5,
        bgcolor: locked ? "action.hover" : "transparent",
        opacity: locked ? 0.8 : 1,
      }}
    >
      <Box sx={{ width: 110 }}>
        {locked ? (
          <Typography variant="body2" color="text.secondary">
            {dayjs(entry.date).format("MMM D, YYYY")}
          </Typography>
        ) : (
          <DatePicker
            value={dayjs(entry.date)}
            onChange={(d) =>
              d && d.isValid() && onChange({ date: d.format("YYYY-MM-DD") })
            }
            slotProps={{
              textField: {
                size: "small",
                variant: "standard",
                InputProps: { disableUnderline: true },
              },
            }}
          />
        )}
      </Box>
      <Box sx={{ flex: 1, pr: 1, minWidth: 0 }}>
        {locked ? (
          <Stack direction="row" alignItems="center" spacing={1}>
            <LockOutlinedIcon fontSize="inherit" sx={{ color: "text.disabled" }} />
            <Typography variant="body2" sx={{ color: "text.secondary" }}>
              {entry.description}
            </Typography>
            <Chip size="small" label={entry.invoiceId} variant="outlined" />
          </Stack>
        ) : (
          <TextField
            size="small"
            fullWidth
            variant="standard"
            InputProps={{ disableUnderline: true }}
            value={entry.description}
            onChange={(e) => onChange({ description: e.target.value })}
          />
        )}
      </Box>
      <Box sx={{ width: 70, textAlign: "right" }}>
        {locked ? (
          <Typography variant="body2" color="text.secondary">
            {entry.hours}
          </Typography>
        ) : (
          <TextField
            size="small"
            variant="standard"
            InputProps={{ disableUnderline: true }}
            inputProps={{ style: { textAlign: "right" } }}
            value={entry.hours}
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              if (!Number.isNaN(v)) onChange({ hours: v });
            }}
            sx={{ width: 60 }}
          />
        )}
      </Box>
      <Box sx={{ width: 85, textAlign: "right", color: "text.secondary" }}>
        <Typography
          variant="body2"
          sx={{ fontStyle: entry.rateOverride ? "normal" : "italic" }}
        >
          ${rate}
        </Typography>
      </Box>
      <Box sx={{ width: 80, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
        <Typography variant="body2">
          {entry.billable ? `$${total.toFixed(0)}` : "—"}
        </Typography>
      </Box>
      <Box sx={{ width: 100, textAlign: "center" }}>
        <Chip
          size="small"
          label={entry.billable ? "Billable" : "Internal"}
          variant="outlined"
          color={entry.billable ? "success" : "default"}
          onClick={locked ? undefined : () => onChange({ billable: !entry.billable })}
          sx={{ cursor: locked ? "default" : "pointer" }}
        />
      </Box>
      <Box sx={{ width: 40, textAlign: "right" }}>
        {!locked && (
          <IconButton
            size="small"
            onClick={onRemove}
            sx={{ color: "text.disabled", "&:hover": { color: "error.main" } }}
          >
            <CloseIcon fontSize="small" />
          </IconButton>
        )}
      </Box>
    </Stack>
  );
}

function TimeEntryEditor({
  onSave,
  onCancel,
}: {
  onSave: (e: Omit<TimeEntry, "id">) => void;
  onCancel: () => void;
}) {
  const [date, setDate] = useState(dayjs().format("YYYY-MM-DD"));
  const [description, setDescription] = useState("");
  const [hours, setHours] = useState<string>("");
  const [rateOverride, setRateOverride] = useState<string>("");
  const [billable, setBillable] = useState(true);
  const canSave = description.trim() !== "" && parseFloat(hours) > 0;
  return (
    <Stack
      direction="row"
      alignItems="center"
      sx={{ px: 1.5, py: 1, bgcolor: "action.hover" }}
      spacing={1}
    >
      <Box sx={{ width: 110 }}>
        <DatePicker
          value={dayjs(date)}
          onChange={(d) => d && d.isValid() && setDate(d.format("YYYY-MM-DD"))}
          slotProps={{ textField: { size: "small" } }}
        />
      </Box>
      <Box sx={{ flex: 1, pr: 1 }}>
        <TextField
          size="small"
          fullWidth
          placeholder="What was done"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </Box>
      <Box sx={{ width: 70 }}>
        <TextField
          size="small"
          fullWidth
          placeholder="Hrs"
          value={hours}
          onChange={(e) => setHours(e.target.value)}
        />
      </Box>
      <Box sx={{ width: 85 }}>
        <TextField
          size="small"
          fullWidth
          placeholder={`$${HOURLY}`}
          value={rateOverride}
          onChange={(e) => setRateOverride(e.target.value)}
        />
      </Box>
      <Box sx={{ width: 80 }} />
      <Box sx={{ width: 100, textAlign: "center" }}>
        <Chip
          size="small"
          label={billable ? "Billable" : "Internal"}
          variant="outlined"
          color={billable ? "success" : "default"}
          onClick={() => setBillable(!billable)}
          sx={{ cursor: "pointer" }}
        />
      </Box>
      <Box sx={{ width: 40 }}>
        <IconButton size="small" onClick={onCancel}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </Box>
      <Button
        variant="contained"
        size="small"
        disabled={!canSave}
        onClick={() => {
          const r = parseFloat(rateOverride);
          onSave({
            date,
            description: description.trim(),
            hours: parseFloat(hours),
            rateOverride: Number.isFinite(r) ? r : null,
            billable,
            invoiceId: null,
          });
        }}
      >
        Save
      </Button>
    </Stack>
  );
}

// ---- Expenses -----------------------------------------------------------

const EXPENSE_CATEGORIES = ["Mileage", "Parking", "Tolls", "Materials", "Other"];

interface Expense {
  id: string;
  date: string;
  category: string;
  description: string;
  amount: number;
  billable: boolean;
  receiptAttached: boolean;
  invoiceId: string | null;
}

const SEED_EXPENSES: Expense[] = [
  {
    id: "e1",
    date: "2026-04-30",
    category: "Mileage",
    description: "Clayton HS round trip (24 mi)",
    amount: 16.08,
    billable: true,
    receiptAttached: false,
    invoiceId: "INV-042",
  },
  {
    id: "e2",
    date: "2026-05-12",
    category: "Parking",
    description: "Crossroads HS visit",
    amount: 6,
    billable: true,
    receiptAttached: true,
    invoiceId: null,
  },
];

function ExpensesCard() {
  const [expenses, setExpenses] = useState<Expense[]>(SEED_EXPENSES);
  const total = expenses.reduce((s, e) => s + e.amount, 0);
  const billable = expenses
    .filter((e) => e.billable)
    .reduce((s, e) => s + e.amount, 0);
  const unbilled = expenses
    .filter((e) => e.billable && !e.invoiceId)
    .reduce((s, e) => s + e.amount, 0);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<Omit<Expense, "id">>({
    date: dayjs().format("YYYY-MM-DD"),
    category: EXPENSE_CATEGORIES[0],
    description: "",
    amount: 0,
    billable: true,
    receiptAttached: false,
    invoiceId: null,
  });
  const update = (id: string, patch: Partial<Expense>) =>
    setExpenses((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  return (
    <Card variant="outlined">
      <CardContent>
        <Stack direction="row" alignItems="baseline" spacing={1.5} sx={{ mb: 1.5 }}>
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            Expenses
          </Typography>
          <Typography variant="caption" color="text.secondary">
            ${total.toFixed(2)} total · ${billable.toFixed(2)} billable ·{" "}
            <Box component="span" sx={{ color: unbilled > 0 ? "warning.main" : "text.disabled" }}>
              ${unbilled.toFixed(2)} unbilled
            </Box>
          </Typography>
          <Box sx={{ flex: 1 }} />
          <Button
            size="small"
            startIcon={<AddIcon />}
            onClick={() => {
              setDraft({
                date: dayjs().format("YYYY-MM-DD"),
                category: EXPENSE_CATEGORIES[0],
                description: "",
                amount: 0,
                billable: true,
                receiptAttached: false,
                invoiceId: null,
              });
              setAdding(true);
            }}
          >
            Add expense
          </Button>
        </Stack>

        <Stack
          divider={<Divider flexItem />}
          sx={{ border: 1, borderColor: "divider", borderRadius: 1 }}
        >
          <Stack
            direction="row"
            sx={{
              px: 1.5,
              py: 1,
              bgcolor: "action.hover",
              fontSize: 12,
              color: "text.secondary",
            }}
          >
            <Box sx={{ width: 110 }}>DATE</Box>
            <Box sx={{ width: 110 }}>CATEGORY</Box>
            <Box sx={{ flex: 1 }}>DESCRIPTION</Box>
            <Box sx={{ width: 100, textAlign: "right" }}>AMOUNT</Box>
            <Box sx={{ width: 90, textAlign: "center" }}>BILLABLE</Box>
            <Box sx={{ width: 80, textAlign: "center" }}>RECEIPT</Box>
            <Box sx={{ width: 40 }} />
          </Stack>
          {expenses.map((e) => {
            const locked = !!e.invoiceId;
            return (
              <Stack
                key={e.id}
                direction="row"
                alignItems="center"
                sx={{
                  px: 1.5,
                  py: 0.75,
                  bgcolor: locked ? "action.hover" : "transparent",
                  opacity: locked ? 0.8 : 1,
                }}
              >
                <Box sx={{ width: 110 }}>
                  <Typography variant="body2">
                    {dayjs(e.date).format("MMM D, YYYY")}
                  </Typography>
                </Box>
                <Box sx={{ width: 110 }}>
                  <Typography variant="body2" color="text.secondary">
                    {e.category}
                  </Typography>
                </Box>
                <Box sx={{ flex: 1, pr: 1 }}>
                  <Stack direction="row" alignItems="center" spacing={1}>
                    {locked && (
                      <LockOutlinedIcon fontSize="inherit" sx={{ color: "text.disabled" }} />
                    )}
                    <Typography variant="body2">{e.description}</Typography>
                    {locked && (
                      <Chip size="small" label={e.invoiceId} variant="outlined" />
                    )}
                  </Stack>
                </Box>
                <Box
                  sx={{
                    width: 100,
                    textAlign: "right",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  <Typography variant="body2">${e.amount.toFixed(2)}</Typography>
                </Box>
                <Box sx={{ width: 90, textAlign: "center" }}>
                  <Chip
                    size="small"
                    label={e.billable ? "Billable" : "Internal"}
                    variant="outlined"
                    color={e.billable ? "success" : "default"}
                    onClick={locked ? undefined : () => update(e.id, { billable: !e.billable })}
                    sx={{ cursor: locked ? "default" : "pointer" }}
                  />
                </Box>
                <Box sx={{ width: 80, textAlign: "center" }}>
                  {e.receiptAttached ? (
                    <Chip
                      size="small"
                      icon={<AttachFileIcon fontSize="small" />}
                      label="Attached"
                      variant="outlined"
                      color="default"
                      onClick={
                        locked ? undefined : () => update(e.id, { receiptAttached: false })
                      }
                      sx={{ cursor: locked ? "default" : "pointer" }}
                    />
                  ) : !locked ? (
                    <IconButton
                      size="small"
                      aria-label="Attach receipt"
                      onClick={() => update(e.id, { receiptAttached: true })}
                      sx={{ color: "text.disabled" }}
                    >
                      <FileUploadOutlinedIcon fontSize="small" />
                    </IconButton>
                  ) : (
                    <Typography variant="caption" color="text.disabled">
                      —
                    </Typography>
                  )}
                </Box>
                <Box sx={{ width: 40, textAlign: "right" }}>
                  {!locked && (
                    <IconButton
                      size="small"
                      onClick={() => setExpenses(expenses.filter((x) => x.id !== e.id))}
                      sx={{ color: "text.disabled", "&:hover": { color: "error.main" } }}
                    >
                      <CloseIcon fontSize="small" />
                    </IconButton>
                  )}
                </Box>
              </Stack>
            );
          })}
          {adding && (
            <Stack
              direction="row"
              alignItems="center"
              sx={{ px: 1.5, py: 1, bgcolor: "action.hover" }}
              spacing={1}
            >
              <Box sx={{ width: 110 }}>
                <DatePicker
                  value={dayjs(draft.date)}
                  onChange={(d) =>
                    d && d.isValid() && setDraft({ ...draft, date: d.format("YYYY-MM-DD") })
                  }
                  slotProps={{ textField: { size: "small" } }}
                />
              </Box>
              <Box sx={{ width: 110 }}>
                <TextField
                  select
                  size="small"
                  fullWidth
                  value={draft.category}
                  onChange={(e) => setDraft({ ...draft, category: e.target.value })}
                >
                  {EXPENSE_CATEGORIES.map((c) => (
                    <MenuItem key={c} value={c}>
                      {c}
                    </MenuItem>
                  ))}
                </TextField>
              </Box>
              <Box sx={{ flex: 1 }}>
                <TextField
                  size="small"
                  fullWidth
                  placeholder="What it was for"
                  value={draft.description}
                  onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                />
              </Box>
              <Box sx={{ width: 100 }}>
                <TextField
                  size="small"
                  fullWidth
                  placeholder="$0.00"
                  value={draft.amount || ""}
                  onChange={(e) =>
                    setDraft({ ...draft, amount: parseFloat(e.target.value) || 0 })
                  }
                />
              </Box>
              <Box sx={{ width: 90, textAlign: "center" }}>
                <Chip
                  size="small"
                  label={draft.billable ? "Billable" : "Internal"}
                  variant="outlined"
                  color={draft.billable ? "success" : "default"}
                  onClick={() => setDraft({ ...draft, billable: !draft.billable })}
                  sx={{ cursor: "pointer" }}
                />
              </Box>
              <Box sx={{ width: 80, textAlign: "center" }}>
                <IconButton
                  size="small"
                  onClick={() =>
                    setDraft({ ...draft, receiptAttached: !draft.receiptAttached })
                  }
                  sx={{
                    color: draft.receiptAttached ? "primary.main" : "text.disabled",
                  }}
                >
                  <FileUploadOutlinedIcon fontSize="small" />
                </IconButton>
              </Box>
              <Box sx={{ width: 40 }}>
                <IconButton size="small" onClick={() => setAdding(false)}>
                  <CloseIcon fontSize="small" />
                </IconButton>
              </Box>
              <Button
                variant="contained"
                size="small"
                disabled={!draft.description.trim() || draft.amount <= 0}
                onClick={() => {
                  setExpenses([
                    ...expenses,
                    { ...draft, id: `e${Date.now()}` },
                  ]);
                  setAdding(false);
                }}
              >
                Save
              </Button>
            </Stack>
          )}
        </Stack>
      </CardContent>
    </Card>
  );
}

// ---- Notes catch-all ----------------------------------------------------

function NotesCard() {
  return (
    <Card variant="outlined">
      <CardContent>
        <Stack spacing={0.25} sx={{ mb: 2 }}>
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            Engagement notes
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Free-form narrative — anything the activities, time entries, or
            expenses sections missed.
          </Typography>
        </Stack>
        <MockRichText placeholder="Anything else worth capturing." minRows={6} />
      </CardContent>
    </Card>
  );
}

// ---- Helpers ------------------------------------------------------------

function MockRichText({
  initial,
  placeholder,
  minRows,
}: {
  initial?: string;
  placeholder?: string;
  minRows?: number;
}) {
  const [value, setValue] = useState(initial ?? "");
  return (
    <RichTextEditor
      value={value}
      onChange={setValue}
      placeholder={placeholder}
      minRows={minRows}
    />
  );
}
