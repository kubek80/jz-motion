import { useEffect, useMemo, useRef, useState } from 'react';
import { compile, Stage } from '../engine';
import { isoModels, projectIso, type IsoModel } from '../engine/iso';
import { icons, type IconDef } from '../engine/library';
import { board, palette, type ColorName } from '../engine/palette';
import { confirmDialog } from './confirm';
import type { CreatorStart } from './Creator';
import { IconPreview } from './editor/IconPreview';
import type { PlacedImage } from './images';
import { formatBytes, useMediaList } from './media';
import { MediaPanel } from './MediaPanel';
import { MarkerTray } from './MarkerTray';
import { deleteFromLibrary, renameInLibrary, saveToLibrary, userItems } from './userLibrary';

export type LibraryGroup = 'all' | 'icon' | 'logo' | 'clipart' | '3d';
type ItemKind = 'icon' | 'logo' | 'clipart' | '3d';
/** Where a library item came from: hand-drawn by the user, made with AI, or imported from UnDraw. */
type Source = 'drawn' | 'ai' | 'undraw';

interface Item { name: string; kind: ItemKind; source: Source; description: string; tags: string[]; mine: boolean; icon?: IconDef; model?: IsoModel }

// The "Made by me" filter is gone: this is the user's personal studio, everything in here is
// theirs in some sense. Browse by what it IS (icon/logo/clipart/3D).
const GROUPS: { group: LibraryGroup; label: string }[] = [
  { group: 'all', label: 'Everything' },
  { group: 'icon', label: 'Icons' },
  { group: 'logo', label: 'Logos' },
  { group: 'clipart', label: 'Clipart' },
  { group: '3d', label: '3D models' },
];
const KIND_LABEL: Record<ItemKind, string> = { icon: 'Icon', logo: 'Logo', clipart: 'Clipart', '3d': '3D model' };
const SOURCE_LABEL: Record<Source, string> = { drawn: 'Hand-drawn', ai: 'Made with AI', undraw: 'From UnDraw' };
// Sub-section order within a kind: hand-drawn first (most polished), then UnDraw imports, then AI.
const SOURCE_ORDER: Source[] = ['drawn', 'undraw', 'ai'];

/** Classify a library item by where it came from, from its raw tags. */
function sourceOf(rawTags: string[]): Source {
  if (rawTags.includes('undraw') || rawTags.includes('external')) return 'undraw';
  if (rawTags.includes('made-with-ai')) return 'ai';
  return 'drawn';
}

function allItems(): Item[] {
  const out: Item[] = Object.entries(icons).map(([name, d]) => ({
    name, icon: d, description: d.description, tags: d.tags.filter((t) => t !== 'made-with-ai' && t !== 'clipart' && t !== 'undraw' && t !== 'external'),
    kind: d.parts ? 'clipart' : d.tags.includes('logo') ? 'logo' : 'icon', mine: name in userItems,
    source: sourceOf(d.tags),
  }));
  for (const [name, m] of Object.entries(isoModels)) {
    const tags = (userItems[name] as { tags?: string[] } | undefined)?.tags ?? [];
    out.push({ name, model: m, description: m.description, tags: tags.filter((t) => t !== 'made-with-ai'), kind: '3d', mine: name in userItems, source: sourceOf(tags) });
  }
  return out;
}

interface Props {
  onClose: () => void;
  /** Present when opened from the editor: puts the item (or a picture from Media) on the board. */
  onAdd?: (item: { kind: 'icon' | 'iso'; name: string } | { kind: 'image'; image: PlacedImage }) => void;
  /** Opens "New with AI" for this kind of item, optionally continuing from an existing one. */
  onCreate?: (kind: 'icon' | 'logo' | 'clipart' | '3d', start?: CreatorStart) => void;
  /** Something in the library changed (renamed, deleted, edited). */
  onChanged?: () => void;
  /** Bumped from outside when something was added (e.g. made with AI). */
  version?: number;
}

/** The whole library full screen: browse, search, preview drawing in, and manage what you made. */
export function LibraryManager({ onClose, onAdd, onCreate, onChanged, version: outside = 0 }: Props) {
  const [version, setVersion] = useState(0);
  const items = useMemo(allItems, [version, outside]);
  const [group, setGroup] = useState<LibraryGroup | 'media'>('all');
  const media = useMediaList(outside);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string | null>(null);

  const changed = () => { setVersion((v) => v + 1); onChanged?.(); };

  const counts = useMemo(() => Object.fromEntries(GROUPS.map((g) => [g.group, items.filter((i) => inGroup(i, g.group)).length])), [items]);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items
      .filter((i) => inGroup(i, group as LibraryGroup))
      .filter((i) => !q || i.name.includes(q) || i.tags.some((t) => t.includes(q)) || i.description.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [items, group, query]);
  // Within a specific category, split into sections by source (hand-drawn / UnDraw / AI).
  // Under "Everything" skip subheadings — too many kinds mixed to make the split meaningful.
  const sections = useMemo(() => {
    if (group === 'all') return [{ source: null as Source | null, items: shown }];
    const bySource = new Map<Source, Item[]>();
    for (const item of shown) {
      const list = bySource.get(item.source) ?? [];
      list.push(item);
      bySource.set(item.source, list);
    }
    return SOURCE_ORDER
      .filter((s) => bySource.has(s))
      .map((source) => ({ source, items: bySource.get(source)! }));
  }, [shown, group]);
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
        <input className="search" autoFocus placeholder={group === 'media' ? `Search ${media.items.length} pictures, recordings and sounds by name…` : `Search ${items.length} icons, logos, clipart and 3D models…`} value={query} onChange={(e) => setQuery(e.target.value)} />
        <span className="spacer" />
        {onCreate && (
          <div className="new-ai">
            <span className="muted">New with AI:</span>
            <button onClick={() => onCreate('icon')}>Icon</button>
            <button onClick={() => onCreate('logo')}>Logo</button>
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
          <button className={`media-nav ${group === 'media' ? 'on' : ''}`} onClick={() => { setGroup('media'); media.reload(); }} title="Pictures, screen recordings and sounds used on boards">
            <span>Media</span><span className="count">{media.available ? `${media.items.length} · ${formatBytes(media.totalBytes)}` : ''}</span>
          </button>
          <p className="muted small">Things you make with AI are saved in <code>library/</code> next to your presentations, and models writing presentations can use them.</p>
        </nav>
        {group === 'media' ? (
          <MediaPanel {...media} query={query} onPlace={onAdd && ((image) => onAdd({ kind: 'image', image }))} onClose={onClose} />
        ) : (<>
        <div className="libman-main">
          {shown.length === 0 && <p className="muted">Nothing matches.</p>}
          {sections.map(({ source, items: list }) => (
            <section key={source ?? 'all'} className="libman-section">
              {source && <h3 className="libman-section-head">{SOURCE_LABEL[source]} <span className="count">{list.length}</span></h3>}
              <div className="libman-grid">
                {list.map((i) => (
                  <div
                    key={`${i.kind}:${i.name}`}
                    className={`lib-tile k-${i.kind} ${selected === keyOf(i) ? 'on' : ''}`}
                    onClick={() => setSelected(keyOf(i))}
                    onDoubleClick={() => onAdd && (onAdd({ kind: i.kind === '3d' ? 'iso' : 'icon', name: i.name }), onClose())}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelected(keyOf(i)); } }}
                    title={i.description}
                    role="button"
                    tabIndex={0}
                  >
                    <span className="art"><Thumb item={i} /></span>
                    <span className="name">{i.name}</span>
                    <TileDelete item={i} onDone={() => { if (selected === keyOf(i)) setSelected(null); changed(); }} />
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
        <aside className="libman-detail">
          {current ? (
            <Detail key={`${keyOf(current)}:${version}:${outside}`} item={current} onRefine={onCreate && ((start) => onCreate(start.kind, start))} onAdd={onAdd && ((it) => { onAdd(it); onClose(); })} onChanged={changed} onGone={() => setSelected(null)} onRenamed={(to) => { setSelected(`${current.kind}:${to}`); changed(); }} />
          ) : (
            <p className="muted">Select something to see it drawn and its details.{onAdd ? ' Double-click to put it on the board.' : ''}</p>
          )}
        </aside>
        </>)}
      </div>
    </div>
  );
}

function inGroup(i: Item, g: LibraryGroup) {
  return g === 'all' || i.kind === g;
}

/** Hover-revealed × that deletes a library item after confirmation. */
function TileDelete({ item, onDone }: { item: Item; onDone: () => void }) {
  if (!(item.name in userItems)) return null;
  const onClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const ok = await confirmDialog({
      title: `Delete “${item.name}” from your library?`,
      message: `Presentations that use it will show an error where it was. This can't be undone.`,
      confirm: 'Delete', danger: true,
    });
    if (!ok) return;
    try { await deleteFromLibrary(item.name); onDone(); } catch (err) { alert((err as Error).message); }
  };
  return (
    <button type="button" className="tile-delete" onClick={onClick} title="Delete this from the library" aria-label={`Delete ${item.name}`}>✕</button>
  );
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
function Detail({ item, onAdd, onRefine, onChanged, onGone, onRenamed }: {
  item: Item;
  onRefine?: (start: CreatorStart) => void;
  onAdd?: (it: { kind: 'icon' | 'iso'; name: string }) => void;
  onChanged: () => void;
  onGone: () => void;
  onRenamed: (to: string) => void;
}) {
  // Cliparts default to white so the multi-colour illustration reads as it does on a presentation
  // whose default element colour is white; swatches still let you flip through markers to see it
  // in another dominant. Single-colour items keep the cyan default they always had.
  const [color, setColor] = useState<ColorName>(() => (item.kind === 'clipart' ? 'white' : 'cyan'));
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
      <MarkerTray value={color} onChange={setColor} />
      <div className="detail-head">
        <h3>{item.name}</h3>
        <span className="kind">{KIND_LABEL[item.kind]}</span>
        <span className="kind">{SOURCE_LABEL[item.source].toLowerCase()}</span>
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
        {onRefine && (
          <button
            title="Talk it over with a model and save the result over this one"
            onClick={() => onRefine({
              kind: item.kind === '3d' ? '3d' : item.kind === 'clipart' ? 'clipart' : item.kind === 'logo' ? 'logo' : 'icon',
              from: item.name,
              // Always refine in place: the whole library is the user's, including the built-ins
              // that shipped with the app. If no library/ file exists yet, saving creates one that
              // shadows the built-in — deleting it later restores the original.
              name: item.name,
              description: item.description,
              value: item.kind === '3d' ? { kind: 'iso', description: item.description, tags: item.tags, parts: item.model!.parts } : { ...item.icon },
            })}
          >
            Refine with AI
          </button>
        )}
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
