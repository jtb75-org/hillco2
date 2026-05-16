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
  Grid,
  IconButton,
  Link as MuiLink,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import CloseIcon from "@mui/icons-material/Close";
import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import { DatePicker } from "@mui/x-date-pickers";
import dayjs from "dayjs";
import { Link as RouterLink } from "react-router-dom";

import { LabeledField } from "../../components/LabeledField";
import { PageHeader } from "../../components/PageHeader";
import { RichTextEditor } from "../../components/RichTextEditor";
import { ghostFieldSx } from "../../components/ghostFieldSx";

/**
 * MOCKUP — not wired to any API. Renders the proposed engagement
 * detail layout for review. Lives at /mockup/engagement-detail.
 * Throw away when the live engagement page is rebuilt.
 *
 * Structure mirrors the source HillCo engagement record PDF, with
 * the intake_snapshot (PR #107) surfaced read-only at the top:
 *
 *   Header (family + student + type, status, started/target, fees rollup)
 *   Intake context (from intake_snapshot — read-only)
 *   Document review (educational + medical)
 *   Support-needs profile (curriculum / placement & size / social-emotional / extras)
 *   Campus visits (repeatable)
 *   Feedback & next steps
 *   Time + fees rollup
 *   Engagement notes (rich text catch-all)
 */
export function EngagementMockup() {
  return (
    <Stack spacing={3}>
      <Alert severity="info" variant="outlined">
        <Typography variant="body2">
          <strong>Mockup —</strong> nothing on this page saves. Inputs are
          interactive so the shape is realistic, but the data is dummy and
          throws away on reload. Reachable at{" "}
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

      <DocumentReviewCard />

      <SupportNeedsCard />

      <CampusVisitsCard />

      <FeedbackCard />

      <TimeAndFeesCard />

      <NotesCard />
    </Stack>
  );
}

// ---- Header strip --------------------------------------------------------

function HeaderStrip() {
  return (
    <Paper variant="outlined" sx={{ p: 2.5 }}>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems="flex-start">
        <Box sx={{ flex: 1 }}>
          <LabeledField label="Status">
            <TextField
              select
              size="small"
              fullWidth
              sx={ghostFieldSx}
              defaultValue="in_progress"
            >
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
      </Stack>
    </Paper>
  );
}

// ---- Intake context (read-only snapshot) --------------------------------

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
            <Typography variant="body2" sx={{ fontStyle: "italic", color: "text.secondary" }}>
              Lost in unstructured time. Written-output meltdowns 2–3×/week
              despite extended-time accommodation. Peer group has thinned out
              after two close friends moved schools.
            </Typography>
          </Grid>
        </Grid>

        <Divider sx={{ my: 1.5 }} />
        <Typography variant="caption" color="text.disabled">
          Read-only snapshot from the intake. To revise the family's stated
          goals or constraints, open the intake and the next engagement
          spawned from it will pick up the new context.
        </Typography>
      </CardContent>
    </Card>
  );
}

// ---- Document review ----------------------------------------------------

interface DocItem {
  id: string;
  title: string;
  date: string;
  summary: string;
}

function DocumentReviewCard() {
  const [educational, setEducational] = useState<DocItem[]>([
    {
      id: "1",
      title: "Current IEP — Clayton Middle",
      date: "2025-09-12",
      summary: "Goals around written expression + executive function. Extended-time + scribe accommodations.",
    },
    {
      id: "2",
      title: "Neuropsych report — Dr. Hoffman",
      date: "2024-11-04",
      summary: "ASD Level 1, ADHD-combined, written-expression LD. Recommendations for small-class structured environment.",
    },
  ]);
  const [medical, setMedical] = useState<DocItem[]>([
    {
      id: "3",
      title: "Pediatrician summary — Dr. Park",
      date: "2025-08-15",
      summary: "Healthy growth, no medical contraindications. Note about anxiety in transitions.",
    },
  ]);
  return (
    <Card variant="outlined">
      <CardContent>
        <SectionHeader title="Review of documents" timeTag="2 hr typical" />
        <DocList
          label="Educational"
          docs={educational}
          onAdd={(d) => setEducational([...educational, d])}
          onRemove={(id) => setEducational(educational.filter((x) => x.id !== id))}
        />
        <Box sx={{ mt: 2 }}>
          <DocList
            label="Medical"
            docs={medical}
            onAdd={(d) => setMedical([...medical, d])}
            onRemove={(id) => setMedical(medical.filter((x) => x.id !== id))}
          />
        </Box>
      </CardContent>
    </Card>
  );
}

function DocList({
  label,
  docs,
  onAdd,
  onRemove,
}: {
  label: string;
  docs: DocItem[];
  onAdd: (d: DocItem) => void;
  onRemove: (id: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  return (
    <Box>
      <Stack direction="row" spacing={1} alignItems="baseline" sx={{ mb: 1 }}>
        <Typography variant="overline" color="text.secondary">
          {label}
        </Typography>
        <Typography variant="caption" color="text.disabled">
          ({docs.length})
        </Typography>
        <Box sx={{ flex: 1 }} />
        {!adding && (
          <Button
            size="small"
            startIcon={<AddIcon />}
            onClick={() => setAdding(true)}
          >
            Add document
          </Button>
        )}
      </Stack>
      <Stack divider={<Divider flexItem />} spacing={1}>
        {docs.map((d) => (
          <Box key={d.id} sx={{ display: "flex", gap: 1, py: 1 }}>
            <DescriptionOutlinedIcon fontSize="small" sx={{ mt: 0.5, color: "text.disabled" }} />
            <Box sx={{ flex: 1 }}>
              <Stack direction="row" alignItems="baseline" spacing={1}>
                <Typography variant="body2" sx={{ fontWeight: 500 }}>
                  {d.title}
                </Typography>
                <Typography variant="caption" color="text.disabled">
                  {dayjs(d.date).format("MMM D, YYYY")}
                </Typography>
              </Stack>
              <Typography variant="body2" color="text.secondary">
                {d.summary}
              </Typography>
            </Box>
            <IconButton
              size="small"
              aria-label="Remove document"
              onClick={() => onRemove(d.id)}
              sx={{ color: "text.disabled", "&:hover": { color: "error.main" } }}
            >
              <CloseIcon fontSize="small" />
            </IconButton>
          </Box>
        ))}
        {adding && (
          <Box sx={{ py: 1 }}>
            <Stack spacing={1.5}>
              <LabeledField label="Document title" required>
                <TextField
                  size="small"
                  fullWidth
                  autoFocus
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </LabeledField>
              <LabeledField label="Summary / key findings">
                <TextField
                  size="small"
                  fullWidth
                  multiline
                  minRows={2}
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                />
              </LabeledField>
              <Stack direction="row" spacing={1} justifyContent="flex-end">
                <Button
                  size="small"
                  onClick={() => {
                    setAdding(false);
                    setTitle("");
                    setSummary("");
                  }}
                >
                  Cancel
                </Button>
                <Button
                  size="small"
                  variant="contained"
                  disabled={!title.trim()}
                  onClick={() => {
                    onAdd({
                      id: `${Date.now()}`,
                      title: title.trim(),
                      date: dayjs().format("YYYY-MM-DD"),
                      summary: summary.trim(),
                    });
                    setAdding(false);
                    setTitle("");
                    setSummary("");
                  }}
                >
                  Add
                </Button>
              </Stack>
            </Stack>
          </Box>
        )}
      </Stack>
    </Box>
  );
}

// ---- Support needs / best educational environment -----------------------

function SupportNeedsCard() {
  return (
    <Card variant="outlined">
      <CardContent>
        <SectionHeader title="Best educational environment" timeTag="30 min typical" />
        <Grid container spacing={2}>
          <Grid item xs={12} md={6}>
            <LabeledField label="Curriculum">
              <MockRichText
                placeholder="Strengths-based academic profile + areas of stretch. Notes on instructional approach (Orton-Gillingham, project-based, etc.)."
                minRows={3}
                initial="<p>Reading + math at grade level. Needs <strong>structured writing instruction</strong> (sentence-level scaffolds before paragraph). Project-based learning landed in 5th — sustained that.</p>"
              />
            </LabeledField>
          </Grid>
          <Grid item xs={12} md={6}>
            <LabeledField label="Placement & size">
              <MockRichText
                placeholder="Class size, classroom culture, mix of mainstream vs supported settings."
                minRows={3}
                initial="<p>Small (under 16). Co-teaching model preferred. Open to a learning-disabilities-focused program if structured social piece is included.</p>"
              />
            </LabeledField>
          </Grid>
          <Grid item xs={12} md={6}>
            <LabeledField label="Social / emotional environment">
              <MockRichText
                placeholder="What he needs from peer group, advisory, lunch, transitions."
                minRows={3}
                initial="<p>Structured lunch + advisory time critical. He thrives with a peer-group mentor system. Open environments without adult scaffold are the consistent failure mode.</p>"
              />
            </LabeledField>
          </Grid>
          <Grid item xs={12} md={6}>
            <LabeledField label="Extra support services">
              <MockRichText
                placeholder="OT, speech, social-skills group, executive-function coaching, etc. needed in or alongside placement."
                minRows={3}
                initial="<ul><li>Continue social-skills group (Tuesday).</li><li>Executive-function coaching during academic day — ideally in-house.</li><li>Drop OT (discharged 2025).</li></ul>"
              />
            </LabeledField>
          </Grid>
        </Grid>
      </CardContent>
    </Card>
  );
}

// ---- Campus visits ------------------------------------------------------

interface CampusVisit {
  id: string;
  school: string;
  date: string;
  timeRange: string;
  attendees: string;
  facts: string;
  opinions: string;
}

function CampusVisitsCard() {
  const [visits, setVisits] = useState<CampusVisit[]>([
    {
      id: "v1",
      school: "Clayton HS",
      date: "2026-04-30",
      timeRange: "9–12",
      attendees: "Mary C. (school principal), Jane S. (SSD coordinator)",
      facts:
        "<p>Class size avg 14. 1:8 student-to-teacher ratio in core academics. Learning specialist embedded in each grade-level team.</p><p>$38k tuition + $4k extras. Out-of-district welcome with no surcharge.</p>",
      opinions:
        "<p>Strong cultural fit on the structured-social piece. Mary clearly knew her LD population by name. Worth pushing through admissions.</p>",
    },
    {
      id: "v2",
      school: "Crossroads HS",
      date: "2026-05-12",
      timeRange: "1–2",
      attendees: "Jill G. (principal), Sally S. (learning specialist)",
      facts:
        "<p>Class size 18-20. Pull-out support model rather than in-class. Tuition $35k.</p>",
      opinions:
        "<p>Curriculum is strong but the pull-out model would isolate Peter in a way that's the opposite of what we're targeting. Not a fit.</p>",
    },
  ]);
  return (
    <Card variant="outlined">
      <CardContent>
        <Stack direction="row" alignItems="baseline" spacing={1} sx={{ mb: 1.5 }}>
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            Search process — campus visits
          </Typography>
          <Typography variant="caption" color="text.disabled">
            ({visits.length})
          </Typography>
          <Chip
            size="small"
            label="≈2 hr / visit"
            variant="outlined"
            sx={{ ml: 1 }}
          />
          <Box sx={{ flex: 1 }} />
          <Button
            size="small"
            startIcon={<AddIcon />}
            onClick={() =>
              setVisits([
                ...visits,
                {
                  id: `v${Date.now()}`,
                  school: "",
                  date: dayjs().format("YYYY-MM-DD"),
                  timeRange: "",
                  attendees: "",
                  facts: "",
                  opinions: "",
                },
              ])
            }
          >
            Add visit
          </Button>
        </Stack>
        <Stack spacing={2}>
          {visits.map((v, i) => (
            <Accordion
              key={v.id}
              variant="outlined"
              disableGutters
              defaultExpanded={i === 0}
            >
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Stack direction="row" spacing={1.5} alignItems="baseline" sx={{ flex: 1 }}>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {v.school || "(new visit)"}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {v.date ? dayjs(v.date).format("MMM D, YYYY") : "—"}
                    {v.timeRange ? ` · ${v.timeRange}` : ""}
                  </Typography>
                </Stack>
              </AccordionSummary>
              <AccordionDetails>
                <Stack spacing={2}>
                  <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                    <Box sx={{ flex: 2 }}>
                      <LabeledField label="School">
                        <TextField
                          size="small"
                          fullWidth
                          sx={ghostFieldSx}
                          defaultValue={v.school}
                        />
                      </LabeledField>
                    </Box>
                    <Box sx={{ flex: 1 }}>
                      <LabeledField label="Date">
                        <DatePicker
                          value={v.date ? dayjs(v.date) : null}
                          onChange={() => undefined}
                          slotProps={{
                            textField: {
                              size: "small",
                              fullWidth: true,
                              sx: ghostFieldSx,
                            },
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
                          defaultValue={v.timeRange}
                          placeholder="9–12"
                        />
                      </LabeledField>
                    </Box>
                  </Stack>
                  <LabeledField label="Met with">
                    <TextField
                      size="small"
                      fullWidth
                      sx={ghostFieldSx}
                      defaultValue={v.attendees}
                      placeholder="Names + roles"
                    />
                  </LabeledField>
                  <LabeledField label="Facts — what we observed">
                    <MockRichText
                      placeholder="Class size, ratio, curriculum specifics, tuition, etc."
                      initial={v.facts}
                      minRows={3}
                    />
                  </LabeledField>
                  <LabeledField label="Opinions — fit assessment">
                    <MockRichText
                      placeholder="Your read on whether this is a fit. What stood out, what felt off."
                      initial={v.opinions}
                      minRows={3}
                    />
                  </LabeledField>
                  <Stack direction="row" justifyContent="flex-end">
                    <Button
                      size="small"
                      color="error"
                      onClick={() =>
                        setVisits(visits.filter((x) => x.id !== v.id))
                      }
                    >
                      Remove visit
                    </Button>
                  </Stack>
                </Stack>
              </AccordionDetails>
            </Accordion>
          ))}
        </Stack>
      </CardContent>
    </Card>
  );
}

// ---- Feedback & next steps ----------------------------------------------

function FeedbackCard() {
  return (
    <Card variant="outlined">
      <CardContent>
        <SectionHeader title="Feedback & next steps" timeTag="1 hr typical" />
        <Grid container spacing={2}>
          <Grid item xs={12} md={6}>
            <LabeledField label="Recommendations to the family">
              <MockRichText
                placeholder="What you'd tell the family in the feedback call: which schools, which order, why."
                initial="<p>I encourage you to look at <strong>Clayton HS</strong> first. The structured-social piece is what Peter needs and Mary clearly runs that program intentionally. Cross Crossroads off — the pull-out model isolates him in the way we want to avoid.</p>"
                minRows={4}
              />
            </LabeledField>
          </Grid>
          <Grid item xs={12} md={6}>
            <LabeledField label="Admissions / tuition discussion">
              <MockRichText
                placeholder="Application timeline, tuition + fees, scholarships, deposit deadlines, anything the family needs to act on."
                initial="<p>Clayton accepts rolling applications through May. $500 deposit holds the spot. Tuition due in two halves (Aug + Jan). No financial aid mid-cycle, but Mary mentioned they sometimes adjust for hardship — worth a call if budget is a constraint.</p>"
                minRows={4}
              />
            </LabeledField>
          </Grid>
          <Grid item xs={12}>
            <LabeledField label="Offered follow-on services">
              <MockRichText
                placeholder="What HillCo can do after acceptance — tour day, IEP meeting attendance, transition planning, etc."
                initial="<ul><li>Offer to tour the campus with the family or assist in transition planning once they've been accepted.</li><li>IEP meeting attendance at Clayton in the fall.</li><li>Doctor referrals + community connections package.</li></ul>"
                minRows={3}
              />
            </LabeledField>
          </Grid>
        </Grid>
      </CardContent>
    </Card>
  );
}

// ---- Time + fees rollup -------------------------------------------------

function TimeAndFeesCard() {
  const HOURLY = 150;
  const lines = [
    { label: "Document review", hours: 2 },
    { label: "Best educational environment", hours: 0.5 },
    { label: "Campus visit — Clayton HS", hours: 4.5 },
    { label: "Campus visit — Crossroads HS", hours: 2 },
    { label: "Feedback & next steps", hours: 1 },
  ];
  const total = lines.reduce((s, l) => s + l.hours, 0);
  const dollars = total * HOURLY;
  return (
    <Card variant="outlined">
      <CardContent>
        <SectionHeader title="Time & fees" />
        <Grid container spacing={2}>
          <Grid item xs={12} md={7}>
            <Stack
              divider={<Divider flexItem />}
              spacing={0}
              sx={{
                border: 1,
                borderColor: "divider",
                borderRadius: 1,
              }}
            >
              {lines.map((l) => (
                <Stack
                  key={l.label}
                  direction="row"
                  alignItems="center"
                  sx={{ px: 1.5, py: 1 }}
                >
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="body2">{l.label}</Typography>
                  </Box>
                  <Typography
                    variant="body2"
                    sx={{ width: 60, textAlign: "right", color: "text.secondary" }}
                  >
                    {l.hours} hr
                  </Typography>
                  <Typography
                    variant="body2"
                    sx={{ width: 80, textAlign: "right", fontVariantNumeric: "tabular-nums" }}
                  >
                    ${(l.hours * HOURLY).toFixed(0)}
                  </Typography>
                </Stack>
              ))}
              <Stack
                direction="row"
                alignItems="center"
                sx={{ px: 1.5, py: 1.25, bgcolor: "action.hover" }}
              >
                <Box sx={{ flex: 1 }}>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    Total
                  </Typography>
                </Box>
                <Typography
                  variant="body2"
                  sx={{ width: 60, textAlign: "right", fontWeight: 600 }}
                >
                  {total} hr
                </Typography>
                <Typography
                  variant="body2"
                  sx={{
                    width: 80,
                    textAlign: "right",
                    fontWeight: 700,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  ${dollars.toFixed(0)}
                </Typography>
              </Stack>
            </Stack>
          </Grid>
          <Grid item xs={12} md={5}>
            <Stack spacing={1.5}>
              <LabeledField label="Hourly rate">
                <TextField
                  size="small"
                  fullWidth
                  sx={ghostFieldSx}
                  defaultValue={`$${HOURLY}`}
                />
              </LabeledField>
              <Box>
                <Typography variant="overline" color="text.secondary" sx={{ display: "block" }}>
                  Invoiced
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  $0 of ${dollars.toFixed(0)}. Generate an invoice from this
                  engagement when ready.
                </Typography>
                <Button size="small" variant="outlined" sx={{ mt: 1 }}>
                  Create invoice →
                </Button>
              </Box>
            </Stack>
          </Grid>
        </Grid>
      </CardContent>
    </Card>
  );
}

// ---- Notes catch-all ----------------------------------------------------

function NotesCard() {
  return (
    <Card variant="outlined">
      <CardContent>
        <SectionHeader
          title="Engagement notes"
          hint="Free-form narrative — anything the structured sections missed."
        />
        <MockRichText
          placeholder="Anything else worth capturing for this engagement."
          minRows={6}
        />
      </CardContent>
    </Card>
  );
}

// ---- Helpers ------------------------------------------------------------

function SectionHeader({
  title,
  hint,
  timeTag,
}: {
  title: string;
  hint?: string;
  timeTag?: string;
}) {
  return (
    <Stack direction="row" alignItems="baseline" spacing={1} sx={{ mb: 2 }}>
      <Typography variant="h6" sx={{ fontWeight: 600 }}>
        {title}
      </Typography>
      {timeTag && (
        <Chip
          size="small"
          label={timeTag}
          variant="outlined"
          sx={{ ml: 1, color: "text.secondary" }}
        />
      )}
      <Box sx={{ flex: 1 }} />
      {hint && (
        <Typography variant="caption" color="text.secondary">
          {hint}
        </Typography>
      )}
    </Stack>
  );
}

/** Local-state wrapper around the real RichTextEditor for the
 *  mockup. Each instance is independently editable; reload loses
 *  everything. */
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
