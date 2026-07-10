/**
 * Live camera QR scanner. Opens the environment-facing camera, scans frames
 * in a requestAnimationFrame loop and reports the first decoded string.
 *
 * The MediaStream tracks are ALWAYS stopped: on decode, on cancel, on
 * permission failure and on unmount (tab switches unmount this component).
 */
import { useEffect, useRef } from 'react';
import { scanQrFromVideo } from '../../lib/qr';
import { CloseIcon } from '../icons';
import styles from './connect.module.css';

export interface QrScannerProps {
  /** Called once with the decoded text; tracks are already stopped. */
  onResult: (text: string) => void;
  /** Camera missing or permission denied — caller falls back to paste. */
  onUnavailable: () => void;
  onCancel: () => void;
}

export default function QrScanner({ onResult, onUnavailable, onCancel }: QrScannerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  // Keep latest callbacks without restarting the camera effect.
  const cbRef = useRef({ onResult, onUnavailable });
  cbRef.current = { onResult, onUnavailable };

  useEffect(() => {
    let stream: MediaStream | null = null;
    let raf = 0;
    let stopped = false;

    const stop = (): void => {
      stopped = true;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      if (stream) {
        for (const track of stream.getTracks()) track.stop();
        stream = null;
      }
    };

    const loop = (): void => {
      if (stopped) return;
      const video = videoRef.current;
      if (video) {
        const text = scanQrFromVideo(video);
        if (text) {
          stop();
          cbRef.current.onResult(text);
          return;
        }
      }
      raf = requestAnimationFrame(loop);
    };

    void (async () => {
      if (typeof navigator.mediaDevices?.getUserMedia !== 'function') {
        cbRef.current.onUnavailable();
        return;
      }
      let acquired: MediaStream;
      try {
        acquired = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
        });
      } catch {
        // Permission denied / no camera — sanitized, nothing logged.
        if (!stopped) cbRef.current.onUnavailable();
        return;
      }
      if (stopped) {
        for (const track of acquired.getTracks()) track.stop();
        return;
      }
      stream = acquired;
      const video = videoRef.current;
      if (!video) {
        stop();
        return;
      }
      video.srcObject = acquired;
      try {
        await video.play();
      } catch {
        // muted + playsInline: autoplay policies allow this; ignore races
      }
      if (!stopped) raf = requestAnimationFrame(loop);
    })();

    return stop;
  }, []);

  return (
    <div className={styles.scanner}>
      <div className={styles.videoWrap}>
        <video ref={videoRef} className={styles.video} muted playsInline autoPlay />
        <div className={styles.reticle} aria-hidden="true" />
      </div>
      <p className={styles.scanHint}>Point the camera at the invitation QR code.</p>
      <button type="button" className="btn btn-block" onClick={onCancel}>
        <CloseIcon size={18} aria-hidden="true" />
        Cancel scan
      </button>
    </div>
  );
}
