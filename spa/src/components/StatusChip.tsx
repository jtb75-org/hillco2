import { Chip, type ChipProps } from "@mui/material";

type Tone = "neutral" | "info" | "success" | "warning" | "danger";

const TONE_COLOR: Record<Tone, ChipProps["color"]> = {
  neutral: "default",
  info: "primary",
  success: "success",
  warning: "warning",
  danger: "error",
};

interface StatusChipProps extends Omit<ChipProps, "color" | "size"> {
  tone?: Tone;
  size?: ChipProps["size"];
}

export function StatusChip({
  tone = "neutral",
  size = "small",
  variant = "outlined",
  ...props
}: StatusChipProps) {
  return (
    <Chip
      size={size}
      variant={variant}
      color={TONE_COLOR[tone]}
      {...props}
    />
  );
}
