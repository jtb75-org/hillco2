import { Box, Breadcrumbs, Stack, Typography } from "@mui/material";
import type { ReactNode } from "react";

interface PageHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  breadcrumbs?: ReactNode;
  actions?: ReactNode;
}

export function PageHeader({ title, subtitle, breadcrumbs, actions }: PageHeaderProps) {
  return (
    <Stack spacing={1.25}>
      {breadcrumbs && (
        <Breadcrumbs
          sx={{
            color: "text.secondary",
            fontSize: 13,
            "& .MuiBreadcrumbs-separator": { mx: 0.75 },
          }}
        >
          {breadcrumbs}
        </Breadcrumbs>
      )}
      <Stack
        direction={{ xs: "column", sm: "row" }}
        alignItems={{ xs: "stretch", sm: "flex-start" }}
        justifyContent="space-between"
        spacing={2}
      >
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="h4">{title}</Typography>
          {subtitle && (
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ mt: 0.5, maxWidth: 760 }}
            >
              {subtitle}
            </Typography>
          )}
        </Box>
        {actions && (
          <Box sx={{ display: "flex", justifyContent: { xs: "flex-start", sm: "flex-end" } }}>
            {actions}
          </Box>
        )}
      </Stack>
    </Stack>
  );
}
