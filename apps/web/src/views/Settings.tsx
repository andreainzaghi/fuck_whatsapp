/**
 * Settings view — Profile, Appearance, Privacy & Security, Network, About and a
 * Danger Zone. Everything is informational or preference-only: no command in the
 * bridge API can drop the core cleanly, so "locking" is documented (and, when
 * requested, surfaced as a toast) as "close the terminal process".
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useSessionStore } from '../state/sessionStore';
import { useUiStore } from '../state/uiStore';
import { lockAndClose } from '../lib/bridgeClient';
import { Wordmark } from '../components/brand/Logo';
import Avatar from '../components/common/Avatar';
import ConfirmDialog from '../components/common/ConfirmDialog';
import SecurityBadge from '../components/common/SecurityBadge';
import { BrandLockup } from '../components/brand/Logo';
import { AlertIcon, ChevronRightIcon, LockIcon, NetworkIcon, ShieldIcon, SunIcon } from '../components/icons';
import SectionCard from '../components/settings/SectionCard';
import InfoRow from '../components/settings/InfoRow';
import DocRow from '../components/settings/DocRow';
import Appearance from '../components/settings/Appearance';
import styles from '../components/settings/settings.module.css';

const PROTECTIONS = [
  'Encrypted local database via the SimpleX core',
  'Loopback-only bridge with a per-launch random port and token',
  'Strict Origin/Host validation on every request',
  'Restrictive Content-Security-Policy',
  'Sanitized logs — error codes only, never message content',
] as const;

const DOCS = [
  { title: 'Threat model', path: 'docs/THREAT_MODEL.md' },
  { title: 'Known limitations', path: 'docs/KNOWN_LIMITATIONS.md' },
] as const;

export default function Settings() {
  const user = useSessionStore((s) => s.user);
  const coreVersion = useSessionStore((s) => s.coreVersion);
  const toast = useUiStore((s) => s.toast);
  const [confirmLock, setConfirmLock] = useState(false);
  const [closed, setClosed] = useState(false);

  const displayName = user?.displayName ?? '—';

  async function doLockAndClose(): Promise<void> {
    setConfirmLock(false);
    const ok = await lockAndClose();
    if (ok) setClosed(true);
    else toast('Could not reach the launcher. Close the app window to lock.', 'danger');
  }

  if (closed) {
    return (
      <div className="page-center">
        <div className="empty-state">
          <Wordmark stacked />
          <h2 className="empty-state-title">Locked and closed</h2>
          <p className="empty-state-body">
            Your encrypted database is locked and Fuck WhatsApp has shut down. You can close this tab.
            Re-open the app and enter your password to continue.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <h1 className={styles.title}>Settings</h1>

      <SectionCard title="Profile">
        <div className={styles.profile}>
          <Avatar name={displayName} size={56} />
          <div>
            <div className={styles.profileName}>{displayName}</div>
            <div className={styles.profileSub}>ID {user ? user.userId : '—'}</div>
          </div>
        </div>
        <InfoRow label="Core version" value={coreVersion ?? '—'} mono />
      </SectionCard>

      <SectionCard title="Appearance" icon={<SunIcon size={18} />}>
        <Appearance />
      </SectionCard>

      <SectionCard title="Privacy & Security" icon={<ShieldIcon size={18} />}>
        <div className={styles.securityWrap}>
          <SecurityBadge withSentence />
        </div>
        <ul className={styles.bullets}>
          {PROTECTIONS.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
        <p className={styles.docsHint}>Details live in the repository (plain files, no external links):</p>
        {DOCS.map((d) => (
          <DocRow key={d.path} title={d.title} path={d.path} />
        ))}
      </SectionCard>

      <SectionCard title="Network" icon={<NetworkIcon size={18} />}>
        <Link className={styles.linkRow} to="/network">
          <span className={styles.linkIcon} aria-hidden="true">
            <NetworkIcon size={20} />
          </span>
          <span className={styles.linkText}>
            <span className={styles.linkTitle}>Relays &amp; connectivity</span>
            <span className={styles.linkSub}>Message and file relays, Tor, advanced JSON</span>
          </span>
          <ChevronRightIcon size={18} className={styles.linkChevron} aria-hidden="true" />
        </Link>
      </SectionCard>

      <SectionCard title="About">
        <div className={styles.aboutHead}>
          <BrandLockup />
          <p className={styles.provisional}>Provisional name.</p>
        </div>
        <InfoRow label="License" value="AGPL-3.0" mono />
        <p className={styles.body}>
          Built on the official, unmodified SimpleX Chat core. This is attribution, not affiliation:
          the project is independent and is not endorsed by SimpleX Chat Ltd.
        </p>
        <p className={styles.noTrack}>No telemetry. No ads. No tracking.</p>
      </SectionCard>

      <SectionCard title="Danger Zone" tone="danger" icon={<AlertIcon size={18} />}>
        <h3 className={styles.subTitle}>Lock and close</h3>
        <p className={styles.body}>
          Locks the encrypted database and shuts Fuck WhatsApp down: the core exits, the passphrase
          leaves memory, the local session is invalidated and temporary files are cleaned up. Opening
          it again requires your password — there is no unlock bypass.
        </p>
        <div className={styles.dangerActions}>
          <button type="button" className="btn btn-danger" onClick={() => setConfirmLock(true)}>
            <LockIcon size={18} />
            Lock and close
          </button>
        </div>
      </SectionCard>

      {confirmLock ? (
        <ConfirmDialog
          title="Lock and close?"
          body="This locks your database and shuts the app down. Any unsent draft is discarded. You'll need your password to open it again."
          confirmLabel="Lock and close"
          cancelLabel="Cancel"
          tone="danger"
          onConfirm={() => void doLockAndClose()}
          onCancel={() => setConfirmLock(false)}
        />
      ) : null}
    </div>
  );
}
