import { palette, type ColorName } from '../engine/palette';

/**
 * Marker colour picker as a tray of standing markers: the chosen one is lifted out of the tray
 * and glows. Shared with the element inspector so picking a colour looks the same everywhere
 * (editor element properties, library detail, AI refinement preview).
 */
export function MarkerTray({ value, onChange, className }: { value: ColorName; onChange: (c: ColorName) => void; className?: string }) {
  return (
    <span className={className ? `marker-tray ${className}` : 'marker-tray'}>
      {(Object.keys(palette) as ColorName[]).map((c) => {
        const hex = palette[c];
        return (
          <button
            key={c}
            type="button"
            title={c}
            className={c === value ? 'marker on' : 'marker'}
            style={{ '--ink': hex } as React.CSSProperties}
            onClick={() => onChange(c)}
            aria-label={c}
          >
            <svg viewBox="0 0 20 46" width="25" height="58" aria-hidden>
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
