import { ICON_GRID, type IconDef, type PartColor } from '../../engine/library';
import { board, palette } from '../../engine/palette';

const colour = (c: PartColor) => (c === 'board' ? board.background : c === 'ink' ? 'currentColor' : palette[c]);
// Dim fills are shown as a pre-mixed solid colour here too (matches renderer). Covers every
// palette colour, not just ink, so pink skin highlights and orange skin tones stay solid against
// panel backgrounds — the sidebar thumbnail matches what you see on the board.
const fillColour = (c: PartColor | undefined, opacity: number | undefined) => {
  if (!c) return 'none';
  if (opacity !== undefined && opacity < 1 && c !== 'board') {
    return `color-mix(in srgb, ${colour(c)} ${Math.round(opacity * 100)}%, ${board.background})`;
  }
  return colour(c);
};

/** A library drawing as a small static picture (no glow, no animation). */
export function IconPreview({ def, size = 30, color = 'currentColor' }: { def: IconDef; size?: number; color?: string }) {
  const [w, h] = def.box ?? [ICON_GRID, ICON_GRID];
  if (def.parts) {
    // Set CSS `color` on the root so `ink` parts (which resolve to `currentColor` for both stroke
    // and the dim-fill color-mix) recolour live when the caller picks a different marker. Without
    // this, `currentColor` inherits from some ancestor and the preview appears to ignore the
    // colour-picker until the component remounts.
    return (
      <svg viewBox={`0 0 ${w} ${h}`} width={size} height={(size * h) / Math.max(w, h)} style={{ maxHeight: size, color }}>
        <g strokeLinecap="round" strokeLinejoin="round">
          {def.parts.map((p, i) => (
            <path
              key={i} d={p.d} transform={p.transform} opacity={p.opacity}
              fill={fillColour(p.fill, p.fillOpacity)}
              fillOpacity={p.fill && p.fill !== 'board' && p.fillOpacity !== undefined && p.fillOpacity < 1 ? undefined : p.fillOpacity}
              fillRule="evenodd"
              stroke={p.color ? colour(p.color) : color} strokeWidth={p.width ?? 2}
            />
          ))}
        </g>
      </svg>
    );
  }
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width={size} height={size} style={{ color }}>
      <g fill="none" stroke={color} strokeWidth={def.stroke ?? (def.style === 'logo' ? 0.8 : 1.6)} strokeLinecap="round" strokeLinejoin="round">
        {def.paths.map((p, i) => <path key={i} d={p} />)}
      </g>
    </svg>
  );
}
