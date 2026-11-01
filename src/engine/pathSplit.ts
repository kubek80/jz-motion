// Splits an SVG path into its subpaths (each starting with a move), so they can be drawn one after
// another: a dash pattern restarts on every subpath, which would draw them all at once.

const ARGS: Record<string, number> = { m: 2, l: 2, t: 2, h: 1, v: 1, c: 6, s: 4, q: 4, a: 7, z: 0 };

export function splitSubpaths(d: string): string[] {
  const tokens = d.match(/[a-df-z]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi) ?? [];
  const out: string[] = [];
  let current = '';
  let x = 0, y = 0, sx = 0, sy = 0;
  let i = 0;
  let cmd = '';
  while (i < tokens.length) {
    if (/[a-z]/i.test(tokens[i])) cmd = tokens[i++];
    const lower = cmd.toLowerCase();
    const rel = cmd === lower;
    const n = ARGS[lower];
    if (lower === 'z') {
      current += 'Z';
      x = sx; y = sy;
      // A bare Z ends; any numbers after it would be an error, so continue with the next command.
      if (i < tokens.length && !/[a-z]/i.test(tokens[i])) i++;
      continue;
    }
    const args = tokens.slice(i, i + n).map(Number);
    if (args.length < n || args.some(Number.isNaN)) break;
    i += n;
    if (lower === 'm') {
      // A move starts a new subpath, written absolute so it stands on its own.
      const nx = rel ? x + args[0] : args[0];
      const ny = rel ? y + args[1] : args[1];
      if (current) out.push(current);
      current = `M${round(nx)} ${round(ny)}`;
      x = sx = nx; y = sy = ny;
      // Further pairs after a move are lines.
      cmd = rel ? 'l' : 'L';
      continue;
    }
    current += `${cmd}${args.map(round).join(' ')}`;
    switch (lower) {
      case 'h': x = rel ? x + args[0] : args[0]; break;
      case 'v': y = rel ? y + args[0] : args[0]; break;
      default: {
        const ex = args[n - 2], ey = args[n - 1];
        x = rel ? x + ex : ex;
        y = rel ? y + ey : ey;
      }
    }
  }
  if (current) out.push(current);
  return out.length ? out : [d];
}

const round = (v: number) => Number(v.toFixed(3));
