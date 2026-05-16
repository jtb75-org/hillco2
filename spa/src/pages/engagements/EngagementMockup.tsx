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
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import CloseIcon from "@mui/icons-material/Close";
import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import FileDownloadOutlinedIcon from "@mui/icons-material/FileDownloadOutlined";
import FileUploadOutlinedIcon from "@mui/icons-material/FileUploadOutlined";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import RadioButtonUncheckedIcon from "@mui/icons-material/RadioButtonUnchecked";
import RemoveCircleOutlineIcon from "@mui/icons-material/RemoveCircleOutline";
import { DatePicker } from "@mui/x-date-pickers";
import dayjs from "dayjs";
import { Link as RouterLink } from "react-router-dom";

import { LabeledField } from "../../components/LabeledField";
import { PageHeader } from "../../components/PageHeader";
import { RichTextEditor } from "../../components/RichTextEditor";
import { ghostFieldSx } from "../../components/ghostFieldSx";

/**
 * MOCKUP — not wired to any API. Renders the proposed engagement
 * detail layout. Throw away when the live engagement page is built.
 *
 * Workflow-shaped (vs the earlier layout-shaped revision):
 *
 *   Header
 *   Intake context (read-only snapshot)
 *   Contract & releases  (services agreement + medical-records release;
 *                         each goes through generate → download →
 *                         upload-signed states)
 *   Activities           (catalog-driven checklist + bespoke; status,
 *                         notes, type-specific structured forms for
 *                         campus visits / doc review / etc.)
 *   Time entries         (independent from activities — freeform
 *                         description + date + hours + optional rate
 *                         override)
 *   Expenses             (per-engagement billable + non-billable lines)
 *   Engagement notes     (rich-text catch-all)
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

type ContractStage = "not_started" | "generated" | "signed";

function ContractCard() {
  return (
    <Card variant="outlined">
      <CardContent>
        <Stack spacing={0.25} sx={{ mb: 2 }}>
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            Contract & releases
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Generate, send for signature, then upload the countersigned PDF.
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
  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems="flex-start">
        <DescriptionOutlinedIcon sx={{ mt: 0.5, color: "text.secondary" }} />
        <Box sx={{ flex: 1 }}>
          <Stack direction="row" spacing={1} alignItems="baseline">
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
              {title}
            </Typography>
            <ContractStageChip stage={stage} />
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
              onClick={() => setStage("generated")}
            >
              Generate
            </Button>
          )}
          {stage === "generated" && (
            <>
              <Button
                variant="outlined"
                size="small"
                startIcon={<FileDownloadOutlinedIcon />}
                onClick={() => undefined}
              >
                Download
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
                Regenerate
              </Button>
            </>
          )}
        </Stack>
      </Stack>
    </Paper>
  );
}

function ContractStageChip({ stage }: { stage: ContractStage }) {
  if (stage === "not_started") {
    return <Chip size="small" label="Not started" variant="outlined" />;
  }
  if (stage === "generated") {
    return (
      <Chip size="small" label="Awaiting signature" color="warning" variant="outlined" />
    );
  }
  return <Chip size="small" label="Signed" color="success" />;
}

// ---- Activities ---------------------------------------------------------

type ActivityStatus = "pending" | "in_progress" | "done" | "na";
type ActivityKind =
  | "generic"
  | "document_review"
  | "best_environment"
  | "campus_visit"
  | "feedback_meeting";

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
    status: "done",
    fromCatalog: true,
    expectedHours: 2,
    notes: "",
  },
  {
    id: "a2",
    name: "Best educational environment profile",
    kind: "best_environment",
    status: "done",
    fromCatalog: true,
    expectedHours: 0.5,
    notes: "",
  },
  {
    id: "a3",
    name: "Campus visit — Clayton HS",
    kind: "campus_visit",
    status: "done",
    fromCatalog: true,
    expectedHours: 4.5,
    notes: "",
  },
  {
    id: "a4",
    name: "Campus visit — Crossroads HS",
    kind: "campus_visit",
    status: "done",
    fromCatalog: true,
    expectedHours: 2,
    notes: "",
  },
  {
    id: "a5",
    name: "Feedback & next steps meeting",
    kind: "feedback_meeting",
    status: "in_progress",
    fromCatalog: true,
    expectedHours: 1,
    notes: "",
  },
  {
    id: "a6",
    name: "Phone consultation with Dr. Hoffman (neuropsych)",
    kind: "generic",
    status: "pending",
    fromCatalog: false,
    expectedHours: null,
    notes: "",
  },
];

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
    const id = `a${Date.now()}`;
    const defaults: Record<ActivityKind, { name: string; expectedHours: number | null }> = {
      generic: { name: "New activity", expectedHours: null },
      document_review: { name: "Review of documents", expectedHours: 2 },
      best_environment: { name: "Best educational environment profile", expectedHours: 0.5 },
      campus_visit: { name: "Campus visit — ", expectedHours: 4 },
      feedback_meeting: { name: "Feedback & next steps meeting", expectedHours: 1 },
    };
    setActivities((prev) => [
      ...prev,
      {
        id,
        name: defaults[kind].name,
        kind,
        status: "pending",
        fromCatalog,
        expectedHours: defaults[kind].expectedHours,
        notes: "",
      },
    ]);
  };

  const counts = useMemo(() => {
    const total = activities.length;
    const done = activities.filter((a) => a.status === "done").length;
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
            {counts.done} of {counts.total} complete
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
                addActivity("campus_visit", true);
                setAddMenuAnchor(null);
              }}
            >
              Campus visit
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
            <MenuItem
              onClick={() => {
                addActivity("generic", false);
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
            />
          ))}
          {activities.length === 0 && (
            <Typography variant="body2" color="text.disabled" sx={{ py: 2 }}>
              No activities yet. Pick a catalog activity above, or add a
              bespoke one.
            </Typography>
          )}
        </Stack>
      </CardContent>
    </Card>
  );
}

function ActivityRow({
  activity,
  onUpdate,
  onRemove,
}: {
  activity: Activity;
  onUpdate: (patch: Partial<Activity>) => void;
  onRemove: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const done = activity.status === "done";
  const na = activity.status === "na";
  return (
    <Accordion
      variant="outlined"
      disableGutters
      expanded={expanded}
      onChange={(_e, v) => setExpanded(v)}
      sx={{ bgcolor: done ? "action.hover" : "transparent" }}
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
                textDecoration: na ? "line-through" : "none",
                color: na ? "text.disabled" : "text.primary",
              }}
            >
              {activity.name}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {activity.fromCatalog ? "Catalog" : "Bespoke"}
              {activity.expectedHours != null
                ? ` · ≈${activity.expectedHours} hr expected`
                : ""}
            </Typography>
          </Box>
          <Chip
            size="small"
            label={ACTIVITY_STATUS_LABEL[activity.status]}
            color={ACTIVITY_STATUS_COLOR[activity.status]}
            variant={done ? "filled" : "outlined"}
          />
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

          <Stack direction="row" justifyContent="flex-end">
            <Button
              size="small"
              color="error"
              startIcon={<RemoveCircleOutlineIcon />}
              onClick={onRemove}
            >
              Remove activity
            </Button>
          </Stack>
        </Stack>
      </AccordionDetails>
    </Accordion>
  );
}

const ACTIVITY_STATUS_LABEL: Record<ActivityStatus, string> = {
  pending: "Pending",
  in_progress: "In progress",
  done: "Done",
  na: "N/A",
};

const ACTIVITY_STATUS_COLOR: Record<
  ActivityStatus,
  "default" | "primary" | "success" | "warning"
> = {
  pending: "default",
  in_progress: "primary",
  done: "success",
  na: "default",
};

function ActivityStatusButton({
  status,
  onChange,
}: {
  status: ActivityStatus;
  onChange: (next: ActivityStatus) => void;
}) {
  const cycle = () => {
    if (status === "pending") onChange("in_progress");
    else if (status === "in_progress") onChange("done");
    else if (status === "done") onChange("pending");
    else onChange("pending");
  };
  return (
    <IconButton
      size="small"
      aria-label="Cycle status"
      onClick={(e) => {
        e.stopPropagation();
        cycle();
      }}
      sx={{
        color:
          status === "done"
            ? "success.main"
            : status === "in_progress"
              ? "primary.main"
              : "text.disabled",
      }}
    >
      {status === "done" ? (
        <CheckCircleOutlineIcon fontSize="small" />
      ) : (
        <RadioButtonUncheckedIcon fontSize="small" />
      )}
    </IconButton>
  );
}

// Type-specific structured forms inside each activity's accordion body.
function ActivityTypeContent({ activity }: { activity: Activity }) {
  if (activity.kind === "document_review") {
    return <DocumentReviewContent />;
  }
  if (activity.kind === "best_environment") {
    return <BestEnvironmentContent />;
  }
  if (activity.kind === "campus_visit") {
    return <CampusVisitContent />;
  }
  if (activity.kind === "feedback_meeting") {
    return <FeedbackContent />;
  }
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
}

const HOURLY = 150;

const SEED_TIME: TimeEntry[] = [
  {
    id: "t1",
    date: "2026-04-29",
    description: "Initial review of IEP + neuropsych report",
    hours: 2,
    rateOverride: null,
  },
  {
    id: "t2",
    date: "2026-04-30",
    description: "Clayton HS visit + drive time",
    hours: 4.5,
    rateOverride: null,
  },
  {
    id: "t3",
    date: "2026-05-08",
    description: "Best-environment profile + research on candidate schools",
    hours: 0.5,
    rateOverride: null,
  },
  {
    id: "t4",
    date: "2026-05-12",
    description: "Crossroads HS visit",
    hours: 2,
    rateOverride: null,
  },
];

function TimeEntriesCard() {
  const [entries, setEntries] = useState<TimeEntry[]>(SEED_TIME);
  const [adding, setAdding] = useState(false);

  const total = entries.reduce(
    (s, e) => s + e.hours * (e.rateOverride ?? HOURLY),
    0,
  );
  const totalHours = entries.reduce((s, e) => s + e.hours, 0);

  return (
    <Card variant="outlined">
      <CardContent>
        <Stack direction="row" alignItems="baseline" spacing={1.5} sx={{ mb: 1.5 }}>
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            Time entries
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {totalHours} hr · ${total.toFixed(0)}
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
            <Box sx={{ width: 80, textAlign: "right" }}>HOURS</Box>
            <Box sx={{ width: 100, textAlign: "right" }}>RATE</Box>
            <Box sx={{ width: 90, textAlign: "right" }}>TOTAL</Box>
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
  return (
    <Stack direction="row" alignItems="center" sx={{ px: 1.5, py: 0.5 }}>
      <Box sx={{ width: 110 }}>
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
      </Box>
      <Box sx={{ flex: 1, pr: 1 }}>
        <TextField
          size="small"
          fullWidth
          variant="standard"
          InputProps={{ disableUnderline: true }}
          value={entry.description}
          onChange={(e) => onChange({ description: e.target.value })}
        />
      </Box>
      <Box sx={{ width: 80, textAlign: "right" }}>
        <TextField
          size="small"
          variant="standard"
          InputProps={{ disableUnderline: true, sx: { textAlign: "right" } }}
          inputProps={{ style: { textAlign: "right" } }}
          value={entry.hours}
          onChange={(e) => {
            const v = parseFloat(e.target.value);
            if (!Number.isNaN(v)) onChange({ hours: v });
          }}
          sx={{ width: 70 }}
        />
      </Box>
      <Box sx={{ width: 100, textAlign: "right", color: "text.secondary" }}>
        <Typography variant="body2" sx={{ fontStyle: entry.rateOverride ? "normal" : "italic" }}>
          ${rate}
        </Typography>
      </Box>
      <Box sx={{ width: 90, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
        <Typography variant="body2">${total.toFixed(0)}</Typography>
      </Box>
      <Box sx={{ width: 40, textAlign: "right" }}>
        <IconButton
          size="small"
          onClick={onRemove}
          sx={{ color: "text.disabled", "&:hover": { color: "error.main" } }}
        >
          <CloseIcon fontSize="small" />
        </IconButton>
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
      <Box sx={{ width: 80 }}>
        <TextField
          size="small"
          fullWidth
          placeholder="Hrs"
          value={hours}
          onChange={(e) => setHours(e.target.value)}
        />
      </Box>
      <Box sx={{ width: 100 }}>
        <TextField
          size="small"
          fullWidth
          placeholder={`$${HOURLY}`}
          value={rateOverride}
          onChange={(e) => setRateOverride(e.target.value)}
        />
      </Box>
      <Box sx={{ width: 90 }} />
      <Box sx={{ width: 40, display: "flex" }}>
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
          });
        }}
      >
        Save
      </Button>
    </Stack>
  );
}

// ---- Expenses -----------------------------------------------------------

interface Expense {
  id: string;
  date: string;
  description: string;
  amount: number;
  billable: boolean;
}

const SEED_EXPENSES: Expense[] = [
  {
    id: "e1",
    date: "2026-04-30",
    description: "Mileage — Clayton HS round trip (24 mi)",
    amount: 16.08,
    billable: true,
  },
  {
    id: "e2",
    date: "2026-05-12",
    description: "Parking — Crossroads HS visit",
    amount: 6,
    billable: true,
  },
];

function ExpensesCard() {
  const [expenses, setExpenses] = useState<Expense[]>(SEED_EXPENSES);
  const total = expenses.reduce((s, e) => s + e.amount, 0);
  const billable = expenses
    .filter((e) => e.billable)
    .reduce((s, e) => s + e.amount, 0);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<Omit<Expense, "id">>({
    date: dayjs().format("YYYY-MM-DD"),
    description: "",
    amount: 0,
    billable: true,
  });
  return (
    <Card variant="outlined">
      <CardContent>
        <Stack direction="row" alignItems="baseline" spacing={1.5} sx={{ mb: 1.5 }}>
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            Expenses
          </Typography>
          <Typography variant="caption" color="text.secondary">
            ${total.toFixed(2)} total · ${billable.toFixed(2)} billable
          </Typography>
          <Box sx={{ flex: 1 }} />
          <Button
            size="small"
            startIcon={<AddIcon />}
            onClick={() => {
              setDraft({
                date: dayjs().format("YYYY-MM-DD"),
                description: "",
                amount: 0,
                billable: true,
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
            <Box sx={{ flex: 1 }}>DESCRIPTION</Box>
            <Box sx={{ width: 100, textAlign: "right" }}>AMOUNT</Box>
            <Box sx={{ width: 90, textAlign: "center" }}>BILLABLE</Box>
            <Box sx={{ width: 40 }} />
          </Stack>
          {expenses.map((e) => (
            <Stack
              key={e.id}
              direction="row"
              alignItems="center"
              sx={{ px: 1.5, py: 0.75 }}
            >
              <Box sx={{ width: 110 }}>
                <Typography variant="body2">
                  {dayjs(e.date).format("MMM D, YYYY")}
                </Typography>
              </Box>
              <Box sx={{ flex: 1, pr: 1 }}>
                <Typography variant="body2">{e.description}</Typography>
              </Box>
              <Box sx={{ width: 100, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                <Typography variant="body2">${e.amount.toFixed(2)}</Typography>
              </Box>
              <Box sx={{ width: 90, textAlign: "center" }}>
                <Chip
                  size="small"
                  label={e.billable ? "Billable" : "Internal"}
                  variant="outlined"
                  color={e.billable ? "success" : "default"}
                />
              </Box>
              <Box sx={{ width: 40, textAlign: "right" }}>
                <IconButton
                  size="small"
                  onClick={() => setExpenses(expenses.filter((x) => x.id !== e.id))}
                  sx={{ color: "text.disabled", "&:hover": { color: "error.main" } }}
                >
                  <CloseIcon fontSize="small" />
                </IconButton>
              </Box>
            </Stack>
          ))}
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
        <MockRichText
          placeholder="Anything else worth capturing."
          minRows={6}
        />
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
