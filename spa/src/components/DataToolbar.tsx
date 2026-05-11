import { Paper, Stack } from "@mui/material";
import type { ReactNode } from "react";

interface DataToolbarProps {
  children: ReactNode;
}

export function DataToolbar({ children }: DataToolbarProps) {
  return (
    <Paper
      variant="outlined"
      sx={{
        px: 2,
        py: 1.5,
        bgcolor: "background.paper",
      }}
    >
      <Stack
        direction={{ xs: "column", md: "row" }}
        spacing={1.5}
        alignItems={{ xs: "stretch", md: "center" }}
      >
        {children}
      </Stack>
    </Paper>
  );
}
