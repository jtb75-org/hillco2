import {
  Box,
  Button,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Link as MuiLink,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import EmailRoundedIcon from "@mui/icons-material/EmailRounded";
import HomeRoundedIcon from "@mui/icons-material/HomeRounded";
import PhoneRoundedIcon from "@mui/icons-material/PhoneRounded";
import { useState, type FormEvent, type ReactNode } from "react";

const NAVY = "#08428d";
const DEEP_NAVY = "#073a7b";
const ROYAL = "#2576f0";
const SKY = "#5fa0ee";
const WORDMARK_CO = "#8fc6ff";
const PALE_BLUE = "#cfe2fb";
const PANEL = "#d8d8d8";
const SERIF = 'Georgia, "Times New Roman", serif';

const CONSULTANT_NAME = "Mary Hilliard Cognata";
const CONSULTANT_PHONE = "314.606.5537";
const CONSULTANT_EMAIL = "hillcoeducationalconsultant@gmail.com";
const MAILTO = `mailto:${CONSULTANT_EMAIL}`;
const HEADSHOT_SRC = "/headshot.jpg";
const HEADSHOT_FALLBACK_SRC = "/headshot-placeholder.svg";

const DIALOG_FIELD_SX = {
  "& .MuiInputLabel-root": {
    bgcolor: "background.paper",
    px: 0.75,
    ml: -0.75,
  },
};

const SUPPORT_ITEMS = [
  "Post-visit briefings",
  "Parent/student interview prep",
  "Application support",
  "Records packet preparation",
  "Acceptance/rejection processing",
  "School transition strategies",
  "IEP meetings",
] as const;

export function LandingPageV2() {
  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "white", color: NAVY }}>
      <Masthead />
      <Container
        maxWidth={false}
        disableGutters
        sx={{
          maxWidth: 1280,
          mx: "auto",
          display: "grid",
          gridTemplateColumns: { xs: "1fr", md: "390px 1fr" },
          gridTemplateAreas: {
            xs: `"intro" "rail" "body"`,
            md: `"rail intro" "rail body"`,
          },
          position: "relative",
        }}
      >
        <IntroPanel />
        <LeftRail />
        <MainColumn />
      </Container>
      <Box sx={{ py: 3, textAlign: "center" }}>
        <MuiLink href="/version1" underline="hover" sx={{ color: NAVY, fontWeight: 700 }}>
          View original landing page
        </MuiLink>
      </Box>
    </Box>
  );
}

function Masthead() {
  return (
    <Box
      sx={{
        bgcolor: DEEP_NAVY,
        minHeight: { xs: 250, md: 330 },
        position: "relative",
        overflow: "hidden",
      }}
    >
      <Box
        aria-hidden
        sx={{
          position: "absolute",
          inset: 0,
          bgcolor: NAVY,
        }}
      />
      <Box
        aria-hidden
        sx={{
          position: "absolute",
          left: { xs: "42%", md: "24%" },
          top: 0,
          width: { xs: 150, md: 230 },
          height: "100%",
          bgcolor: "rgba(123,177,236,0.32)",
        }}
      />
      <Box
        aria-hidden
        sx={{
          position: "absolute",
          left: { xs: -90, md: 0 },
          bottom: -95,
          width: { xs: 360, md: 540 },
          height: 210,
          bgcolor: SKY,
        }}
      />
      <Stack
        direction="row"
        spacing={1}
        sx={{
          position: "absolute",
          top: { xs: 18, md: 28 },
          right: { xs: 23, md: 63 },
          zIndex: 2,
          flexWrap: "wrap",
          justifyContent: "flex-end",
        }}
      >
        {["Services", "FAQS", "Giving"].map((label) => (
          <Button
            key={label}
            href={`#${label.toLowerCase()}`}
            size="small"
            sx={{
              width: { xs: 82, md: 104 },
              borderRadius: 999,
              px: 0,
              py: { xs: 0.65, md: 0.8 },
              bgcolor: PANEL,
              border: "2px solid rgba(255,255,255,0.72)",
              color: NAVY,
              fontSize: { xs: "0.74rem", md: "0.82rem" },
              fontWeight: 900,
              textTransform: "none",
              boxShadow: "0 10px 22px rgba(0,0,0,0.18)",
              "&:hover": {
                bgcolor: "#e4e4e4",
                borderColor: "white",
                boxShadow: "0 12px 26px rgba(0,0,0,0.22)",
              },
            }}
          >
            {label}
          </Button>
        ))}
      </Stack>
      <Circle size={{ xs: 108, md: 124 }} top={{ xs: 150, md: 208 }} left={{ xs: 36, md: 110 }} />
      <Circle size={{ xs: 112, md: 152 }} top={{ xs: -46, md: -36 }} right={{ xs: -26, md: 42 }} />
      <Stack
        spacing={0.75}
        sx={{
          position: "relative",
          minHeight: { xs: 250, md: 330 },
          alignItems: { xs: "center", md: "flex-start" },
          justifyContent: "center",
          pl: { md: "49%" },
          pr: 3,
          textAlign: { xs: "center", md: "left" },
          color: "white",
        }}
      >
        <Typography
          component="div"
          sx={{
            fontSize: { xs: "2.45rem", md: "3.65rem" },
            lineHeight: 0.95,
            letterSpacing: 0,
            fontWeight: 900,
          }}
        >
          <Box component="span">HILL</Box>
          <Box component="span" sx={{ color: WORDMARK_CO }}>
            CO.
          </Box>
        </Typography>
        <Typography
          sx={{
            fontSize: { xs: "1rem", md: "1.55rem" },
            letterSpacing: { xs: "0.22em", md: "0.26em" },
            fontWeight: 300,
            color: "rgba(255,255,255,0.88)",
          }}
        >
          EDUCATIONAL CONSULTING
        </Typography>
      </Stack>
    </Box>
  );
}

function Circle({
  size,
  top,
  left,
  right,
}: {
  size: Record<string, number | string>;
  top: Record<string, number | string>;
  left?: Record<string, number | string>;
  right?: Record<string, number | string>;
}) {
  return (
    <Box
      aria-hidden
      sx={{
        position: "absolute",
        top,
        left,
        right,
        width: size,
        height: size,
        borderRadius: "50%",
        bgcolor: ROYAL,
      }}
    />
  );
}

function LeftRail() {
  return (
    <Box
      sx={{
        bgcolor: PALE_BLUE,
        minHeight: { md: 1100 },
        gridArea: "rail",
        pt: { xs: 38, md: 52 },
        px: { xs: 4, sm: 8, md: 6 },
        pb: 7,
        position: "relative",
      }}
    >
      <HeadshotBadge />
      <Stack spacing={{ xs: 7, md: 11 }}>
        <Box>
          <Typography
            component="h2"
            sx={{
              fontSize: "1.42rem",
              lineHeight: 1.25,
              fontWeight: 900,
              textTransform: "uppercase",
              letterSpacing: 0,
            }}
          >
            Ongoing
            <br />
            Placement
            <br />
            Support
          </Typography>
          <Box component="ul" sx={{ mt: 2, pl: 2.25, m: 0, fontWeight: 800, lineHeight: 1.32 }}>
            {SUPPORT_ITEMS.map((item) => (
              <Typography component="li" key={item} sx={{ fontSize: "1.02rem" }}>
                {item}
              </Typography>
            ))}
          </Box>
        </Box>

        <Box>
          <Typography
            component="h2"
            sx={{
              fontSize: "1.42rem",
              fontWeight: 900,
              textTransform: "uppercase",
            }}
          >
            About Me
          </Typography>
          <Typography sx={{ mt: 1.5, fontWeight: 900, lineHeight: 1.25 }}>
            {CONSULTANT_NAME}
          </Typography>
          <Typography sx={{ mt: 2, fontWeight: 800, lineHeight: 1.25 }}>
            Bachelor of Education in Elementary Education
          </Typography>
          <Typography sx={{ mt: 0.25, fontWeight: 800, lineHeight: 1.25 }}>
            Borcelle University
          </Typography>
          <Typography sx={{ mt: 6, fontSize: "1.15rem", color: "#245a9f" }}>
            Graduated: May 2016
          </Typography>
        </Box>

        <Box>
          <Typography
            component="h2"
            sx={{
              fontSize: { xs: "2rem", md: "2.6rem" },
              lineHeight: 1,
              fontWeight: 900,
              textTransform: "uppercase",
            }}
          >
            Contact
          </Typography>
          <ContactLine icon={<PhoneRoundedIcon />} href={`tel:${CONSULTANT_PHONE.replace(/\./g, "")}`}>
            {CONSULTANT_PHONE}
          </ContactLine>
          <ContactLine icon={<EmailRoundedIcon />} href={MAILTO} compact>
            {CONSULTANT_EMAIL}
          </ContactLine>
          <ContactLine icon={<HomeRoundedIcon />}>
            St. Louis, Missouri
          </ContactLine>
        </Box>
      </Stack>
    </Box>
  );
}

function ContactLine({
  icon,
  href,
  compact = false,
  children,
}: {
  icon: ReactNode;
  href?: string;
  compact?: boolean;
  children: ReactNode;
}) {
  const content = (
    <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mt: 2 }}>
      <Box
        sx={{
          width: 26,
          height: 26,
          borderRadius: "50%",
          bgcolor: NAVY,
          color: "white",
          display: "grid",
          placeItems: "center",
          flex: "0 0 auto",
          "& svg": { fontSize: 17 },
        }}
      >
        {icon}
      </Box>
      <Typography
        sx={{
          fontWeight: 800,
          fontSize: compact ? { xs: "0.8rem", md: "0.78rem" } : "1rem",
          lineHeight: compact ? 1.25 : 1.35,
          overflowWrap: "anywhere",
        }}
      >
        {children}
      </Typography>
    </Stack>
  );

  if (!href) return content;
  return (
    <MuiLink href={href} underline="hover" sx={{ color: NAVY }}>
      {content}
    </MuiLink>
  );
}

function HeadshotBadge() {
  return (
    <Box
      sx={{
        position: "absolute",
        top: { xs: 54, md: -58 },
        left: { xs: "52%", md: "54%" },
        transform: "translateX(-50%)",
        width: { xs: 190, md: 240 },
        height: { xs: 190, md: 240 },
        borderRadius: "50%",
        bgcolor: NAVY,
        p: { xs: 3, md: 3.8 },
        zIndex: 3,
      }}
    >
      <Box
        component="img"
        src={HEADSHOT_SRC}
        alt={CONSULTANT_NAME}
        onError={(event) => {
          event.currentTarget.src = HEADSHOT_FALLBACK_SRC;
        }}
        sx={{
          width: "100%",
          height: "100%",
          borderRadius: "50%",
          display: "block",
          objectFit: "cover",
          objectPosition: "center",
          bgcolor: "#e8f1fb",
          }}
        />
    </Box>
  );
}

function MainColumn() {
  const [leadDialogOpen, setLeadDialogOpen] = useState(false);

  return (
    <Box sx={{ gridArea: "body", position: "relative", pb: { xs: 7, md: 10 } }}>
      <Box
        sx={{
          px: { xs: 4, sm: 8, md: 9, lg: 12 },
          pt: { xs: 7, md: 8 },
        }}
      >
        <Typography
          component="h2"
          sx={{
            fontSize: { xs: "2rem", md: "2.35rem" },
            fontWeight: 900,
            lineHeight: 1.1,
            letterSpacing: 0,
          }}
        >
          Support Every Step of the Way
        </Typography>
        <Stack spacing={4.5} sx={{ mt: 4 }}>
          <StepSection title="Have Questions?">
            <Typography sx={{ fontWeight: 800 }}>
              Get started with a free 30 minute consultation.
            </Typography>
            <Typography sx={{ mt: 0.5 }}>
              Tell us about your child, your goals, and the challenges you are facing. We will
              discuss your concerns, answer questions, and explore how I can support your family.
            </Typography>
            <Button
              onClick={() => setLeadDialogOpen(true)}
              sx={{
                mt: 2.5,
                borderRadius: 999,
                bgcolor: NAVY,
                color: "white",
                px: 3.5,
                py: 1.2,
                fontWeight: 800,
                textTransform: "none",
                "&:hover": { bgcolor: DEEP_NAVY },
              }}
            >
              Get in touch
            </Button>
          </StepSection>
          <StepSection title="What to Expect">
            <Typography>
              As both an experienced educator and a parent, I understand the educational process
              from multiple perspectives. I combine professional expertise with personal insight to
              help families make thoughtful, informed decisions.
            </Typography>
            <Typography sx={{ mt: 3 }}>
              After a thorough review of your child's educational records, evaluations, report
              cards, medical history, and other relevant documentation, I will schedule a parent
              interview to understand your family's goals.
            </Typography>
            <Typography sx={{ mt: 3 }}>
              Using this information, I develop a comprehensive learner profile and identify
              educational settings and programs that best align with your child. As part of the
              placement process, I may visit the current school, tour prospective schools, and meet
              with educators or admissions teams to ensure each recommendation is thoughtful,
              well-informed, and tailored to your student.
            </Typography>
          </StepSection>
        </Stack>
      </Box>
      <LeadDialog open={leadDialogOpen} onClose={() => setLeadDialogOpen(false)} />
    </Box>
  );
}

function LeadDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [submitted, setSubmitted] = useState(false);

  const handleClose = () => {
    setSubmitted(false);
    onClose();
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitted(true);
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ color: NAVY, fontWeight: 900 }}>Get in touch</DialogTitle>
      {submitted ? (
        <>
          <DialogContent>
            <Typography sx={{ color: "#255ba3", lineHeight: 1.5 }}>
              Thanks. Your information has been captured in this preview flow.
            </Typography>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2.5 }}>
            <Button onClick={handleClose} sx={{ color: NAVY, fontWeight: 800 }}>
              Close
            </Button>
          </DialogActions>
        </>
      ) : (
        <Box component="form" onSubmit={handleSubmit}>
          <DialogContent sx={{ pt: 1 }}>
            <Stack spacing={2}>
              <TextField
                label="Name"
                name="name"
                autoComplete="name"
                required
                fullWidth
                sx={DIALOG_FIELD_SX}
              />
              <TextField
                label="Email"
                name="email"
                type="email"
                autoComplete="email"
                required
                fullWidth
                sx={DIALOG_FIELD_SX}
              />
              <TextField
                label="Phone"
                name="phone"
                type="tel"
                autoComplete="tel"
                fullWidth
                sx={DIALOG_FIELD_SX}
              />
              <TextField
                label="Questions or comments"
                name="message"
                minRows={4}
                multiline
                fullWidth
                sx={DIALOG_FIELD_SX}
              />
            </Stack>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2.5 }}>
            <Button onClick={handleClose} sx={{ color: NAVY, fontWeight: 800 }}>
              Cancel
            </Button>
            <Button
              type="submit"
              sx={{
                borderRadius: 999,
                bgcolor: NAVY,
                color: "white",
                px: 2.5,
                fontWeight: 800,
                textTransform: "none",
                "&:hover": { bgcolor: DEEP_NAVY },
              }}
            >
              Submit
            </Button>
          </DialogActions>
        </Box>
      )}
    </Dialog>
  );
}

function IntroPanel() {
  return (
    <Box
      sx={{
        gridArea: "intro",
        mt: { xs: -4, md: -5 },
        ml: { md: -26 },
        bgcolor: PANEL,
        minHeight: { xs: 350, md: 360 },
        display: "grid",
        alignItems: "center",
        px: { xs: 4, sm: 8, md: 10 },
        py: { xs: 7, md: 5 },
        position: "relative",
        zIndex: 2,
      }}
    >
      <Box sx={{ maxWidth: 680, mx: "auto", textAlign: "center" }}>
        <Typography
          component="h1"
          sx={{
            fontFamily: SERIF,
            fontSize: { xs: "1.72rem", md: "2rem" },
            lineHeight: 1.15,
            fontWeight: 900,
            color: NAVY,
          }}
        >
          Guiding Families With Unique Learners Through All Facets of School Transitions
        </Typography>
        <Typography sx={{ mt: 4, fontFamily: SERIF, fontWeight: 800, lineHeight: 1.35 }}>
          Whether your child has a diagnosed learning difference or simply needs a new environment,
          my approach is centered on the whole child.
        </Typography>
        <Typography sx={{ mt: 3, fontFamily: SERIF, fontWeight: 800, lineHeight: 1.35 }}>
          Together we will examine your learner's cognitive profile, social emotional needs,
          learning preferences, executive functioning skills, interests, and long-term goals to
          consider programs and placements that best fit their needs.
        </Typography>
      </Box>
      <Box
        aria-hidden
        sx={{
          position: "absolute",
          width: { xs: 180, md: 305 },
          height: 22,
          bgcolor: ROYAL,
          left: { xs: "50%", md: 140 },
          bottom: -11,
          transform: { xs: "translateX(-50%)", md: "none" },
        }}
      />
    </Box>
  );
}

function StepSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <Box
      sx={{
        position: "relative",
        pl: { xs: 4, md: 4.5 },
        color: "#255ba3",
        fontSize: "1.1rem",
        lineHeight: 1.35,
      }}
    >
      <Box
        aria-hidden
        sx={{
          position: "absolute",
          left: 0,
          top: 2,
          width: 28,
          height: 28,
          borderRadius: "50%",
          border: `5px solid ${ROYAL}`,
        }}
      />
      <Typography
        component="h3"
        sx={{
          color: NAVY,
          fontSize: { xs: "1.45rem", md: "1.65rem" },
          lineHeight: 1.1,
          fontWeight: 900,
          mb: 2,
        }}
      >
        {title}
      </Typography>
      <Box sx={{ "& p": { fontSize: "1.08rem", lineHeight: 1.35 } }}>{children}</Box>
    </Box>
  );
}
