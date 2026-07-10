/**
 * Network view — configured relay operators and servers, straight from the
 * core (`/_servers <userId>`), plus the advanced raw-JSON editor and the Tor
 * note. No server address is ever invented client-side.
 */
import { useCallback, useEffect, useState } from 'react';
import { useNetworkStore } from '../state/networkStore';
import { useSessionStore } from '../state/sessionStore';
import OperatorCard from '../components/network/OperatorCard';
import AdvancedPanel from '../components/network/AdvancedPanel';
import { NetworkIcon } from '../components/icons';
import { fetchRawServers, rolesForOperator, type RawUserServers } from '../components/network/serversConfig';
import styles from '../components/network/network.module.css';

const LEAD =
  'Relays are interchangeable transport. They queue encrypted messages they cannot read. ' +
  'You can replace them without changing your identity or losing contacts.';

export default function Network() {
  const operators = useNetworkStore((s) => s.operators);
  const load = useNetworkStore((s) => s.load);
  const userId = useSessionStore((s) => s.user?.userId ?? null);
  const [raw, setRaw] = useState<RawUserServers | null>(null);

  const reload = useCallback(async () => {
    await load();
    if (userId != null) setRaw(await fetchRawServers(userId));
  }, [load, userId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return (
    <div className="page">
      <h1 className={styles.title}>Network</h1>
      <p className={styles.lead}>{LEAD}</p>

      {operators.length === 0 ? (
        <p className={styles.emptyNote}>No server configuration loaded from the core yet.</p>
      ) : (
        operators.map((op, i) => (
          <OperatorCard key={`${op.name}-${i}`} op={op} roles={rolesForOperator(raw, op.name)} />
        ))
      )}

      <AdvancedPanel userId={userId} raw={raw} onReload={reload} />

      <section className={styles.card}>
        <div className={styles.noteHead}>
          <span className={styles.noteIcon} aria-hidden="true">
            <NetworkIcon size={18} />
          </span>
          <h2 className={styles.noteTitle}>Tor</h2>
        </div>
        <p className={styles.noteBody}>
          Run a local Tor SOCKS proxy and start FWA with{' '}
          <span className={styles.noteMono}>FWA_SOCKS_PROXY=127.0.0.1:9050</span> to route relay traffic
          through Tor.
        </p>
      </section>
    </div>
  );
}
