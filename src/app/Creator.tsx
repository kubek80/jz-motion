import { useEffect, useRef, useState } from 'react';
import { insertScene, checkScene, sceneMessages, SCENE_TASK } from '../ai/assistant';
import { askJson, type AskResult, type ChatMessage, type Check } from '../ai/client';
import { checkDrawing, checkIso, CLIPART_RULES, drawingMessages, ICON_RULES, ISO_RULES, isoMessages, refineMessages, type Refinement } from '../ai/iconPrompt';
import { loadProfiles, type ModelProfile } from '../ai/profiles';
import { isoModels, projectIso, type IsoPart } from '../engine/iso';
import { icons, type IconDef } from '../engine/library';
import { IconPreview } from './editor/IconPreview';
import { ModelsEditor } from './ModelsEditor';
import { ModelSelect } from './ModelSelect';
import { advice, pickFor, rememberedFor, rememberFor, type Task } from '../ai/recommend';
import { Preview } from './Preview';
import { saveToLibrary } from './userLibrary';

export type CreateKind = 'scene' | 'icon' | 'clipart' | '3d';

/** An existing item to continue from ("Refine with AI" in the library). */
export interface CreatorStart {
  kind: Exclude<CreateKind, 'scene'>;
  /** The item it came from. */
  from: string;
  /** Set for your own items: saving under this name updates it. */
  name?: string;
  description: string;
  value: unknown;
}

/** What opens the creator: a kind, and optionally an item to refine. */
export interface CreateRequest { kind: CreateKind; start?: CreatorStart }

/* eslint-disable @typescript-eslint/no-explicit-any */
type Turn =
  | { role: 'user'; text: string }
  | { role: 'assistant'; model: string; result?: AskResult<any>; seeded?: boolean };

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
  /** Continue from an existing library item instead of starting empty. */
  start?: CreatorStart;
  /** The presentation and the scene being edited (scenes are added after it). Without them, scenes can't be made. */
  presentation?: string;
  scene?: number;
  onClose: () => void;
  /** A library item (icon, clipart, 3D model) was saved under `name`. */
  onSaved: (kind: CreateKind, name: string) => void;
  /** A scene to add after the current one. */
  onAddScene?: (scene: Record<string, unknown>) => void;
}

/** Describe something, then talk it over with a model: every reply is a version you can see; keep the one you like. */
export function Creator({ initialKind, start, presentation, scene = 0, onClose, onSaved, onAddScene }: Props) {
  const [kind, setKind] = useState<CreateKind>(start?.kind ?? initialKind);
  const [turns, setTurns] = useState<Turn[]>(() => (start ? [
    { role: 'user', text: start.description },
    { role: 'assistant', model: `“${start.from}” from the library`, seeded: true, result: { ok: true, value: start.value, errors: [], attempts: 0, ms: 0, usage: { prompt: 0, completion: 0 } } },
  ] : []));
  const [input, setInput] = useState('');
  const [name, setName] = useState(start ? start.name ?? `my-${start.from}` : '');
  const [profiles, setProfiles] = useState<ModelProfile[]>(loadProfiles);
  const [picked, setPicked] = useState<Partial<Record<CreateKind, string>>>({});
  const [managing, setManaging] = useState(false);
  const [shown, setShown] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const thread = useRef<HTMLDivElement>(null);

  const kinds = KINDS.filter((k) => k.kind !== 'scene' || (presentation && onAddScene));
  const info = KINDS.find((k) => k.kind === kind)!;
  // Each kind of thing has its own model: the one last used for it, else the one recommended for it.
  const task: Task = kind === 'scene' ? 'scene-new' : kind;
  const profile = pickFor(task, profiles, picked[kind] ?? rememberedFor(task));
  const busy = turns.some((t) => t.role === 'assistant' && !t.result);
  const firstText = turns.find((t) => t.role === 'user')?.text ?? '';
  const finalName = slug(name || firstText.split(/\s+/).slice(0, 3).join(' '));
  const taken = kind !== 'scene' && !!finalName && finalName !== start?.name && (kind === '3d' ? finalName in isoModels : finalName in icons);

  /** Versions are the replies that passed the checks, numbered in order. */
  const versions = turns.flatMap((t, i) => (t.role === 'assistant' && t.result?.ok ? [i] : []));
  const current = shown ?? versions.at(-1) ?? null;
  const currentValue = current !== null ? (turns[current] as Extract<Turn, { role: 'assistant' }>).result!.value : null;

  useEffect(() => {
    thread.current?.scrollTo({ top: thread.current.scrollHeight, behavior: 'smooth' });
  }, [turns.length]);

  const firstMessages = (text: string): [ChatMessage[], (v: unknown) => Check<any>] => {
    switch (kind) {
      case 'scene': return [sceneMessages(text, presentation!, scene), checkScene(presentation!, scene)];
      case '3d': return [isoMessages(text), checkIso];
      default: return [drawingMessages(kind, text), checkDrawing(kind)];
    }
  };

  const send = () => {
    const text = input.trim();
    if (!text || !profile || busy) return;
    rememberFor(task, profile.id);
    setError(null);
    setInput('');
    const asked: Turn[] = [...turns, { role: 'user', text }];
    // The conversation as the model sees it: the first request, then each change with the version it was made to.
    const steps: Refinement[] = [];
    let last: unknown = null;
    for (let i = 0; i < asked.length; i++) {
      const t = asked[i];
      if (t.role === 'assistant' && t.result?.ok) last = t.result.value;
      if (t.role === 'user' && i > 0 && last !== null) steps.push({ previous: last, change: t.text });
    }
    const first = asked.find((t) => t.role === 'user')!.text;
    const [base, check] = firstMessages(first);
    const at = asked.length;
    setTurns([...asked, { role: 'assistant', model: profile.name }]);
    setShown(null);
    void askJson(profile, refineMessages(base, steps), check).then((result) => setTurns((ts) => ts.map((t, i) => (i === at ? { ...t, result } as Turn : t))));
  };

  const keep = async () => {
    if (currentValue === null) return;
    try {
      if (kind === 'scene') return onAddScene?.(currentValue);
      await saveToLibrary(finalName, currentValue);
      onSaved(kind, finalName);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const preview = (value: any, big: boolean) => {
    if (kind === 'scene') {
      const { doc, index } = insertScene(JSON.parse(presentation!), value, scene);
      return <Preview json={JSON.stringify(doc)} scene={index} className="preview" />;
    }
    if (kind === '3d') return <Preview json={isoPreview(value.parts)} className="preview" />;
    return <IconPreview def={value as IconDef} size={big ? (kind === 'icon' ? 220 : 380) : kind === 'icon' ? 56 : 110} color="#3ef0ff" />;
  };

  const started = turns.length > 0;
  const versionOf = (i: number) => versions.indexOf(i) + 1;

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal tall wide creator" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{start ? (start.name ? `Refine “${start.from}” with AI` : `A variation of “${start.from}” with AI`) : `New ${info.label.toLowerCase()} with AI`}</h2>
          <button onClick={onClose} title="Close">✕</button>
        </div>
        <div className="creator-body">
          <div className="creator-chat">
            {!started && (
              <div className="toggle small">
                {kinds.map((k) => (
                  <button key={k.kind} className={kind === k.kind ? 'on' : ''} title={k.hint} onClick={() => setKind(k.kind)}>{k.label}</button>
                ))}
              </div>
            )}
            <div className="creator-thread" ref={thread}>
              {!started && (
                <div className="creator-intro muted">
                  <p>{info.hint}.</p>
                  <p>Describe it and send. Every reply is a version you can look at; then ask for changes (“thicker lines”, “make the GPU pink”, “add a fan on top”) until you like one, and save it.</p>
                </div>
              )}
              {turns.map((t, i) => t.role === 'user' ? (
                <div key={i} className="msg user">{i === 0 && start ? <><span className="muted">Started from: </span>{t.text}</> : t.text}</div>
              ) : (
                <div key={i} className={`msg version ${t.result ? (t.result.ok ? 'ok' : 'bad') : 'pending'} ${current === i ? 'on' : ''}`} onClick={() => t.result?.ok && setShown(i)}>
                  {t.result?.ok ? (
                    <>
                      <div className="version-art">{preview(t.result.value, false)}</div>
                      <div className="version-meta">
                        <b>Version {versionOf(i)}</b>
                        <span className="muted">{t.model}{t.seeded ? '' : ` · ${(t.result.ms / 1000).toFixed(1)}s${t.result.attempts > 1 ? ` · fixed after ${t.result.attempts - 1} ${t.result.attempts === 2 ? 'retry' : 'retries'}` : ''}`}</span>
                      </div>
                    </>
                  ) : t.result ? (
                    <div className="version-meta">
                      <b className="error-text">{t.model} couldn't make a valid one</b>
                      <details className="error-text"><summary>{t.result.errors.length} problems</summary><ul>{t.result.errors.slice(0, 8).map((e: string) => <li key={e}>{e}</li>)}</ul></details>
                      <span className="muted">Ask again, or say it differently.</span>
                    </div>
                  ) : (
                    <div className="version-meta"><span className="muted">{t.model} is working…</span></div>
                  )}
                </div>
              ))}
            </div>
            <div className="creator-input">
              <textarea
                rows={started ? 2 : 3}
                value={input}
                autoFocus
                placeholder={started ? 'What should change? (Enter sends, Shift+Enter for a new line)' : info.example}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
              />
              <div className="row">
                <ModelSelect task={task} profiles={profiles} value={profile?.id} onChange={(id) => { setPicked({ ...picked, [kind]: id }); rememberFor(task, id); }} />
                <button onClick={() => setManaging(!managing)}>{managing ? 'Done' : 'Models…'}</button>
                <span className="spacer" />
                {started && !start && <button onClick={() => { setTurns([]); setShown(null); }} disabled={busy} title="Forget this conversation">Start over</button>}
                <button className="primary" disabled={!input.trim() || !profile || busy} onClick={send}>{busy ? 'Working…' : started ? 'Ask for changes' : 'Make it'}</button>
              </div>
              {profiles.length > 0 && <small className="model-advice">{advice(task, profiles)}</small>}
              {managing && <ModelsEditor onChange={setProfiles} />}
              <details>
                <summary className="muted">Rules the model follows</summary>
                <pre className="rules">{RULES[kind]}</pre>
              </details>
            </div>
          </div>
          <div className="creator-side">
            <div className={`creator-preview ${kind === 'scene' || kind === '3d' ? 'board' : ''}`}>
              {currentValue !== null ? preview(currentValue, true) : <span className="muted">The current version shows here</span>}
            </div>
            {current !== null && <span className="muted">Version {versionOf(current)} of {versions.length}{shown !== null && current !== versions.at(-1) ? ' (an earlier one)' : ''}</span>}
            {kind !== 'scene' && (
              <label className="field"><span>name</span><input value={name} placeholder={finalName || 'name'} onChange={(e) => setName(e.target.value)} /></label>
            )}
            {taken && <p className="error-text">“{finalName}” is already in the library; saving replaces it.</p>}
            {start?.name && finalName === start.name && <p className="muted">Saving updates “{start.name}” in your library.</p>}
            <button className="primary" disabled={currentValue === null || busy || (kind !== 'scene' && !finalName)} onClick={() => void keep()}>
              {kind === 'scene' ? 'Add this scene' : `Save to library as “${finalName || '…'}”`}
            </button>
            {error && <p className="error-text">{error}</p>}
          </div>
        </div>
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
