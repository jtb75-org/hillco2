// Interlocked HC monogram redrawn from the HillCo business cards. Mirrors
// spa/src/components/BrandMark.tsx — the landing and the SPA are separate
// Vite builds, so the mark is duplicated rather than shared.
// Brand colors are fixed: it's the logo, so it does not re-theme.
export const BRAND_INDIGO = "#302870";
export const BRAND_CYAN = "#00a8d8";

const SERIF = 'Georgia, "Times New Roman", serif';

export function BrandMark({
  size = 28,
  hColor = BRAND_INDIGO,
  cColor = BRAND_CYAN,
}: {
  size?: number;
  hColor?: string;
  cColor?: string;
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden focusable="false">
      <text x="1" y="21" fontFamily={SERIF} fontSize="22" fontWeight="700" fill={hColor}>
        H
      </text>
      <text x="13" y="29" fontFamily={SERIF} fontSize="22" fontWeight="700" fill={cColor}>
        C
      </text>
    </svg>
  );
}
