import {
  Box,
  Chip,
  Divider,
  Paper,
  Stack,
  Typography,
  type PaperProps,
} from "@mui/material";
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
  const hasHeader = title || subtitle || count !== undefined || actions;

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
      {hasHeader && (
        <>
          <Stack
            direction="row"
            alignItems="center"
            spacing={1.5}
            sx={{ px: 2, py: 1.5 }}
          >
            <Box sx={{ minWidth: 0, flex: 1 }}>
              {title && (
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
              )}
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
          <Divider />
        </>
      )}
      {empty ? (
        <EmptyState title={emptyTitle} description={emptyDescription} compact />
      ) : (
        children
      )}
    </Paper>
  );
}
