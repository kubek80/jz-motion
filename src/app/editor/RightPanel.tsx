// The editor's right-hand panel: Properties (the inspector for the picked elements, beat or scene),
// JSON, AI chat and Video tabs, and the list of errors while the presentation doesn't compile.
import type { CompileResult } from '../../engine';
import type { Camera } from '../../engine/schema';
import { AiPanel } from '../AiPanel';
import type { ChatMessageView } from '../Chat';
import { log } from '../debug';
import { rememberFrame } from '../images';
import { JsonPanel } from '../JsonPanel';
import { VideoPanel } from '../VideoPanel';
import { updateBeats, updateElement, updateScene, type Raw, type RawDoc } from './doc';
import { Inspector } from './Inspector';
import type { Selection } from './types';

export type Panel = 'props' | 'json' | 'ai' | 'video';

interface Props {
  id: string;
  text: string;
  doc: RawDoc | null;
  result: CompileResult | { ok: false; errors: string[] };
  mode: 'edit' | 'play';
  panel: Panel;
  setPanel: (p: Panel) => void;
  sceneIndex: number;
  picked: string[];
  setPicked: (ids: string[]) => void;
  editable: Set<string>;
  ids: string[];
  selection: Selection;
  setSelection: (s: Selection) => void;
  /** Number of beats in the open scene (a new beat goes after them). */
  beatCount: number;
  update: (next: RawDoc) => void;
  /** Sets the presentation text as it comes from the AI or JSON panels. */
  history: { set: (value: string, opts?: { merge?: boolean }) => void };
  chatLog: ChatMessageView[];
  setChatLog: (log: ChatMessageView[]) => void;
  /** Changes when a take is added, so the Video tab lists it; `madeTake` is selected there. */
  videoRefreshKey: string;
  madeTake: string | undefined;
  pinPatch: (id: string, pin: boolean) => Raw;
  rename: (from: string, to: string) => string | null;
  deletePicked: (list: string[]) => void;
  duplicate: (id: string) => void;
  replaceAll: (value: string) => void;
  currentView: () => Camera;
}

export function RightPanel(p: Props) {
  const { text, doc, result, mode, panel, setPanel, sceneIndex, picked, update, history } = p;
  return (
    <aside className="right">
      <div className="tabs">
        <button className={panel === 'props' ? 'on' : ''} onClick={() => setPanel('props')} disabled={mode !== 'edit'}>Properties</button>
        <button className={panel === 'json' || (mode !== 'edit' && panel === 'props') ? 'on' : ''} onClick={() => setPanel('json')}>JSON</button>
        <button className={panel === 'ai' ? 'on' : ''} onClick={() => setPanel('ai')}>AI</button>
        <button className={panel === 'video' ? 'on' : ''} onClick={() => setPanel('video')}>Video</button>
      </div>
      {panel === 'ai' ? (
        <AiPanel current={text} scene={sceneIndex} onUse={(json) => { log('ai:aiPanel', { bytes: json.length }); history.set(json); }} chat={p.chatLog} onChat={p.setChatLog} />
      ) : panel === 'video' ? (
        <VideoPanel presentation={text} presentationId={p.id} refreshKey={p.videoRefreshKey} select={p.madeTake} />
      ) : mode === 'edit' && panel === 'props' && doc ? (
        <Inspector
          doc={doc}
          scene={sceneIndex}
          picked={picked}
          editable={p.editable}
          ids={p.ids}
          selection={p.selection}
          onElement={(id, k, v) => { if (k === 'frame') rememberFrame(v); update(updateElement(doc, sceneIndex, id, k === 'line' ? { line: v, dashed: undefined } : k === 'pinned' ? p.pinPatch(id, !!v) : { [k]: v })); }}
          onRename={p.rename}
          onDelete={p.deletePicked}
          onDuplicate={p.duplicate}
          onAddBeat={(beat) => {
            const n = p.beatCount;
            update(updateBeats(doc, sceneIndex, (beats) => [...beats, beat as (typeof beats)[number]]));
            p.setPicked([]);
            p.setSelection({ kind: 'beat', beat: n });
          }}
          onAction={(bi, ai, next) => update(updateBeats(doc, sceneIndex, (beats) => beats.map((b, i) => (i === bi ? { ...b, actions: b.actions.map((a, j) => (j === ai ? next : a)) } : b))))}
          onBeat={(bi, k, v) => update(updateBeats(doc, sceneIndex, (beats) => beats.map((b, i) => {
            if (i !== bi) return b;
            const next: Raw = { ...b, [k]: v };
            if (v === undefined) delete next[k];
            return next as typeof b;
          })))}
          onScene={(k, v) => update(updateScene(doc, sceneIndex, { [k]: v }))}
          onTitle={(title) => update({ ...doc, title })}
          currentView={p.currentView}
        />
      ) : (
        <JsonPanel text={text} scene={sceneIndex} errors={result.ok ? [] : result.errors} onText={(v) => { log('jsonPanel', { bytes: v.length }); history.set(v, { merge: true }); }} onReplace={p.replaceAll} />
      )}
      {!result.ok && (
        <ul className="errors">
          {result.errors.map((e) => <li key={e}>{e}</li>)}
        </ul>
      )}
    </aside>
  );
}
