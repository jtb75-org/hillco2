import { useEffect, useState } from "react";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Chip,
  Grid,
  Stack,
  Typography,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { Link as RouterLink } from "react-router-dom";
import dayjs from "dayjs";

import { LabeledField } from "../../components/LabeledField";
import { RichTextEditor } from "../../components/RichTextEditor";
import { SectionPanel } from "../../components/SectionPanel";
import { StudentEditor } from "../students/StudentEditor";

import type { IntakeStudent } from "./intakeTypes";

/**
 * One Student Discovery card per intake-student. Top accordion folds
 * out the live StudentEditor (name, DOB, school, at-a-glance flags —
 * shared with the family page drawer). Below it: five discovery
 * prompts (rich text) and a "mentioned during discovery" chip strip.
 */
export function StudentDiscoveryCard({
  student,
  onPatch,
}: {
  student: IntakeStudent;
  /** Per-intake-student PATCH — body becomes the API request body. */
  onPatch: (body: Partial<IntakeStudent>) => void;
}) {
  return (
    <SectionPanel title="Student discovery" titleVariant="overline">
      <Box sx={{ p: 2.5 }}>
        <Stack
          direction="row"
          spacing={2}
          alignItems="baseline"
          sx={{ mb: 1.5, flexWrap: "wrap" }}
        >
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            {student.name}
          </Typography>
          {student.current_grade && (
            <Typography variant="body2" color="text.secondary">
              Grade {student.current_grade}
            </Typography>
          )}
          {student.dob && (
            <Typography variant="body2" color="text.secondary">
              DOB {dayjs(student.dob).format("MMM D, YYYY")}
            </Typography>
          )}
        </Stack>

        <Box sx={{ mb: 2 }}>
          <Accordion variant="outlined" disableGutters>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography variant="overline" color="text.secondary">
                Edit student details
                <Box
                  component="span"
                  sx={{ ml: 1, color: "text.disabled", fontWeight: 400 }}
                >
                  (name, DOB, school, at-a-glance)
                </Box>
              </Typography>
            </AccordionSummary>
            <AccordionDetails>
              {/* StudentEditor is the shared editing surface from the
                  family/student drawer — owns its own GET/PATCH and
                  invalidates the student query on save. */}
              <StudentEditor studentId={student.id} />
            </AccordionDetails>
          </Accordion>
        </Box>

        <Grid container spacing={2}>
          <Grid item xs={12} md={6}>
            <LabeledField label="What's working">
              <DebouncedRichText
                initial={student.working ?? ""}
                placeholder="Current supports, classes, relationships, routines that are landing."
                minRows={3}
                onCommit={(html) => onPatch({ working: html || null })}
              />
            </LabeledField>
          </Grid>
          <Grid item xs={12} md={6}>
            <LabeledField label="What's not working">
              <DebouncedRichText
                initial={student.not_working ?? ""}
                placeholder="Friction points, gaps, recent regressions, accommodations being denied."
                minRows={3}
                onCommit={(html) => onPatch({ not_working: html || null })}
              />
            </LabeledField>
          </Grid>

          <Grid item xs={12}>
            <LabeledField label="History / timeline">
              <DebouncedRichText
                initial={student.history ?? ""}
                placeholder="School history, evaluations, diagnoses, prior placements — chronological if possible."
                minRows={3}
                onCommit={(html) => onPatch({ history: html || null })}
              />
            </LabeledField>
          </Grid>

          <Grid item xs={12} md={6}>
            <LabeledField label="School-fit concerns">
              <DebouncedRichText
                initial={student.school_fit ?? ""}
                placeholder="What's their current school not delivering? Class size? Curriculum? Peer group?"
                minRows={2}
                onCommit={(html) => onPatch({ school_fit: html || null })}
              />
            </LabeledField>
          </Grid>
          <Grid item xs={12} md={6}>
            <LabeledField label="Supports tried">
              <DebouncedRichText
                initial={student.supports_tried ?? ""}
                placeholder="Tutors, therapists, accommodations, programs — what worked, what didn't."
                minRows={2}
                onCommit={(html) => onPatch({ supports_tried: html || null })}
              />
            </LabeledField>
          </Grid>

          {student.existing_engagements.length > 0 && (
            <Grid item xs={12}>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ display: "block", mb: 0.5 }}
              >
                Active engagements for {student.name.split(" ")[0]}
              </Typography>
              <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ gap: 0.5 }}>
                {student.existing_engagements.map((e) => (
                  <Chip
                    key={e.id}
                    component={RouterLink}
                    to={`/engagements/${e.id}`}
                    size="small"
                    variant="outlined"
                    color="info"
                    label={`${e.engagement_type} · ${e.status}`}
                    clickable
                  />
                ))}
              </Stack>
            </Grid>
          )}
        </Grid>
      </Box>
    </SectionPanel>
  );
}

function DebouncedRichText({
  initial,
  placeholder,
  minRows,
  onCommit,
}: {
  initial: string;
  placeholder?: string;
  minRows?: number;
  onCommit: (html: string) => void;
}) {
  const [value, setValue] = useState(initial);
  useEffect(() => {
    setValue(initial);
  }, [initial]);
  return (
    <Box
      sx={{ display: "flex" }}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
          if (value !== initial) onCommit(value);
        }
      }}
    >
      <RichTextEditor
        value={value}
        onChange={setValue}
        placeholder={placeholder}
        minRows={minRows}
      />
    </Box>
  );
}
