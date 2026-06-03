import {
  Box,
  Card,
  CardContent,
  Stack,
  Typography,
  type CardProps,
} from "@mui/material";
import type { ReactNode } from "react";

type Emphasis = "default" | "alert" | "muted";

interface StatCardProps extends Omit<CardProps, "title" | "onClick"> {
  label: ReactNode;
  value: ReactNode;
  subtitle?: ReactNode;
  icon?: ReactNode;
  emphasis?: Emphasis;
  onClick?: () => void;
}

// Color the value, not the whole card, when emphasis is set.
// "alert" = error red (e.g. an overdue counter), "muted" = de-emphasized
// (zero/empty state).
const VALUE_COLOR: Record<Emphasis, string> = {
  default: "text.primary",
  alert: "error.main",
  muted: "text.disabled",
};

export function StatCard({
  label,
  value,
  subtitle,
  icon,
  emphasis = "default",
  onClick,
  sx,
  ...cardProps
}: StatCardProps) {
  const clickable = Boolean(onClick);
  return (
    <Card
      variant="outlined"
      onClick={onClick}
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={(e) => {
        if (!onClick) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      {...cardProps}
      sx={{
        height: "100%",
        cursor: clickable ? "pointer" : undefined,
        "&:hover": clickable
          ? { borderColor: "primary.main", bgcolor: "action.hover" }
          : undefined,
        ...sx,
      }}
    >
      <CardContent sx={{ p: 2, "&:last-child": { pb: 2 } }}>
        <Stack direction="row" alignItems="flex-start" spacing={1.5}>
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography
              variant="overline"
              color="text.secondary"
              sx={{ display: "block", lineHeight: 1.4 }}
            >
              {label}
            </Typography>
            <Typography
              variant="h4"
              sx={{ mt: 0.25, color: VALUE_COLOR[emphasis] }}
            >
              {value}
            </Typography>
          </Box>
          {icon && (
            <Box
              sx={{
                width: 36,
                height: 36,
                borderRadius: 2,
                bgcolor: "action.hover",
                color: "text.secondary",
                display: "grid",
                placeItems: "center",
                flexShrink: 0,
                "& .MuiSvgIcon-root": { fontSize: 20 },
              }}
            >
              {icon}
            </Box>
          )}
        </Stack>
        {subtitle && (
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ mt: 1, minHeight: 20 }}
          >
            {subtitle}
          </Typography>
        )}
      </CardContent>
    </Card>
  );
}
