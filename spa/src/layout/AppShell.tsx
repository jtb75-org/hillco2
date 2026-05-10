import {
  AppBar,
  Avatar,
  Box,
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Toolbar,
  Typography,
} from "@mui/material";
import AdminPanelSettingsIcon from "@mui/icons-material/AdminPanelSettings";
import EventNoteIcon from "@mui/icons-material/EventNote";
import GroupsIcon from "@mui/icons-material/Groups";
import HomeIcon from "@mui/icons-material/Home";
import ReceiptLongIcon from "@mui/icons-material/ReceiptLong";
import SchoolIcon from "@mui/icons-material/School";
import { Link, Outlet, useLocation } from "react-router-dom";

import { useAuth } from "../auth";

const DRAWER_WIDTH = 240;

const NAV_ITEMS: ReadonlyArray<{ to: string; label: string; icon: JSX.Element }> = [
  { to: "/", label: "Home", icon: <HomeIcon /> },
  { to: "/families", label: "Families", icon: <GroupsIcon /> },
  { to: "/engagements", label: "Engagements", icon: <EventNoteIcon /> },
  { to: "/schools", label: "Schools", icon: <SchoolIcon /> },
  { to: "/invoices", label: "Invoices", icon: <ReceiptLongIcon /> },
  { to: "/admin", label: "Admin", icon: <AdminPanelSettingsIcon /> },
];

export function AppShell() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  return (
    <Box sx={{ display: "flex", minHeight: "100vh" }}>
      <AppBar
        position="fixed"
        sx={{ zIndex: (t) => t.zIndex.drawer + 1 }}
        elevation={1}
      >
        <Toolbar sx={{ gap: 2 }}>
          <Typography variant="h6" sx={{ flexGrow: 1, fontWeight: 600 }}>
            HillCo Portal
          </Typography>
          {user && (
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <Typography variant="body2">{user.name}</Typography>
              <Avatar sx={{ width: 32, height: 32 }}>{user.name.charAt(0)}</Avatar>
            </Box>
          )}
        </Toolbar>
      </AppBar>
      <Drawer
        variant="permanent"
        sx={{
          width: DRAWER_WIDTH,
          flexShrink: 0,
          [`& .MuiDrawer-paper`]: { width: DRAWER_WIDTH, boxSizing: "border-box" },
        }}
      >
        <Toolbar />
        <Box sx={{ overflow: "auto" }}>
          <List>
            {NAV_ITEMS.map((item) => {
              const selected =
                item.to === "/"
                  ? pathname === "/"
                  : pathname.startsWith(item.to);
              return (
                <ListItem key={item.to} disablePadding>
                  <ListItemButton component={Link} to={item.to} selected={selected}>
                    <ListItemIcon>{item.icon}</ListItemIcon>
                    <ListItemText primary={item.label} />
                  </ListItemButton>
                </ListItem>
              );
            })}
          </List>
        </Box>
      </Drawer>
      <Box component="main" sx={{ flexGrow: 1, p: 3 }}>
        <Toolbar />
        <Outlet />
      </Box>
    </Box>
  );
}
