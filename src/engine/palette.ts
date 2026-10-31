/** Luminous marker colors. Scenes refer to them by name. */
export const palette = {
  green: '#3dff8b',
  pink: '#ff4fd8',
  yellow: '#fff05a',
  cyan: '#3ef0ff',
  orange: '#ff9a3c',
  white: '#f2f6ff',
} as const;

export type ColorName = keyof typeof palette;
export const colorNames = Object.keys(palette) as [ColorName, ...ColorName[]];

export const board = {
  background: '#0d1114',
  /** Font for all handwritten text. */
  font: "'Caveat', 'Comic Sans MS', cursive",
  /** Stroke width of the marker in board units. */
  stroke: 5,
};
