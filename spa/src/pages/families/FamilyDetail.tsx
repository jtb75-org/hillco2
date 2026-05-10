import { useState } from "react";
import {
  Alert,
  Box,
  Breadcrumbs,
  Button,
  Card,
  CardActionArea,
  CardContent,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Divider,
  Grid,
  Link as MuiLink,
  Skeleton,
  Stack,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import EditIcon from "@mui/icons-material/Edit";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";
import { Link as RouterLink, useParams } from "react-router-dom";

import { api } from "../../api/client";
import { CardActionsMenu } from "../../components/CardActionsMenu";

import { AddParentDialog } from "./AddParentDialog";
import { AddStudentDialog } from "./AddStudentDialog";
import { EditStudentDialog } from "./EditStudentDialog";
import { ParentDrawer } from "./ParentDrawer";

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
      <Breadcrumbs>
        <MuiLink component={RouterLink} to="/families" color="inherit" underline="hover">
          Families
        </MuiLink>
        <Typography color="text.primary">
          {isPending ? <Skeleton width={140} /> : data?.household_name}
        </Typography>
      </Breadcrumbs>

      <Box>
        <Typography variant="h4">
          {isPending ? <Skeleton width={280} /> : data?.household_name}
        </Typography>
        {!isPending && data?.notes && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {data.notes}
          </Typography>
        )}
      </Box>

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
          <EngagementsCard engagements={data?.engagements} loading={isPending} />
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
    <Box>
      <Typography variant="overline" color="text.secondary" sx={{ display: "block", mb: 1 }}>
        Parents / guardians
      </Typography>
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
                    sx={{
                      height: "100%",
                      boxShadow: 1,
                      transition: (t) => t.transitions.create("box-shadow"),
                      "&:hover": { boxShadow: 3 },
                    }}
                  >
                    <CardActionArea
                      onClick={() => setDrawerParent(p)}
                      sx={{ height: "100%" }}
                    >
                      <CardContent>
                        <Stack direction="row" alignItems="baseline" spacing={1} sx={{ mb: 0.5 }}>
                          <Typography variant="subtitle1" sx={{ fontWeight: 600, flex: 1 }}>
                            {p.name}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {p.role}
                          </Typography>
                        </Stack>
                        <Stack direction="row" spacing={0.5} sx={{ mb: 1 }}>
                          {p.id === primaryId && (
                            <Chip size="small" label="primary" color="primary" variant="outlined" />
                          )}
                          {isBilling && (
                            <Chip size="small" label="billing" color="success" variant="outlined" />
                          )}
                        </Stack>
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
                        {p.mailing_address && (
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            sx={{ display: "block", whiteSpace: "pre-line", mt: 0.75 }}
                          >
                            {p.mailing_address}
                          </Typography>
                        )}
                        {isBilling && (p.billing_address || p.billing_attention_to) && (
                          <Box sx={{ mt: 0.75, pt: 0.75, borderTop: 1, borderColor: "divider" }}>
                            <Typography variant="caption" color="text.secondary" sx={{ fontStyle: "italic" }}>
                              Billing override:
                            </Typography>
                            {p.billing_attention_to && (
                              <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                                Attn: {p.billing_attention_to}
                              </Typography>
                            )}
                            {p.billing_address && (
                              <Typography
                                variant="caption"
                                color="text.secondary"
                                sx={{ display: "block", whiteSpace: "pre-line" }}
                              >
                                {p.billing_address}
                              </Typography>
                            )}
                          </Box>
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
  const [editing, setEditing] = useState<Student | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Student | null>(null);

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error: respError } = await api.DELETE(
        "/api/students/{student_id}",
        { params: { path: { student_id: id } } },
      );
      if (respError) {
        const msg = (respError as { detail?: string }).detail ?? "Failed.";
        throw new Error(msg);
      }
    },
    onSuccess: () => {
      setConfirmDelete(null);
      onChanged();
    },
  });

  return (
    <Box>
      <Typography variant="overline" color="text.secondary" sx={{ display: "block", mb: 1 }}>
        Students
      </Typography>
      <Grid container spacing={2}>
        {loading ? (
          <Grid item xs={12} sm={6} md={4}>
            <Skeleton variant="rounded" height={120} />
          </Grid>
        ) : (
          (students ?? []).map((s) => (
            <Grid key={s.id} item xs={12} sm={6} md={4}>
              <Card
                sx={{
                  height: "100%",
                  position: "relative",
                  boxShadow: 1,
                  transition: (t) => t.transitions.create("box-shadow"),
                  "&:hover": { boxShadow: 3 },
                }}
              >
                <CardActionArea
                  component={RouterLink}
                  to={`/students/${s.id}`}
                  sx={{ height: "100%" }}
                >
                  <CardContent sx={{ pr: 5 }}>
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
                <CardActionsMenu
                  actions={[
                    {
                      label: "Edit details",
                      icon: <EditIcon fontSize="small" />,
                      onClick: () => setEditing(s),
                    },
                    {
                      label: "Remove from family",
                      icon: <DeleteOutlineIcon fontSize="small" />,
                      variant: "danger",
                      onClick: () => setConfirmDelete(s),
                    },
                  ]}
                />
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
      <EditStudentDialog
        open={!!editing}
        student={editing}
        onClose={() => setEditing(null)}
        onSaved={onChanged}
      />
      <Dialog
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Remove {confirmDelete?.name}?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            They'll be soft-deleted from the system. Engagements stay intact
            with their student id reference; you can reach out if you need a
            hard reset.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDelete(null)}>Cancel</Button>
          <Button
            color="error"
            variant="contained"
            disabled={remove.isPending}
            onClick={() => confirmDelete && remove.mutate(confirmDelete.id)}
          >
            Remove
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
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
  engagements,
  loading,
}: {
  engagements?: Engagement[];
  loading: boolean;
}) {
  return (
    <Card variant="outlined">
      <CardContent>
        <Typography variant="overline" color="text.secondary">
          Engagements
        </Typography>
        {loading ? (
          <Skeleton width="60%" sx={{ mt: 1 }} />
        ) : !engagements || engagements.length === 0 ? (
          <Typography variant="body2" color="text.disabled" sx={{ mt: 1 }}>
            No engagements yet.
          </Typography>
        ) : (
          <Stack divider={<Divider />} sx={{ mt: 1 }}>
            {engagements.map((e) => (
              <Stack
                key={e.id}
                direction="row"
                alignItems="center"
                spacing={2}
                sx={{ py: 1 }}
                component={RouterLink}
                to={`/engagements/${e.id}`}
                style={{ textDecoration: "none", color: "inherit" }}
              >
                <Typography variant="body1" sx={{ flex: 1, fontWeight: 500 }}>
                  {e.engagement_type.replace(/_/g, " ")}
                </Typography>
                <Chip
                  size="small"
                  label={e.status}
                  color={e.status === "in_progress" ? "primary" : "default"}
                  variant="outlined"
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
      </CardContent>
    </Card>
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
