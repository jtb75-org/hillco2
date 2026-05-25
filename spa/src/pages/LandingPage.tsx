import {
  Box,
  Button,
  CircularProgress,
  Container,
  Link as MuiLink,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import HandshakeOutlinedIcon from "@mui/icons-material/HandshakeOutlined";
import SchoolOutlinedIcon from "@mui/icons-material/SchoolOutlined";
import GroupsOutlinedIcon from "@mui/icons-material/GroupsOutlined";
import ApartmentOutlinedIcon from "@mui/icons-material/ApartmentOutlined";
import { Navigate } from "react-router-dom";

import { redirectToLogin, useAuth } from "../auth";

const PALETTE = {
  sand: "#F7F4EA",
  ivory: "#FFFDF6",
  navy: "#18233F",
  navyHover: "#26365C",
  gold: "#E5B91E",
  goldHover: "#D8AD1D",
  subtle: "#52606D",
  border: "#D8D1BC",
  cardBorder: "#EEE7D4",
} as const;

const CONSULTANT_NAME = "Mary Hilliard Cognata";
const CONSULTANT_PHONE = "314.606.5537";
const CONSULTANT_EMAIL = "hillcoeducationalconsultant@gmail.com";

export function LandingPage() {
  const { user, isLoading } = useAuth();
  if (isLoading) {
    return (
      <Box display="flex" alignItems="center" justifyContent="center" minHeight="100vh">
        <CircularProgress />
      </Box>
    );
  }
  if (user) return <Navigate to="/dashboard" replace />;

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: PALETTE.sand, color: PALETTE.navy }}>
      <Header />
      <Hero />
      <Services />
      <Cta />
      <Footer />
    </Box>
  );
}

function Header() {
  return (
    <Container maxWidth="lg" sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", py: 3 }}>
      <Stack direction="row" spacing={1.5} alignItems="center">
        <Box
          sx={{
            width: 48,
            height: 48,
            borderRadius: 2,
            bgcolor: PALETTE.gold,
            color: PALETTE.navy,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: 700,
            fontSize: "1.125rem",
            boxShadow: 1,
          }}
        >
          HC
        </Box>
        <Box>
          <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.1 }}>
            Hillco Educational Consultant
          </Typography>
          <Typography variant="caption" sx={{ color: PALETTE.subtle }}>
            {CONSULTANT_NAME}
          </Typography>
        </Box>
      </Stack>
      <Button
        href={`mailto:${CONSULTANT_EMAIL}`}
        sx={{
          borderRadius: 999,
          bgcolor: PALETTE.navy,
          color: "white",
          px: 2.5,
          "&:hover": { bgcolor: PALETTE.navyHover },
        }}
      >
        Schedule a Consultation
      </Button>
    </Container>
  );
}

function Hero() {
  return (
    <Container
      maxWidth="lg"
      sx={{
        display: "grid",
        gap: 5,
        py: { xs: 7, md: 10 },
        alignItems: "center",
        gridTemplateColumns: { xs: "1fr", md: "1.1fr 0.9fr" },
      }}
    >
      <Box>
        <Box
          sx={{
            display: "inline-flex",
            mb: 2.5,
            px: 2,
            py: 1,
            borderRadius: 999,
            bgcolor: "white",
            color: PALETTE.subtle,
            fontSize: "0.875rem",
            fontWeight: 500,
            boxShadow: 1,
          }}
        >
          Serving families and schools with experience and compassion
        </Box>
        <Typography
          variant="h2"
          sx={{
            fontWeight: 700,
            lineHeight: 1.1,
            letterSpacing: "-0.02em",
            fontSize: { xs: "2.5rem", md: "3.75rem" },
            maxWidth: 720,
          }}
        >
          Helping families find the right educational environment for their child.
        </Typography>
        <Typography variant="body1" sx={{ mt: 3, color: PALETTE.subtle, lineHeight: 1.6, maxWidth: 620, fontSize: "1.125rem" }}>
          With over 25 years of experience in education, Hillco supports families through school transitions, special needs assessments, placement evaluation, and admissions guidance.
        </Typography>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ mt: 4 }}>
          <Button
            href={`mailto:${CONSULTANT_EMAIL}`}
            endIcon={<ArrowForwardIcon />}
            sx={{
              borderRadius: 999,
              bgcolor: PALETTE.gold,
              color: PALETTE.navy,
              px: 3,
              py: 1.5,
              fontWeight: 600,
              "&:hover": { bgcolor: PALETTE.goldHover },
            }}
          >
            Start the Conversation
          </Button>
          <Button
            href="#services"
            variant="outlined"
            sx={{
              borderRadius: 999,
              borderColor: PALETTE.border,
              color: PALETTE.navy,
              bgcolor: "white",
              px: 3,
              py: 1.5,
              fontWeight: 600,
              "&:hover": { bgcolor: PALETTE.ivory, borderColor: PALETTE.border },
            }}
          >
            Explore Services
          </Button>
        </Stack>
      </Box>

      <Paper
        elevation={6}
        sx={{ borderRadius: 6, p: 4, bgcolor: "white", border: 0 }}
      >
        <Box sx={{ borderRadius: 4, bgcolor: PALETTE.navy, color: "white", p: 4 }}>
          <HandshakeOutlinedIcon sx={{ color: PALETTE.gold, fontSize: 40, mb: 2 }} />
          <Typography variant="h5" sx={{ fontWeight: 700 }}>
            Thoughtful guidance for important decisions.
          </Typography>
          <Typography sx={{ mt: 2, color: "rgba(255,255,255,0.8)", lineHeight: 1.65 }}>
            Support for families evaluating school placements that fit a learner&apos;s strengths,
            needs, goals, and future opportunities.
          </Typography>
        </Box>
        <Stack spacing={1.5} sx={{ mt: 3 }}>
          {[
            "School transition support",
            "Special needs placement guidance",
            "Admissions process coaching",
          ].map((item) => (
            <Stack
              key={item}
              direction="row"
              spacing={1.5}
              alignItems="center"
              sx={{ p: 2, borderRadius: 3, bgcolor: PALETTE.sand }}
            >
              <CheckCircleIcon sx={{ color: PALETTE.gold }} />
              <Typography sx={{ fontWeight: 500 }}>{item}</Typography>
            </Stack>
          ))}
        </Stack>
      </Paper>
    </Container>
  );
}

function Services() {
  return (
    <Box id="services" sx={{ bgcolor: "white", py: 8 }}>
      <Container maxWidth="lg">
        <Box sx={{ maxWidth: 720 }}>
          <Typography variant="h3" sx={{ fontWeight: 700, fontSize: { xs: "1.875rem", md: "2.25rem" }, letterSpacing: "-0.01em" }}>
            Services may include
          </Typography>
          <Typography variant="body1" sx={{ mt: 2, color: PALETTE.subtle, lineHeight: 1.65, fontSize: "1.125rem" }}>
            Hillco meets families where they are, helping them look broadly at their learner and consider
            placement possibilities that best fit their child&apos;s unique needs.
          </Typography>
        </Box>
        <Box
          sx={{
            mt: 5,
            display: "grid",
            gap: 2.5,
            gridTemplateColumns: { xs: "1fr", md: "repeat(3, 1fr)" },
          }}
        >
          <ServiceCard
            icon={<SchoolOutlinedIcon />}
            title="Placement Evaluation"
            text="Reviewing learner needs, educational history, assessments, and school options to identify appropriate environments."
          />
          <ServiceCard
            icon={<GroupsOutlinedIcon />}
            title="Family Guidance"
            text="Supporting family goals and dreams while helping parents navigate complex educational decisions."
          />
          <ServiceCard
            icon={<ApartmentOutlinedIcon />}
            title="School Collaboration"
            text="Working with schools to help build strong, inclusive educational environments and connected communities."
          />
        </Box>
      </Container>
    </Box>
  );
}

function ServiceCard({ icon, title, text }: { icon: React.ReactElement; title: string; text: string }) {
  return (
    <Paper
      variant="outlined"
      sx={{
        borderRadius: 5,
        borderColor: PALETTE.cardBorder,
        bgcolor: PALETTE.ivory,
        p: 3.5,
      }}
    >
      <Box
        sx={{
          mb: 2.5,
          width: 48,
          height: 48,
          borderRadius: 2,
          bgcolor: `${PALETTE.gold}33`,
          color: PALETTE.navy,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Box sx={{ "& > svg": { fontSize: 28 } }}>{icon}</Box>
      </Box>
      <Typography variant="h6" sx={{ fontWeight: 700 }}>
        {title}
      </Typography>
      <Typography sx={{ mt: 1.5, color: PALETTE.subtle, lineHeight: 1.65 }}>
        {text}
      </Typography>
    </Paper>
  );
}

function Cta() {
  return (
    <Container maxWidth="lg" sx={{ py: 8 }}>
      <Box
        sx={{
          display: "grid",
          gap: 4,
          gridTemplateColumns: { xs: "1fr", md: "1fr auto" },
          alignItems: "center",
          borderRadius: 6,
          bgcolor: PALETTE.navy,
          color: "white",
          p: { xs: 4, md: 6 },
        }}
      >
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 700, letterSpacing: "-0.01em", fontSize: { xs: "1.875rem", md: "2.25rem" } }}>
            Ready to discuss your student&apos;s next step?
          </Typography>
          <Typography sx={{ mt: 2, color: "rgba(255,255,255,0.75)", lineHeight: 1.65, maxWidth: 620 }}>
            Contact {CONSULTANT_NAME} to begin a thoughtful conversation about educational fit,
            admissions support, and school placement options.
          </Typography>
        </Box>
        <Paper sx={{ borderRadius: 4, p: 3, color: PALETTE.navy, boxShadow: 3 }}>
          <Typography sx={{ fontWeight: 700 }}>{CONSULTANT_NAME}</Typography>
          <Typography sx={{ mt: 1, color: PALETTE.subtle }}>{CONSULTANT_PHONE}</Typography>
          <MuiLink
            href={`mailto:${CONSULTANT_EMAIL}`}
            sx={{ display: "block", mt: 0.5, color: PALETTE.subtle }}
            underline="hover"
          >
            {CONSULTANT_EMAIL}
          </MuiLink>
        </Paper>
      </Box>
    </Container>
  );
}

function Footer() {
  return (
    <Box sx={{ borderTop: 1, borderColor: PALETTE.border, py: 3, mt: 4 }}>
      <Container
        maxWidth="lg"
        sx={{
          display: "flex",
          flexDirection: { xs: "column", sm: "row" },
          gap: 1,
          alignItems: { sm: "center" },
          justifyContent: "space-between",
        }}
      >
        <Typography variant="caption" sx={{ color: PALETTE.subtle }}>
          © {new Date().getFullYear()} Hillco Educational Consultant
        </Typography>
        <MuiLink
          component="button"
          type="button"
          onClick={redirectToLogin}
          sx={{ color: PALETTE.subtle, fontSize: "0.875rem" }}
          underline="hover"
        >
          Consultant login
        </MuiLink>
      </Container>
    </Box>
  );
}
