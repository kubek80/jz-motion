// Which voice clips point at a recording that isn't on this computer (uploads/ is not in git, so a
// presentation opened elsewhere keeps its clips but not their sound). Asks for one byte of each file.
import { useEffect, useState } from 'react';
import type { Clip } from '../../engine/schema';

export function useMissingUploads(clips: Clip[]): Set<string> {
  const key = [...new Set(clips.map((c) => c.upload))].sort().join('|');
  const [missing, setMissing] = useState<Set<string>>(new Set());
  useEffect(() => {
    let alive = true;
    const uploads = key ? key.split('|') : [];
    void Promise.all(uploads.map(async (u) => {
      const res = await fetch(`/uploads/${u}`, { headers: { range: 'bytes=0-0' } }).catch(() => null);
      return res?.ok ? null : u;
    })).then((list) => { if (alive) setMissing(new Set(list.filter((u): u is string => !!u))); });
    return () => { alive = false; };
  }, [key]);
  return missing;
}
