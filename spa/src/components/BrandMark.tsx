// Interlocked HC monogram redrawn from the HillCo business cards.
// Brand colors are fixed — it's the logo, so it does not re-theme
// with the color scheme (indigo H, cyan C, per the card front).
export const BRAND_INDIGO = "#302870";
export const BRAND_CYAN = "#00a8d8";

const SERIF = 'Georgia, "Times New Roman", serif';

export function BrandMark({ size = 28 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      aria-hidden
      focusable="false"
    >
      <text
        x="1"
        y="21"
        fontFamily={SERIF}
        fontSize="22"
        fontWeight="700"
        fill={BRAND_INDIGO}
      >
        H
      </text>
      <text
        x="13"
        y="29"
        fontFamily={SERIF}
        fontSize="22"
        fontWeight="700"
        fill={BRAND_CYAN}
      >
        C
      </text>
    </svg>
  );
}
