import type { ReactNode } from "react";
import { Box, Typography } from "@mui/material";

/**
 * Replacement for MUI's outlined-floating-label pattern. The label sits
 * statically above the input as a plain Typography line; the field is
 * rendered without its own `label` prop, so there's no floating-shrink
 * animation, no border notch, and no chance of the multiline-notch bug
 * we hit on the Notes textarea.
 *
 * Usage:
 *   <LabeledField label="Household name" required>
 *     <TextField value={x} onChange={...} fullWidth required />
 *   </LabeledField>
 *
 * The TextField inside should NOT carry a `label` prop. Pass
 * `placeholder` if you want hint text inside the field.
 */
export function LabeledField({
  label,
  required = false,
  helperText,
  children,
}: {
  label: string;
  required?: boolean;
  helperText?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Box>
      <Typography
        component="label"
        variant="body2"
        sx={{
          display: "block",
          mb: 0.5,
          color: "text.secondary",
          fontWeight: 500,
        }}
      >
        {label}
        {required && (
          <Box
            component="span"
            aria-hidden="true"
            sx={{ color: "error.main", ml: 0.5 }}
          >
            *
          </Box>
        )}
      </Typography>
      {children}
      {helperText && (
        <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: "block" }}>
          {helperText}
        </Typography>
      )}
    </Box>
  );
}
