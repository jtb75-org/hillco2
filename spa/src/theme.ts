import type { SystemStyleObject } from "@mui/system";
import { alpha, createTheme, darken, type Theme } from "@mui/material/styles";

const SERIF_HEADER_STACK = ['"Georgia"', '"Times New Roman"', "serif"].join(",");

const baseTypography = {
  fontFamily: ['"Inter"', "system-ui", "Helvetica", "Arial", "sans-serif"].join(","),
  h4: {
    fontSize: "1.625rem",
    lineHeight: 1.25,
    fontWeight: 700,
    letterSpacing: 0,
    fontFamily: SERIF_HEADER_STACK,
  },
  h5: {
    fontWeight: 700,
    letterSpacing: 0,
    fontFamily: SERIF_HEADER_STACK,
  },
  h6: {
    fontWeight: 650,
    letterSpacing: 0,
  },
  button: {
    textTransform: "none" as const,
    fontWeight: 650,
  },
  overline: {
    fontSize: "0.6875rem",
    fontWeight: 700,
    letterSpacing: "0.04em",
    lineHeight: 1.6,
  },
};

function commonComponents(tableHeadBg: string, tableHeadColor: string) {
  return {
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
          borderRadius: 12,
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
        // Scoped to outlined so menus/popovers/tooltips (elevation
        // variant) keep their default radius. Outlined Papers are
        // SectionPanel-style content containers — they get the
        // larger rounded-xl look.
        outlined: {
          borderRadius: 12,
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        head: {
          backgroundColor: tableHeadBg,
          color: tableHeadColor,
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
  };
}

// ---------------------------------------------------------------------------
// Color schemes — the palette/typography axis ("Color scheme" in the UI).
// `ink` is the scheme's darkest structural neutral; window styles derive
// their header bars and solid buttons from it so the two axes compose.
// ---------------------------------------------------------------------------

interface SchemeDef {
  label: string;
  /** Darkest structural neutral — ink window-style bars, ledger buttons. */
  ink: string;
  tableHeadBg: string;
  tableHeadColor: string;
  /** Override for buttons sitting ON the ink bar (ink window style).
   *  Needed when the scheme's primary is too close to its ink. */
  inkAction?: { bg: string; hoverBg: string; text: string };
  palette: NonNullable<Parameters<typeof createTheme>[0]>["palette"];
  typography: NonNullable<Parameters<typeof createTheme>[0]>["typography"];
}

const schemeDefs = {
  default: {
    label: "Default",
    ink: "#243043",
    tableHeadBg: "#f8fafc",
    tableHeadColor: "#475569",
    palette: {
      mode: "light" as const,
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
    typography: baseTypography,
  },
  // Brand colors sampled 2026-07-26 from the original HillCo business
  // cards (indigo #302870–#403078, cyan #00a8d8, gold tagline). The
  // serif headers the app already uses match the cards' serif identity.
  hillco: {
    label: "HillCo",
    ink: "#312770",
    tableHeadBg: "#f2f1f9",
    tableHeadColor: "#4b4390",
    // Card-back treatment: cyan on indigo. Indigo primary buttons would
    // vanish on the ink bar, so bar actions go cyan with dark ink text.
    inkAction: { bg: "#0aa8d8", hoverBg: "#0894c2", text: "#0b2531" },
    palette: {
      mode: "light" as const,
      primary: {
        main: "#3b3183",
        dark: "#2b2364",
      },
      secondary: {
        main: "#0aa8d8",
        dark: "#0782ab",
        contrastText: "#ffffff",
      },
      warning: {
        main: "#c2a222",
        dark: "#96790f",
      },
      background: {
        default: "#f6f6fa",
        paper: "#ffffff",
      },
      text: {
        primary: "#2a2749",
        secondary: "#5b5875",
      },
      divider: "#e3e2ee",
    },
    typography: baseTypography,
  },
  intake: {
    label: "Intake",
    ink: "#1f2933",
    tableHeadBg: "#fff9df",
    tableHeadColor: "#5f4a12",
    palette: {
      mode: "light" as const,
      primary: {
        main: "#F8D660",
        dark: "#D8AE16",
        contrastText: "#1f2933",
      },
      secondary: {
        main: "#1FC4DD",
        dark: "#138BA0",
        contrastText: "#ffffff",
      },
      warning: {
        main: "#E07A77",
        dark: "#B94F4B",
      },
      info: {
        main: "#F0A526",
        dark: "#B87411",
      },
      background: {
        default: "#ffffff",
        paper: "#ffffff",
      },
      text: {
        primary: "#1f2933",
        secondary: "#55616f",
      },
      divider: "#e8edf0",
    },
    typography: {
      ...baseTypography,
      // Georgia is inherited from baseTypography; intake adds italic
      // for a more editorial feel.
      h4: {
        ...baseTypography.h4,
        fontStyle: "italic",
      },
      h5: {
        ...baseTypography.h5,
        fontStyle: "italic",
      },
    },
  },
} satisfies Record<string, SchemeDef>;

export type SchemeName = keyof typeof schemeDefs;

export const schemeOptions: Array<{ name: SchemeName; label: string }> = (
  Object.keys(schemeDefs) as SchemeName[]
).map((name) => ({ name, label: schemeDefs[name].label }));

// ---------------------------------------------------------------------------
// Window styles — the structure/contrast axis ("Window style" in the UI).
// Chosen from the 2026-07 design-options review: classic is the shipped
// look; sharp/ink/ledger step up section-header and button contrast.
// ---------------------------------------------------------------------------

export type WindowStyleName = "classic" | "sharp" | "ink" | "ledger";

export const windowStyleOptions: Array<{ name: WindowStyleName; label: string }> = [
  { name: "classic", label: "Classic" },
  { name: "sharp", label: "Sharp" },
  { name: "ink", label: "Ink" },
  { name: "ledger", label: "Ledger" },
];

// ---------------------------------------------------------------------------
// Text size — the type-scale axis ("Text size" in the UI). Implemented via
// the root font-size, so every rem-derived size (all MUI variants plus the
// explicit rem values above) scales together; px-based spacing stays put.
// ---------------------------------------------------------------------------

export type TextSizeName = "smaller" | "default" | "larger";

export const textSizeOptions: Array<{ name: TextSizeName; label: string }> = [
  { name: "smaller", label: "Smaller" },
  { name: "default", label: "Default" },
  { name: "larger", label: "Larger" },
];

const TEXT_SIZE_ROOT_PX: Record<TextSizeName, number> = {
  smaller: 15,
  default: 16,
  larger: 17.5,
};

export interface HillcoPanelTokens {
  /** Ledger renders the panel title outside/above the Paper. */
  outside: boolean;
  /** Ink puts header content on a dark bar — light-ink overrides apply. */
  onDark: boolean;
  headerBg: string;
  headerBorder: string;
  /** null → classic per-variant title behavior (overline/subtitle1). */
  titleSx: SystemStyleObject<Theme> | null;
  /** Applied to text-variant buttons inside the panel header. */
  actionSx: SystemStyleObject<Theme> | null;
}

export interface HillcoTokens {
  windowStyle: WindowStyleName;
  ink: string;
  panel: HillcoPanelTokens;
}

declare module "@mui/material/styles" {
  interface Theme {
    hillco: HillcoTokens;
  }
  interface ThemeOptions {
    hillco?: HillcoTokens;
  }
}

export function buildTheme(
  schemeName: SchemeName,
  styleName: WindowStyleName,
  textSize: TextSizeName = "default",
): Theme {
  const def: SchemeDef = schemeDefs[schemeName];
  const base = createTheme({
    palette: def.palette,
    shape: {
      borderRadius: 6,
    },
    typography: def.typography,
    components: commonComponents(def.tableHeadBg, def.tableHeadColor),
  });

  const ink = def.ink;
  const primary = base.palette.primary;
  let background = base.palette.background.default;
  let divider = base.palette.divider;
  let panel: HillcoPanelTokens;

  switch (styleName) {
    case "classic":
      panel = {
        outside: false,
        onDark: false,
        headerBg: "transparent",
        headerBorder: divider,
        titleSx: null,
        actionSx: null,
      };
      break;
    case "sharp":
      // Same layout language, contrast turned up: tinted header strip,
      // dark sentence-case titles, tonal buttons, deeper page ground.
      background = darken(background, 0.045);
      divider = darken(divider, 0.12);
      panel = {
        outside: false,
        onDark: false,
        headerBg: alpha(ink, 0.05),
        headerBorder: divider,
        titleSx: {
          fontSize: "0.85rem",
          fontWeight: 700,
          lineHeight: 1.5,
          color: "text.primary",
        },
        actionSx: {
          px: 1.5,
          bgcolor: alpha(primary.main, 0.1),
          color: primary.dark,
          border: "1px solid",
          borderColor: alpha(primary.main, 0.4),
          "&:hover": { bgcolor: alpha(primary.main, 0.18) },
        },
      };
      break;
    case "ink":
      // Dark header bars with the scheme's primary as solid buttons —
      // strongest section scanability.
      background = darken(background, 0.06);
      divider = darken(divider, 0.12);
      panel = {
        outside: false,
        onDark: true,
        headerBg: ink,
        headerBorder: ink,
        titleSx: {
          fontSize: "0.75rem",
          fontWeight: 700,
          letterSpacing: "0.07em",
          textTransform: "uppercase",
          lineHeight: 1.6,
          color: "#ffffff",
        },
        actionSx: def.inkAction
          ? {
              px: 1.5,
              bgcolor: def.inkAction.bg,
              color: def.inkAction.text,
              "&:hover": {
                bgcolor: def.inkAction.hoverBg,
                color: def.inkAction.text,
              },
            }
          : {
              px: 1.5,
              bgcolor: primary.main,
              color: primary.contrastText,
              "&:hover": { bgcolor: primary.dark, color: primary.contrastText },
            },
      };
      break;
    case "ledger":
      // Serif titles above the card over a heavy ink rule; solid ink
      // buttons. The scheme's serif (and intake's italic) carries through
      // because titleSx only sets the family, not the style.
      background = darken(background, 0.035);
      divider = darken(divider, 0.08);
      panel = {
        outside: true,
        onDark: false,
        headerBg: "transparent",
        headerBorder: ink,
        titleSx: {
          fontFamily: SERIF_HEADER_STACK,
          fontSize: "1.2rem",
          fontWeight: 700,
          lineHeight: 1.3,
          color: "text.primary",
        },
        actionSx: {
          px: 1.5,
          bgcolor: ink,
          color: "#ffffff",
          "&:hover": { bgcolor: alpha(ink, 0.85) },
        },
      };
      break;
  }

  // Style-aware component overrides beyond SectionPanel: table heads
  // (every DataTableContainer/table in the app) and Accordion section
  // headers (the intake page's roster sections) follow the window style
  // so no section header is left on the pale classic look.
  const text = base.palette.text;
  const styleComponents: Record<string, object> = {};
  if (styleName === "sharp") {
    styleComponents.MuiTableCell = {
      styleOverrides: {
        head: { backgroundColor: alpha(ink, 0.06), color: text.primary },
      },
    };
    styleComponents.MuiAccordionSummary = {
      styleOverrides: {
        root: {
          backgroundColor: alpha(ink, 0.05),
          "& .MuiTypography-overline": { color: text.primary },
        },
      },
    };
  } else if (styleName === "ink") {
    const barAction = def.inkAction?.bg ?? "#ffffff";
    styleComponents.MuiTableCell = {
      styleOverrides: {
        head: { backgroundColor: ink, color: "rgba(255,255,255,0.92)" },
      },
    };
    styleComponents.MuiAccordion = {
      // Keep the dark summary bar inside the rounded outline.
      styleOverrides: { root: { overflow: "hidden" } },
    };
    styleComponents.MuiAccordionSummary = {
      styleOverrides: {
        root: {
          backgroundColor: ink,
          "& .MuiTypography-root": { color: "rgba(255,255,255,0.9)" },
          "& .MuiTypography-overline": { color: "#ffffff" },
          "& .MuiTypography-overline > span": { color: "rgba(255,255,255,0.6)" },
          "& .MuiAccordionSummary-expandIconWrapper": {
            color: "rgba(255,255,255,0.8)",
          },
          // Inline add-actions (span[role=button]) sitting on the bar.
          "& [role='button']": {
            color: barAction,
            "&:hover": { backgroundColor: "rgba(255,255,255,0.08)" },
          },
        },
      },
    };
  } else if (styleName === "ledger") {
    styleComponents.MuiTableCell = {
      styleOverrides: {
        head: {
          backgroundColor: "transparent",
          color: text.primary,
          borderBottom: `2px solid ${ink}`,
        },
      },
    };
    styleComponents.MuiAccordionSummary = {
      styleOverrides: {
        root: {
          "& .MuiTypography-overline": {
            color: text.primary,
            fontFamily: SERIF_HEADER_STACK,
            fontSize: "0.95rem",
            textTransform: "none",
            letterSpacing: 0,
          },
        },
      },
    };
  }

  return createTheme(base, {
    palette: {
      background: { default: background },
      divider,
    },
    components: {
      ...styleComponents,
      MuiCssBaseline: {
        styleOverrides: {
          html: { fontSize: TEXT_SIZE_ROOT_PX[textSize] },
        },
      },
    },
    hillco: {
      windowStyle: styleName,
      ink,
      panel,
    },
  });
}
