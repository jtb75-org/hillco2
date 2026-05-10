import { createTheme } from "@mui/material/styles";

// Palette is a quick first pass — calibrate against your branding when
// the visual identity for hillco2 lands. Indigo-700 carries over from the
// hillco-portal accent color.
export const theme = createTheme({
  palette: {
    mode: "light",
    primary: {
      main: "#1d4ed8",
    },
    secondary: {
      main: "#475569",
    },
    background: {
      default: "#f8fafc",
    },
  },
  shape: {
    borderRadius: 6,
  },
  typography: {
    fontFamily: ['"Inter"', "system-ui", "Helvetica", "Arial", "sans-serif"].join(","),
  },
});
