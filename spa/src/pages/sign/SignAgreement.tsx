import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Container,
  Divider,
  FormControlLabel,
  Link,
  Paper,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";

const NAVY = "#08428d";

type SigningView = {
  contract_number: string | null;
  client_name: string | null;
  firm_name: string | null;
  body_html: string;
  status: string;
  signed: boolean;
  consent_text: string;
};

export function SignAgreement() {
  const { token = "" } = useParams();
  const [view, setView] = useState<SigningView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/sign/${token}`);
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.detail ?? "This signing link could not be opened.");
        }
        const data = (await res.json()) as SigningView;
        if (!cancelled) setView(data);
      } catch (e) {
        if (!cancelled) setLoadError((e as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (loadError) {
    return (
      <CenteredCard>
        <Alert severity="error" variant="outlined">
          {loadError}
        </Alert>
        <Typography variant="body2" color="text.secondary">
          If you believe this is a mistake, please contact HillCo Educational
          Consulting for a new link.
        </Typography>
      </CenteredCard>
    );
  }

  if (!view) {
    return (
      <CenteredCard>
        <CircularProgress />
      </CenteredCard>
    );
  }

  if (done || view.signed) {
    return (
      <CenteredCard>
        <Typography variant="h5" sx={{ color: NAVY, fontWeight: 700 }}>
          Thank you — your agreement is signed.
        </Typography>
        <Typography variant="body1" color="text.secondary">
          A copy of the fully executed{" "}
          {view.contract_number ? <strong>{view.contract_number}</strong> : "agreement"}{" "}
          has been emailed to you for your records.
        </Typography>
        <Button
          variant="contained"
          href={`/api/sign/${token}/pdf`}
          target="_blank"
          rel="noreferrer"
          sx={{ bgcolor: NAVY }}
        >
          Download signed PDF
        </Button>
      </CenteredCard>
    );
  }

  return <SigningForm token={token} view={view} onSigned={() => setDone(true)} />;
}

function CenteredCard({ children }: { children: React.ReactNode }) {
  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "#f4f6fb", py: { xs: 3, md: 6 } }}>
      <Container maxWidth="sm">
        <Paper variant="outlined" sx={{ p: { xs: 3, md: 4 } }}>
          <Stack spacing={2} alignItems="center" textAlign="center">
            <Wordmark />
            {children}
          </Stack>
        </Paper>
      </Container>
    </Box>
  );
}

function Wordmark() {
  return (
    <Typography sx={{ fontWeight: 900, letterSpacing: ".02em", fontSize: 22 }}>
      <span style={{ color: NAVY }}>HILL</span>
      <span style={{ color: "#5fa0ee" }}>CO</span>{" "}
      <span style={{ fontWeight: 300, fontSize: 12, letterSpacing: ".22em", color: "#557" }}>
        EDUCATIONAL CONSULTING
      </span>
    </Typography>
  );
}

function SigningForm({
  token,
  view,
  onSigned,
}: {
  token: string;
  view: SigningView;
  onSigned: () => void;
}) {
  const [name, setName] = useState(view.client_name?.replace(/^the /, "").replace(/ family$/, "") ?? "");
  const [tab, setTab] = useState<"typed" | "drawn">("typed");
  const [typed, setTyped] = useState("");
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawnRef = useRef(false);

  const canSubmit =
    name.trim() !== "" &&
    consent &&
    (tab === "typed" ? typed.trim() !== "" : drawnRef.current) &&
    !submitting;

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = {
        signer_name: name.trim(),
        method: tab,
        consent,
      };
      if (tab === "typed") {
        payload.signature_text = typed.trim();
      } else {
        payload.signature_data_uri = canvasRef.current?.toDataURL("image/png");
      }
      const res = await fetch(`/api/sign/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.detail ?? "Could not submit your signature.");
      }
      onSigned();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "#f4f6fb", py: { xs: 2, md: 5 } }}>
      <Container maxWidth="md">
        <Stack spacing={2}>
          <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 } }}>
            <Wordmark />
            <Typography variant="h5" sx={{ mt: 2, color: NAVY, fontWeight: 700 }}>
              Review &amp; sign your agreement
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {view.contract_number ? `${view.contract_number} · ` : ""}
              Please review the agreement below, then sign at the bottom.
            </Typography>
          </Paper>

          <Paper variant="outlined" sx={{ p: { xs: 2, md: 4 } }}>
            <Box
              sx={{
                fontFamily: "Georgia, 'Times New Roman', serif",
                "& h1": { fontSize: 20 },
                "& h2": { fontSize: 16 },
                "& h3": { fontSize: 14 },
                lineHeight: 1.55,
                maxHeight: { md: 480 },
                overflowY: { md: "auto" },
              }}
              dangerouslySetInnerHTML={{ __html: view.body_html }}
            />
          </Paper>

          <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 } }}>
            <Typography variant="h6" sx={{ color: NAVY }}>
              Your signature
            </Typography>
            <Stack spacing={2} sx={{ mt: 2 }}>
              <TextField
                label="Full legal name"
                size="small"
                value={name}
                onChange={(e) => setName(e.target.value)}
                fullWidth
              />
              <Tabs value={tab} onChange={(_, v) => setTab(v)}>
                <Tab value="typed" label="Type" />
                <Tab value="drawn" label="Draw" />
              </Tabs>
              {tab === "typed" ? (
                <>
                  <TextField
                    label="Type your signature"
                    size="small"
                    value={typed}
                    onChange={(e) => setTyped(e.target.value)}
                    fullWidth
                  />
                  {typed.trim() && (
                    <Box
                      sx={{
                        fontFamily: "'Segoe Script','Snell Roundhand',cursive",
                        fontSize: 32,
                        px: 2,
                        py: 1,
                        border: "1px solid #ddd",
                        borderRadius: 1,
                      }}
                    >
                      {typed}
                    </Box>
                  )}
                </>
              ) : (
                <SignaturePad canvasRef={canvasRef} drawnRef={drawnRef} />
              )}
              <FormControlLabel
                control={
                  <Checkbox checked={consent} onChange={(e) => setConsent(e.target.checked)} />
                }
                label={
                  <Typography variant="body2" color="text.secondary">
                    {view.consent_text}
                  </Typography>
                }
              />
              {error && (
                <Alert severity="error" variant="outlined">
                  {error}
                </Alert>
              )}
              <Divider />
              <Box sx={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 2 }}>
                <Link href={`/api/sign/${token}/pdf`} target="_blank" rel="noreferrer" variant="body2">
                  View as PDF
                </Link>
                <Button
                  variant="contained"
                  disabled={!canSubmit}
                  onClick={submit}
                  sx={{ bgcolor: NAVY, minWidth: 160 }}
                >
                  {submitting ? "Signing…" : "Sign agreement"}
                </Button>
              </Box>
            </Stack>
          </Paper>
        </Stack>
      </Container>
    </Box>
  );
}

function SignaturePad({
  canvasRef,
  drawnRef,
}: {
  canvasRef: React.MutableRefObject<HTMLCanvasElement | null>;
  drawnRef: React.MutableRefObject<boolean>;
}) {
  const drawing = useRef(false);

  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const c = canvasRef.current!;
    const r = c.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const start = (e: React.PointerEvent<HTMLCanvasElement>) => {
    drawing.current = true;
    const ctx = canvasRef.current!.getContext("2d")!;
    const p = pos(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
  };
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const ctx = canvasRef.current!.getContext("2d")!;
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#111";
    const p = pos(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    drawnRef.current = true;
  };
  const end = () => {
    drawing.current = false;
  };
  const clear = () => {
    const c = canvasRef.current!;
    c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
    drawnRef.current = false;
  };

  return (
    <Box>
      <Box
        component="canvas"
        ref={canvasRef}
        width={520}
        height={160}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerLeave={end}
        sx={{
          width: "100%",
          maxWidth: 520,
          height: 160,
          border: "1px solid #ddd",
          borderRadius: 1,
          touchAction: "none",
          bgcolor: "#fff",
        }}
      />
      <Button size="small" onClick={clear} sx={{ mt: 0.5 }}>
        Clear
      </Button>
    </Box>
  );
}
