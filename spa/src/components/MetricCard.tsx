import { Card, CardContent, Typography } from "@mui/material";
import type { ReactNode } from "react";

interface MetricCardProps {
  label: string;
  value: ReactNode;
  emphasis?: "alert" | "muted" | "default";
}

export function MetricCard({ label, value, emphasis = "default" }: MetricCardProps) {
  return (
    <Card variant="outlined" sx={{ height: "100%" }}>
      <CardContent sx={{ py: 2, "&:last-child": { pb: 2 } }}>
        <Typography variant="overline" color="text.secondary">
          {label}
        </Typography>
        <Typography
          variant="h4"
          sx={{
            mt: 0.25,
            fontWeight: 700,
            color:
              emphasis === "alert"
                ? "error.main"
                : emphasis === "muted"
                ? "text.disabled"
                : "text.primary",
          }}
        >
          {value}
        </Typography>
      </CardContent>
    </Card>
  );
}
