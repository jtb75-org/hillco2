import type { ReactNode } from "react";
import { Box, Tooltip, Typography } from "@mui/material";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";

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
  info,
  children,
}: {
  label: string;
  required?: boolean;
  helperText?: ReactNode;
  /** Optional explainer attached to a small "i" icon next to the
   *  label. Rich content allowed — Stack / Typography render fine
   *  inside an MUI Tooltip. */
  info?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Box>
      <Typography
        component="label"
        variant="body2"
        sx={{
          display: "inline-flex",
          alignItems: "center",
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
        {info && (
          <Tooltip title={info} arrow placement="top">
            <Box
              component="span"
              sx={{
                ml: 0.75,
                display: "inline-flex",
                cursor: "help",
                color: "text.disabled",
                "&:hover": { color: "text.secondary" },
              }}
            >
              <InfoOutlinedIcon sx={{ fontSize: 16 }} />
            </Box>
          </Tooltip>
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
