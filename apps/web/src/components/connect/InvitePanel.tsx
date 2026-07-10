/**
 * "Invite" tab: create a one-time invitation and show it as a large QR code
 * plus a copyable link. The link itself is the secret — it is rendered into
 * a canvas / textarea, never logged.
 */
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useConnectStore } from '../../state/connectStore';
import { useUiStore } from '../../state/uiStore';
import { renderQr } from '../../lib/qr';
import { CopyIcon, ShieldIcon, AlertIcon, CheckIcon } from '../icons';
import Spinner from '../common/Spinner';
import styles from './connect.module.css';

export default function InvitePanel({ connectedName }: { connectedName: string | null }) {
  const invitation = useConnectStore((s) => s.invitation);
  const creating = useConnectStore((s) => s.creating);
  const createInvitation = useConnectStore((s) => s.createInvitation);
  const toast = useUiStore((s) => s.toast);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const boxRef = useRef<HTMLTextAreaElement | null>(null);
  const [attempted, setAttempted] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!invitation || !canvas) return;
    void renderQr(invitation, canvas).catch(() => undefined);
  }, [invitation]);

  async function onCreate(): Promise<void> {
    setAttempted(true);
    await createInvitation();
  }

  async function onCopy(): Promise<void> {
    if (!invitation) return;
    try {
      await navigator.clipboard.writeText(invitation);
      toast('Invitation copied', 'success');
    } catch {
      boxRef.current?.select();
      toast('Copy failed — the link is selected, copy it manually', 'danger');
    }
  }

  const failed = attempted && !creating && invitation === null;

  return (
    <section className={styles.panel}>
      <p className={styles.trust}>
        <ShieldIcon size={16} className={styles.trustIcon} aria-hidden="true" />
        <span>
          Hand this link to one person over a channel you already trust. There is no directory and
          no central account — the introduction happens directly between your two devices.
        </span>
      </p>

      {!invitation ? (
        <button
          type="button"
          className="btn btn-primary btn-block"
          onClick={() => void onCreate()}
          disabled={creating}
        >
          {creating ? <Spinner /> : null}
          Create one-time invitation
        </button>
      ) : (
        <div className={styles.invitation}>
          <div className={styles.qrCard}>
            <canvas
              ref={canvasRef}
              className={styles.qrCanvas}
              role="img"
              aria-label="Invitation QR code"
            />
          </div>

          <div className={styles.linkGroup}>
            <label className="label" htmlFor="invite-link">
              Invitation link
            </label>
            <textarea
              id="invite-link"
              ref={boxRef}
              className={styles.linkBox}
              readOnly
              value={invitation}
              rows={4}
              aria-label="Invitation link"
              spellCheck={false}
              onFocus={(e) => e.currentTarget.select()}
            />
            <div className={styles.row}>
              <button type="button" className="btn" onClick={() => void onCopy()}>
                <CopyIcon size={18} aria-hidden="true" />
                Copy
              </button>
            </div>
          </div>

          <p className={styles.caution}>
            <AlertIcon size={16} className={styles.cautionIcon} aria-hidden="true" />
            <span>One-time link — it works once. Share it over a channel you already trust.</span>
          </p>

          {connectedName !== null ? (
            <div className={styles.connected} role="status">
              <p className={styles.connectedTitle}>
                <CheckIcon size={18} className={styles.connectedIcon} aria-hidden="true" />
                Connected to {connectedName}
              </p>
              <Link className="btn btn-primary" to="/chats">
                Open chats
              </Link>
            </div>
          ) : (
            <span className={styles.waiting} role="status">
              <span className={styles.dot} aria-hidden="true" />
              Waiting to connect…
            </span>
          )}

          <button
            type="button"
            className={`btn btn-ghost ${styles.regen}`}
            onClick={() => void onCreate()}
            disabled={creating}
          >
            {creating ? <Spinner /> : null}
            New invitation
          </button>
        </div>
      )}

      {failed ? (
        <p className="error-text" role="alert">
          Could not create an invitation. Check the connection status and try again.
        </p>
      ) : null}
    </section>
  );
}
