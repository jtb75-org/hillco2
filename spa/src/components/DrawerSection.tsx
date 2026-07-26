import { Box, Divider, Stack, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import type { ReactNode } from "react";

interface DrawerSectionProps {
  title: ReactNode;
  /** "danger" renders the title (and rule) in error ink — the shared
   *  Danger-zone treatment. */
  tone?: "default" | "danger";
  /** Small count rendered after the title, e.g. "(3)". */
  count?: number;
  action?: ReactNode;
  children: ReactNode;
}

/** Flat (borderless) section for drawers and dialogs — the same
 *  window-style-aware title treatment as SectionPanel, minus the Paper.
 *  Replaces the local `Section()` helpers that used to live in
 *  ContactDrawer, SchoolDrawer, DeleteFamilyDialog, and AuditLogDrawer. */
export function DrawerSection({
  title,
  tone = "default",
  count,
  action,
  children,
}: DrawerSectionProps) {
  const { hillco } = useTheme();
  const panel = hillco.panel;
  const danger = tone === "danger";

  // panel.titleSx is designed for the panel header strip (ink style sets
  // white text for its dark bar) — on a flat drawer surface keep the
  // typography treatment but re-ink it for the light ground.
  const titleSx = panel.titleSx
    ? { ...panel.titleSx, color: danger ? "error.main" : "text.primary" }
    : undefined;

  return (
    <Box>
      <Stack direction="row" alignItems="baseline" spacing={1}>
        {titleSx ? (
          <Typography variant="subtitle1" sx={{ ...titleSx, flex: 1 }}>
            {title}
            {count !== undefined && (
              <Box component="span" sx={{ ml: 1, color: "text.disabled", fontWeight: 400 }}>
                ({count})
              </Box>
            )}
          </Typography>
        ) : (
          <Typography
            variant="overline"
            color={danger ? "error.main" : "text.secondary"}
            sx={{ display: "block", lineHeight: 1.6, flex: 1 }}
          >
            {title}
            {count !== undefined && (
              <Box component="span" sx={{ ml: 1, color: "text.disabled", fontWeight: 400 }}>
                ({count})
              </Box>
            )}
          </Typography>
        )}
        {action}
      </Stack>
      <Divider
        sx={{
          mb: 1.5,
          ...(danger && { borderColor: "error.main", opacity: 0.5 }),
        }}
      />
      {children}
    </Box>
  );
}
