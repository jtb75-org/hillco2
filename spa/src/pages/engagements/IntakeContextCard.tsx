import { Box, Chip, Divider, Stack, Typography } from "@mui/material";
import dayjs from "dayjs";
import { Link as RouterLink } from "react-router-dom";

import { SectionPanel } from "../../components/SectionPanel";
import { sanitizeRichTextHtml } from "../../utils/richText";

/** Read-only snapshot of the intake conversation that spawned this
 *  engagement. Stored on engagements.intake_snapshot at convert time
 *  so the engagement keeps a stable record even if the intake row is
 *  later edited. */
export interface IntakeSnapshot {
  snapshotted_at?: string;
  intake_id?: string;
  family?: {
    desired_outcome?: string | null;
    constraints?: string[];
  };
  student?: {
    working?: string | null;
    not_working?: string | null;
    history?: string | null;
    school_fit?: string | null;
    supports_tried?: string | null;
    mentions?: Array<{ text: string; kind: string }>;
  };
}

const STUDENT_SECTIONS: Array<{ key: keyof NonNullable<IntakeSnapshot["student"]>; label: string }> = [
  { key: "working", label: "What's working" },
  { key: "not_working", label: "What's not working" },
  { key: "history", label: "History" },
  { key: "school_fit", label: "School fit" },
  { key: "supports_tried", label: "Supports tried" },
];

export function IntakeContextCard({ snapshot }: { snapshot: IntakeSnapshot | null }) {
  if (!snapshot) {
    return (
      <SectionPanel title="Intake context" titleVariant="overline">
        <Box sx={{ p: 2.5 }}>
          <Typography variant="body2" color="text.disabled">
            This engagement was created outside the intake flow, so there's no
            snapshot of the discovery conversation to display.
          </Typography>
        </Box>
      </SectionPanel>
    );
  }

  const { family, student, snapshotted_at, intake_id } = snapshot;
  const constraints = family?.constraints ?? [];
  const mentions = student?.mentions ?? [];
  const hasAnyStudentDetail = STUDENT_SECTIONS.some(
    ({ key }) => student?.[key],
  );
  const hasAnyFamilyDetail =
    !!family?.desired_outcome || constraints.length > 0;

  return (
    <SectionPanel
      title="Intake context"
      titleVariant="overline"
      subtitle={
        snapshotted_at
          ? `Captured ${dayjs(snapshotted_at).format("MMM D, YYYY")}`
          : undefined
      }
      actions={
        intake_id ? (
          <Typography
            component={RouterLink}
            to={`/intakes/${intake_id}`}
            variant="caption"
            sx={{ color: "primary.main", textDecoration: "none", "&:hover": { textDecoration: "underline" } }}
          >
            Open intake →
          </Typography>
        ) : undefined
      }
    >
      <Box sx={{ p: 2.5 }}>
        {hasAnyFamilyDetail && (
          <Stack spacing={1.5}>
            {family?.desired_outcome && (
              <Section label="Desired outcome (in parents' words)">
                <Typography variant="body2" sx={{ whiteSpace: "pre-line" }}>
                  {family.desired_outcome}
                </Typography>
              </Section>
            )}
            {constraints.length > 0 && (
              <Section label="Constraints">
                <Stack direction="row" useFlexGap flexWrap="wrap" sx={{ gap: 0.75 }}>
                  {constraints.map((c, i) => (
                    <Chip key={`${c}-${i}`} size="small" variant="outlined" label={c} />
                  ))}
                </Stack>
              </Section>
            )}
          </Stack>
        )}

        {hasAnyStudentDetail && (
          <>
            {hasAnyFamilyDetail && <Divider sx={{ my: 2 }} />}
            <Stack spacing={1.5}>
              {STUDENT_SECTIONS.map(({ key, label }) => {
                const html = student?.[key];
                if (!html) return null;
                return (
                  <Section key={key} label={label}>
                    <RichBody html={html as string} />
                  </Section>
                );
              })}
              {mentions.length > 0 && (
                <Section label="Mentioned during discovery">
                  <Stack direction="row" useFlexGap flexWrap="wrap" sx={{ gap: 0.75 }}>
                    {mentions.map((m, i) => (
                      <Chip
                        key={`${m.text}-${i}`}
                        size="small"
                        variant="outlined"
                        label={`${m.text} · ${m.kind}`}
                      />
                    ))}
                  </Stack>
                </Section>
              )}
            </Stack>
          </>
        )}

        {!hasAnyFamilyDetail && !hasAnyStudentDetail && (
          <Typography variant="body2" color="text.disabled">
            The intake was converted before discovery details were captured.
          </Typography>
        )}
      </Box>
    </SectionPanel>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Box>
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ display: "block", mb: 0.5, fontWeight: 600, letterSpacing: 0.2 }}
      >
        {label}
      </Typography>
      {children}
    </Box>
  );
}

function RichBody({ html }: { html: string }) {
  return (
    <Box
      sx={{
        fontSize: 14,
        "& p": { m: 0, mb: 0.5 },
        "& p:last-child": { mb: 0 },
        "& ul, & ol": { my: 0.5, pl: 3 },
      }}
      dangerouslySetInnerHTML={{ __html: sanitizeRichTextHtml(html) }}
    />
  );
}
