import {
  Alert,
  Box,
  Breadcrumbs,
  Card,
  CardContent,
  Chip,
  Divider,
  Grid,
  Link as MuiLink,
  Skeleton,
  Stack,
  Typography,
} from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";
import { Link as RouterLink, useParams } from "react-router-dom";

import { api } from "../../api/client";

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
  billing_address: string | null;
  billing_attention_to: string | null;
}
interface Student {
  id: string;
  name: string;
  current_grade: string | null;
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
        <Grid item xs={12} md={5}>
          <BillingCard parents={data?.parents} loading={isPending} />
        </Grid>
        <Grid item xs={12} md={7}>
          <ParentsCard
            parents={data?.parents}
            loading={isPending}
            primaryId={data?.primary_parent_id ?? null}
            billingId={data?.billing_parent_id ?? null}
          />
        </Grid>
      </Grid>

      <StudentsCard students={data?.students} loading={isPending} />

      <EngagementsCard engagements={data?.engagements} loading={isPending} />
    </Stack>
  );
}

// ---- Billing -----------------------------------------------------------

function BillingCard({ parents, loading }: { parents?: Parent[]; loading: boolean }) {
  // Billing data lives on whichever parent is flagged is_billing_contact.
  // No billing parent → fall back to the primary parent's name+email so
  // the operator at least sees who'd get the bill in practice; UI flags
  // the missing flag so they can promote one.
  const billing = parents?.find((p) => p.is_billing_contact);
  const primary = parents?.find((p) => p.is_primary_contact);
  const display = billing ?? primary ?? null;
  return (
    <Card variant="outlined" sx={{ height: "100%" }}>
      <CardContent>
        <Typography variant="overline" color="text.secondary">
          Billing
        </Typography>
        {loading ? (
          <Stack spacing={1} sx={{ mt: 1 }}>
            <Skeleton width="60%" />
            <Skeleton width="80%" />
            <Skeleton width="40%" />
          </Stack>
        ) : !display ? (
          <Typography variant="body2" color="text.disabled" sx={{ mt: 1 }}>
            No billing contact set. Add a parent and flag them as the
            billing contact.
          </Typography>
        ) : (
          <Stack spacing={0.5} sx={{ mt: 1 }}>
            <Typography variant="body1" sx={{ fontWeight: 500 }}>
              {display.name}
            </Typography>
            {display.email && (
              <Typography variant="body2" color="text.secondary">{display.email}</Typography>
            )}
            {billing?.billing_attention_to && (
              <Typography variant="body2" color="text.secondary">
                Attn: {billing.billing_attention_to}
              </Typography>
            )}
            {billing?.billing_address && (
              <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: "pre-line" }}>
                {billing.billing_address}
              </Typography>
            )}
            {!billing && primary && (
              <Typography variant="caption" color="text.disabled" sx={{ mt: 1 }}>
                No billing contact flagged — falling back to the primary parent.
              </Typography>
            )}
          </Stack>
        )}
      </CardContent>
    </Card>
  );
}

// ---- Parents -----------------------------------------------------------

function ParentsCard({
  parents,
  loading,
  primaryId,
  billingId,
}: {
  parents?: Parent[];
  loading: boolean;
  primaryId: string | null;
  billingId: string | null;
}) {
  return (
    <Card variant="outlined" sx={{ height: "100%" }}>
      <CardContent>
        <Typography variant="overline" color="text.secondary">
          Parents / guardians
        </Typography>
        {loading ? (
          <Stack spacing={1} sx={{ mt: 1 }}>
            <Skeleton width="80%" />
            <Skeleton width="80%" />
          </Stack>
        ) : !parents || parents.length === 0 ? (
          <Typography variant="body2" color="text.disabled" sx={{ mt: 1 }}>
            No parents added yet.
          </Typography>
        ) : (
          <Stack divider={<Divider />} sx={{ mt: 1 }}>
            {parents.map((p) => (
              <Box key={p.id} sx={{ py: 1 }}>
                <Stack direction="row" alignItems="center" spacing={1}>
                  <Typography variant="body1" sx={{ fontWeight: 500 }}>
                    {p.name}
                  </Typography>
                  {p.id === primaryId && (
                    <Chip size="small" label="primary" color="primary" variant="outlined" />
                  )}
                  {p.id === billingId && (
                    <Chip size="small" label="billing" color="success" variant="outlined" />
                  )}
                  <Typography variant="caption" color="text.secondary" sx={{ ml: "auto" }}>
                    {p.role}
                  </Typography>
                </Stack>
                {(p.email || p.phone) && (
                  <Typography variant="caption" color="text.secondary">
                    {[p.email, p.phone].filter(Boolean).join(" · ")}
                  </Typography>
                )}
              </Box>
            ))}
          </Stack>
        )}
      </CardContent>
    </Card>
  );
}

// ---- Students ----------------------------------------------------------

function StudentsCard({ students, loading }: { students?: Student[]; loading: boolean }) {
  return (
    <Card variant="outlined">
      <CardContent>
        <Typography variant="overline" color="text.secondary">
          Students
        </Typography>
        {loading ? (
          <Skeleton width="60%" sx={{ mt: 1 }} />
        ) : !students || students.length === 0 ? (
          <Typography variant="body2" color="text.disabled" sx={{ mt: 1 }}>
            No students added yet.
          </Typography>
        ) : (
          <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mt: 1 }}>
            {students.map((s) => (
              <Chip
                key={s.id}
                component={RouterLink}
                to={`/students/${s.id}`}
                clickable
                label={`${s.name}${s.current_grade ? ` (${s.current_grade})` : ""}`}
              />
            ))}
          </Stack>
        )}
      </CardContent>
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
