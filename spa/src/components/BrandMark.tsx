// Interlocked HC monogram redrawn from the HillCo business cards.
// Brand colors are fixed — it's the logo, so it does not re-theme
// with the color scheme (navy H, Carolina blue C). Kept in step with
// landing/src/BrandMark.tsx so the public site and the portal show
// the same mark; the two are separate Vite builds, hence the copy.
export const BRAND_NAVY = "#13294B";
export const BRAND_CAROLINA = "#4B9CD3";

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
        fill={BRAND_NAVY}
      >
        H
      </text>
      <text
        x="13"
        y="29"
        fontFamily={SERIF}
        fontSize="22"
        fontWeight="700"
        fill={BRAND_CAROLINA}
      >
        C
      </text>
    </svg>
  );
}
