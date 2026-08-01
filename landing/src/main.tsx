import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { CssBaseline, ThemeProvider, createTheme } from "@mui/material";

import { App } from "./App";

// Bare-bones MUI theme. The landing is a single page and uses sx props
// for all custom palette work, so only the body type stack is set here —
// it matches the SPA so the two tiers read as one brand.
const theme = createTheme({
  typography: {
    fontFamily: ['"Inter"', "system-ui", "Helvetica", "Arial", "sans-serif"].join(","),
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <App />
    </ThemeProvider>
  </StrictMode>,
);
