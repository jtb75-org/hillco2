import {
  Box,
  Chip,
  Paper,
  Stack,
  Typography,
  type PaperProps,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import type { ReactNode } from "react";

import { EmptyState } from "./EmptyState";

interface SectionPanelProps extends Omit<PaperProps, "title"> {
  title?: ReactNode;
  titleVariant?: "subtitle1" | "overline";
  subtitle?: ReactNode;
  count?: number;
  actions?: ReactNode;
  empty?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  children: ReactNode;
}

export function SectionPanel({
  title,
  titleVariant = "subtitle1",
  subtitle,
  count,
  actions,
  empty = false,
  emptyTitle = "Nothing here",
  emptyDescription,
  children,
  sx,
  ...paperProps
}: SectionPanelProps) {
  // Window-style tokens (theme.hillco) decide how the header reads:
  // classic keeps the original per-variant typography; sharp/ink/ledger
  // impose their own header treatment so every panel is consistent.
  const { hillco } = useTheme();
  const panel = hillco.panel;
  const hasHeader = Boolean(title || subtitle || count !== undefined || actions);

  const header = hasHeader ? (
    <Stack
      direction="row"
      alignItems="center"
      spacing={1.5}
      sx={{
        px: panel.outside ? 0.25 : 2,
        pt: panel.outside ? 0 : 1.5,
        pb: panel.outside ? 1 : 1.5,
        bgcolor: panel.headerBg,
        borderBottom: panel.outside ? 2 : 1,
        borderColor: panel.headerBorder,
        // Ink puts the header on a dark bar — flip embedded content
        // (counts, toggles, kebabs pages pass via `actions`) to light ink.
        ...(panel.onDark && {
          "& .MuiTypography-root": { color: "rgba(255,255,255,0.9)" },
          "& .MuiChip-outlined": {
            color: "#fff",
            borderColor: "rgba(255,255,255,0.5)",
          },
          "& .MuiIconButton-root": { color: "rgba(255,255,255,0.8)" },
          "& .MuiSwitch-track": { backgroundColor: "rgba(255,255,255,0.45)" },
        }),
        // Style the header's add/edit actions (text buttons) per window
        // style without touching buttons pages render elsewhere.
        ...(panel.actionSx && { "& .MuiButton-text": panel.actionSx }),
      }}
    >
      <Box sx={{ minWidth: 0, flex: 1 }}>
        {title &&
          (panel.titleSx ? (
            <Typography variant="subtitle1" sx={panel.titleSx}>
              {title}
            </Typography>
          ) : (
            <Typography
              variant={titleVariant}
              color={titleVariant === "overline" ? "text.secondary" : undefined}
              sx={{
                display: titleVariant === "overline" ? "block" : undefined,
                fontWeight: titleVariant === "subtitle1" ? 650 : undefined,
                lineHeight: titleVariant === "overline" ? 1.4 : undefined,
              }}
            >
              {title}
            </Typography>
          ))}
        {subtitle && (
          <Typography variant="body2" color="text.secondary">
            {subtitle}
          </Typography>
        )}
      </Box>
      {count !== undefined && (
        <Chip size="small" label={count} variant="outlined" />
      )}
      {actions}
    </Stack>
  ) : null;

  const body = empty ? (
    <EmptyState title={emptyTitle} description={emptyDescription} compact />
  ) : (
    children
  );

  if (panel.outside) {
    // Ledger: the title sits above the card over a heavy ink rule, so the
    // caller's sx (spacing, widths) applies to the wrapper, not the Paper.
    return (
      <Box sx={sx}>
        {header}
        <Paper
          variant="outlined"
          {...paperProps}
          sx={{
            overflow: "hidden",
            borderColor: "divider",
            bgcolor: "background.paper",
            mt: hasHeader ? 1.5 : 0,
          }}
        >
          {body}
        </Paper>
      </Box>
    );
  }

  return (
    <Paper
      variant="outlined"
      {...paperProps}
      sx={{
        overflow: "hidden",
        borderColor: "divider",
        bgcolor: "background.paper",
        ...sx,
      }}
    >
      {header}
      {body}
    </Paper>
  );
}
