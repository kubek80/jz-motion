import { AvatarVideo } from '../AvatarVideo';
import type { RawDoc } from './doc';

// Your avatar on the editor's board: where the scene's video layout shows the camera, a still of the avatar made for
// the scene's voice clip, placed as the video places it (a bottom corner for pip / pip-left; for camera, where the
// video shows you full frame, a still in the bottom-left corner marked so, since the board has to stay full size to edit). Clicks go
// through it to the board. Without an avatar yet, a dashed outline shows where the camera goes.

type Layout = 'camera' | 'pip' | 'pip-left' | 'side';
const isCamera = (l: unknown): l is Layout => l === 'camera' || l === 'pip' || l === 'pip-left' || l === 'side';

export function AvatarStill({ doc, sceneIndex }: { doc: RawDoc; sceneIndex: number }) {
  const scene = doc.scenes[sceneIndex];
  if (!scene) return null;
  const layout = [scene.layout, ...(scene.beats ?? []).map((b) => (b as { layout?: unknown }).layout)].find(isCamera);
  if (!layout) return null;
  const clips = (doc.voiceover as { clips?: { scene?: string; avatar?: { video: string } }[] } | undefined)?.clips ?? [];
  const avatar = clips.find((c) => c.scene === scene.id && c.avatar)?.avatar;
  const where = layout === 'camera' ? 'Full frame in the video, the board small' : 'In this corner in the video';
  return (
    <div className={`avatar-still ${layout}${avatar ? '' : ' empty'}`} title={avatar ? `Your avatar · ${where}` : 'The camera goes here in the video: no avatar for this scene yet (make one in Timing: double-click its clip)'}>
      {avatar && <AvatarVideo file={avatar.video} still />}
      <span className="tag">{avatar ? (layout === 'camera' ? '🎥 full frame in the video' : layout === 'side' ? '🎥 beside the board in the video' : '🎥 avatar') : 'camera / avatar'}</span>
    </div>
  );
}
