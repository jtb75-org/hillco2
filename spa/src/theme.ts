import { createTheme } from "@mui/material/styles";

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

export const themes = {
  default: createTheme({
    palette: {
      mode: "light",
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
    shape: {
      borderRadius: 6,
    },
    typography: baseTypography,
    components: commonComponents("#f8fafc", "#475569"),
  }),
  intake: createTheme({
    palette: {
      mode: "light",
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
    shape: {
      borderRadius: 6,
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
    components: commonComponents("#fff9df", "#5f4a12"),
  }),
};

export type ThemeName = keyof typeof themes;

export const themeOptions: Array<{ name: ThemeName; label: string }> = [
  { name: "default", label: "Default" },
  { name: "intake", label: "Intake" },
];
