import {
  Box,
  Card,
  CardContent,
  Stack,
  Typography,
  type CardProps,
} from "@mui/material";
import type { ReactNode } from "react";

interface StatCardProps extends Omit<CardProps, "title"> {
  label: ReactNode;
  value: ReactNode;
  subtitle?: ReactNode;
  icon?: ReactNode;
}

export function StatCard({
  label,
  value,
  subtitle,
  icon,
  sx,
  ...cardProps
}: StatCardProps) {
  return (
    <Card
      variant="outlined"
      {...cardProps}
      sx={{
        height: "100%",
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
            <Typography variant="h4" sx={{ mt: 0.25 }}>
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
