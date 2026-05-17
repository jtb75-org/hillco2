import { Alert, Box, Button, CircularProgress, Stack, Typography } from "@mui/material";
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
import { CatalogLayout } from "./pages/catalog/CatalogLayout";
import { CatalogPage } from "./pages/catalog/CatalogPage";
import { CatalogContracts } from "./pages/catalog/Contracts";
import { CatalogFirmSettings } from "./pages/catalog/FirmSettings";
import { SchoolsList } from "./pages/schools/SchoolsList";
import { IntakeForm } from "./pages/intake/IntakeForm";
import { IntakesList } from "./pages/intake/IntakesList";
import { StudentDetail } from "./pages/students/StudentDetail";

// Friendly copy for the `?login_error=...` codes the auth callback
// uses when something goes wrong server-side. Anything we don't have
// explicit copy for falls back to the generic message.
const LOGIN_ERROR_COPY: Record<string, string> = {
  oauth_failed:
    "That sign-in attempt couldn't complete — please try again. (Often happens when the callback URL is reloaded.)",
  no_userinfo: "Google didn't return your account info. Please try again.",
  not_allowed:
    "Your Google account isn't authorized for HillCo Portal. Contact an admin if you think this is a mistake.",
  deactivated:
    "Your account has been deactivated. Contact an admin to reactivate it.",
};

function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const params = new URLSearchParams(window.location.search);
  const loginError = params.get("login_error");
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
        <Stack spacing={2} alignItems="center" sx={{ maxWidth: 420, px: 2 }}>
          <Typography variant="h5">HillCo Portal</Typography>
          {loginError && (
            <Alert severity="error" variant="outlined" sx={{ width: "100%" }}>
              {LOGIN_ERROR_COPY[loginError] ??
                "Sign-in failed. Please try again."}
            </Alert>
          )}
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
            <Route path="/intakes" element={<IntakesList />} />
            <Route path="/intakes/:id" element={<IntakeForm />} />
            <Route path="/contacts" element={<ContactsList />} />
            <Route path="/schools" element={<SchoolsList />} />
            <Route path="/catalog" element={<CatalogLayout />}>
              <Route index element={<Navigate to="activities" replace />} />
              <Route path="activities" element={<CatalogPage />} />
              <Route path="contracts" element={<CatalogContracts />} />
              <Route path="firm-settings" element={<CatalogFirmSettings />} />
            </Route>
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
