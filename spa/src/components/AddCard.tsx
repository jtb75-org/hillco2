import AddIcon from "@mui/icons-material/Add";
import { ButtonBase, Stack, Typography } from "@mui/material";

/** Dashed ghost card that sits in a card grid as a second route into an
 *  "add item" flow — same handler as the section-header action button. */
export function AddCard({
  label,
  onClick,
  minHeight = 96,
}: {
  label: string;
  onClick: () => void;
  minHeight?: number;
}) {
  return (
    <ButtonBase
      onClick={onClick}
      sx={{
        width: "100%",
        height: "100%",
        minHeight,
        borderRadius: 2,
        border: "1.5px dashed",
        borderColor: "divider",
        color: "text.secondary",
        "&:hover": {
          borderColor: "primary.main",
          color: "primary.main",
          bgcolor: "action.hover",
        },
        "&:focus-visible": {
          outline: "2px solid",
          outlineColor: "primary.main",
          outlineOffset: 1,
        },
      }}
    >
      <Stack direction="row" spacing={1} alignItems="center">
        <AddIcon fontSize="small" />
        <Typography variant="body2" sx={{ fontWeight: 650 }}>
          {label}
        </Typography>
      </Stack>
    </ButtonBase>
  );
}
