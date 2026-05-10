import { createContext, useCallback, useContext, useState } from "react";
import type { ReactNode } from "react";
import { Alert, type AlertColor, Snackbar as MuiSnackbar } from "@mui/material";

interface ToastMessage {
  message: string;
  severity: AlertColor;
}

interface SnackbarContextValue {
  show: (message: string, severity?: AlertColor) => void;
}

const SnackbarContext = createContext<SnackbarContextValue>({
  show: () => {
    // Provider not mounted — no-op fallback so usages don't crash in
    // tests that skip the provider.
  },
});

/**
 * App-wide toast for "X happened" confirmations. Mount once at the
 * root of the tree; any descendant can call `useSnackbar().show(...)`.
 * One message at a time; new calls replace the current message.
 */
export function SnackbarProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<ToastMessage | null>(null);

  const show = useCallback<SnackbarContextValue["show"]>(
    (message, severity = "success") => {
      setMsg({ message, severity });
    },
    [],
  );

  const handleClose = (_: unknown, reason?: string) => {
    // Don't dismiss on background click — only autoHide or explicit X.
    if (reason === "clickaway") return;
    setMsg(null);
  };

  return (
    <SnackbarContext.Provider value={{ show }}>
      {children}
      <MuiSnackbar
        open={!!msg}
        autoHideDuration={3500}
        onClose={handleClose}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        {msg ? (
          <Alert
            onClose={handleClose}
            severity={msg.severity}
            variant="filled"
            sx={{ width: "100%" }}
          >
            {msg.message}
          </Alert>
        ) : undefined}
      </MuiSnackbar>
    </SnackbarContext.Provider>
  );
}

export function useSnackbar() {
  return useContext(SnackbarContext);
}
