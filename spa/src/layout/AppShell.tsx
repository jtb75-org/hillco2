import { useState } from "react";
import {
  AppBar,
  Avatar,
  Box,
  Divider,
  Drawer,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Toolbar,
  Typography,
} from "@mui/material";
import AdminPanelSettingsIcon from "@mui/icons-material/AdminPanelSettings";
import AssignmentOutlinedIcon from "@mui/icons-material/AssignmentOutlined";
import AutoStoriesOutlinedIcon from "@mui/icons-material/AutoStoriesOutlined";
import ContactsIcon from "@mui/icons-material/Contacts";
import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined";
import GroupsIcon from "@mui/icons-material/Groups";
import HomeIcon from "@mui/icons-material/Home";
import LogoutIcon from "@mui/icons-material/Logout";
import { Link, Outlet, useLocation } from "react-router-dom";

import { signOut, useAuth } from "../auth";

const DRAWER_WIDTH = 240;

const NAV_ITEMS: ReadonlyArray<{ to: string; label: string; icon: JSX.Element }> = [
  { to: "/", label: "Home", icon: <HomeIcon /> },
  { to: "/families", label: "Families", icon: <GroupsIcon /> },
  { to: "/intakes", label: "Intakes", icon: <DescriptionOutlinedIcon /> },
  { to: "/engagements", label: "Engagements", icon: <AssignmentOutlinedIcon /> },
  { to: "/contacts", label: "Contacts", icon: <ContactsIcon /> },
  { to: "/catalog", label: "Catalog", icon: <AutoStoriesOutlinedIcon /> },
  { to: "/admin", label: "Admin", icon: <AdminPanelSettingsIcon /> },
];

export function AppShell() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  return (
    <Box sx={{ display: "flex", minHeight: "100vh", bgcolor: "background.default" }}>
      <AppBar
        position="fixed"
        color="inherit"
        sx={{
          zIndex: (t) => t.zIndex.drawer + 1,
          bgcolor: "background.paper",
          color: "text.primary",
          borderBottom: 1,
          borderColor: "divider",
        }}
        elevation={0}
      >
        <Toolbar sx={{ gap: 2 }}>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            HillCo Portal
          </Typography>
          {user && (
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <Typography variant="body2">{user.name}</Typography>
              <IconButton
                onClick={(e) => setMenuAnchor(e.currentTarget)}
                size="small"
                aria-label="Account menu"
                aria-haspopup="true"
                aria-expanded={menuAnchor ? "true" : undefined}
                sx={{ p: 0 }}
              >
                <Avatar sx={{ width: 32, height: 32 }}>
                  {user.name.charAt(0)}
                </Avatar>
              </IconButton>
              <Menu
                anchorEl={menuAnchor}
                open={!!menuAnchor}
                onClose={() => setMenuAnchor(null)}
                anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
                transformOrigin={{ vertical: "top", horizontal: "right" }}
              >
                <Box sx={{ px: 2, py: 1, minWidth: 200 }}>
                  <Typography variant="body2">{user.name}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {user.email}
                  </Typography>
                </Box>
                <Divider />
                <MenuItem onClick={() => { setMenuAnchor(null); signOut(); }}>
                  <ListItemIcon>
                    <LogoutIcon fontSize="small" />
                  </ListItemIcon>
                  <ListItemText>Sign out</ListItemText>
                </MenuItem>
              </Menu>
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
        <Box sx={{ overflow: "auto", px: 1.25, py: 1.5 }}>
          <List sx={{ display: "grid", gap: 0.25 }}>
            {NAV_ITEMS.map((item) => {
              const selected =
                item.to === "/"
                  ? pathname === "/"
                  : pathname.startsWith(item.to);
              return (
                <ListItem key={item.to} disablePadding>
                  <ListItemButton
                    component={Link}
                    to={item.to}
                    selected={selected}
                    sx={{
                      borderRadius: 1,
                      minHeight: 42,
                      "&.Mui-selected": {
                        bgcolor: "#eff6ff",
                        color: "primary.dark",
                      },
                      "&.Mui-selected:hover": {
                        bgcolor: "#eff6ff",
                      },
                    }}
                  >
                    <ListItemIcon
                      sx={{
                        minWidth: 36,
                        color: selected ? "primary.dark" : "text.secondary",
                      }}
                    >
                      {item.icon}
                    </ListItemIcon>
                    <ListItemText
                      primary={item.label}
                      primaryTypographyProps={{ fontSize: 14, fontWeight: selected ? 650 : 500 }}
                    />
                  </ListItemButton>
                </ListItem>
              );
            })}
          </List>
        </Box>
      </Drawer>
      {/* px scales with viewport — drawer provides the visual buffer on
          the left, so the right needs more padding on wide screens to
          match. */}
      <Box component="main" sx={{ flexGrow: 1, py: 3, px: { xs: 3, md: 5, lg: 6 } }}>
        <Toolbar />
        <Box sx={{ maxWidth: 1440, mx: "auto" }}>
          <Outlet />
        </Box>
      </Box>
    </Box>
  );
}
