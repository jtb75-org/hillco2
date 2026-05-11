import {
  Box,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Typography,
  type DialogProps,
} from "@mui/material";
import type { FormEventHandler, ReactNode } from "react";

interface FormDialogProps extends Pick<DialogProps, "open" | "maxWidth"> {
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  actions: ReactNode;
  onClose: () => void;
  onSubmit?: FormEventHandler<HTMLFormElement>;
}

export function FormDialog({
  open,
  title,
  subtitle,
  children,
  actions,
  onClose,
  onSubmit,
  maxWidth = "sm",
}: FormDialogProps) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth={maxWidth} fullWidth>
      <Box component="form" onSubmit={onSubmit}>
        <DialogTitle sx={{ pb: subtitle ? 1 : 2 }}>
          {title}
          {subtitle && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              {subtitle}
            </Typography>
          )}
        </DialogTitle>
        <DialogContent sx={{ pt: 2 }}>{children}</DialogContent>
        <Divider />
        <DialogActions sx={{ px: 3, py: 1.5 }}>{actions}</DialogActions>
      </Box>
    </Dialog>
  );
}
