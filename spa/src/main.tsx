import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { CssBaseline, ThemeProvider } from "@mui/material";
import { QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";

import { App } from "./App";
import { queryClient } from "./queryClient";
import { theme } from "./theme";

// Skeleton uses plain fetch with credentials: 'include' (see auth.tsx).
// When the first domain page lands, we'll add @hey-api/openapi-ts back
// for a typed client generated from /openapi.json — deferred so the
// skeleton isn't gated on a hey-api version pair.

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </QueryClientProvider>
    </ThemeProvider>
  </StrictMode>,
);
