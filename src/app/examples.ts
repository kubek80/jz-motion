// The bundled example presentations (src/examples/*.json).
export const examples = Object.entries(import.meta.glob<{ title: string }>('../examples/*.json', { eager: true, import: 'default' }))
  .map(([path, data]) => ({ name: path.split('/').pop()!.replace('.json', ''), title: data.title, text: JSON.stringify(data, null, 2) }));
