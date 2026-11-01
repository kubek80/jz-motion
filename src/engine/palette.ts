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
  /** Text styles: handwritten marker, chunky outlined capitals (like the JZ in the logo), and code. */
  fonts: {
    marker: { family: "'Caveat', 'Comic Sans MS', cursive", weight: 700, charWidth: 0.42 },
    bold: { family: "'Bungee', 'Arial Black', sans-serif", weight: 400, charWidth: 0.78 },
    code: { family: "'JetBrains Mono', ui-monospace, monospace", weight: 500, charWidth: 0.6 },
  },
  /** Line height of multi-line text, in font sizes. */
  lineHeight: 1.25,
  /** Stroke width of the marker in board units. */
  stroke: 5,
};

export type TextStyle = keyof typeof board.fonts;
