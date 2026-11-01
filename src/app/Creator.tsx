import { useState } from 'react';
import { insertScene, checkScene, sceneMessages, SCENE_TASK } from '../ai/assistant';
import { askJson, type AskResult, type ChatMessage, type Check } from '../ai/client';
import { checkDrawing, checkIso, CLIPART_RULES, drawingMessages, ICON_RULES, ISO_RULES, isoMessages } from '../ai/iconPrompt';
import { loadProfiles, type ModelProfile } from '../ai/profiles';
import { isoModels, projectIso, type IsoPart } from '../engine/iso';
import { icons, type IconDef } from '../engine/library';
import { IconPreview } from './editor/IconPreview';
import { ModelsEditor } from './ModelsEditor';
import { Preview } from './Preview';
import { saveToLibrary } from './userLibrary';

export type CreateKind = 'scene' | 'icon' | 'clipart' | '3d';

/* eslint-disable @typescript-eslint/no-explicit-any */
interface Run { profile: ModelProfile; result?: AskResult<any> }

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').replace(/^(\d)/, 'x$1');

const KINDS: { kind: CreateKind; label: string; hint: string; example: string }[] = [
  { kind: 'scene', label: 'Scene', hint: 'A new scene for this presentation, added after the current one', example: 'e.g. how a request flows through an API gateway to three microservices, then zoom into the auth service' },
  { kind: 'icon', label: 'Icon', hint: 'Single-colour line icon on a 24×24 grid; takes the element\'s colour', example: 'e.g. a vector database: a cylinder with three small dots connected by lines on its front' },
  { kind: 'clipart', label: 'Clipart', hint: 'Multi-colour drawing in the marker colours', example: 'e.g. a friendly robot holding a glowing GPU card, cyan body, pink GPU' },
  { kind: '3d', label: '3D model', hint: 'Isometric model from boxes and cylinders; can turn, spin and explode', example: 'e.g. a GPU server: a flat base, four tall cards standing on it, a fan cylinder on top' },
];

const RULES: Record<CreateKind, string> = {
  scene: `${SCENE_TASK}\n\n(Plus the presentation itself and the full format reference and library, as for every presentation request.)`,
  icon: ICON_RULES,
  clipart: CLIPART_RULES,
  '3d': ISO_RULES,
};

interface Props {
  initialKind: CreateKind;
  /** The presentation and the scene being edited (scenes are added after it). */
  presentation: string;
  scene: number;
  onClose: () => void;
  /** A library item (icon, clipart, 3D model) was saved under `name`. */
  onSaved: (kind: CreateKind, name: string) => void;
  /** A scene to add after the current one. */
  onAddScene: (scene: Record<string, unknown>) => void;
}

/** Describe something; models make it under the shown rules; keep the one you like. */
export function Creator({ initialKind, presentation, scene, onClose, onSaved, onAddScene }: Props) {
  const [kind, setKind] = useState<CreateKind>(initialKind);
  const [description, setDescription] = useState('');
  const [name, setName] = useState('');
  const [profiles, setProfiles] = useState<ModelProfile[]>(loadProfiles);
  const [managing, setManaging] = useState(false);
  const [runs, setRuns] = useState<Run[]>([]);
  const [error, setError] = useState<string | null>(null);
  const enabled = profiles.filter((p) => p.enabled);
  const running = runs.some((r) => !r.result);
  const info = KINDS.find((k) => k.kind === kind)!;
  const finalName = slug(name || description.split(/\s+/).slice(0, 3).join(' '));
  const taken = kind !== 'scene' && !!finalName && (kind === '3d' ? finalName in isoModels : finalName in icons);

  const request = (): [ChatMessage[], (v: unknown) => Check<any>] => {
    switch (kind) {
      case 'scene': return [sceneMessages(description, presentation, scene), checkScene(presentation, scene)];
      case '3d': return [isoMessages(description), checkIso];
      default: return [drawingMessages(kind, description), checkDrawing(kind)];
    }
  };

  const generate = () => {
    setError(null);
    const [messages, check] = request();
    setRuns(enabled.map((profile) => ({ profile })));
    for (const profile of enabled) {
      void askJson(profile, messages, check).then((result) => setRuns((rs) => rs.map((r) => (r.profile.id === profile.id ? { ...r, result } : r))));
    }
  };

  const keep = async (value: any) => {
    try {
      if (kind === 'scene') return onAddScene(value);
      await saveToLibrary(finalName, value);
      onSaved(kind, finalName);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const preview = (value: any) => {
    if (kind === 'scene') {
      const { doc, index } = insertScene(JSON.parse(presentation), value, scene);
      return <Preview json={JSON.stringify(doc)} scene={index} className="preview" />;
    }
    if (kind === '3d') return <Preview json={isoPreview(value.parts)} className="preview" />;
    return <IconPreview def={value as IconDef} size={kind === 'icon' ? 96 : 200} color="#3ef0ff" />;
  };

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>New {info.label.toLowerCase()} with AI</h2>
          <button onClick={onClose} title="Close">✕</button>
        </div>
        <div className="toggle small">
          {KINDS.map((k) => (
            <button key={k.kind} className={kind === k.kind ? 'on' : ''} title={k.hint} onClick={() => { setKind(k.kind); setRuns([]); }}>{k.label}</button>
          ))}
        </div>
        <p className="muted hint">{info.hint}.</p>
        <textarea rows={3} value={description} placeholder={info.example} onChange={(e) => setDescription(e.target.value)} />
        {kind !== 'scene' && <label className="field"><span>name</span><input value={name} placeholder={finalName || 'name'} onChange={(e) => setName(e.target.value)} /></label>}
        {taken && <p className="error-text">“{finalName}” is already in the library; saving replaces it.</p>}
        <details>
          <summary>Rules sent to the model with your description</summary>
          <pre className="rules">{RULES[kind]}</pre>
        </details>
        <div className="row">
          <button className="primary" disabled={!description.trim() || !enabled.length || running} onClick={generate}>
            {running ? 'Working…' : `Make it with ${enabled.length} model${enabled.length === 1 ? '' : 's'}`}
          </button>
          <button onClick={() => setManaging(!managing)}>{managing ? 'Done' : 'Models…'}</button>
        </div>
        {managing && <ModelsEditor onChange={setProfiles} />}
        <div className={kind === 'scene' || kind === '3d' ? 'drawings wide' : 'drawings'}>
          {runs.map((r) => (
            <div key={r.profile.id} className={`drawing ${r.result ? (r.result.ok ? 'ok' : 'bad') : ''}`}>
              <div className="drawing-art">
                {r.result?.ok ? preview(r.result.value) : <span className="muted">{r.result ? 'nothing usable' : 'working…'}</span>}
              </div>
              <div className="muted drawing-meta">{r.profile.name}{r.result ? ` · ${(r.result.ms / 1000).toFixed(1)}s${r.result.attempts > 1 ? ` · ${r.result.attempts} tries` : ''}` : ''}</div>
              {r.result && !r.result.ok && <details className="error-text"><summary>{r.result.errors.length} problems</summary><ul>{r.result.errors.slice(0, 8).map((e: string) => <li key={e}>{e}</li>)}</ul></details>}
              {r.result?.ok && (
                <button disabled={kind !== 'scene' && !finalName} onClick={() => void keep(r.result!.value)}>
                  {kind === 'scene' ? 'Add this scene' : `Save as “${finalName}”`}
                </button>
              )}
            </div>
          ))}
        </div>
        {error && <p className="error-text">{error}</p>}
      </div>
    </div>
  );
}

/** A one-element presentation showing a 3D model, scaled to fill the board. */
function isoPreview(parts: IsoPart[]): string {
  const box = projectIso(parts, { rotate: 0, explode: 0 }, 1).box;
  const scale = Math.min(1300 / Math.max(box.width, 0.1), 760 / Math.max(box.height, 0.1));
  return JSON.stringify({ version: 1, title: 'preview', scenes: [{ id: 'p', elements: [{ id: 'm', type: 'iso', parts, x: 960, y: 540, scale, color: 'cyan' }], beats: [] }] });
}
