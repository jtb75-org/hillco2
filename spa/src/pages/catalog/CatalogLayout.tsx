import { Box, Tab, Tabs } from "@mui/material";
import { Link, Outlet, useLocation } from "react-router-dom";

import { PageHeader } from "../../components/PageHeader";

// URL-per-tab so each section is bookmarkable. The `value` is derived
// from the current path's second segment (`/catalog/activities` ->
// `activities`).
const TABS = [
  { value: "activities", label: "Activities", to: "/catalog/activities" },
  { value: "contracts", label: "Contracts", to: "/catalog/contracts" },
  { value: "firm-settings", label: "Firm settings", to: "/catalog/firm-settings" },
] as const;

type TabValue = (typeof TABS)[number]["value"];

export function CatalogLayout() {
  const { pathname } = useLocation();
  const seg = pathname.split("/")[2] ?? "";
  const current: TabValue =
    (TABS.find((t) => t.value === seg)?.value ?? "activities");

  return (
    <Box>
      <PageHeader
        title="Catalog"
        subtitle="The user-editable building blocks of an engagement: activities, phases, engagement types, and contract templates."
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
