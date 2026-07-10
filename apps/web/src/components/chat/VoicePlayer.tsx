/**
 * Custom voice-note player: play/pause button, progress bar, m:ss readout.
 * The underlying <audio> element is created lazily on first play so opening a
 * conversation never triggers a network fetch per voice message.
 */
import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { formatSeconds } from './format';
import styles from './voicePlayer.module.css';

export interface VoicePlayerProps {
  /** Same-origin URL of the audio bytes (fileUrl(...) or a blob: object URL). */
  src: string;
  /** Known duration in seconds (from msgContent); refined once metadata loads. */
  duration?: number;
}

function PlayIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M6 5h4v14H6zM14 5h4v14h-4z" />
    </svg>
  );
}

export default function VoicePlayer({ src, duration }: VoicePlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  const [dur, setDur] = useState(duration && duration > 0 ? duration : 0);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    return () => {
      // release the element; blob: URLs are revoked by the owner of the blob
      const a = audioRef.current;
      if (a) {
        a.pause();
        a.removeAttribute('src');
        audioRef.current = null;
      }
    };
  }, []);

  function ensureAudio(): HTMLAudioElement {
    const existing = audioRef.current;
    if (existing) return existing;
    const el = new Audio();
    el.preload = 'none';
    el.src = src;
    el.addEventListener('timeupdate', () => setPos(el.currentTime));
    el.addEventListener('durationchange', () => {
      if (Number.isFinite(el.duration) && el.duration > 0) setDur(el.duration);
    });
    el.addEventListener('play', () => setPlaying(true));
    el.addEventListener('pause', () => setPlaying(false));
    el.addEventListener('ended', () => {
      setPlaying(false);
      setPos(0);
    });
    el.addEventListener('error', () => {
      setPlaying(false);
      setFailed(true);
    });
    audioRef.current = el;
    return el;
  }

  function toggle(): void {
    if (failed) return;
    const a = ensureAudio();
    if (playing) a.pause();
    else void a.play().catch(() => setFailed(true));
  }

  function seek(e: MouseEvent<HTMLButtonElement>): void {
    if (failed || dur <= 0) return;
    const a = ensureAudio();
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width <= 0) return;
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    a.currentTime = ratio * dur;
    setPos(ratio * dur);
  }

  if (failed) {
    return <span className={styles['failed']}>Audio unavailable</span>;
  }

  const pct = dur > 0 ? Math.min(100, (pos / dur) * 100) : 0;
  return (
    <span className={styles['player']}>
      <button
        type="button"
        className={styles['toggle']}
        onClick={toggle}
        aria-label={playing ? 'Pause' : 'Play'}
      >
        {playing ? <PauseIcon /> : <PlayIcon />}
      </button>
      <button type="button" className={styles['bar']} onClick={seek} aria-label="Seek">
        <span className={styles['track']}>
          <span className={styles['fill']} style={{ width: `${pct}%` }} />
        </span>
      </button>
      <span className={styles['time']}>{formatSeconds(playing || pos > 0 ? pos : dur)}</span>
    </span>
  );
}
