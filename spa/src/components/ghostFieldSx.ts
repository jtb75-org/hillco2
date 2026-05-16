import type { SxProps, Theme } from "@mui/material";

/**
 * "Ghost input" styling for MUI TextField / TextField select / DatePicker.
 *
 * At rest: invisible outline. On hover: faint border + subtle bg tint.
 * On focus: full outlined input with primary border.
 *
 * Quiets the always-on TextField noise on dense forms (the intake page
 * is the first surface using it) while keeping meeting-speed editing.
 * Apply via `sx={ghostFieldSx}` on TextField or via
 * `slotProps={{ textField: { sx: ghostFieldSx } }}` on DatePicker.
 *
 * For a Select, pass through TextField with `select` — plain `<Select>`
 * renders the OutlinedInput root directly and the descendant selector
 * below won't match.
 */
export const ghostFieldSx: SxProps<Theme> = {
  "& .MuiOutlinedInput-root": {
    bgcolor: "transparent",
    transition: "background-color 150ms, border-color 150ms",
    "& fieldset": { borderColor: "transparent" },
    "&:hover": { bgcolor: "action.hover" },
    "&:hover fieldset": { borderColor: "divider" },
    "&.Mui-focused": { bgcolor: "background.paper" },
    "&.Mui-focused fieldset": { borderColor: "primary.main" },
  },
};
