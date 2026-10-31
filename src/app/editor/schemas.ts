import { z } from 'zod';
import { Action, Beat, Element, Presentation, Scene } from '../../engine/schema';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Obj = { properties: Record<string, any>; required?: string[] };

const json = (s: z.ZodType) => z.toJSONSchema(s, { io: 'input', unrepresentable: 'any' }) as any;
const byConst = (union: any, key: string): Record<string, Obj> =>
  Object.fromEntries((union.oneOf ?? union.anyOf).map((v: Obj) => [v.properties[key].const, v]));

/** JSON Schema of each element type and action, for generated forms. */
export const elementSchemas = byConst(json(Element), 'type');
export const actionSchemas = byConst(json(Action), 'do');
export const beatSchema: Obj = json(Beat);
export const sceneSchema: Obj = json(Scene);
export const presentationSchema: Obj = json(Presentation);
export const actionKinds = Object.keys(actionSchemas);
