import { useState } from "react";
import {
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Tooltip,
} from "@mui/material";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import CheckIcon from "@mui/icons-material/Check";

import type { ReactNode } from "react";

export interface CardAction {
  /** Display label. */
  label: string;
  /** Optional left-side icon. */
  icon?: ReactNode;
  /** When true, render a leading check (used for "toggle" items that
   *  are currently on). Mutually exclusive with `icon`. */
  checked?: boolean;
  /** When set, item is rendered disabled and shows this tooltip on
   *  hover/focus instead of triggering onClick. */
  disabledReason?: string;
  /** Style hint — `danger` colors the item red (e.g., Remove). */
  variant?: "default" | "danger";
  /** Renders a divider above this item. Skip for the first item. */
  dividerAbove?: boolean;
  onClick: () => void;
}

/**
 * Three-dot menu launched from a top-right IconButton on a card. Stops
 * propagation so the parent CardActionArea doesn't pick up clicks.
 */
export function CardActionsMenu({ actions }: { actions: CardAction[] }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const open = Boolean(anchor);
  return (
    <>
      <IconButton
        size="small"
        aria-label="Card actions"
        onClick={(e) => {
          e.stopPropagation();
          setAnchor(e.currentTarget);
        }}
        sx={{
          position: "absolute",
          top: 4,
          right: 4,
          color: "text.secondary",
        }}
      >
        <MoreVertIcon fontSize="small" />
      </IconButton>
      <Menu
        anchorEl={anchor}
        open={open}
        onClose={() => setAnchor(null)}
        onClick={(e) => e.stopPropagation()}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
      >
        {actions.map((a, i) => {
          const item = (
            <MenuItem
              key={a.label}
              disabled={!!a.disabledReason}
              onClick={() => {
                setAnchor(null);
                a.onClick();
              }}
              sx={{
                ...(a.variant === "danger" && {
                  color: "error.main",
                }),
                ...(a.dividerAbove && i > 0 && {
                  borderTop: 1,
                  borderColor: "divider",
                  mt: 0.5,
                  pt: 1,
                }),
              }}
            >
              {(a.icon || a.checked !== undefined) && (
                <ListItemIcon sx={{ color: "inherit", minWidth: 32 }}>
                  {a.icon ?? (a.checked ? <CheckIcon fontSize="small" /> : null)}
                </ListItemIcon>
              )}
              <ListItemText>{a.label}</ListItemText>
            </MenuItem>
          );
          if (a.disabledReason) {
            return (
              <Tooltip key={a.label} title={a.disabledReason} placement="left">
                <span>{item}</span>
              </Tooltip>
            );
          }
          return item;
        })}
      </Menu>
    </>
  );
}
