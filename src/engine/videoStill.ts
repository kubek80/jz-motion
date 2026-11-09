// Export: a canvas showing a video's current frame. A <video> that has just loaded, seeked or come into view may not
// be on screen yet when the exporter takes its picture (the browser puts video frames on screen on its own time,
// later under load), which showed as empty boxes flickering in the first frames of recordings. A canvas is drawn
// with the page, so once painted it is in the picture. Used by videoPictures.ts and src/render/avatarLayer.ts.

export class VideoStill {
  readonly canvas: HTMLCanvasElement;

  constructor(private video: HTMLVideoElement) {
    this.canvas = document.createElement('canvas');
    this.canvas.style.cssText = video.style.cssText;
    this.canvas.style.display = 'none';
  }

  /** Copies the video's current frame; false (and hidden) while it has none. */
  paint(): boolean {
    const v = this.video;
    const c = this.canvas;
    if (v.readyState < 2 || !v.videoWidth || !v.videoHeight) {
      c.style.display = 'none';
      return false;
    }
    if (c.width !== v.videoWidth || c.height !== v.videoHeight) {
      c.width = v.videoWidth;
      c.height = v.videoHeight;
    }
    c.getContext('2d')?.drawImage(v, 0, 0, c.width, c.height);
    c.style.display = 'block';
    return true;
  }

  hide() {
    this.canvas.style.display = 'none';
  }
}
