import {
  Alert,
  Box,
  Breadcrumbs,
  CircularProgress,
  Link as MuiLink,
  Stack,
  Typography,
} from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import { Link as RouterLink, useNavigate, useParams } from "react-router-dom";

import { api } from "../../api/client";
import { StudentEditor, type StudentEditorData } from "./StudentEditor";

/** Standalone student page. Wraps <StudentEditor> with breadcrumbs and
 *  a navigation-on-remove callback. The drawer (StudentDrawer) uses the
 *  same editor but closes itself instead of navigating. */
export function StudentDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  // Mirror the editor's query so the breadcrumb can render the family
  // link. TanStack Query dedupes on the same key, so this is a free
  // cache hit once the editor's query resolves.
  const { data, isPending, error } = useQuery<StudentEditorData, Error>({
    queryKey: ["students", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error: respError, response } = await api.GET(
        "/api/students/{student_id}",
        { params: { path: { student_id: id! } } },
      );
      if (response.status === 404) throw new Error("Student not found.");
      if (respError || !data) throw new Error("Failed to load student.");
      return data as unknown as StudentEditorData;
    },
  });

  if (error) return <Alert severity="error">{error.message}</Alert>;
  if (isPending || !data || !id) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Stack spacing={3}>
      <Breadcrumbs>
        <MuiLink component={RouterLink} to="/families" color="inherit" underline="hover">
          Families
        </MuiLink>
        {data.family && (
          <MuiLink
            component={RouterLink}
            to={`/families/${data.family.id}`}
            color="inherit"
            underline="hover"
          >
            {data.family.household_name}
          </MuiLink>
        )}
        <Typography color="text.primary">{data.name}</Typography>
      </Breadcrumbs>

      <StudentEditor
        studentId={id}
        onRemoved={(student) =>
          navigate(student.family ? `/families/${student.family.id}` : "/families")
        }
      />
    </Stack>
  );
}
