/**
 * Start a private chat: two tabs — "Invite" (create a one-time invitation) and
 * "Join" (paste / scan a peer's invitation). A completed handshake — from
 * either direction — surfaces inside the active panel with a link to chats.
 *
 * Camera note: the QR scanner lives inside the Join tab; switching tabs
 * unmounts it, which stops all MediaStream tracks.
 */
import { useRef, useState } from 'react';
import { useConnectStore } from '../state/connectStore';
import { ConnectIcon } from '../components/icons';
import InvitePanel from '../components/connect/InvitePanel';
import JoinPanel from '../components/connect/JoinPanel';
import styles from '../components/connect/connect.module.css';

type Tab = 'invite' | 'join';

export default function Connect() {
  const [tab, setTab] = useState<Tab>('invite');
  const lastConnected = useConnectStore((s) => s.lastConnected);
  // Only announce connections that happen while this view is open.
  const baseline = useRef(lastConnected);
  const connectedName =
    lastConnected !== null && lastConnected !== baseline.current ? lastConnected : null;

  return (
    <div className="page page-scroll">
      <div className={styles.wrap}>
        <header className="page-header">
          <h1 className="page-title">
            <ConnectIcon size={20} aria-hidden="true" /> Start a private chat
          </h1>
        </header>

        <p className="page-lead" style={{ marginBottom: 0 }}>
          No phone number. No public username. An invitation connects one person directly to you.
        </p>

        <div className={styles.tabs} role="tablist" aria-label="Connect options">
          <button
            type="button"
            role="tab"
            id="tab-invite"
            aria-selected={tab === 'invite'}
            aria-controls="panel-invite"
            className={`${styles.tab} ${tab === 'invite' ? styles.tabActive : ''}`}
            onClick={() => setTab('invite')}
          >
            Invite
          </button>
          <button
            type="button"
            role="tab"
            id="tab-join"
            aria-selected={tab === 'join'}
            aria-controls="panel-join"
            className={`${styles.tab} ${tab === 'join' ? styles.tabActive : ''}`}
            onClick={() => setTab('join')}
          >
            Join
          </button>
        </div>

        {tab === 'invite' ? (
          <div id="panel-invite" role="tabpanel" aria-labelledby="tab-invite">
            <InvitePanel connectedName={connectedName} />
          </div>
        ) : (
          <div id="panel-join" role="tabpanel" aria-labelledby="tab-join">
            <JoinPanel connectedName={connectedName} />
          </div>
        )}
      </div>
    </div>
  );
}
