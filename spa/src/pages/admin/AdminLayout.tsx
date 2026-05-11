import { Box, Tab, Tabs } from "@mui/material";
import { Link, Outlet, useLocation } from "react-router-dom";

import { PageHeader } from "../../components/PageHeader";

// URL-per-tab so each section is bookmarkable and the back button
// behaves like a normal navigation. The `value` is derived from the
// current path's second segment (`/admin/users` -> `users`); MUI's
// Tabs is happy with whatever string we hand it as long as it matches
// one of the Tab `value`s.
const TABS = [
  { value: "users", label: "Users", to: "/admin/users" },
  { value: "audit-log", label: "Audit Log", to: "/admin/audit-log" },
  { value: "about", label: "About", to: "/admin/about" },
] as const;

type TabValue = (typeof TABS)[number]["value"];

export function AdminLayout() {
  const { pathname } = useLocation();
  const seg = pathname.split("/")[2] ?? "";
  const current: TabValue =
    (TABS.find((t) => t.value === seg)?.value ?? "users");

  return (
    <Box>
      <PageHeader
        title="Admin"
        subtitle="Manage access, inspect audit history, and verify the deployed build."
      />
      <Tabs value={current} sx={{ borderBottom: 1, borderColor: "divider", mb: 3 }}>
        {TABS.map((t) => (
          <Tab
            key={t.value}
            value={t.value}
            label={t.label}
            component={Link}
            to={t.to}
          />
        ))}
      </Tabs>
      <Outlet />
    </Box>
  );
}
