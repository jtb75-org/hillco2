import { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardActionArea,
  CardContent,
  Chip,
  Divider,
  Grid,
  Link as MuiLink,
  Skeleton,
  Stack,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";
import { Link as RouterLink, useNavigate, useParams, useSearchParams } from "react-router-dom";

import { api } from "../../api/client";

import { NewEngagementDialog } from "./NewEngagementDialog";
import { PageHeader } from "../../components/PageHeader";
import { SectionPanel } from "../../components/SectionPanel";
import { StatusChip } from "../../components/StatusChip";

import { AddParentDialog } from "./AddParentDialog";
import { AddStudentDialog } from "./AddStudentDialog";
import { ParentDrawer } from "./ParentDrawer";
import { StudentDrawer } from "../students/StudentDrawer";

// /api/families/{id} returns a plain dict in the route — its OpenAPI
// response schema is empty. Hand-typed for the parts we render; the
// full shape is documented at app/routes/families.py:family_detail.
interface Parent {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: string;
  is_primary_contact: boolean;
  is_billing_contact: boolean;
  mailing_address: string | null;
  billing_address: string | null;
  billing_attention_to: string | null;
}
interface Student {
  id: string;
  name: string;
  current_grade: string | null;
  // Clinical flags surface as small chips under the name. The full
  // editing surface lives on /students/:id.
  has_504?: boolean;
  has_iep?: boolean;
  has_learning_disability?: boolean;
  has_adhd?: boolean;
  has_intellectual_disability?: boolean;
  has_health_impairment?: boolean;
  has_emotional_disturbance?: boolean;
  autism_level?: number | null;
}
interface Engagement {
  id: string;
  engagement_type: string;
  status: string;
  start_date: string | null;
  target_end_date: string | null;
}
interface FamilyDetail {
  id: string;
  household_name: string;
  notes: string | null;
  primary_parent_id: string | null;
  billing_parent_id: string | null;
  parents: Parent[];
  students: Student[];
  engagements: Engagement[];
  created_at: string;
  updated_at: string;
}

export function FamilyDetail() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();

  const { data, isPending, error } = useQuery<FamilyDetail, Error>({
    queryKey: ["families", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error: respError, response } = await api.GET(
        "/api/families/{family_id}",
        { params: { path: { family_id: id! } } },
      );
      if (response.status === 404) throw new Error("Family not found");
      if (respError || !data) throw new Error("families fetch failed");
      return data as unknown as FamilyDetail;
    },
  });

  if (error) {
    return <Alert severity="error">{error.message}</Alert>;
  }

  return (
    <Stack spacing={3}>
      <PageHeader
        title={isPending ? <Skeleton width={280} /> : data?.household_name}
        subtitle={!isPending && data?.notes ? data.notes : undefined}
        breadcrumbs={
          <>
            <MuiLink component={RouterLink} to="/families" color="inherit" underline="hover">
              Families
            </MuiLink>
            <Typography color="text.primary">
              {isPending ? <Skeleton width={140} /> : data?.household_name}
            </Typography>
          </>
        }
      />

      <Grid container spacing={3}>
        <Grid item xs={12}>
          <ParentsCard
            familyId={id!}
            parents={data?.parents}
            loading={isPending}
            primaryId={data?.primary_parent_id ?? null}
            billingId={data?.billing_parent_id ?? null}
            onChanged={() => qc.invalidateQueries({ queryKey: ["families", id] })}
          />
        </Grid>
        <Grid item xs={12}>
          <StudentsCard
            familyId={id!}
            students={data?.students}
            loading={isPending}
            onChanged={() => qc.invalidateQueries({ queryKey: ["families", id] })}
          />
        </Grid>
        <Grid item xs={12}>
          <EngagementsCard
            familyId={id!}
            familyName={data?.household_name ?? ""}
            students={data?.students ?? []}
            engagements={data?.engagements}
            loading={isPending}
          />
        </Grid>
      </Grid>
    </Stack>
  );
}

// ---- Parents -----------------------------------------------------------

function ParentsCard({
  familyId,
  parents,
  loading,
  primaryId,
  billingId,
  onChanged,
}: {
  familyId: string;
  parents?: Parent[];
  loading: boolean;
  primaryId: string | null;
  billingId: string | null;
  onChanged: () => void;
}) {
  const [addOpen, setAddOpen] = useState(false);
  const [drawerParent, setDrawerParent] = useState<Parent | null>(null);
  const hasBilling = parents?.some((p) => p.is_billing_contact) ?? false;

  // Keep the drawer's parent reference in sync as the family detail
  // refetches after a save — otherwise the drawer holds stale data.
  const liveDrawerParent =
    drawerParent && (parents ?? []).find((p) => p.id === drawerParent.id)
      ? (parents ?? []).find((p) => p.id === drawerParent.id)!
      : drawerParent;

  return (
    <SectionPanel title="Parents / guardians">
      <Box sx={{ p: 2 }}>
      <Grid container spacing={2}>
        {loading
          ? [0, 1].map((i) => (
              <Grid key={i} item xs={12} sm={6} md={4}>
                <Skeleton variant="rounded" height={140} />
              </Grid>
            ))
          : (parents ?? []).map((p) => {
              const isBilling = p.id === billingId;
              return (
                <Grid key={p.id} item xs={12} sm={6} md={4}>
                  <Card
                    variant="outlined"
                    sx={{
                      height: "100%",
                      transition: (t) => t.transitions.create(["border-color", "background-color"]),
                      "&:hover": { borderColor: "primary.light", bgcolor: "action.hover" },
                    }}
                  >
                    <CardActionArea
                      onClick={() => setDrawerParent(p)}
                      sx={{ height: "100%" }}
                    >
                      <CardContent>
                        {/* Trimmed per design: chips on top, then
                            name, email, phone. Address + billing
                            override live on the drawer. */}
                        <Stack direction="row" spacing={0.5} sx={{ mb: 1, minHeight: 24 }}>
                          {p.id === primaryId && (
                            <StatusChip size="small" label="primary" tone="info" variant="soft" />
                          )}
                          {isBilling && (
                            <StatusChip size="small" label="billing" tone="success" variant="soft" />
                          )}
                        </Stack>
                        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                          {p.name}
                        </Typography>
                        {p.email && (
                          <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                            {p.email}
                          </Typography>
                        )}
                        {p.phone && (
                          <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                            {p.phone}
                          </Typography>
                        )}
                      </CardContent>
                    </CardActionArea>
                  </Card>
                </Grid>
              );
            })}
        {!loading && (
          <Grid item xs={12} sm={6} md={4}>
            <AddCard label="Add parent / guardian" onClick={() => setAddOpen(true)} />
          </Grid>
        )}
      </Grid>
      {!loading && (parents?.length ?? 0) > 0 && !hasBilling && (
        <Typography variant="caption" color="warning.main" sx={{ display: "block", mt: 1 }}>
          No billing contact flagged — invoices won't have a recipient.
        </Typography>
      )}
      <AddParentDialog
        open={addOpen}
        familyId={familyId}
        onClose={() => setAddOpen(false)}
        onCreated={(parentId) => {
          // Refetch so the new parent is in the family detail data,
          // then pop the drawer for that parent so the operator fills
          // in the rest (email, address, role, flags) right away.
          onChanged();
          setDrawerParent({ id: parentId } as Parent);
        }}
      />
      <ParentDrawer
        open={!!drawerParent}
        parent={liveDrawerParent}
        onClose={() => setDrawerParent(null)}
        onChanged={onChanged}
        onRemoved={onChanged}
      />
      </Box>
    </SectionPanel>
  );
}

// ---- Students ----------------------------------------------------------

function StudentsCard({
  familyId,
  students,
  loading,
  onChanged,
}: {
  familyId: string;
  students?: Student[];
  loading: boolean;
  onChanged: () => void;
}) {
  const [addOpen, setAddOpen] = useState(false);
  const [drawerId, setDrawerId] = useState<string | null>(null);

  return (
    <SectionPanel title="Students">
      <Box sx={{ p: 2 }}>
      <Grid container spacing={2}>
        {loading ? (
          <Grid item xs={12} sm={6} md={4}>
            <Skeleton variant="rounded" height={120} />
          </Grid>
        ) : (
          (students ?? []).map((s) => (
            <Grid key={s.id} item xs={12} sm={6} md={4}>
              <Card
                variant="outlined"
                sx={{
                  height: "100%",
                  transition: (t) => t.transitions.create(["border-color", "background-color"]),
                  "&:hover": { borderColor: "primary.light", bgcolor: "action.hover" },
                }}
              >
                <CardActionArea
                  onClick={() => setDrawerId(s.id)}
                  sx={{ height: "100%" }}
                >
                  <CardContent>
                    <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                      {s.name}
                    </Typography>
                    {s.current_grade && (
                      <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                        Grade {s.current_grade}
                      </Typography>
                    )}
                    <StudentFlagChips student={s} />
                  </CardContent>
                </CardActionArea>
              </Card>
            </Grid>
          ))
        )}
        {!loading && (
          <Grid item xs={12} sm={6} md={4}>
            <AddCard label="Add student" onClick={() => setAddOpen(true)} />
          </Grid>
        )}
      </Grid>
      <AddStudentDialog
        open={addOpen}
        familyId={familyId}
        onClose={() => setAddOpen(false)}
        onCreated={onChanged}
      />
      <StudentDrawer
        open={!!drawerId}
        studentId={drawerId}
        onClose={() => setDrawerId(null)}
        onChanged={onChanged}
        onRemoved={onChanged}
      />
      </Box>
    </SectionPanel>
  );
}

// Shared "+" card. Dashed border, neutral by default, primary tint on
// hover. Used at the end of every card grid that supports adding.
function AddCard({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Card
      variant="outlined"
      onClick={onClick}
      sx={{
        height: "100%",
        minHeight: 140,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        borderStyle: "dashed",
        borderColor: "divider",
        color: "text.secondary",
        bgcolor: "transparent",
        transition: (t) => t.transitions.create(["border-color", "color", "background-color"]),
        "&:hover": {
          borderColor: "primary.main",
          color: "primary.main",
          bgcolor: "action.hover",
        },
      }}
    >
      <Stack direction="row" alignItems="center" spacing={1}>
        <AddIcon fontSize="small" />
        <Typography variant="body2" sx={{ fontWeight: 500 }}>
          {label}
        </Typography>
      </Stack>
    </Card>
  );
}

// ---- Engagements -------------------------------------------------------

function EngagementsCard({
  familyId,
  familyName,
  students,
  engagements,
  loading,
}: {
  familyId: string;
  familyName: string;
  students: Student[];
  engagements?: Engagement[];
  loading: boolean;
}) {
  const navigate = useNavigate();
  const [newOpen, setNewOpen] = useState(false);
  // Auto-open the create dialog when the engagements list page routes
  // us here via /families/:id?new=engagement, then strip the param so
  // a reload doesn't keep re-opening the dialog.
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    if (!loading && students.length > 0 && searchParams.get("new") === "engagement") {
      setNewOpen(true);
      const next = new URLSearchParams(searchParams);
      next.delete("new");
      setSearchParams(next, { replace: true });
    }
  }, [loading, students.length, searchParams, setSearchParams]);
  const studentChoices = students.map((s) => ({
    id: s.id,
    name: s.name,
    current_grade: s.current_grade,
  }));
  return (
    <SectionPanel
      title="Engagements"
      actions={
        <Button
          size="small"
          startIcon={<AddIcon />}
          onClick={() => setNewOpen(true)}
          disabled={loading || students.length === 0}
        >
          New engagement
        </Button>
      }
    >
      <Box sx={{ p: 2 }}>
        {loading ? (
          <Skeleton width="60%" sx={{ mt: 1 }} />
        ) : !engagements || engagements.length === 0 ? (
          <Typography variant="body2" color="text.disabled" sx={{ mt: 1 }}>
            {students.length === 0
              ? "Add a student first, then start an engagement."
              : "No engagements yet. Click New engagement to start one."}
          </Typography>
        ) : (
          <Stack divider={<Divider />} sx={{ mt: 1 }}>
            {engagements.map((e) => (
              <Stack
                key={e.id}
                direction="row"
                alignItems="center"
                spacing={2}
                sx={{ py: 1, cursor: "pointer" }}
                onClick={() => navigate(`/engagements/${e.id}`)}
              >
                <Typography variant="body1" sx={{ flex: 1, fontWeight: 500 }}>
                  {e.engagement_type.replace(/_/g, " ")}
                </Typography>
                <StatusChip
                  size="small"
                  label={e.status.replace(/_/g, " ")}
                  tone={e.status === "in_progress" ? "info" : "neutral"}
                  variant="soft"
                />
                {e.start_date && (
                  <Typography variant="caption" color="text.secondary">
                    started {dayjs(e.start_date).format("MMM YYYY")}
                  </Typography>
                )}
              </Stack>
            ))}
          </Stack>
        )}
      </Box>
      <NewEngagementDialog
        open={newOpen}
        familyId={familyId}
        familyName={familyName}
        students={studentChoices}
        onClose={() => setNewOpen(false)}
        onCreated={(id) => navigate(`/engagements/${id}`)}
      />
    </SectionPanel>
  );
}

// Compact active-flag chips for the student card. Hidden when nothing
// is on; otherwise renders the labels for whichever flags are TRUE
// plus "Autism N" when autism_level is set.
function StudentFlagChips({ student: s }: { student: Student }) {
  const chips: string[] = [];
  if (s.has_504) chips.push("504");
  if (s.has_iep) chips.push("IEP");
  if (s.has_learning_disability) chips.push("LD");
  if (s.autism_level != null) chips.push(`Autism ${s.autism_level}`);
  if (s.has_adhd) chips.push("ADHD");
  if (s.has_intellectual_disability) chips.push("Intellectual");
  if (s.has_health_impairment) chips.push("Health");
  if (s.has_emotional_disturbance) chips.push("Emotional");
  if (chips.length === 0) return null;
  return (
    <Stack direction="row" spacing={0.5} flexWrap="wrap" sx={{ mt: 1, gap: 0.5 }}>
      {chips.map((c) => (
        <Chip key={c} size="small" label={c} variant="outlined" />
      ))}
    </Stack>
  );
}
