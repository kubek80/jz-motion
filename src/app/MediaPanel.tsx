import { useMemo, useRef, useState } from 'react';
import { confirmDialog } from './confirm';
import type { PlacedImage } from './images';
import { MediaDetail } from './MediaDetail';
import { MediaThumb } from './MediaThumb';
import { addMedia, deleteMedia, formatBytes, KIND_LABEL, measure, type MediaEntry, type MediaItem } from './media';

// The Library window's "Media" view: every picture, recording and sound in media/, with import (converted on
// the way in), filters, a detail panel and a clean-up of what nothing uses.

type Filter = 'all' | 'picture' | 'recording' | 'sound' | 'unused';
const FILTERS: { filter: Filter; label: string }[] = [
  { filter: 'all', label: 'All' },
  { filter: 'picture', label: 'Pictures' },
  { filter: 'recording', label: 'Recordings' },
  { filter: 'sound', label: 'Sounds' },
  { filter: 'unused', label: 'Unused' },
];
const matches = (i: MediaItem, f: Filter) =>
  f === 'all' || (f === 'unused' ? i.usedBy.length === 0 : f === 'picture' ? i.kind === 'picture' || i.kind === 'drawing' : i.kind === f);

/** One file being imported: converting, then what it became (or why it failed). */
interface Upload { key: number; name: string; bytes: number; entry?: MediaEntry; error?: string }

interface Props {
  items: MediaItem[];
  available: boolean;
  reload: () => void;
  /** The search box in the window's header. */
  query: string;
  /** Present when opened from the editor: puts a picture on the board. */
  onPlace?: (image: PlacedImage) => void;
  /** Leaves the Library window (after putting something on the board, or opening a presentation). */
  onClose: () => void;
}

export function MediaPanel({ items, available, reload, query, onPlace, onClose }: Props) {
  const [filter, setFilter] = useState<Filter>('all');
  const [selected, setSelected] = useState<string | null>(null);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nextKey = useRef(0);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((i) => matches(i, filter) && (!q || i.name.toLowerCase().includes(q)));
  }, [items, filter, query]);
  const unused = items.filter((i) => i.usedBy.length === 0);
  const current = items.find((i) => i.file === selected) ?? null;

  const importFiles = async (files: File[]) => {
    const batch = files.map((f) => ({ key: nextKey.current++, name: f.name, bytes: f.size }));
    setUploads((u) => [...batch, ...u].slice(0, 12));
    const update = (key: number, patch: Partial<Upload>) => setUploads((u) => u.map((x) => (x.key === key ? { ...x, ...patch } : x)));
    // One at a time: converting video is heavy, and the list fills in order.
    for (const [n, f] of files.entries()) {
      try {
        const entry = await addMedia(f, f.name);
        update(batch[n].key, { entry });
        if (files.length === 1) setSelected(entry.file);
      } catch (e) {
        update(batch[n].key, { error: (e as Error).message });
      }
      reload();
    }
  };

  const cleanUp = async () => {
    const bytes = unused.reduce((a, i) => a + i.bytes, 0);
    const ok = await confirmDialog({
      title: `Remove ${unused.length} unused ${unused.length === 1 ? 'item' : 'items'}?`,
      message: `Nothing uses ${unused.length === 1 ? 'it' : 'them'}; this frees ${formatBytes(bytes)}. This can't be undone.`,
      confirm: 'Remove', danger: true,
    });
    if (!ok) return;
    setError(null);
    try {
      for (const i of unused) await deleteMedia(i.file);
      if (current && current.usedBy.length === 0) setSelected(null);
    } catch (e) {
      setError((e as Error).message);
    }
    reload();
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length) void importFiles(files);
  };

  if (!available) {
    return <div className="libman-main"><p className="muted">The media library needs the local server (<code>npm run dev</code>).</p></div>;
  }

  return (
    <>
      <div
        className={`libman-main media-main ${dragging ? 'dragging' : ''}`}
        onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setDragging(true); } }}
        onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false); }}
        onDrop={onDrop}
      >
        <div className="media-bar">
          <div className="chips">
            {FILTERS.map((f) => (
              <button key={f.filter} className={filter === f.filter ? 'on' : ''} onClick={() => setFilter(f.filter)}>
                {f.label} <span className="count">{items.filter((i) => matches(i, f.filter)).length}</span>
              </button>
            ))}
          </div>
          <span className="spacer" />
          <button disabled={unused.length === 0} onClick={() => void cleanUp()} title="Remove everything no presentation uses">Clean up</button>
          <label className="file-button primary-like" title="Pictures, screen recordings (APNG, GIF, MP4, MOV, WebM) and sounds; you can also drop files here">
            Import…
            <input type="file" multiple accept="image/*,video/*,audio/*,.apng" onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              e.target.value = '';
              if (files.length) void importFiles(files);
            }} />
          </label>
        </div>
        {uploads.length > 0 && (
          <ul className="media-uploads">
            {uploads.map((u) => (
              <li key={u.key} className={u.error ? 'bad' : u.entry ? 'ok' : 'busy'}>
                <span className="name">{u.name}</span>
                <span className="muted">
                  {u.error ? `Could not import: ${u.error}`
                    : u.entry ? `${formatBytes(u.entry.bytes)} ${KIND_LABEL[u.entry.kind].toLowerCase()} (was ${formatBytes(u.bytes)})`
                    : 'Converting…'}
                </span>
              </li>
            ))}
            <li className="dismiss"><button onClick={() => setUploads((u) => u.filter((x) => !x.entry && !x.error))}>Hide</button></li>
          </ul>
        )}
        {error && <p className="error-text">{error}</p>}
        {items.length === 0 && <p className="muted">Nothing here yet. Import pictures, screen recordings or sounds, or drop them here. Pictures you paste or drop on the board land here too.</p>}
        {items.length > 0 && shown.length === 0 && <p className="muted">Nothing matches.</p>}
        <div className="media-grid">
          {shown.map((i) => (
            <div
              key={i.file}
              className={`media-tile k-${i.kind} ${selected === i.file ? 'on' : ''}`}
              onClick={() => setSelected(i.file)}
              onDoubleClick={() => onPlace && placeable(i) && (onPlace(placed(i)), onClose())}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelected(i.file); } }}
              role="button"
              tabIndex={0}
              title={i.name}
            >
              <MediaThumb item={i} />
              <span className="name">{i.name}</span>
              <span className="meta">{KIND_LABEL[i.kind]} · {formatBytes(i.bytes)}{measure(i) && ` · ${measure(i)}`}</span>
              {i.usedBy.length === 0 && <span className="unused" title="No presentation uses this">unused</span>}
            </div>
          ))}
        </div>
        {dragging && <div className="media-drop">Drop to add to the media library</div>}
      </div>
      <aside className="libman-detail">
        {current ? (
          <MediaDetail
            key={`${current.file}:${current.name}`}
            item={current}
            onPlace={onPlace && placeable(current) ? () => { onPlace(placed(current)); onClose(); } : undefined}
            onOpen={onClose}
            onChanged={reload}
            onGone={() => { setSelected(null); reload(); }}
          />
        ) : (
          <p className="muted">
            Select something to see it, where it is used, and to rename or delete it.{onPlace ? ' Double-click a picture to put it on the board.' : ''}
          </p>
        )}
      </aside>
    </>
  );
}

/** Only still pictures and drawings go on the board as images for now. */
const placeable = (i: MediaEntry) => i.kind === 'picture' || i.kind === 'drawing';
const placed = (i: MediaEntry): PlacedImage => ({ src: i.src, width: i.width ?? 800, height: i.height ?? 600 });
