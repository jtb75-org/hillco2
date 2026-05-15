import {
  Box,
  Drawer,
  IconButton,
  Link as MuiLink,
  Stack,
  Typography,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import { Link as RouterLink } from "react-router-dom";

import { useResizableDrawerWidth } from "../../components/useResizableDrawerWidth";
import { StudentEditor } from "./StudentEditor";

/** Right-slide drawer that opens the StudentEditor for inline editing
 *  from a student card on the family or intake page. Mirrors the
 *  ParentDrawer pattern: the consumer manages open state and gets a
 *  callback when the student is removed so it can refresh its
 *  surrounding lists. */
export function StudentDrawer({
  open,
  studentId,
  onClose,
  onChanged,
  onRemoved,
}: {
  open: boolean;
  studentId: string | null;
  onClose: () => void;
  /** Fired any time the editor finishes a save — invalidate the
   *  card's parent query so the row repaints with the new values. */
  onChanged?: () => void;
  /** Fired when the student is soft-deleted. Same as onChanged plus
   *  the drawer closes itself. */
  onRemoved?: () => void;
}) {
  const { width, handle } = useResizableDrawerWidth("student-drawer", {
    initial: 560,
  });
  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      // Force a fresh mount per student so the editor's useState
      // re-initializes from the new query data instead of holding
      // onto the previous student's local edits.
      ModalProps={{ keepMounted: false }}
      PaperProps={{
        sx: { width, maxWidth: "100%", p: 0 },
      }}
    >
      {handle}
      {studentId && (
        <Stack sx={{ height: "100%" }}>
          <Stack
            direction="row"
            alignItems="center"
            spacing={1}
            sx={{
              px: 2,
              py: 1.5,
              borderBottom: 1,
              borderColor: "divider",
              bgcolor: "background.paper",
              position: "sticky",
              top: 0,
              zIndex: 1,
            }}
          >
            <Typography variant="overline" color="text.secondary" sx={{ flex: 1 }}>
              Student
            </Typography>
            <IconButton
              size="small"
              aria-label="Open full student page"
              component={RouterLink}
              to={`/students/${studentId}`}
              target="_blank"
            >
              <OpenInNewIcon fontSize="small" />
            </IconButton>
            <IconButton size="small" aria-label="Close" onClick={onClose}>
              <CloseIcon fontSize="small" />
            </IconButton>
          </Stack>
          <Box sx={{ p: 2, flex: 1, overflowY: "auto" }}>
            <StudentEditor
              studentId={studentId}
              onRemoved={() => {
                onRemoved?.();
                onChanged?.();
                onClose();
              }}
            />
            <Box sx={{ mt: 2 }}>
              <MuiLink
                component={RouterLink}
                to={`/students/${studentId}`}
                target="_blank"
                rel="noopener"
                variant="caption"
                sx={{ color: "text.disabled" }}
              >
                Open full student page →
              </MuiLink>
            </Box>
          </Box>
        </Stack>
      )}
    </Drawer>
  );
}
