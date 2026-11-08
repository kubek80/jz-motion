import { forwardRef, useState, type VideoHTMLAttributes } from 'react';

// One of your avatar's videos (uploads/<file>), or, when it can't play, why: not on this computer at all, or only a
// Git LFS placeholder (pulled without `git lfs pull`). A black box says nothing; this says what to do.

type Props = { file: string; still?: boolean; short?: boolean } & Omit<VideoHTMLAttributes<HTMLVideoElement>, 'src'>;

export const AvatarVideo = forwardRef<HTMLVideoElement, Props>(function AvatarVideo({ file, still, short, className, ...rest }, ref) {
  const [problem, setProblem] = useState<string | null>(null);
  const failed = async () => {
    const res = await fetch(`/uploads/${file}`, { headers: { range: 'bytes=0-0' } }).catch(() => null);
    const j = res && !res.ok ? await res.json().catch(() => ({})) : {};
    setProblem(j.lfs ? 'not downloaded: run git lfs pull' : res && !res.ok ? 'not on this computer' : 'this browser can’t play it');
  };
  if (problem) return <span className={`avatar-video-problem ${className ?? ''}`} title={`${file}: ${problem}`}>⚠ {short ? 'video missing' : `avatar video ${problem}`}</span>;
  return <video ref={ref} className={className} src={`/uploads/${file}${still ? '#t=1' : ''}`} muted playsInline preload={still ? 'metadata' : 'auto'} onError={() => void failed()} {...rest} />;
});
