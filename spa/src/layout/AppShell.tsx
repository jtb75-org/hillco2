import { useState } from "react";
import {
  AppBar,
  Avatar,
  Box,
  Divider,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
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
  Button,
} from "@mui/material";
import AdminPanelSettingsIcon from "@mui/icons-material/AdminPanelSettings";
import AssignmentOutlinedIcon from "@mui/icons-material/AssignmentOutlined";
import AutoStoriesOutlinedIcon from "@mui/icons-material/AutoStoriesOutlined";
import CheckIcon from "@mui/icons-material/Check";
import ContactsIcon from "@mui/icons-material/Contacts";
import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined";
import GroupsIcon from "@mui/icons-material/Groups";
import HomeIcon from "@mui/icons-material/Home";
import LogoutIcon from "@mui/icons-material/Logout";
import PaletteOutlinedIcon from "@mui/icons-material/PaletteOutlined";
import ReceiptLongOutlinedIcon from "@mui/icons-material/ReceiptLongOutlined";
import WebAssetOutlinedIcon from "@mui/icons-material/WebAssetOutlined";
import SchoolIcon from "@mui/icons-material/School";
import { Link, Outlet, useLocation } from "react-router-dom";

import { signOut, useAuth } from "../auth";
import { useAppTheme } from "../themeProvider";

const DRAWER_WIDTH = 240;

type NavEntry =
  | { kind: "item"; to: string; label: string; icon: JSX.Element }
  | { kind: "separator" };

const NAV_ITEMS: ReadonlyArray<NavEntry> = [
  // Top: Home + the active work surfaces.
  { kind: "item", to: "/dashboard", label: "Home", icon: <HomeIcon /> },
  { kind: "item", to: "/intakes", label: "Intakes", icon: <DescriptionOutlinedIcon /> },
  { kind: "item", to: "/engagements", label: "Engagements", icon: <AssignmentOutlinedIcon /> },
  { kind: "item", to: "/invoices", label: "Invoices", icon: <ReceiptLongOutlinedIcon /> },
  // Reference data — who and what we're working with.
  { kind: "separator" },
  { kind: "item", to: "/families", label: "Families", icon: <GroupsIcon /> },
  { kind: "item", to: "/contacts", label: "Contacts", icon: <ContactsIcon /> },
  { kind: "item", to: "/schools", label: "Schools", icon: <SchoolIcon /> },
  { kind: "item", to: "/catalog", label: "Catalog", icon: <AutoStoriesOutlinedIcon /> },
  // Practice configuration.
  { kind: "separator" },
  { kind: "item", to: "/admin", label: "Admin", icon: <AdminPanelSettingsIcon /> },
];

export function AppShell() {
  const { user } = useAuth();
  const appTheme = useAppTheme();
  const { pathname } = useLocation();
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [themeDialogOpen, setThemeDialogOpen] = useState(false);
  const [styleDialogOpen, setStyleDialogOpen] = useState(false);
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
                <MenuItem
                  onClick={() => {
                    setMenuAnchor(null);
                    setThemeDialogOpen(true);
                  }}
                >
                  <ListItemIcon>
                    <PaletteOutlinedIcon fontSize="small" />
                  </ListItemIcon>
                  <ListItemText
                    primary="Color scheme"
                    secondary={
                      appTheme.schemes.find((option) => option.name === appTheme.scheme)
                        ?.label
                    }
                  />
                </MenuItem>
                <MenuItem
                  onClick={() => {
                    setMenuAnchor(null);
                    setStyleDialogOpen(true);
                  }}
                >
                  <ListItemIcon>
                    <WebAssetOutlinedIcon fontSize="small" />
                  </ListItemIcon>
                  <ListItemText
                    primary="Window style"
                    secondary={
                      appTheme.styles.find((option) => option.name === appTheme.style)
                        ?.label
                    }
                  />
                </MenuItem>
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
      <Dialog
        open={themeDialogOpen}
        onClose={() => setThemeDialogOpen(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Color scheme</DialogTitle>
        <DialogContent>
          <List disablePadding>
            {appTheme.schemes.map((option) => (
              <ListItem key={option.name} disablePadding>
                <ListItemButton
                  selected={option.name === appTheme.scheme}
                  onClick={() => {
                    appTheme.setScheme(option.name);
                    setThemeDialogOpen(false);
                  }}
                >
                  <ListItemText primary={option.label} />
                  {option.name === appTheme.scheme && <CheckIcon fontSize="small" />}
                </ListItemButton>
              </ListItem>
            ))}
          </List>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setThemeDialogOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>
      <Dialog
        open={styleDialogOpen}
        onClose={() => setStyleDialogOpen(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Window style</DialogTitle>
        <DialogContent>
          <List disablePadding>
            {appTheme.styles.map((option) => (
              <ListItem key={option.name} disablePadding>
                <ListItemButton
                  selected={option.name === appTheme.style}
                  onClick={() => {
                    appTheme.setStyle(option.name);
                    setStyleDialogOpen(false);
                  }}
                >
                  <ListItemText primary={option.label} />
                  {option.name === appTheme.style && <CheckIcon fontSize="small" />}
                </ListItemButton>
              </ListItem>
            ))}
          </List>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setStyleDialogOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>
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
            {NAV_ITEMS.map((entry, idx) => {
              if (entry.kind === "separator") {
                return (
                  <Divider
                    key={`sep-${idx}`}
                    sx={{ my: 0.75, mx: 1, borderColor: "divider" }}
                  />
                );
              }
              const selected =
                entry.to === "/"
                  ? pathname === "/"
                  : pathname.startsWith(entry.to);
              return (
                <ListItem key={entry.to} disablePadding>
                  <ListItemButton
                    component={Link}
                    to={entry.to}
                    selected={selected}
                    sx={{
                      borderRadius: 1,
                      minHeight: 42,
                      "&.Mui-selected": {
                        bgcolor: "action.selected",
                        color: "primary.dark",
                      },
                      "&.Mui-selected:hover": {
                        bgcolor: "action.selected",
                      },
                    }}
                  >
                    <ListItemIcon
                      sx={{
                        minWidth: 36,
                        color: selected ? "primary.dark" : "text.secondary",
                      }}
                    >
                      {entry.icon}
                    </ListItemIcon>
                    <ListItemText
                      primary={entry.label}
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
