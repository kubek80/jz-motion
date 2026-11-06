import { useState } from 'react';
import type { MediaEntry } from './media';

/** The tile's picture: the image itself, a recording's poster (playing while hovered), or a sound's waveform. */
export function MediaThumb({ item }: { item: MediaEntry }) {
  const [hover, setHover] = useState(false);
  if (item.kind === 'sound') return <span className="art"><SoundGlyph /></span>;
  if (item.kind === 'recording') {
    return (
      <span className="art" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
        {hover ? <video src={item.src} poster={item.poster} muted autoPlay loop playsInline /> : <img src={item.poster} alt="" loading="lazy" />}
        <span className="badge-play" aria-hidden>▶</span>
      </span>
    );
  }
  return <span className="art"><img src={item.src} alt="" loading="lazy" /></span>;
}

export function SoundGlyph({ size = 56 }: { size?: number }) {
  const bars = [5, 9, 14, 8, 17, 11, 6, 13, 18, 10, 7, 12, 4];
  return (
    <svg viewBox="0 0 64 24" width={size * 2} height={size * 0.75} aria-hidden>
      {bars.map((h, n) => <rect key={n} x={3 + n * 4.6} y={12 - h / 2} width="2.4" height={h} rx="1.2" fill="currentColor" />)}
    </svg>
  );
}
