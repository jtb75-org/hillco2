import { useCallback, useEffect, useRef, useState } from "react";
import { Box } from "@mui/material";

/**
 * Drag-to-resize behavior for a right-anchored MUI Drawer. Returns the
 * current width (a number, in px) and a handle element to render
 * absolute-positioned at the left edge of the Drawer's Paper.
 *
 * Width persists per `storageKey` so each drawer remembers what the
 * user picked. On viewports narrower than the saved width, the caller
 * should cap with `maxWidth: "100%"` — this hook intentionally does
 * not touch CSS beyond the handle itself.
 */
export function useResizableDrawerWidth(
  storageKey: string,
  options?: { initial?: number; min?: number; max?: number },
) {
  const { initial = 480, min = 360, max = 1200 } = options ?? {};

  const [width, setWidth] = useState<number>(() => {
    if (typeof window === "undefined") return initial;
    const raw = window.localStorage.getItem(storageKey);
    const parsed = raw ? Number(raw) : NaN;
    return Number.isFinite(parsed) && parsed >= min && parsed <= max
      ? parsed
      : initial;
  });

  const draggingRef = useRef(false);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      draggingRef.current = true;
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!draggingRef.current) return;
      // Drawer is anchored right, so visible width = viewport - clientX.
      const next = Math.min(max, Math.max(min, window.innerWidth - e.clientX));
      setWidth(next);
    },
    [min, max],
  );

  const stop = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // pointer already released
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(storageKey, String(width));
  }, [storageKey, width]);

  const handle = (
    <Box
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize drawer"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={stop}
      onPointerCancel={stop}
      sx={{
        position: "absolute",
        top: 0,
        left: 0,
        bottom: 0,
        width: 6,
        cursor: "ew-resize",
        zIndex: 2,
        touchAction: "none",
        "&:hover, &:active": {
          bgcolor: "action.selected",
        },
      }}
    />
  );

  return { width, handle };
}
