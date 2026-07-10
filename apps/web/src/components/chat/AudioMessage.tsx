/**
 * Voice-note player: play/pause, a scrub bar (an <input type="range"> labelled
 * "Seek"), and an m:ss readout. The underlying <audio> element uses preload
 * "none" so opening a conversation never fetches audio until the user plays it.
 * Received notes not yet downloaded show a Download affordance (acceptFile).
 */
import { useRef, useState } from 'react';
import { DownloadIcon, PauseIcon, PlayIcon } from '../icons';
import { fileUrl } from '../../lib/bridgeClient';
import { useChatsStore, type Message } from '../../state/chatsStore';
import { formatSeconds } from './format';
import styles from './message.module.css';

export default function AudioMessage({ msg }: { msg: Message }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  const [dur, setDur] = useState(msg.duration && msg.duration > 0 ? msg.duration : 0);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);

  const src = msg.filePath ? fileUrl(msg.filePath) : null;
  const needsDownload = !src && msg.fileId != null;

  function toggle(): void {
    const a = audioRef.current;
    if (!a || failed) return;
    if (playing) a.pause();
    else void a.play().catch(() => setFailed(true));
  }

  function onSeek(value: number): void {
    const a = audioRef.current;
    setPos(value);
    if (a && dur > 0) a.currentTime = value;
  }

  async function download(): Promise<void> {
    if (msg.fileId == null || busy) return;
    setBusy(true);
    try {
      await useChatsStore.getState().acceptFile(msg.fileId);
    } finally {
      setBusy(false);
    }
  }

  if (needsDownload) {
    return (
      <div className={styles['audio']}>
        <button
          type="button"
          className={styles['audioBtn']}
          onClick={() => void download()}
          disabled={busy}
          aria-label="Download voice message"
        >
          {busy ? <span className={styles['inlineSpinner']} /> : <DownloadIcon size={18} />}
        </button>
        <span className={styles['audioMain']}>
          <input className={styles['seek']} type="range" min={0} max={dur || 0} value={0} aria-label="Seek" disabled readOnly />
          <span className={styles['audioTime']}>{formatSeconds(dur)}</span>
        </span>
      </div>
    );
  }

  if (failed) {
    return <span className={styles['audioFail']}>Audio unavailable</span>;
  }

  const shown = playing || pos > 0 ? pos : dur;
  return (
    <div className={styles['audio']}>
      <button
        type="button"
        className={styles['audioBtn']}
        onClick={toggle}
        aria-label={playing ? 'Pause voice message' : 'Play voice message'}
      >
        {playing ? <PauseIcon size={18} /> : <PlayIcon size={18} />}
      </button>
      <span className={styles['audioMain']}>
        <input
          className={styles['seek']}
          type="range"
          min={0}
          max={dur || 0}
          step={0.1}
          value={Math.min(pos, dur || 0)}
          aria-label="Seek"
          onChange={(e) => onSeek(Number(e.target.value))}
        />
        <span className={styles['audioTime']}>{formatSeconds(shown)}</span>
      </span>
      {src ? (
        <audio
          ref={audioRef}
          src={src}
          preload="none"
          onTimeUpdate={(e) => setPos(e.currentTarget.currentTime)}
          onDurationChange={(e) => {
            const d = e.currentTarget.duration;
            if (Number.isFinite(d) && d > 0) setDur(d);
          }}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => {
            setPlaying(false);
            setPos(0);
          }}
          onError={() => {
            setPlaying(false);
            setFailed(true);
          }}
        />
      ) : null}
    </div>
  );
}
