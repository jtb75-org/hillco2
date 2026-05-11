import { Box, Button, Stack, Typography } from "@mui/material";
import type { ReactNode } from "react";

interface EmptyStateProps {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  compact?: boolean;
}

export function EmptyState({ title, description, action, compact = false }: EmptyStateProps) {
  return (
    <Box
      sx={{
        py: compact ? 3 : 6,
        px: 3,
        textAlign: "center",
        color: "text.secondary",
      }}
    >
      <Stack spacing={1.25} alignItems="center">
        <Typography variant={compact ? "body2" : "subtitle1"} color="text.primary" sx={{ fontWeight: 600 }}>
          {title}
        </Typography>
        {description && (
          <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 420 }}>
            {description}
          </Typography>
        )}
        {action && (
          <Box sx={{ pt: 0.5 }}>
            {typeof action === "string" ? <Button variant="text">{action}</Button> : action}
          </Box>
        )}
      </Stack>
    </Box>
  );
}
