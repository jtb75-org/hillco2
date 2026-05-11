import { createTheme } from "@mui/material/styles";

// Palette is a quick first pass — calibrate against your branding when
// the visual identity for hillco2 lands. Indigo-700 carries over from the
// hillco-portal accent color.
export const theme = createTheme({
  palette: {
    mode: "light",
    primary: {
      main: "#2563eb",
      dark: "#1d4ed8",
    },
    secondary: {
      main: "#475569",
    },
    background: {
      default: "#f6f7f9",
      paper: "#ffffff",
    },
    divider: "#e2e8f0",
  },
  shape: {
    borderRadius: 6,
  },
  typography: {
    fontFamily: ['"Inter"', "system-ui", "Helvetica", "Arial", "sans-serif"].join(","),
    h4: {
      fontSize: "1.625rem",
      lineHeight: 1.25,
      fontWeight: 700,
      letterSpacing: 0,
    },
    h5: {
      fontWeight: 700,
      letterSpacing: 0,
    },
    h6: {
      fontWeight: 650,
      letterSpacing: 0,
    },
    button: {
      textTransform: "none",
      fontWeight: 650,
    },
    overline: {
      fontSize: "0.6875rem",
      fontWeight: 700,
      letterSpacing: "0.04em",
      lineHeight: 1.6,
    },
  },
  components: {
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundImage: "none",
        },
      },
    },
    MuiButton: {
      defaultProps: {
        disableElevation: true,
      },
      styleOverrides: {
        root: {
          borderRadius: 6,
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          backgroundImage: "none",
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          fontWeight: 600,
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: "none",
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        head: {
          backgroundColor: "#f8fafc",
          color: "#475569",
          fontSize: 12,
          fontWeight: 700,
          lineHeight: 1.4,
        },
        sizeSmall: {
          paddingTop: 10,
          paddingBottom: 10,
        },
      },
    },
    MuiTableRow: {
      styleOverrides: {
        root: {
          "&:last-child td": {
            borderBottom: 0,
          },
        },
      },
    },
  },
});
