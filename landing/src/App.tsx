import { Alert, Snackbar } from "@mui/material";
import { useState } from "react";

import { LandingPage } from "./LandingPage";
import { LandingPageV2 } from "./LandingPageV2";

// Friendly copy for the `?login_error=...` codes the backend auth callback
// emits when something goes wrong server-side. Mirrors the SPA's AuthGate
// strings so the same error vocabulary surfaces here when the landing is
// where the user lands after a failed OAuth round-trip.
const LOGIN_ERROR_COPY: Record<string, string> = {
  oauth_failed:
    "That sign-in attempt couldn't complete — please try again. (Often happens when the callback URL is reloaded.)",
  no_userinfo: "Google didn't return your account info. Please try again.",
  not_allowed:
    "Your Google account isn't authorized for HillCo Portal. Contact an admin if you think this is a mistake.",
  deactivated:
    "Your account has been deactivated. Contact an admin to reactivate it.",
};

export function App() {
  const params = new URLSearchParams(window.location.search);
  const errorCode = params.get("login_error");
  const showVersion1 = window.location.pathname === "/version1" || params.get("version") === "1";
  const [errorOpen, setErrorOpen] = useState(!!errorCode);

  return (
    <>
      {showVersion1 ? <LandingPage /> : <LandingPageV2 />}
      <Snackbar
        open={errorOpen}
        autoHideDuration={8000}
        onClose={() => setErrorOpen(false)}
        anchorOrigin={{ vertical: "top", horizontal: "center" }}
      >
        <Alert
          severity="error"
          variant="filled"
          onClose={() => setErrorOpen(false)}
        >
          {errorCode && (LOGIN_ERROR_COPY[errorCode] ?? "Sign-in failed. Please try again.")}
        </Alert>
      </Snackbar>
    </>
  );
}
