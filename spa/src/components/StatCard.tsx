import {
  alpha,
  Box,
  Card,
  CardContent,
  Stack,
  Typography,
  type CardProps,
  type SxProps,
} from "@mui/material";
import { useTheme, type Theme } from "@mui/material/styles";
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

// "alert" (e.g. an overdue counter) colors the value error-red AND gives
// the whole card a faint red wash so problem cards pop at a glance;
// "muted" de-emphasizes the value (zero/empty state). Neutral cards stay
// untinted on purpose — an uncolored card is the all-clear signal, so
// color only ever means "needs attention".
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
  const { hillco } = useTheme();
  const panel = hillco.panel;
  // Non-classic window styles restyle the tile with a mini header strip
  // (label + icon) matching the section-header treatment; classic keeps
  // the original flat anatomy untouched.
  const styled = panel.titleSx != null;
  const clickable = Boolean(onClick);
  const alert = emphasis === "alert";

  const cardSx: SxProps<Theme> = {
    height: "100%",
    cursor: clickable ? "pointer" : undefined,
    ...(alert && {
      bgcolor: (theme: Theme) => alpha(theme.palette.error.main, 0.05),
      borderColor: (theme: Theme) => alpha(theme.palette.error.main, 0.4),
    }),
    "&:hover": clickable
      ? alert
        ? {
            borderColor: "error.main",
            bgcolor: (theme: Theme) => alpha(theme.palette.error.main, 0.1),
          }
        : { borderColor: "primary.main", bgcolor: "action.hover" }
      : undefined,
    ...sx,
  };

  const interactive = {
    onClick,
    role: clickable ? ("button" as const) : undefined,
    tabIndex: clickable ? 0 : undefined,
    onKeyDown: (e: React.KeyboardEvent) => {
      if (!onClick) return;
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onClick();
      }
    },
  };

  if (styled) {
    return (
      <Card variant="outlined" {...interactive} {...cardProps} sx={cardSx}>
        <Stack
          direction="row"
          alignItems="center"
          spacing={1}
          sx={{
            px: 2,
            py: 0.75,
            bgcolor: panel.headerBg,
            borderBottom: panel.outside ? 2 : 1,
            borderColor: panel.headerBorder,
          }}
        >
          <Typography
            component="div"
            sx={{
              ...panel.titleSx,
              // Tile labels are long single words in caps under ink —
              // step down so they clear the icon.
              fontSize: panel.onDark ? "0.7rem" : "0.8rem",
              lineHeight: 1.6,
              flex: 1,
              minWidth: 0,
            }}
          >
            {label}
          </Typography>
          {icon && (
            <Box
              sx={{
                display: "flex",
                flexShrink: 0,
                color: panel.onDark
                  ? "rgba(255,255,255,0.75)"
                  : "text.secondary",
                "& .MuiSvgIcon-root": { fontSize: 18 },
              }}
            >
              {icon}
            </Box>
          )}
        </Stack>
        <Box sx={{ px: 2, pt: 1.25, pb: 1.5 }}>
          <Typography variant="h4" sx={{ color: VALUE_COLOR[emphasis] }}>
            {value}
          </Typography>
          {subtitle && (
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ mt: 0.75, minHeight: 20 }}
            >
              {subtitle}
            </Typography>
          )}
        </Box>
      </Card>
    );
  }

  return (
    <Card variant="outlined" {...interactive} {...cardProps} sx={cardSx}>
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
                bgcolor: alert
                  ? (theme) => alpha(theme.palette.error.main, 0.1)
                  : "action.hover",
                color: alert ? "error.main" : "text.secondary",
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
