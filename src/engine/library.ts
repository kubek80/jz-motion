import { generatedIcons } from './icons.generated';

/** A stroke icon on a 24×24 grid. Paths are drawn in order. */
export interface IconDef {
  description: string;
  tags: string[];
  paths: string[];
}

/** Hand-made icons go here; they override generated ones with the same name. */
const customIcons: Record<string, IconDef> = {};

export const icons: Record<string, IconDef> = { ...generatedIcons, ...customIcons };

export const ICON_GRID = 24;
