import { useMemo, useState } from 'react';
import { isoModels } from '../../engine/iso';
import { icons, type IconDef } from '../../engine/library';
import { IconPreview } from './IconPreview';
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
        <button onClick={() => onAdd({ kind: 'text' })}>Text</button>
        <button onClick={() => onAdd({ kind: 'box' })}>Box</button>
        <button onClick={() => onAdd({ kind: 'chart' })}>Chart</button>
        <button
          className={arrowActive ? 'on' : ''}
          onClick={() => onAdd({ kind: 'arrow' })}
          title="Connect two elements: click the start, then the end (or select two elements first)"
        >
          Arrow
        </button>
        <label className="file-button" title="Add a screenshot or picture (you can also paste one with Ctrl+V, or drop it on the board)">
          Image
          <input type="file" accept="image/*" onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (isImageFile(f)) void uploadImage(f).then((image) => onAdd({ kind: 'image', image }), (err) => alert(`Could not add the picture: ${(err as Error).message}`));
          }} />
        </label>
        <button onClick={() => onAdd({ kind: 'area' })} title="Mark part of a screenshot (or anything) to circle it, spotlight it or zoom to it">Area</button>
      </div>
      <div className="lib-search">
        <input className="search" placeholder="Search icons, logos, clipart…" value={query} onChange={(e) => setQuery(e.target.value)} />
        {onBrowse && <button onClick={onBrowse} title="Open the whole library: big previews, details, manage what you made">⤢</button>}
      </div>
      {onCreate && <button className="add" onClick={onCreate} title="Describe an icon, clipart or 3D model and let a model make it">+ New with AI</button>}
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
