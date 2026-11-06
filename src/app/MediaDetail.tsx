import { useState } from 'react';
import { confirmDialog } from './confirm';
import { SoundGlyph } from './MediaThumb';
import { deleteMedia, formatBytes, formatDuration, KIND_LABEL, originalType, renameMedia, type MediaItem } from './media';

/** The selected media file: a large preview, its details, where it is used, and what you can do with it. */
export function MediaDetail({ item, onPlace, onOpen, onChanged, onGone }: {
  item: MediaItem;
  /** Present when opened from the editor and the item can go on the board. */
  onPlace?: () => void;
  /** A presentation link was followed (the window closes). */
  onOpen: () => void;
  onChanged: () => void;
  onGone: () => void;
}) {
  const [name, setName] = useState(item.name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const dirty = name.trim() !== '' && name.trim() !== item.name;

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try { await fn(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  const save = () => run(async () => { await renameMedia(item.file, name.trim()); onChanged(); });

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(item.src);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError(`Could not copy; the reference is ${item.src}`);
    }
  };

  const remove = async () => {
    const ok = await confirmDialog({
      title: `Delete “${item.name}”?`,
      message: `The file is removed from the media library (${formatBytes(item.bytes)}). This can't be undone.`,
      confirm: 'Delete', danger: true,
    });
    if (!ok) return;
    await run(async () => {
      const r = await deleteMedia(item.file);
      if (r.ok) return onGone();
      const anyway = await confirmDialog({
        title: `“${item.name}” is used in ${r.usedBy.length === 1 ? 'a presentation' : `${r.usedBy.length} presentations`}`,
        message: `${r.usedBy.map((u) => `“${u.title}”`).join(', ')} will show an empty frame where it was.`,
        confirm: 'Delete anyway', danger: true,
      });
      if (!anyway) return;
      await deleteMedia(item.file, true);
      onGone();
    });
  };

  const was = item.original && (item.original.bytes !== item.bytes || originalType(item.original.name) !== item.file.split('.').pop()!.toUpperCase());

  return (
    <div className="detail media-detail">
      <div className="media-preview">
        {item.kind === 'recording' ? <video src={item.src} poster={item.poster} controls muted loop playsInline autoPlay />
          : item.kind === 'sound' ? <div className="sound"><SoundGlyph size={90} /><audio src={item.src} controls /></div>
          : <img src={item.src} alt={item.name} />}
      </div>
      <div className="detail-head">
        <h3>{item.name}</h3>
        <span className="kind">{KIND_LABEL[item.kind].toLowerCase()}</span>
        {item.usedBy.length === 0 && <span className="kind unused">unused</span>}
      </div>
      <dl className="media-facts">
        <dt>Size</dt>
        <dd>
          {formatBytes(item.bytes)} {item.file.split('.').pop()!.toUpperCase()}
          {was && item.original && <span className="muted">, converted from {formatBytes(item.original.bytes)} {originalType(item.original.name)}</span>}
        </dd>
        {item.width !== undefined && <><dt>Dimensions</dt><dd>{item.width}×{item.height}</dd></>}
        {item.duration !== undefined && <><dt>Length</dt><dd>{formatDuration(item.duration)}</dd></>}
        {item.original && <><dt>Original</dt><dd className="ellipsis" title={item.original.name}>{item.original.name}</dd></>}
        <dt>Added</dt><dd>{new Date(item.added).toLocaleString()}</dd>
      </dl>
      <div className="detail-form">
        <label><span>name</span><input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && dirty) void save(); }} /></label>
      </div>
      <div className="media-used">
        <h4>Used in</h4>
        {item.usedBy.length === 0 ? <p className="muted small">Nothing uses this yet.</p> : (
          <ul>
            {item.usedBy.map((u) => (
              <li key={u.id}>
                {u.id.startsWith('example:') ? <span title="An example shipped with the app">{u.title} <span className="muted">(example)</span></span>
                  : <a href={`#/p/${u.id}`} onClick={onOpen}>{u.title}</a>}
              </li>
            ))}
          </ul>
        )}
      </div>
      <details className="snippet">
        <summary>Use it in JSON</summary>
        <code>{item.src}</code>
      </details>
      {error && <p className="error-text">{error}</p>}
      <div className="row wrap">
        {onPlace && <button className="primary" onClick={onPlace}>Put on the board</button>}
        <button onClick={() => void copy()} title={`Copies "${item.src}", the reference presentations use`}>{copied ? 'Copied' : 'Copy reference'}</button>
        <button disabled={!dirty || busy} onClick={() => void save()}>Save name</button>
        <button className="danger" disabled={busy} onClick={() => void remove()}>Delete</button>
      </div>
    </div>
  );
}
