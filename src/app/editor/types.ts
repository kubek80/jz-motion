/** What the property panel is showing. Selected board elements are tracked separately. */
export type Selection =
  | { kind: 'beat'; beat: number }
  | { kind: 'action'; beat: number; action: number }
  | null;
