/**
 * QR helpers — render invitation links to a canvas and scan QR codes from a
 * live <video> element. Both are fully local (bundled libs, no network).
 */
import { toCanvas } from 'qrcode';
import jsQR from 'jsqr';

/**
 * Render `text` as a QR code into `canvas`. Fixed black-on-white with a quiet
 * zone: maximum contrast scans best regardless of the app theme (the canvas
 * itself provides the light background).
 */
export async function renderQr(text: string, canvas: HTMLCanvasElement): Promise<void> {
  await toCanvas(canvas, text, {
    errorCorrectionLevel: 'M',
    margin: 2,
    width: 512,
    color: { dark: '#000000', light: '#ffffff' },
  });
}

// Reused offscreen canvas: callers scan in a requestAnimationFrame loop.
let scanCanvas: HTMLCanvasElement | null = null;

/**
 * Grab the current frame of `video`, run jsQR over it and return the decoded
 * string, or null when no QR code is visible yet. Call repeatedly from a
 * requestAnimationFrame loop until it returns a value.
 */
export function scanQrFromVideo(video: HTMLVideoElement): string | null {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) return null;

  // Downscale large camera frames: plenty for QR detection, much faster.
  const maxDim = 640;
  const scale = Math.min(1, maxDim / Math.max(vw, vh));
  const w = Math.max(1, Math.round(vw * scale));
  const h = Math.max(1, Math.round(vh * scale));

  if (!scanCanvas) scanCanvas = document.createElement('canvas');
  if (scanCanvas.width !== w) scanCanvas.width = w;
  if (scanCanvas.height !== h) scanCanvas.height = h;

  const ctx = scanCanvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;

  ctx.drawImage(video, 0, 0, w, h);
  let image: ImageData;
  try {
    image = ctx.getImageData(0, 0, w, h);
  } catch {
    return null;
  }
  const code = jsQR(image.data, image.width, image.height, { inversionAttempts: 'attemptBoth' });
  return code?.data ?? null;
}
