import { useMemo } from 'react';
import type { CompiledScene } from '../../engine';
import { palette, type ColorName } from '../../engine/palette';

/** Each element's marker colour (as it ends the scene) and type, for the storyboard's chips and "+ action". */
export function useElementInfo(scene: CompiledScene | undefined) {
  return useMemo(() => ({
    colors: Object.fromEntries((scene?.elements ?? []).map((e) => [e.id, palette[(scene?.final[e.id]?.color ?? e.color ?? 'white') as ColorName] ?? palette.white])),
    types: Object.fromEntries((scene?.elements ?? []).map((e) => [e.id, e.type])) as Record<string, string>,
  }), [scene]);
}
