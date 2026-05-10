import { Stack, Typography, Paper, Box } from "@mui/material";

import { useAuth } from "../auth";

// Placeholder home. Will be replaced by the dashboard view (uses
// /api/dashboard) in a follow-up commit. For the skeleton, the goal is
// just: prove the auth gate works, render shell + a route.
export function Home() {
  const { user } = useAuth();
  return (
    <Stack spacing={3} maxWidth={720}>
      <Box>
        <Typography variant="h4" gutterBottom>
          Welcome{user ? `, ${user.name.split(" ")[0]}` : ""}.
        </Typography>
        <Typography color="text.secondary">
          You're logged in as <strong>{user?.email}</strong>.
        </Typography>
      </Box>
      <Paper variant="outlined" sx={{ p: 3 }}>
        <Typography variant="h6" gutterBottom>
          Skeleton page
        </Typography>
        <Typography variant="body2" color="text.secondary">
          The SPA scaffold is up: Vite + React + TypeScript, MUI theming,
          react-router for navigation, TanStack Query for data, openapi-ts
          for a typed API client. Domain pages (Home dashboard, Families,
          Engagements, Schools, Invoices) get filled in next.
        </Typography>
      </Paper>
    </Stack>
  );
}
