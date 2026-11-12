import { useEffect } from 'react';

// Where you are, kept in the address, so a reload lands you back there:
//
//   #/p/<id>[/<window>…][?scene=<n>&tab=<tab>&t=<seconds>&at=<scene>.<beat>]
//
// the presentation; the windows open over the editor (timing, script, settings, library; Script can sit over
// Timing: /timing/script); the scene shown in the editor (from 1, as the scene list numbers them); the right
// panel's tab; Timing's playhead; and the beat the Script page was opened at. Changes replace the address
// (history.replaceState), so moving around doesn't fill the back button.

export type View = 'timing' | 'script' | 'settings' | 'library';
const VIEWS: View[] = ['timing', 'script', 'settings', 'library'];
const TABS = ['props', 'json', 'ai', 'video'] as const;
export type Tab = (typeof TABS)[number];

export interface Route {
  id: string | null;
  views: View[];
  /** Index of the scene (0 = the first). */
  scene?: number;
  tab?: Tab;
  /** Timing's playhead, in seconds. */
  t?: number;
  /** The beat the Script page opened at. */
  at?: { scene: number; beat: number };
}

export function parseRoute(hash: string): Route {
  const m = /^#\/p\/([\w-]+)((?:\/[a-z]+)*)(?:\?(.*))?$/.exec(hash);
  if (!m) return { id: null, views: [] };
  const views = m[2].split('/').filter((v): v is View => (VIEWS as string[]).includes(v));
  const q = new URLSearchParams(m[3] ?? '');
  const num = (k: string) => { const v = Number(q.get(k)); return q.has(k) && Number.isFinite(v) ? v : undefined; };
  const scene = num('scene');
  const tab = q.get('tab');
  const at = /^(\d+)\.(\d+)$/.exec(q.get('at') ?? '');
  return {
    id: m[1],
    views,
    ...(scene !== undefined && scene >= 1 ? { scene: Math.floor(scene) - 1 } : {}),
    ...(tab && (TABS as readonly string[]).includes(tab) ? { tab: tab as Tab } : {}),
    ...(num('t') !== undefined && num('t')! >= 0 ? { t: num('t') } : {}),
    ...(at ? { at: { scene: Number(at[1]) - 1, beat: Number(at[2]) - 1 } } : {}),
  };
}

export function formatRoute(r: Route): string {
  if (!r.id) return '';
  const q = new URLSearchParams();
  if (r.scene) q.set('scene', String(r.scene + 1));
  if (r.tab && r.tab !== 'props') q.set('tab', r.tab);
  if (r.t !== undefined) q.set('t', String(Math.round(r.t * 10) / 10));
  if (r.at) q.set('at', `${r.at.scene + 1}.${r.at.beat + 1}`);
  const views = VIEWS.filter((v) => r.views.includes(v));
  const query = q.toString();
  return `#/p/${r.id}${views.map((v) => `/${v}`).join('')}${query ? `?${query}` : ''}`;
}

export const currentRoute = () => parseRoute(location.hash);

/** Changes part of the address, without a new history entry (and without a hashchange). */
export function replaceRoute(patch: Partial<Omit<Route, 'id'>>) {
  const now = currentRoute();
  if (!now.id) return;
  const next = formatRoute({ ...now, ...patch });
  if (next !== location.hash) history.replaceState(history.state, '', next);
}

/**
 * The editor's part of the address: which windows are open, the scene, the tab (once `ready`: the board shows the
 * scene it opened at). Timing's playhead and the Script's beat go when their window does.
 */
export function useAddress(ready: boolean, open: Record<View, boolean>, scene: number, tab: Tab) {
  const views = VIEWS.filter((v) => open[v]);
  const key = views.join('/');
  useEffect(() => {
    if (!ready) return;
    replaceRoute({ views, scene, tab, ...(open.timing ? {} : { t: undefined }), ...(open.script ? {} : { at: undefined }) });
  }, [ready, key, scene, tab]); // eslint-disable-line react-hooks/exhaustive-deps
}

