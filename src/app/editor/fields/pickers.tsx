import { palette } from '../../../engine/palette';

// Choosing by look: marker colours as a tray of markers, and small pictures for choices such as chart
// kinds, layouts, line styles, arrowheads, text styles and frames.

/** Marker colors as a tray of markers: the chosen one is lifted out and glows. */
export function Swatches({ value, colors, fallback, onChange }: { value?: string; colors: string[]; fallback?: string; onChange: (v: unknown) => void }) {
  const current = value ?? fallback;
  return (
    <span className="marker-tray">
      {colors.map((c) => {
        const hex = palette[c as keyof typeof palette];
        return (
          <button
            key={c}
            type="button"
            title={c + (value === undefined && c === fallback ? ' (default)' : '')}
            className={c === current ? 'marker on' : 'marker'}
            style={{ '--ink': hex } as React.CSSProperties}
            onClick={() => onChange(c === fallback && value !== undefined ? undefined : c)}
          >
            <svg viewBox="0 0 20 46" width="25" height="58" aria-hidden>
              {/* chisel tip, collar, body with a colour band */}
              <path d="M7.5 1.5 L12.5 5 V12 H7.5 Z" fill={hex} />
              <rect x="5.5" y="12" width="9" height="5" rx="1" fill={hex} opacity="0.55" />
              <rect x="3" y="17" width="14" height="28" rx="3" fill="#232a31" stroke="#38424c" />
              <rect x="3" y="23" width="14" height="7" fill={hex} opacity="0.85" />
              <rect x="5" y="19" width="2" height="23" rx="1" fill="#ffffff" opacity="0.08" />
            </svg>
          </button>
        );
      })}
    </span>
  );
}

/** Small pictures for enum fields that are easier to pick by look than by name. */
const g = (body: React.ReactNode) => (
  <svg viewBox="0 0 32 22" width="32" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{body}</svg>
);
const frame = <rect x="1.5" y="1.5" width="29" height="19" rx="2" strokeWidth="1.2" opacity="0.6" />;
export const CHOICE_ICONS: Record<string, Record<string, React.ReactNode>> = {
  kind: {
    bar: g(<><path d="M4 19H28" opacity="0.6" /><path d="M7 19V11H11V19M14 19V5H18V19M21 19V9H25V19" /></>),
    line: g(<><path d="M4 19H28" opacity="0.6" /><path d="M5 15L11 9L17 13L27 4" /><circle cx="11" cy="9" r="1.3" fill="currentColor" /><circle cx="17" cy="13" r="1.3" fill="currentColor" /></>),
    pie: g(<><path d="M16 3A8 8 0 1 1 8.1 12.4" /><path d="M16 3A8 8 0 0 0 8.1 12.4L16 11Z" /><circle cx="16" cy="11" r="3.5" /></>),
  },
  layout: {
    board: g(<>{frame}<path d="M7 14L12 8L17 12L24 6" /></>),
    pip: g(<>{frame}<path d="M6 10L10 6L14 9" /><rect x="18" y="12" width="10" height="6.5" rx="1" fill="currentColor" stroke="none" /></>),
    'pip-left': g(<>{frame}<path d="M18 10L22 6L26 9" /><rect x="4" y="12" width="10" height="6.5" rx="1" fill="currentColor" stroke="none" /></>),
    camera: g(<>{frame}<circle cx="13" cy="10" r="3" /><path d="M7 19C7 15 19 15 19 19" /><rect x="21" y="3.5" width="7.5" height="5" rx="1" strokeWidth="1.2" /></>),
    side: g(<>{frame}<path d="M16 2V20" opacity="0.6" /><circle cx="8.5" cy="9" r="2.4" /><path d="M4.5 18C4.5 14.5 12.5 14.5 12.5 18" /><circle cx="23.5" cy="9" r="2.4" /><path d="M19.5 18C19.5 14.5 27.5 14.5 27.5 18" /></>),
  },
  align: {
    start: g(<path d="M6 6H26M6 11H18M6 16H22" />),
    middle: g(<path d="M6 6H26M10 11H22M8 16H24" />),
    end: g(<path d="M6 6H26M14 11H26M10 16H26" />),
  },
  style: {
    marker: <svg viewBox="0 0 40 22" width="40" height="22"><text x="20" y="16" textAnchor="middle" fontFamily="Caveat, cursive" fontWeight="700" fontSize="18" fill="currentColor">Aa</text></svg>,
    bold: <svg viewBox="0 0 40 22" width="40" height="22"><text x="21" y="17" textAnchor="middle" fontFamily="Bungee, 'Arial Black', sans-serif" fontSize="14" fill="none" stroke="currentColor" strokeWidth="0.6" opacity="0.5" transform="translate(1 1)">AB</text><text x="20" y="16" textAnchor="middle" fontFamily="Bungee, 'Arial Black', sans-serif" fontSize="14" fill="#0d1114" stroke="currentColor" strokeWidth="1">AB</text></svg>,
    code: <svg viewBox="0 0 40 22" width="40" height="22"><text x="20" y="15.5" textAnchor="middle" fontFamily="'JetBrains Mono', monospace" fontWeight="500" fontSize="11" fill="currentColor">{'</>'}</text></svg>,
    dark: g(<><rect x="1.5" y="1.5" width="29" height="19" rx="2" fill="#000" stroke="none" /><rect x="10" y="6" width="12" height="10" rx="2" fill="currentColor" opacity="0.9" stroke="none" /></>),
    fade: g(<><rect x="1.5" y="1.5" width="29" height="19" rx="2" fill="currentColor" opacity="0.18" stroke="none" /><rect x="10" y="6" width="12" height="10" rx="2" fill="currentColor" opacity="0.9" stroke="none" /></>),
  },
  frame: {
    none: g(<><rect x="5" y="4" width="22" height="14" rx="1.5" fill="currentColor" opacity="0.35" stroke="none" /><path d="M8 14L13 9L17 12L24 7" strokeWidth="1.4" /></>),
    browser: g(<><rect x="3" y="2.5" width="26" height="17" rx="3" /><path d="M3 7.5H29" strokeWidth="1.4" /><circle cx="6.2" cy="5" r="0.6" fill="currentColor" /><circle cx="8.6" cy="5" r="0.6" fill="currentColor" /><circle cx="11" cy="5" r="0.6" fill="currentColor" /><rect x="7" y="10" width="18" height="7" rx="1" fill="currentColor" opacity="0.35" stroke="none" /></>),
  },
  shape: {
    rect: g(<rect x="5" y="4" width="22" height="14" rx="2" />),
    ellipse: g(<ellipse cx="16" cy="11" rx="11.5" ry="7.5" />),
    diamond: g(<path d="M16 2.5L28 11L16 19.5L4 11Z" />),
  },
  line: {
    solid: g(<path d="M4 11H28" strokeWidth="2.2" />),
    dashed: g(<path d="M4 11H28" strokeWidth="2.2" strokeDasharray="5 4" />),
    dotted: g(<path d="M4 11H28" strokeWidth="2.6" strokeDasharray="0 5" />),
  },
  weight: {
    normal: g(<><path d="M5 16L25 6" /><path d="M19 5L25 6L22 11.5" /></>),
    bold: g(<><path d="M5 16L25 6" strokeWidth="3.6" /><path d="M17 4L25 6L21.5 13" strokeWidth="3.6" /></>),
  },
  head: {
    end: g(<><path d="M5 11H27" /><path d="M22 6L27 11L22 16" /></>),
    start: g(<><path d="M5 11H27" /><path d="M10 6L5 11L10 16" /></>),
    both: g(<><path d="M5 11H27" /><path d="M22 6L27 11L22 16M10 6L5 11L10 16" /></>),
    none: g(<path d="M5 11H27" />),
  },
};

export function IconChoice({ value, options, fallback, pictures, onChange }: { value?: string; options: string[]; fallback?: string; pictures: Record<string, React.ReactNode>; onChange: (v: unknown) => void }) {
  const current = value ?? fallback;
  return (
    <span className="icon-choice">
      {options.map((o) => (
        <button
          key={o}
          type="button"
          title={o + (value === undefined && o === fallback ? ' (default)' : '')}
          className={o === current ? 'on' : ''}
          // Clicking the chosen one again (or the default) clears the field.
          onClick={() => onChange((o === fallback || o === value) && value !== undefined ? undefined : o)}
        >
          {pictures[o]}
        </button>
      ))}
    </span>
  );
}

