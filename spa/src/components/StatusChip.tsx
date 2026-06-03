import { Chip, alpha, useTheme, type ChipProps } from "@mui/material";

type Tone = "neutral" | "info" | "success" | "warning" | "danger";

// Extend MUI's variants with our own "soft" — a tinted background with
// fully-saturated text. Matches the mockup pills (e.g. red-100 bg +
// red-700 text) and reads as a softer pill than "filled" without
// disappearing the way "outlined" does at small sizes.
type Variant = ChipProps["variant"] | "soft";

const TONE_COLOR: Record<Tone, ChipProps["color"]> = {
  neutral: "default",
  info: "primary",
  success: "success",
  warning: "warning",
  danger: "error",
};

interface StatusChipProps extends Omit<ChipProps, "color" | "size" | "variant"> {
  tone?: Tone;
  size?: ChipProps["size"];
  variant?: Variant;
}

export function StatusChip({
  tone = "neutral",
  size = "small",
  variant = "outlined",
  sx,
  ...props
}: StatusChipProps) {
  const theme = useTheme();
  const color = TONE_COLOR[tone];

  if (variant === "soft") {
    // Resolve the palette entry; "default" doesn't exist on the
    // palette so we fall back to neutral grey from text.secondary.
    const paletteEntry =
      color && color !== "default"
        ? theme.palette[color]
        : { main: theme.palette.text.secondary };
    return (
      <Chip
        size={size}
        variant="filled"
        {...props}
        sx={{
          bgcolor: alpha(paletteEntry.main, 0.12),
          color: paletteEntry.main,
          fontWeight: 650,
          ...sx,
        }}
      />
    );
  }

  return (
    <Chip
      size={size}
      variant={variant}
      color={color}
      sx={sx}
      {...props}
    />
  );
}
