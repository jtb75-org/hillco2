import {
  Alert,
  Box,
  CircularProgress,
  Divider,
  Drawer,
  IconButton,
  Link as MuiLink,
  Stack,
  Toolbar,
  Typography,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import { useQuery } from "@tanstack/react-query";
import { Link as RouterLink } from "react-router-dom";

import { api } from "../../api/client";
import type { components } from "../../api/schema";
import { StatusChip } from "../../components/StatusChip";

type PersonDetail = components["schemas"]["PersonDetail"];

const KIND_LABEL: Record<string, string> = {
  guardian: "Guardian",
  student: "Student",
  school_worker: "School worker",
  other: "Other",
};

/**
 * Right-side detail panel for a contact. Read-only by design — the
 * editable surfaces live on the family detail drawer (for guardians)
 * and the student page (for students). This drawer is the "see what
 * we know about this person" view, plus a way to navigate to whatever
 * family/families they're part of.
 */
export function ContactDrawer({
  personId,
  onClose,
}: {
  personId: string | null;
  onClose: () => void;
}) {
  const { data, isPending, error } = useQuery<PersonDetail, Error>({
    queryKey: ["contacts", "detail", personId],
    enabled: !!personId,
    queryFn: async () => {
      const { data, error: respError } = await api.GET("/api/people/{person_id}", {
        params: { path: { person_id: personId! } },
      });
      if (respError || !data) throw new Error("Failed to load contact.");
      return data;
    },
  });

  return (
    <Drawer
      anchor="right"
      open={!!personId}
      onClose={onClose}
      PaperProps={{ sx: { width: { xs: "100%", sm: 480 } } }}
    >
      <Toolbar />
      <Box sx={{ p: 3, flex: 1, display: "flex", flexDirection: "column", overflow: "auto" }}>
        <Stack direction="row" alignItems="center" sx={{ mb: 2 }}>
          <Typography variant="overline" color="text.secondary" sx={{ flex: 1 }}>
            Contact
          </Typography>
          <IconButton size="small" onClick={onClose} aria-label="Close">
            <CloseIcon />
          </IconButton>
        </Stack>

        {error && <Alert severity="error">{error.message}</Alert>}
        {isPending ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
            <CircularProgress size={28} />
          </Box>
        ) : data ? (
          <Stack spacing={3}>
            <HeaderBlock person={data} />
            <ContactInfo person={data} />
            <FamilySection person={data} />
            {data.school_name && <SchoolSection person={data} />}
          </Stack>
        ) : null}
      </Box>
    </Drawer>
  );
}

function HeaderBlock({ person }: { person: PersonDetail }) {
  const fullName = [person.first_name, person.last_name].filter(Boolean).join(" ");
  return (
    <Box>
      <Typography variant="h5" sx={{ fontWeight: 600 }}>
        {fullName}
      </Typography>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.5 }}>
        <StatusChip
          size="small"
          label={KIND_LABEL[person.kind] ?? person.kind}
          tone="info"
          variant="outlined"
        />
        {person.current_grade && (
          <Typography variant="caption" color="text.secondary">
            Grade {person.current_grade}
          </Typography>
        )}
      </Stack>
    </Box>
  );
}

function ContactInfo({ person }: { person: PersonDetail }) {
  const hasContact = person.email || person.phone || person.mailing_address;
  if (!hasContact) {
    return (
      <Section title="Contact">
        <Typography variant="body2" color="text.disabled">
          No email, phone, or address on file.
        </Typography>
      </Section>
    );
  }
  return (
    <Section title="Contact">
      <Stack spacing={1}>
        {person.email && (
          <DefRow label="Email">
            <MuiLink href={`mailto:${person.email}`} underline="hover">
              {person.email}
            </MuiLink>
          </DefRow>
        )}
        {person.phone && <DefRow label="Phone">{person.phone}</DefRow>}
        {person.mailing_address && (
          <DefRow label="Address">
            <Box component="span" sx={{ whiteSpace: "pre-line" }}>
              {person.mailing_address}
            </Box>
          </DefRow>
        )}
        {person.billing_address && person.billing_address !== person.mailing_address && (
          <DefRow label="Billing">
            <Box component="span" sx={{ whiteSpace: "pre-line", fontStyle: "italic" }}>
              {person.billing_address}
            </Box>
          </DefRow>
        )}
      </Stack>
    </Section>
  );
}

function FamilySection({ person }: { person: PersonDetail }) {
  if (person.memberships.length === 0) {
    return (
      <Section title="Family">
        <Typography variant="body2" color="text.disabled">
          Not mapped to a family yet.
        </Typography>
      </Section>
    );
  }
  return (
    <Section title={person.memberships.length === 1 ? "Family" : "Families"}>
      <Stack spacing={1}>
        {person.memberships.map((m) => {
          const roleLabel = m.role.startsWith("guardian:")
            ? m.role.slice("guardian:".length)
            : m.role;
          return (
            <Stack
              key={m.family_id}
              direction="row"
              spacing={1}
              alignItems="center"
            >
              {m.is_archived ? (
                <Typography variant="body2" sx={{ color: "text.disabled" }}>
                  {m.household_name}
                </Typography>
              ) : (
                <MuiLink
                  component={RouterLink}
                  to={`/families/${m.family_id}`}
                  underline="hover"
                  variant="body2"
                >
                  {m.household_name}
                </MuiLink>
              )}
              <Typography variant="caption" color="text.secondary">
                · {roleLabel}
              </Typography>
              {m.is_archived && (
                <StatusChip
                  size="small"
                  label="archived"
                  tone="warning"
                  variant="outlined"
                />
              )}
            </Stack>
          );
        })}
      </Stack>
    </Section>
  );
}

function SchoolSection({ person }: { person: PersonDetail }) {
  return (
    <Section title="School">
      <Typography variant="body2">{person.school_name}</Typography>
    </Section>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Box>
      <Typography variant="overline" color="text.secondary" sx={{ display: "block", mb: 1 }}>
        {title}
      </Typography>
      <Divider sx={{ mb: 1.5 }} />
      {children}
    </Box>
  );
}

function DefRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: "auto 1fr",
        columnGap: 2,
        alignItems: "baseline",
      }}
    >
      <Typography variant="caption" color="text.secondary" sx={{ textTransform: "uppercase" }}>
        {label}
      </Typography>
      <Typography variant="body2" component="div">
        {children}
      </Typography>
    </Box>
  );
}
