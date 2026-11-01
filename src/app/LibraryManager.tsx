import { useEffect, useMemo, useRef, useState } from 'react';
import { compile, Stage } from '../engine';
import { isoModels, projectIso, type IsoModel } from '../engine/iso';
import { icons, type IconDef } from '../engine/library';
import { board, palette, type ColorName } from '../engine/palette';
import { confirmDialog } from './confirm';
import { IconPreview } from './editor/IconPreview';
import { deleteFromLibrary, renameInLibrary, saveToLibrary, userItems } from './userLibrary';

export type LibraryGroup = 'all' | 'icon' | 'logo' | 'clipart' | '3d' | 'mine';
type ItemKind = 'icon' | 'logo' | 'clipart' | '3d';

interface Item { name: string; kind: ItemKind; description: string; tags: string[]; mine: boolean; icon?: IconDef; model?: IsoModel }

const GROUPS: { group: LibraryGroup; label: string }[] = [
  { group: 'all', label: 'Everything' },
  { group: 'icon', label: 'Icons' },
  { group: 'logo', label: 'Logos' },
  { group: 'clipart', label: 'Clipart' },
  { group: '3d', label: '3D models' },
  { group: 'mine', label: 'Made by me' },
];
const KIND_LABEL: Record<ItemKind, string> = { icon: 'Icon', logo: 'Logo', clipart: 'Clipart', '3d': '3D model' };

function allItems(): Item[] {
  const out: Item[] = Object.entries(icons).map(([name, d]) => ({
    name, icon: d, description: d.description, tags: d.tags.filter((t) => t !== 'made-with-ai' && t !== 'clipart'),
    kind: d.parts ? 'clipart' : d.tags.includes('logo') ? 'logo' : 'icon', mine: name in userItems,
  }));
  for (const [name, m] of Object.entries(isoModels)) {
    const tags = (userItems[name] as { tags?: string[] } | undefined)?.tags ?? [];
    out.push({ name, model: m, description: m.description, tags: tags.filter((t) => t !== 'made-with-ai'), kind: '3d', mine: name in userItems });
  }
  return out;
}

interface Props {
  onClose: () => void;
  /** Present when opened from the editor: puts the item on the board. */
  onAdd?: (item: { kind: 'icon' | 'iso'; name: string }) => void;
  /** Opens "New with AI" for this kind of item. */
  onCreate?: (kind: 'icon' | 'clipart' | '3d') => void;
  /** Something in the library changed (renamed, deleted, edited). */
  onChanged?: () => void;
  /** Bumped from outside when something was added (e.g. made with AI). */
  version?: number;
}

/** The whole library full screen: browse, search, preview drawing in, and manage what you made. */
export function LibraryManager({ onClose, onAdd, onCreate, onChanged, version: outside = 0 }: Props) {
  const [version, setVersion] = useState(0);
  const items = useMemo(allItems, [version, outside]);
  const [group, setGroup] = useState<LibraryGroup>('all');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string | null>(null);

  const changed = () => { setVersion((v) => v + 1); onChanged?.(); };

  const counts = useMemo(() => Object.fromEntries(GROUPS.map((g) => [g.group, items.filter((i) => inGroup(i, g.group)).length])), [items]);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items
      .filter((i) => inGroup(i, group))
      .filter((i) => !q || i.name.includes(q) || i.tags.some((t) => t.includes(q)) || i.description.toLowerCase().includes(q))
      // Your own things first, then by name.
      .sort((a, b) => Number(b.mine) - Number(a.mine) || a.name.localeCompare(b.name));
  }, [items, group, query]);
  const keyOf = (i: Item) => `${i.kind}:${i.name}`;
  const current = items.find((i) => keyOf(i) === selected) ?? null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || (e.target as HTMLElement).closest('input, textarea')) return;
      e.stopPropagation();
      onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  return (
    <div className="libman">
      <header className="libman-head">
        <h2>Library</h2>
        <input className="search" autoFocus placeholder={`Search ${items.length} icons, logos, clipart and 3D models…`} value={query} onChange={(e) => setQuery(e.target.value)} />
        <span className="spacer" />
        {onCreate && (
          <div className="new-ai">
            <span className="muted">New with AI:</span>
            <button onClick={() => onCreate('icon')}>Icon</button>
            <button onClick={() => onCreate('clipart')}>Clipart</button>
            <button onClick={() => onCreate('3d')}>3D model</button>
          </div>
        )}
        <button onClick={onClose} title="Close (Esc)">✕</button>
      </header>
      <div className="libman-body">
        <nav className="libman-nav">
          {GROUPS.map((g) => (
            <button key={g.group} className={group === g.group ? 'on' : ''} onClick={() => setGroup(g.group)}>
              <span>{g.label}</span><span className="count">{counts[g.group]}</span>
            </button>
          ))}
          <p className="muted small">Things you make with AI are saved in <code>library/</code> next to your presentations, and models writing presentations can use them.</p>
        </nav>
        <div className="libman-grid">
          {shown.length === 0 && <p className="muted">{group === 'mine' && !query ? 'Nothing made yet. Use “New with AI” above.' : 'Nothing matches.'}</p>}
          {shown.map((i) => (
            <button
              key={`${i.kind}:${i.name}`}
              className={`lib-tile k-${i.kind} ${selected === keyOf(i) ? 'on' : ''}`}
              onClick={() => setSelected(keyOf(i))}
              onDoubleClick={() => onAdd && (onAdd({ kind: i.kind === '3d' ? 'iso' : 'icon', name: i.name }), onClose())}
              title={i.description}
            >
              <span className="art"><Thumb item={i} /></span>
              <span className="name">{i.name}</span>
              {i.mine && <span className="badge">mine</span>}
            </button>
          ))}
        </div>
        <aside className="libman-detail">
          {current ? (
            <Detail key={keyOf(current)} item={current} onAdd={onAdd && ((it) => { onAdd(it); onClose(); })} onChanged={changed} onGone={() => setSelected(null)} onRenamed={(to) => { setSelected(`${current.kind}:${to}`); changed(); }} />
          ) : (
            <p className="muted">Select something to see it drawn and its details.{onAdd ? ' Double-click to put it on the board.' : ''}</p>
          )}
        </aside>
      </div>
    </div>
  );
}

function inGroup(i: Item, g: LibraryGroup) {
  return g === 'all' || (g === 'mine' ? i.mine : i.kind === g);
}

/** Small static picture for the grid. */
function Thumb({ item }: { item: Item }) {
  if (item.icon) return <IconPreview def={item.icon} size={item.kind === 'clipart' ? 88 : 40} />;
  return <IsoThumb model={item.model!} size={80} />;
}

function IsoThumb({ model, size }: { model: IsoModel; size: number }) {
  const { faces, box } = useMemo(() => projectIso(model.parts, { rotate: 0, explode: 0 }, 40), [model]);
  const pad = 4;
  return (
    <svg viewBox={`${box.x - pad} ${box.y - pad} ${box.width + pad * 2} ${box.height + pad * 2}`} width={size} height={size}>
      {faces.map((f, i) => (
        <path key={i} d={f.d} fill={board.background} stroke={palette[(model.parts[f.part]?.color ?? 'cyan') as ColorName]} strokeWidth={1.4} strokeLinejoin="round" />
      ))}
    </svg>
  );
}

/** The selected item: drawn in on a small board, its details, and (for your own) editing. */
function Detail({ item, onAdd, onChanged, onGone, onRenamed }: {
  item: Item;
  onAdd?: (it: { kind: 'icon' | 'iso'; name: string }) => void;
  onChanged: () => void;
  onGone: () => void;
  onRenamed: (to: string) => void;
}) {
  const [color, setColor] = useState<ColorName>('cyan');
  const [name, setName] = useState(item.name);
  const [description, setDescription] = useState(item.description);
  const [tags, setTags] = useState(item.tags.join(', '));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const element = item.kind === '3d' ? { type: 'iso', model: item.name } : { type: 'icon', icon: item.name };
  const snippet = JSON.stringify({ id: item.name, ...element, x: 960, y: 540 });
  const dirty = name !== item.name || description !== item.description || tags !== item.tags.join(', ');

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try { await fn(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  const save = () => run(async () => {
    const def = userItems[item.name];
    const tagList = tags.split(',').map((t) => t.trim()).filter(Boolean);
    const keep = (def.tags ?? []).filter((t) => t === 'made-with-ai' || t === 'clipart');
    await saveToLibrary(item.name, { ...def, description: description.trim(), tags: [...keep, ...tagList] } as typeof def);
    const to = name.trim();
    if (to !== item.name) {
      if (!/^[a-z][a-z0-9-]*$/.test(to)) throw new Error('Names use lowercase letters, digits and -, starting with a letter');
      const ok = await confirmDialog({
        title: `Rename “${item.name}” to “${to}”?`,
        message: `Presentations that already use “${item.name}” keep the old name and won't find it any more.`,
        confirm: 'Rename',
      });
      if (!ok) return onChanged();
      await renameInLibrary(item.name, to);
      return onRenamed(to);
    }
    onChanged();
  });

  const remove = async () => {
    const ok = await confirmDialog({
      title: `Delete “${item.name}” from your library?`,
      message: `Presentations that use it will show an error where it was. This can't be undone.`,
      confirm: 'Delete', danger: true,
    });
    if (ok) await run(async () => { await deleteFromLibrary(item.name); onGone(); onChanged(); });
  };

  return (
    <div className="detail">
      <DrawPreview element={element} color={color} />
      {item.kind !== 'clipart' && (
        <div className="swatch-row" title="Preview colour (on the board, it takes the element's colour)">
          {(Object.keys(palette) as ColorName[]).map((c) => (
            <button key={c} className={c === color ? 'on' : ''} style={{ background: palette[c] }} onClick={() => setColor(c)} aria-label={c} />
          ))}
        </div>
      )}
      <div className="detail-head">
        <h3>{item.name}</h3>
        <span className="kind">{KIND_LABEL[item.kind]}</span>
        <span className="kind">{item.mine ? 'made in this app' : 'built in'}</span>
      </div>
      {item.mine ? (
        <div className="detail-form">
          <label><span>name</span><input value={name} onChange={(e) => setName(e.target.value.toLowerCase())} /></label>
          <label><span>description</span><textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} /></label>
          <label><span>tags</span><input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="comma, separated" /></label>
          <p className="muted small">Models read the description and tags to decide when to use it.</p>
        </div>
      ) : (
        <>
          <p>{item.description}</p>
          {item.tags.length > 0 && <div className="tag-list">{item.tags.map((t) => <span key={t}>{t}</span>)}</div>}
        </>
      )}
      <details className="snippet">
        <summary>Use it in JSON</summary>
        <code>{snippet}</code>
      </details>
      {error && <p className="error-text">{error}</p>}
      <div className="row">
        {onAdd && <button className="primary" onClick={() => onAdd({ kind: item.kind === '3d' ? 'iso' : 'icon', name: item.name })}>Put on the board</button>}
        {item.mine && <button disabled={!dirty || busy} onClick={() => void save()}>Save changes</button>}
        {item.mine && <button className="danger" disabled={busy} onClick={() => void remove()}>Delete</button>}
      </div>
    </div>
  );
}

/** A small board that draws the item in, and again on click. */
function DrawPreview({ element, color }: { element: Record<string, unknown>; color: ColorName }) {
  const host = useRef<HTMLDivElement>(null);
  const [round, setRound] = useState(0);
  useEffect(() => {
    const isIso = element.type === 'iso';
    const isClipart = element.type === 'icon' && !!icons[element.icon as string]?.parts;
    const fit = (parts: IsoModel['parts']) => {
      const box = projectIso(parts, { rotate: 0, explode: 0 }, 1).box;
      return Math.min(1100 / Math.max(box.width, 0.1), 680 / Math.max(box.height, 0.1));
    };
    const model = isIso ? isoModels[element.model as string] : undefined;
    const size = model ? { scale: fit(model.parts) } : { size: isClipart ? 1100 : 560 };
    const doc = {
      version: 1, title: 'preview',
      scenes: [{ id: 'p', elements: [{ id: 'it', ...element, ...size, x: 960, y: 540, color }], beats: [{ actions: [{ do: 'draw', target: 'it', duration: isClipart ? 2.4 : 1.6 }] }] }],
    };
    const result = compile(doc);
    if (!result.ok || !host.current) return;
    const stage = new Stage(host.current);
    let alive = true;
    void stage.load(result.presentation, { scene: 0, beat: 0 }).then(() => alive && stage.next());
    return () => { alive = false; stage.destroy(); };
  }, [element.type, element.icon, element.model, color, round]); // eslint-disable-line react-hooks/exhaustive-deps
  return <div className="draw-preview" ref={host} onClick={() => setRound((r) => r + 1)} title="Click to draw it again" />;
}
