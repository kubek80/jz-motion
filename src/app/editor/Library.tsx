import { useMemo, useState } from 'react';
import { isoModels } from '../../engine/iso';
import { icons } from '../../engine/library';

export type AddRequest =
  | { kind: 'icon'; name: string }
  | { kind: 'iso'; name: string }
  | { kind: 'text' | 'box' | 'arrow' };

/** Palette of things to put on the board. Clicking adds the item in the middle of the view. */
export function Library({ onAdd, canConnect }: { onAdd: (r: AddRequest) => void; canConnect: boolean }) {
  const [query, setQuery] = useState('');
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return Object.entries(icons).filter(([name, d]) => !q || name.includes(q) || d.tags.some((t) => t.includes(q)) || d.description.toLowerCase().includes(q));
  }, [query]);

  return (
    <div className="library">
      <div className="basics">
        <button onClick={() => onAdd({ kind: 'text' })}>Text</button>
        <button onClick={() => onAdd({ kind: 'box' })}>Box</button>
        <button
          onClick={() => onAdd({ kind: 'arrow' })}
          disabled={!canConnect}
          title={canConnect ? 'Arrow between the two selected elements' : 'Select two elements (shift+click) to connect them'}
        >
          Arrow
        </button>
      </div>
      <input className="search" placeholder="Search icons…" value={query} onChange={(e) => setQuery(e.target.value)} />
      <div className="icon-grid">
        {shown.map(([name, d]) => (
          <button key={name} className="icon-tile" title={d.description} onClick={() => onAdd({ kind: 'icon', name })}>
            <svg viewBox="0 0 24 24" width="30" height="30">
              <g fill="none" stroke="currentColor" strokeWidth={d.style === 'logo' ? 0.8 : 1.6} strokeLinecap="round" strokeLinejoin="round">
                {d.paths.map((p, i) => <path key={i} d={p} />)}
              </g>
            </svg>
            <span>{name}</span>
          </button>
        ))}
      </div>
      <div className="subhead">3D models</div>
      <div className="model-list">
        {Object.entries(isoModels).map(([name, m]) => (
          <button key={name} title={m.description} onClick={() => onAdd({ kind: 'iso', name })}>{name}</button>
        ))}
      </div>
    </div>
  );
}
