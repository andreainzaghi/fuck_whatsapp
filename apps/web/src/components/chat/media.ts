/**
 * Client-side media preparation for outgoing attachments:
 *  - images: downscale to max 1280px and build the tiny base64 preview the
 *    SimpleX `msgContent.image` field expects (~24px wide jpeg data URI);
 *  - videos: best-effort first-frame thumbnail + duration.
 *
 * Everything works on local blobs / object URLs only — nothing leaves the
 * device from here, and nothing is logged.
 */

const MAX_IMAGE_DIM = 1280;
const PREVIEW_WIDTH = 24;

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image-decode'));
    img.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('encode'))), type, quality);
  });
}

function draw(source: CanvasImageSource, w: number, h: number, targetW: number, targetH: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(targetW));
  canvas.height = Math.max(1, Math.round(targetH));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas');
  ctx.drawImage(source, 0, 0, w, h, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function jpegName(original: string): string {
  const base = original.replace(/\.[A-Za-z0-9]{1,8}$/, '') || 'image';
  return `${base}.jpg`;
}

export interface PreparedImage {
  blob: Blob;
  filename: string;
  /** Tiny base64 jpeg data URI for msgContent.image. */
  preview: string;
}

/** Downscale an image file to max 1280px and build the tiny inline preview. */
export async function prepareImage(file: File): Promise<PreparedImage | null> {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    if (w <= 0 || h <= 0) return null;
    const scale = Math.min(1, MAX_IMAGE_DIM / Math.max(w, h));
    const main = draw(img, w, h, w * scale, h * scale);
    const blob = await canvasToBlob(main, 'image/jpeg', 0.85);
    const tiny = draw(img, w, h, PREVIEW_WIDTH, (PREVIEW_WIDTH * h) / w);
    const preview = tiny.toDataURL('image/jpeg', 0.5);
    return { blob, filename: jpegName(file.name || 'image'), preview };
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export interface PreparedVideoMeta {
  /** Tiny base64 jpeg data URI of an early frame, for msgContent.image. */
  preview: string;
  /** Rounded duration in seconds. */
  duration: number;
}

/** Best-effort video thumbnail + duration; null when the browser can't decode. */
export function prepareVideoMeta(file: File, timeoutMs = 4000): Promise<PreparedVideoMeta | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    let settled = false;
    const finish = (result: PreparedVideoMeta | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      video.removeAttribute('src');
      video.load();
      URL.revokeObjectURL(url);
      resolve(result);
    };
    const timer = window.setTimeout(() => finish(null), timeoutMs);
    video.muted = true;
    video.playsInline = true;
    video.preload = 'metadata';
    video.onerror = () => finish(null);
    video.onloadedmetadata = () => {
      try {
        video.currentTime = Math.min(0.1, video.duration || 0);
      } catch {
        finish(null);
      }
    };
    video.onseeked = () => {
      try {
        const w = video.videoWidth;
        const h = video.videoHeight;
        if (w <= 0 || h <= 0) {
          finish(null);
          return;
        }
        const tiny = draw(video, w, h, PREVIEW_WIDTH, (PREVIEW_WIDTH * h) / w);
        const preview = tiny.toDataURL('image/jpeg', 0.5);
        const duration = Number.isFinite(video.duration) ? Math.round(video.duration) : 0;
        finish({ preview, duration });
      } catch {
        finish(null);
      }
    };
    video.src = url;
  });
}
