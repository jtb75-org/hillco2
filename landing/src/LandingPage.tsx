import {
  Box,
  Button,
  Container,
  Link as MuiLink,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import CheckIcon from "@mui/icons-material/Check";

import { BRAND_CYAN, BRAND_INDIGO, BrandMark } from "./BrandMark";

const PALETTE = {
  indigo: BRAND_INDIGO,
  indigoDeep: "#241E58",
  indigoSoft: "#453B96",
  cyan: BRAND_CYAN,
  cyanHover: "#0092bb",
  ink: "#1D1B33",
  body: "#4A5568",
  ground: "#F6F7FB",
  border: "#E3E6EF",
} as const;

const SERIF = 'Georgia, "Times New Roman", serif';

const CONSULTANT_NAME = "Mary Hilliard Cognata";
const CONSULTANT_PHONE = "314.606.5537";
const CONSULTANT_EMAIL = "hillcoeducationalconsultant@gmail.com";
const MAILTO = `mailto:${CONSULTANT_EMAIL}`;

export function LandingPage() {
  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "white", color: PALETTE.ink }}>
      <Header />
      <Banner />
      <Mission />
      <Details />
      <Focus />
      <Contact />
      <Footer />
    </Box>
  );
}

function Header() {
  return (
    <Box sx={{ borderBottom: 1, borderColor: PALETTE.border, bgcolor: "white" }}>
      <Container
        maxWidth="lg"
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 2,
          py: 2,
        }}
      >
        <Stack direction="row" spacing={1.75} alignItems="center">
          <BrandMark size={64} />
          <Box>
            <Typography component="div" sx={{ fontSize: "1.6rem", lineHeight: 1.15 }}>
              <Box component="span" sx={{ fontFamily: SERIF, fontWeight: 700, color: PALETTE.indigo }}>
                Hill
              </Box>
              <Box component="span" sx={{ fontFamily: SERIF, fontWeight: 700, color: PALETTE.cyan }}>
                Co
              </Box>
            </Typography>
            <Typography
              sx={{
                fontSize: "0.7rem",
                letterSpacing: "0.09em",
                textTransform: "uppercase",
                color: PALETTE.body,
              }}
            >
              Educational Consultant
            </Typography>
          </Box>
        </Stack>
        <Button
          href={MAILTO}
          sx={{
            display: { xs: "none", sm: "inline-flex" },
            borderRadius: 999,
            bgcolor: PALETTE.indigo,
            color: "white",
            px: 2.75,
            py: 1,
            fontWeight: 600,
            textTransform: "none",
            fontSize: "0.95rem",
            whiteSpace: "nowrap",
            "&:hover": { bgcolor: PALETTE.indigoDeep },
          }}
        >
          Schedule a Consultation
        </Button>
      </Container>
    </Box>
  );
}

/**
 * Full-bleed brand banner: eyebrow, serif statement, single accent CTA.
 * The tonal circles are the card-stock texture from the business cards —
 * large, soft, mostly cropped by the banner's overflow.
 */
function Banner() {
  return (
    <Box
      sx={{
        position: "relative",
        overflow: "hidden",
        bgcolor: PALETTE.indigo,
        color: "white",
        py: { xs: 8, md: 12 },
      }}
    >
      <Box
        aria-hidden
        sx={{
          position: "absolute",
          top: "-38%",
          right: "-8%",
          width: 780,
          height: 780,
          borderRadius: "50%",
          bgcolor: PALETTE.indigoSoft,
          opacity: 0.55,
        }}
      />
      <Box
        aria-hidden
        sx={{
          position: "absolute",
          bottom: "-58%",
          left: "-14%",
          width: 720,
          height: 720,
          borderRadius: "50%",
          bgcolor: PALETTE.indigoDeep,
          opacity: 0.75,
        }}
      />
      <Container maxWidth="md" sx={{ position: "relative", textAlign: "center" }}>
        <Typography
          sx={{
            fontSize: "0.8rem",
            fontWeight: 700,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            color: PALETTE.cyan,
            mb: 2.5,
          }}
        >
          Educational Consulting &amp; School Placement
        </Typography>
        <Typography
          component="h1"
          sx={{
            fontFamily: SERIF,
            fontWeight: 400,
            lineHeight: 1.13,
            letterSpacing: "-0.01em",
            fontSize: { xs: "2.25rem", sm: "3rem", md: "3.6rem" },
          }}
        >
          Helping families find the right educational environment for their child.
        </Typography>
        <Button
          href={MAILTO}
          sx={{
            mt: 5,
            borderRadius: 999,
            bgcolor: PALETTE.cyan,
            color: PALETTE.indigo,
            px: 4,
            py: 1.5,
            fontWeight: 700,
            fontSize: "1rem",
            textTransform: "none",
            "&:hover": { bgcolor: PALETTE.cyanHover },
          }}
        >
          Schedule a Consultation
        </Button>
      </Container>
    </Box>
  );
}

/** The mission statement — one plain-spoken paragraph, nothing competing with it. */
function Mission() {
  return (
    <Container maxWidth="md" sx={{ py: { xs: 7, md: 10 } }}>
      <Typography
        sx={{
          fontSize: { xs: "1.25rem", md: "1.45rem" },
          lineHeight: 1.65,
          color: PALETTE.ink,
        }}
      >
        HillCo meets families where they are — helping them look broadly at their learner and
        consider the placement possibilities that best fit their child&apos;s strengths, needs,
        goals, and future opportunities.
      </Typography>
      <Typography sx={{ mt: 3, fontSize: "1.0625rem", lineHeight: 1.75, color: PALETTE.body }}>
        With over 25 years of experience in education, {CONSULTANT_NAME} supports families through
        school transitions, special needs assessments, placement evaluation, and admissions
        guidance — working alongside you throughout the process.
      </Typography>
    </Container>
  );
}

const CONSULTATION_INCLUDES = [
  "A review of your learner's needs, educational history, and prior assessments",
  "A look at the school options realistically available to your family",
  "Guidance toward environments suited to how your child actually learns",
];

const ONGOING_SUPPORT = [
  "School transition support",
  "Special needs placement guidance",
  "Admissions process coaching",
];

function Details() {
  return (
    <Box sx={{ bgcolor: PALETTE.ground, borderTop: 1, borderBottom: 1, borderColor: PALETTE.border }}>
      <Container
        maxWidth="lg"
        sx={{
          py: { xs: 7, md: 9 },
          display: "grid",
          gap: { xs: 5, md: 8 },
          gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
        }}
      >
        <BulletBlock title="What a consultation includes" items={CONSULTATION_INCLUDES} />
        <BulletBlock title="Ongoing support may include" items={ONGOING_SUPPORT} />
      </Container>
    </Box>
  );
}

function BulletBlock({ title, items }: { title: string; items: readonly string[] }) {
  return (
    <Box>
      <Typography
        component="h2"
        sx={{ fontFamily: SERIF, fontWeight: 700, fontSize: { xs: "1.5rem", md: "1.75rem" } }}
      >
        {title}
      </Typography>
      <Stack spacing={2} sx={{ mt: 3 }}>
        {items.map((item) => (
          <Stack key={item} direction="row" spacing={1.75} alignItems="flex-start">
            <Box
              sx={{
                mt: "2px",
                flexShrink: 0,
                width: 24,
                height: 24,
                borderRadius: "50%",
                bgcolor: PALETTE.cyan,
                color: "white",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <CheckIcon sx={{ fontSize: 16 }} />
            </Box>
            <Typography sx={{ color: PALETTE.body, lineHeight: 1.65, fontSize: "1.0625rem" }}>
              {item}
            </Typography>
          </Stack>
        ))}
      </Stack>
    </Box>
  );
}

const FOCUS_AREAS = [
  {
    title: "Placement Evaluation",
    text: "Reviewing learner needs, educational history, assessments, and school options to identify appropriate environments.",
  },
  {
    title: "Family Guidance",
    text: "Supporting family goals and dreams while helping parents navigate complex educational decisions.",
  },
  {
    title: "School Collaboration",
    text: "Working with schools to help build strong, inclusive educational environments and connected communities.",
  },
] as const;

function Focus() {
  return (
    <Container maxWidth="lg" sx={{ py: { xs: 7, md: 10 } }}>
      <Typography
        component="h2"
        sx={{ fontFamily: SERIF, fontWeight: 700, fontSize: { xs: "1.75rem", md: "2.125rem" } }}
      >
        Areas of focus
      </Typography>
      <Box
        sx={{
          mt: 4,
          display: "grid",
          gap: { xs: 4, md: 5 },
          gridTemplateColumns: { xs: "1fr", md: "repeat(3, 1fr)" },
        }}
      >
        {FOCUS_AREAS.map((area) => (
          <Box key={area.title} sx={{ borderTop: 3, borderColor: PALETTE.cyan, pt: 2.5 }}>
            <Typography sx={{ fontWeight: 700, fontSize: "1.125rem", color: PALETTE.indigo }}>
              {area.title}
            </Typography>
            <Typography sx={{ mt: 1.25, color: PALETTE.body, lineHeight: 1.7 }}>
              {area.text}
            </Typography>
          </Box>
        ))}
      </Box>
    </Container>
  );
}

function Contact() {
  return (
    <Box sx={{ bgcolor: PALETTE.indigo, color: "white", py: { xs: 7, md: 9 } }}>
      <Container
        maxWidth="lg"
        sx={{
          display: "grid",
          gap: 4,
          gridTemplateColumns: { xs: "1fr", md: "1fr auto" },
          alignItems: "center",
        }}
      >
        <Box>
          <Typography
            component="h2"
            sx={{
              fontFamily: SERIF,
              fontWeight: 400,
              fontSize: { xs: "1.75rem", md: "2.25rem" },
              lineHeight: 1.2,
            }}
          >
            Ready to discuss your student&apos;s next step?
          </Typography>
          <Typography sx={{ mt: 2, color: "rgba(255,255,255,0.78)", lineHeight: 1.7, maxWidth: 620 }}>
            Contact {CONSULTANT_NAME} to begin a thoughtful conversation about educational fit,
            admissions support, and school placement options.
          </Typography>
        </Box>
        <Paper elevation={0} sx={{ borderRadius: 3, p: 3, color: PALETTE.ink, minWidth: { md: 320 } }}>
          <Typography sx={{ fontWeight: 700 }}>{CONSULTANT_NAME}</Typography>
          <MuiLink
            href={`tel:${CONSULTANT_PHONE.replace(/\./g, "")}`}
            sx={{ display: "block", mt: 1.25, color: PALETTE.body }}
            underline="hover"
          >
            {CONSULTANT_PHONE}
          </MuiLink>
          <MuiLink
            href={MAILTO}
            sx={{ display: "block", mt: 0.5, color: PALETTE.body, wordBreak: "break-word" }}
            underline="hover"
          >
            {CONSULTANT_EMAIL}
          </MuiLink>
          <Button
            href={MAILTO}
            fullWidth
            sx={{
              mt: 2.5,
              borderRadius: 999,
              bgcolor: PALETTE.cyan,
              color: PALETTE.indigo,
              py: 1.15,
              fontWeight: 700,
              textTransform: "none",
              "&:hover": { bgcolor: PALETTE.cyanHover },
            }}
          >
            Schedule a Consultation
          </Button>
        </Paper>
      </Container>
    </Box>
  );
}

function Footer() {
  return (
    <Box sx={{ py: 3, bgcolor: "white" }}>
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
        <Typography variant="caption" sx={{ color: PALETTE.body }}>
          © {new Date().getFullYear()} HillCo Educational Consultant
        </Typography>
        <MuiLink href="/auth/login" sx={{ color: PALETTE.body, fontSize: "0.875rem" }} underline="hover">
          Consultant login
        </MuiLink>
      </Container>
    </Box>
  );
}
