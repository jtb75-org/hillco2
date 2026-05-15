import { Box, Button, CircularProgress, Stack, Typography } from "@mui/material";
import { Navigate, Route, Routes } from "react-router-dom";

import { AppShell } from "./layout/AppShell";
import { AuthProvider, redirectToLogin, useAuth } from "./auth";
import { Dashboard } from "./pages/Dashboard";
import { AdminLayout } from "./pages/admin/AdminLayout";
import { AdminUsers } from "./pages/admin/Users";
import { AdminAuditLog } from "./pages/admin/AuditLog";
import { AdminAbout } from "./pages/admin/About";
import { ContactsList } from "./pages/contacts/ContactsList";
import { FamiliesList } from "./pages/families/FamiliesList";
import { FamilyDetail } from "./pages/families/FamilyDetail";
import { EngagementDetail } from "./pages/engagements/EngagementDetail";
import { EngagementsList } from "./pages/engagements/EngagementsList";
import { CatalogPage } from "./pages/catalog/CatalogPage";
import { IntakeWizard } from "./pages/intake/IntakeWizard";
import { IntakeForm } from "./pages/intake/IntakeForm";
import { IntakeDiscoveryMockup } from "./pages/intake/IntakeDiscoveryMockup";
import { IntakesList } from "./pages/intake/IntakesList";
import { StudentDetail } from "./pages/students/StudentDetail";

function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  if (isLoading) {
    return (
      <Box display="flex" alignItems="center" justifyContent="center" minHeight="100vh">
        <CircularProgress />
      </Box>
    );
  }
  if (!user) {
    return (
      <Box
        display="flex"
        alignItems="center"
        justifyContent="center"
        minHeight="100vh"
      >
        <Stack spacing={2} alignItems="center">
          <Typography variant="h5">HillCo Portal</Typography>
          <Typography variant="body2" color="text.secondary">
            Sign in to continue.
          </Typography>
          <Button variant="contained" onClick={redirectToLogin}>
            Sign in with Google
          </Button>
        </Stack>
      </Box>
    );
  }
  return <>{children}</>;
}

export function App() {
  return (
    <AuthProvider>
      <AuthGate>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/families" element={<FamiliesList />} />
            <Route path="/families/:id" element={<FamilyDetail />} />
            <Route path="/students/:id" element={<StudentDetail />} />
            <Route path="/engagements" element={<EngagementsList />} />
            <Route path="/engagements/:id" element={<EngagementDetail />} />
            <Route path="/intake" element={<IntakeWizard />} />
            <Route path="/intakes" element={<IntakesList />} />
            <Route path="/intakes/:id" element={<IntakeForm />} />
            <Route path="/mockup/intake-discovery" element={<IntakeDiscoveryMockup />} />
            <Route path="/contacts" element={<ContactsList />} />
            <Route path="/catalog" element={<CatalogPage />} />
            <Route path="/admin" element={<AdminLayout />}>
              <Route index element={<Navigate to="users" replace />} />
              <Route path="users" element={<AdminUsers />} />
              <Route path="audit-log" element={<AdminAuditLog />} />
              <Route path="about" element={<AdminAbout />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </AuthGate>
    </AuthProvider>
  );
}

function NotFound() {
  return (
    <Box p={4}>
      <Typography variant="h6">Not found</Typography>
      <Typography variant="body2" color="text.secondary">
        That page isn't here yet. The skeleton only ships the home route — the
        domain pages get added as the SPA fills out.
      </Typography>
    </Box>
  );
}
