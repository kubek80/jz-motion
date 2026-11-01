import { useMemo, useState } from 'react';
import { isoModels } from '../../engine/iso';
import { icons, type IconDef } from '../../engine/library';
import { IconPreview } from './IconPreview';
import { palette } from '../../engine/palette';
import { isImageFile, uploadImage, type PlacedImage } from '../images';

export type AddRequest =
  | { kind: 'icon'; name: string }
  | { kind: 'iso'; name: string }
  | { kind: 'text' | 'box' | 'arrow' | 'chart' | 'area' }
  | { kind: 'image'; image: PlacedImage };

/** Palette of things to put on the board. Clicking adds the item in the middle of the view. */
export function Library({ onAdd, arrowActive, onCreate, onBrowse, version }: { onAdd: (r: AddRequest) => void; arrowActive: boolean; onCreate?: () => void; onBrowse?: () => void; version?: number }) {
  const [query, setQuery] = useState('');
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return Object.entries(icons).filter(([name, d]) => !q || name.includes(q) || d.tags.some((t) => t.includes(q)) || d.description.toLowerCase().includes(q));
  }, [query, version]);

  const groups: [string, [string, IconDef][]][] = [
    ['Icons', shown.filter(([, d]) => !d.parts && !d.tags.includes('logo'))],
    ['Logos', shown.filter(([, d]) => !d.parts && d.tags.includes('logo'))],
    ['Clipart', shown.filter(([, d]) => !!d.parts)],
  ];

  return (
    <div className="library">
      <div className="basics">
        <button className="tool" style={ink.yellow} onClick={() => onAdd({ kind: 'text' })} title="Handwritten, bold or code text">{TOOL_ICONS.text}<span>Text</span></button>
        <button className="tool" style={ink.cyan} onClick={() => onAdd({ kind: 'box' })} title="A box with a label">{TOOL_ICONS.box}<span>Box</span></button>
        <button className="tool" style={ink.green} onClick={() => onAdd({ kind: 'chart' })} title="Bar, line or pie chart">{TOOL_ICONS.chart}<span>Chart</span></button>
        <button
          className={arrowActive ? 'tool on' : 'tool'}
          style={ink.pink}
          onClick={() => onAdd({ kind: 'arrow' })}
          title="Connect two elements: click the start, then the end (or select two elements first)"
        >
          {TOOL_ICONS.arrow}<span>Arrow</span>
        </button>
        <label className="tool file-button" style={ink.orange} title="Add a screenshot or picture (you can also paste one with Ctrl+V, or drop it on the board)">
          {TOOL_ICONS.image}<span>Image</span>
          <input type="file" accept="image/*" onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (isImageFile(f)) void uploadImage(f).then((image) => onAdd({ kind: 'image', image }), (err) => alert(`Could not add the picture: ${(err as Error).message}`));
          }} />
        </label>
        <button className="tool" style={ink.white} onClick={() => onAdd({ kind: 'area' })} title="Mark part of a screenshot (or anything) to circle it, spotlight it or zoom to it">{TOOL_ICONS.area}<span>Area</span></button>
      </div>
      <div className="lib-search">
        <input className="search" placeholder="Search icons, logos, clipart…" value={query} onChange={(e) => setQuery(e.target.value)} />
        {onBrowse && <button onClick={onBrowse} title="Open the whole library: big previews, details, manage what you made">⤢</button>}
      </div>
      {onCreate && <button className="add ai-add" onClick={onCreate} title="Describe an icon, clipart or 3D model and let a model make it">{TOOL_ICONS.sparkle} New with AI</button>}
      {groups.map(([title, list]) => list.length > 0 && (
        <div key={title}>
          <div className="subhead">{title}</div>
          <div className={title === 'Clipart' ? 'icon-grid wide' : 'icon-grid'}>
            {list.map(([name, d]) => (
              <button key={name} className="icon-tile" title={d.description} onClick={() => onAdd({ kind: 'icon', name })}>
                <IconPreview def={d} size={title === 'Clipart' ? 64 : 30} />
                <span>{name}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
      <div className="subhead">3D models</div>
      <div className="model-list">
        {Object.entries(isoModels).filter(([name, m]) => !query.trim() || name.includes(query.trim().toLowerCase()) || m.description.toLowerCase().includes(query.trim().toLowerCase())).map(([name, m]) => (
          <button key={name} title={m.description} onClick={() => onAdd({ kind: 'iso', name })}>{name}</button>
        ))}
      </div>
    </div>
  );
}

/** Each tool in its own marker colour. */
const ink = Object.fromEntries(Object.entries(palette).map(([k, v]) => [k, { '--ink': v } as React.CSSProperties])) as Record<keyof typeof palette, React.CSSProperties>;

const svg = (body: React.ReactNode) => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{body}</svg>
);
/** Small line pictures for the tools, drawn like the board's marker icons. */
export const TOOL_ICONS = {
  text: <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden><text x="12" y="18" textAnchor="middle" fontFamily="Caveat, cursive" fontWeight="700" fontSize="19" fill="currentColor">Aa</text></svg>,
  box: svg(<rect x="3.5" y="6" width="17" height="12" rx="3" />),
  chart: svg(<><path d="M4 20h16" opacity="0.6" /><path d="M7 20v-6M12 20V7M17 20v-9" strokeWidth="2.6" /></>),
  arrow: svg(<><path d="M4 17C9 17 12 9 19 8" /><path d="M15 5l4 3-3.5 3.5" /></>),
  image: svg(<><rect x="3" y="4.5" width="18" height="15" rx="2.5" /><path d="M3 8.5h18" opacity="0.7" /><path d="M6.5 16.5l4-4 3 3 2-2 2.5 3" /></>),
  area: svg(<><rect x="4" y="5" width="16" height="14" rx="2" strokeDasharray="3 2.6" /><circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" /></>),
  sparkle: svg(<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" />),
};
