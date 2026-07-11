/**
 * Sticky conversation header: back (mobile only, kept in DOM on desktop),
 * avatar, contact name, and a discreet "Encrypted" control that opens a small
 * end-to-end-encryption explainer.
 */
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Avatar from '../common/Avatar';
import IconButton from '../common/IconButton';
import { BackIcon, LockIcon } from '../icons';
import styles from './conversation.module.css';

export default function ConversationHeader({
  contactId,
  displayName,
}: {
  contactId: number;
  displayName: string | undefined;
}) {
  const navigate = useNavigate();
  const name = displayName ?? `Contact ${contactId}`;
  const [secOpen, setSecOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!secOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSecOpen(false);
    };
    const onDown = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setSecOpen(false);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onDown);
    };
  }, [secOpen]);

  function goBack(): void {
    navigate(-1);
  }

  return (
    <header className={styles['header']}>
      <IconButton label="Back" className={styles['backBtn']} onClick={goBack}>
        <BackIcon size={22} />
      </IconButton>

      <Avatar name={name} size={38} />

      <div className={styles['headerInfo']}>
        <h1 className={styles['headerName']}>{name}</h1>
        <button
          type="button"
          className={styles['encPill']}
          onClick={() => setSecOpen((v) => !v)}
          aria-expanded={secOpen}
          aria-haspopup="dialog"
        >
          <LockIcon size={12} />
          Encrypted
        </button>
      </div>

      {secOpen ? (
        <>
          <div className={styles['secBackdrop']} aria-hidden="true" />
          <div ref={panelRef} className={styles['secPanel']} role="dialog" aria-label="End-to-end encrypted">
            <div className={styles['secHead']}>
              <LockIcon size={18} />
              <h2 className={styles['secTitle']}>End-to-end encrypted</h2>
            </div>
            <p className={styles['secBody']}>
              Messages are encrypted on your device and decrypted only on participating devices. The transport network
              receives ciphertext.
            </p>
          </div>
        </>
      ) : null}
    </header>
  );
}
