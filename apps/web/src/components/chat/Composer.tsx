/**
 * Message composer — the daily driver. Auto-growing textarea, attach button
 * (direct filechooser) + a richer AttachmentSheet, drag-and-drop and image
 * paste, a MediaRecorder voice note with an animated waveform, and send.
 * Sticky at the bottom with safe-area padding. Dimmed with a hint while the
 * core WebSocket is not open. Nothing here is logged or persisted.
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type KeyboardEvent,
} from 'react';
import { BRIDGE_LIMITS } from '@fwa/shared-types';
import { useChatsStore } from '../../state/chatsStore';
import { ClipIcon, MicIcon, SendIcon, StopIcon, TrashIcon, DownloadIcon } from '../icons';
import { prepareImage, prepareVideoMeta } from './media';
import { formatSeconds } from './format';
import VoicePlayer from './VoicePlayer';
import AttachmentSheet from './AttachmentSheet';
import styles from './composer.module.css';

const MAX_TEXTAREA_PX = 148; // ~6 rows, mirrors the CSS max-height
const LONG_PRESS_MS = 500;
const WAVE_BARS = 28;

type RecState = 'idle' | 'recording' | 'preview';

interface VoicePreview {
  blob: Blob;
  url: string;
  duration: number;
  ext: string;
}

function pickAudioMime(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) return 'audio/webm;codecs=opus';
  if (MediaRecorder.isTypeSupported('audio/mp4')) return 'audio/mp4';
  return '';
}

function dataTransferHasFiles(dt: DataTransfer | null): boolean {
  if (!dt) return false;
  return Array.from(dt.types || []).includes('Files');
}

/* --------------------------------------------------------------------------- */

export default function Composer({ contactId, disabled }: { contactId: number; disabled: boolean }) {
  const sendText = useChatsStore((s) => s.sendText);
  const sendAttachment = useChatsStore((s) => s.sendAttachment);

  const [text, setText] = useState('');
  const [attaching, setAttaching] = useState(false);
  const [errorHint, setErrorHint] = useState<string | null>(null);
  const [recState, setRecState] = useState<RecState>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [preview, setPreview] = useState<VoicePreview | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [dragging, setDragging] = useState(false);

  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const discardRef = useRef(false);
  const startedAtRef = useRef(0);
  const previewUrlRef = useRef<string | null>(null);
  const longPressRef = useRef<number | null>(null);
  const suppressClickRef = useRef(false);

  /** Enter sends only on fine-pointer (desktop) devices; touch inserts a newline. */
  const enterSends = useMemo(() => !window.matchMedia('(pointer: coarse)').matches, []);
  const waveBars = useMemo(() => Array.from({ length: WAVE_BARS }, (_v, i) => i), []);

  useEffect(() => {
    previewUrlRef.current = preview?.url ?? null;
  }, [preview]);

  // Unmount: always stop the recorder (its onstop releases the mic) and free URLs.
  useEffect(
    () => () => {
      discardRef.current = true;
      if (longPressRef.current) window.clearTimeout(longPressRef.current);
      try {
        if (recRef.current && recRef.current.state !== 'inactive') recRef.current.stop();
      } catch {
        // already stopped
      }
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    },
    [],
  );

  useEffect(() => {
    if (recState !== 'recording') return;
    const t = window.setInterval(() => {
      setElapsed((Date.now() - startedAtRef.current) / 1000);
    }, 250);
    return () => window.clearInterval(t);
  }, [recState]);

  /* ------------------------------- attachments ---------------------------- */

  const handlePicked = useCallback(
    async (file: File): Promise<void> => {
      setErrorHint(null);
      if (file.size > BRIDGE_LIMITS.maxUploadBytes) {
        setErrorHint('That file is too large — the limit is 100 MB.');
        return;
      }
      setAttaching(true);
      try {
        if (file.type.startsWith('image/')) {
          const prep = await prepareImage(file);
          if (prep && prep.blob.size <= BRIDGE_LIMITS.maxUploadBytes) {
            await sendAttachment(contactId, prep.blob, prep.filename, 'image', { imagePreview: prep.preview });
            return;
          }
          // could not decode/downscale — fall back to sending the original as a file
          await sendAttachment(contactId, file, file.name || 'file', 'file');
          return;
        }
        if (file.type.startsWith('video/')) {
          const meta = await prepareVideoMeta(file);
          if (meta && meta.preview) {
            await sendAttachment(contactId, file, file.name || 'video', 'video', {
              duration: meta.duration,
              imagePreview: meta.preview,
            });
            return;
          }
          await sendAttachment(contactId, file, file.name || 'file', 'file');
          return;
        }
        await sendAttachment(contactId, file, file.name || 'file', 'file');
      } finally {
        setAttaching(false);
      }
    },
    [contactId, sendAttachment],
  );

  function onFileChange(e: ChangeEvent<HTMLInputElement>): void {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-picking the same file
    if (file) void handlePicked(file);
  }

  // Desktop drag-and-drop of files onto the conversation → same send path.
  useEffect(() => {
    if (disabled) return;
    let depth = 0;
    const onDragEnter = (e: DragEvent): void => {
      if (!dataTransferHasFiles(e.dataTransfer)) return;
      e.preventDefault();
      depth += 1;
      setDragging(true);
    };
    const onDragOver = (e: DragEvent): void => {
      if (!dataTransferHasFiles(e.dataTransfer)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    };
    const onDragLeave = (e: DragEvent): void => {
      if (!dataTransferHasFiles(e.dataTransfer)) return;
      depth -= 1;
      if (depth <= 0) {
        depth = 0;
        setDragging(false);
      }
    };
    const onDrop = (e: DragEvent): void => {
      if (!dataTransferHasFiles(e.dataTransfer)) return;
      e.preventDefault();
      depth = 0;
      setDragging(false);
      const file = e.dataTransfer?.files?.[0];
      if (file) void handlePicked(file);
    };
    document.addEventListener('dragenter', onDragEnter);
    document.addEventListener('dragover', onDragOver);
    document.addEventListener('dragleave', onDragLeave);
    document.addEventListener('drop', onDrop);
    return () => {
      document.removeEventListener('dragenter', onDragEnter);
      document.removeEventListener('dragover', onDragOver);
      document.removeEventListener('dragleave', onDragLeave);
      document.removeEventListener('drop', onDrop);
      setDragging(false);
    };
  }, [disabled, handlePicked]);

  function onPaste(e: ClipboardEvent<HTMLTextAreaElement>): void {
    const files = e.clipboardData?.files;
    if (!files || files.length === 0) return;
    const image = Array.from(files).find((f) => f.type.startsWith('image/'));
    if (image) {
      e.preventDefault();
      void handlePicked(image);
    }
  }

  /* ------------------------- attach button gestures ----------------------- */

  function openFileChooser(): void {
    fileRef.current?.click();
  }

  function clearLongPress(): void {
    if (longPressRef.current) {
      window.clearTimeout(longPressRef.current);
      longPressRef.current = null;
    }
  }

  // Plain click/tap → direct filechooser (E2E depends on this). A long press
  // opens the richer AttachmentSheet without ever blocking the primary path.
  function onAttachPointerDown(): void {
    if (disabled || attaching) return;
    suppressClickRef.current = false;
    clearLongPress();
    longPressRef.current = window.setTimeout(() => {
      suppressClickRef.current = true;
      setSheetOpen(true);
    }, LONG_PRESS_MS);
  }

  function onAttachClick(): void {
    clearLongPress();
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    openFileChooser();
  }

  /* ------------------------------------ text ------------------------------ */

  function autoGrow(ta: HTMLTextAreaElement): void {
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, MAX_TEXTAREA_PX)}px`;
  }

  function onChange(e: ChangeEvent<HTMLTextAreaElement>): void {
    setText(e.target.value);
    autoGrow(e.currentTarget);
  }

  function doSendText(): void {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    setText('');
    const ta = taRef.current;
    if (ta) {
      ta.style.height = 'auto';
      ta.focus();
    }
    void sendText(contactId, trimmed);
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>): void {
    if (e.key === 'Enter' && !e.shiftKey && enterSends) {
      e.preventDefault();
      doSendText();
    }
  }

  /* ------------------------------- voice notes ---------------------------- */

  async function startRecording(): Promise<void> {
    if (recState !== 'idle' || disabled) return;
    setErrorHint(null);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setErrorHint('Voice recording is not supported in this browser.');
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setErrorHint('Microphone unavailable.');
      return;
    }
    const mime = pickAudioMime();
    let rec: MediaRecorder;
    try {
      rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
    } catch {
      stream.getTracks().forEach((t) => t.stop());
      setErrorHint('Voice recording is not supported in this browser.');
      return;
    }
    chunksRef.current = [];
    discardRef.current = false;
    rec.ondataavailable = (e: BlobEvent) => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
    };
    rec.onstop = () => {
      // ALWAYS release the microphone, whatever happens next.
      stream.getTracks().forEach((t) => t.stop());
      recRef.current = null;
      const type = rec.mimeType || mime || 'audio/webm';
      const blob = new Blob(chunksRef.current, { type });
      chunksRef.current = [];
      const duration = Math.max(1, Math.round((Date.now() - startedAtRef.current) / 1000));
      if (discardRef.current || blob.size === 0) {
        setRecState('idle');
        return;
      }
      const ext = type.includes('mp4') ? 'm4a' : 'webm';
      setPreview({ blob, url: URL.createObjectURL(blob), duration, ext });
      setRecState('preview');
    };
    recRef.current = rec;
    startedAtRef.current = Date.now();
    setElapsed(0);
    try {
      rec.start();
      setRecState('recording');
    } catch {
      stream.getTracks().forEach((t) => t.stop());
      recRef.current = null;
      setErrorHint('Voice recording failed to start.');
    }
  }

  function stopRecording(discard: boolean): void {
    discardRef.current = discard;
    const rec = recRef.current;
    if (rec && rec.state !== 'inactive') {
      try {
        rec.stop();
        return;
      } catch {
        // fall through to reset
      }
    }
    setRecState('idle');
  }

  function cancelPreview(): void {
    if (preview) URL.revokeObjectURL(preview.url);
    setPreview(null);
    setRecState('idle');
  }

  function sendVoice(): void {
    const p = preview;
    if (!p || disabled) return;
    setPreview(null);
    setRecState('idle');
    URL.revokeObjectURL(p.url);
    void sendAttachment(contactId, p.blob, `voice-${Date.now()}.${p.ext}`, 'voice', { duration: p.duration });
  }

  /* --------------------------------- render ------------------------------- */

  const showSend = text.trim().length > 0;

  return (
    <div className={`${styles['wrap']} ${disabled ? styles['disabled'] : ''}`}>
      {recState === 'recording' ? (
        <div className={styles['voiceRow']}>
          <span className={styles['recDot']} aria-hidden="true" />
          <span className={styles['recTimer']} role="timer">
            {formatSeconds(elapsed)}
          </span>
          <span className={styles['wave']} aria-hidden="true">
            {waveBars.map((i) => (
              <span
                key={i}
                className={styles['waveBar']}
                style={{ animationDelay: `${(i % 7) * 90}ms` }}
              />
            ))}
          </span>
          <button
            type="button"
            className={styles['btn']}
            onClick={() => stopRecording(true)}
            aria-label="Discard recording"
          >
            <TrashIcon size={22} />
          </button>
          <button
            type="button"
            className={`${styles['btn']} ${styles['recStop']}`}
            onClick={() => stopRecording(false)}
            aria-label="Stop recording"
          >
            <StopIcon size={20} />
          </button>
        </div>
      ) : recState === 'preview' && preview ? (
        <div className={styles['voiceRow']}>
          <button type="button" className={styles['btn']} onClick={cancelPreview} aria-label="Discard voice message">
            <TrashIcon size={22} />
          </button>
          <span className={styles['previewPlayer']}>
            <VoicePlayer src={preview.url} duration={preview.duration} />
          </span>
          <button
            type="button"
            className={`${styles['btn']} ${styles['send']}`}
            onClick={sendVoice}
            disabled={disabled}
            aria-label="Send voice message"
          >
            <SendIcon size={22} />
          </button>
        </div>
      ) : (
        <div className={styles['row']}>
          <button
            type="button"
            className={styles['btn']}
            onClick={onAttachClick}
            onPointerDown={onAttachPointerDown}
            onPointerUp={clearLongPress}
            onPointerLeave={clearLongPress}
            disabled={disabled || attaching}
            aria-label="Attach a file"
          >
            <ClipIcon size={22} />
          </button>
          <textarea
            ref={taRef}
            className={styles['textarea']}
            rows={1}
            value={text}
            onChange={onChange}
            onKeyDown={onKeyDown}
            onPaste={onPaste}
            placeholder="Message"
            disabled={disabled}
            aria-label="Message"
          />
          {showSend ? (
            <button
              type="button"
              className={`${styles['btn']} ${styles['send']}`}
              onClick={doSendText}
              disabled={disabled}
              aria-label="Send message"
            >
              <SendIcon size={22} />
            </button>
          ) : (
            <button
              type="button"
              className={styles['btn']}
              onClick={() => void startRecording()}
              disabled={disabled}
              aria-label="Record a voice message"
            >
              <MicIcon size={22} />
            </button>
          )}
        </div>
      )}

      {errorHint ? <p className={styles['errorHint']}>{errorHint}</p> : null}
      {disabled ? <p className={styles['hint']}>Reconnecting to the core — sending is paused.</p> : null}

      <input
        ref={fileRef}
        type="file"
        accept="image/*,video/*,*/*"
        className={styles['hiddenInput']}
        onChange={onFileChange}
        tabIndex={-1}
        aria-hidden="true"
      />

      <AttachmentSheet open={sheetOpen} onClose={() => setSheetOpen(false)} onPick={(f) => void handlePicked(f)} />

      {dragging ? (
        <div className={styles['dragOverlay']}>
          <div className={styles['dragCard']}>
            <DownloadIcon size={28} />
            Drop to send
            <span>Photos, videos and files</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
