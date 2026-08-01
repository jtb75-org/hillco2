// Interlocked HC monogram redrawn from the HillCo business cards. Mirrors
// spa/src/components/BrandMark.tsx — the landing and the SPA are separate
// Vite builds, so the mark is duplicated rather than shared.
// Colors are passed in by the caller so the mark stays in family with
// whatever scheme the page is running; the defaults are the Carolina pair.
const NAVY = "#13294B";
const CAROLINA = "#4B9CD3";

const SERIF = 'Georgia, "Times New Roman", serif';

export function BrandMark({
  size = 28,
  hColor = NAVY,
  cColor = CAROLINA,
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
