/**
 * "Join" tab: paste or scan a peer's invitation and accept it. The link is
 * validated locally (simplex:/ or https:// prefix) before it is sent to the
 * core; errors surface as sanitized codes only.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useConnectStore } from '../../state/connectStore';
import { errorText } from '../onboarding/errors';
import { ScanIcon, ShieldIcon, CheckIcon } from '../icons';
import Spinner from '../common/Spinner';
import QrScanner from './QrScanner';
import styles from './connect.module.css';

export default function JoinPanel({ connectedName }: { connectedName: string | null }) {
  const acceptInvitation = useConnectStore((s) => s.acceptInvitation);

  const [link, setLink] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [badFormat, setBadFormat] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [cameraUnavailable, setCameraUnavailable] = useState(false);

  const trimmed = link.trim();
  const looksValid = trimmed.startsWith('simplex:/') || trimmed.startsWith('https://');

  async function onConnect(): Promise<void> {
    if (busy || trimmed.length === 0) return;
    if (!looksValid) {
      setBadFormat(true);
      return;
    }
    setBadFormat(false);
    setBusy(true);
    setError(null);
    const code = await acceptInvitation(trimmed);
    setBusy(false);
    if (code !== null) {
      setError(code);
    } else {
      setAccepted(true);
      setLink('');
    }
  }

  function onScanResult(text: string): void {
    setScanning(false);
    setCameraUnavailable(false);
    setLink(text);
    setBadFormat(false);
    setError(null);
  }

  const connected = connectedName !== null;

  return (
    <section className={styles.panel}>
      <p className={styles.trust}>
        <ShieldIcon size={16} className={styles.trustIcon} aria-hidden="true" />
        <span>
          Paste or scan the invitation your contact handed you over a channel you both trust — the
          encrypted connection is then negotiated directly between your devices.
        </span>
      </p>

      {accepted && connected ? (
        <div className={styles.connected} role="status">
          <p className={styles.connectedTitle}>
            <CheckIcon size={18} className={styles.connectedIcon} aria-hidden="true" />
            Connected to {connectedName}
          </p>
          <Link className="btn btn-primary" to="/chats">
            Open chats
          </Link>
        </div>
      ) : accepted ? (
        <div className={styles.connected} role="status">
          <span className={styles.waiting}>
            <span className={styles.dot} aria-hidden="true" />
            Invitation accepted — the encrypted handshake finishes in the background.
          </span>
          <Link className="btn" to="/chats">
            Go to chats
          </Link>
        </div>
      ) : null}

      <div className={styles.joinField}>
        <label className="label" htmlFor="join-link">
          Invitation link
        </label>
        <textarea
          id="join-link"
          className={styles.linkBox}
          value={link}
          onChange={(e) => {
            setLink(e.target.value);
            setBadFormat(false);
            setError(null);
          }}
          rows={4}
          placeholder="simplex:/invitation#... or https://..."
          spellCheck={false}
          autoComplete="off"
          disabled={busy}
          aria-invalid={badFormat || undefined}
          aria-describedby={badFormat ? 'join-link-err' : undefined}
        />
        {badFormat ? (
          <p className="error-text" id="join-link-err">
            That does not look like an invitation link — it should start with simplex:/ or https://
          </p>
        ) : null}
      </div>

      <div className={styles.row}>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => void onConnect()}
          disabled={busy || trimmed.length === 0}
        >
          Connect
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => {
            setCameraUnavailable(false);
            setScanning(true);
          }}
          disabled={busy || scanning}
        >
          <ScanIcon size={18} aria-hidden="true" />
          Scan QR
        </button>
        {busy ? <Spinner /> : null}
      </div>

      {error !== null ? (
        <p className="error-text" role="alert">
          {errorText(error)}
        </p>
      ) : null}

      {cameraUnavailable ? (
        <p className={styles.hint} role="status">
          Camera unavailable — paste the link instead.
        </p>
      ) : null}

      {scanning ? (
        <QrScanner
          onResult={onScanResult}
          onUnavailable={() => {
            setScanning(false);
            setCameraUnavailable(true);
          }}
          onCancel={() => setScanning(false)}
        />
      ) : null}
    </section>
  );
}
