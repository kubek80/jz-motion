import { ICON_GRID, type IconDef, type PartColor } from '../../engine/library';
import { board, palette } from '../../engine/palette';

const colour = (c: PartColor) => (c === 'board' ? board.background : palette[c]);

/** A library drawing as a small static picture (no glow, no animation). */
export function IconPreview({ def, size = 30, color = 'currentColor' }: { def: IconDef; size?: number; color?: string }) {
  const [w, h] = def.box ?? [ICON_GRID, ICON_GRID];
  if (def.parts) {
    return (
      <svg viewBox={`0 0 ${w} ${h}`} width={size} height={(size * h) / Math.max(w, h)} style={{ maxHeight: size }}>
        <g strokeLinecap="round" strokeLinejoin="round">
          {def.parts.map((p, i) => (
            <path
              key={i} d={p.d} transform={p.transform} opacity={p.opacity}
              fill={p.fill ? colour(p.fill) : 'none'} fillOpacity={p.fillOpacity} fillRule="evenodd"
              stroke={p.color ? colour(p.color) : color} strokeWidth={p.width ?? 2}
            />
          ))}
        </g>
      </svg>
    );
  }
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width={size} height={size}>
      <g fill="none" stroke={color} strokeWidth={def.stroke ?? (def.style === 'logo' ? 0.8 : 1.6)} strokeLinecap="round" strokeLinejoin="round">
        {def.paths.map((p, i) => <path key={i} d={p} />)}
      </g>
    </svg>
  );
}
