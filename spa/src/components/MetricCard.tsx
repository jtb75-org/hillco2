import { Card, CardContent, Typography } from "@mui/material";
import type { ReactNode } from "react";

interface MetricCardProps {
  label: string;
  value: ReactNode;
  emphasis?: "alert" | "muted" | "default";
  onClick?: () => void;
}

export function MetricCard({
  label,
  value,
  emphasis = "default",
  onClick,
}: MetricCardProps) {
  return (
    <Card
      variant="outlined"
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={(e) => {
        if (!onClick) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      sx={{
        height: "100%",
        cursor: onClick ? "pointer" : undefined,
        "&:hover": onClick
          ? { borderColor: "primary.main", bgcolor: "action.hover" }
          : undefined,
      }}
    >
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
