/**
 * Collapsed-by-default advanced panel: edit the raw servers JSON and apply it
 * with `/_servers <userId> <json>`, reset to the baseline captured at first
 * load of the session, and run a connectivity check (`/_network`).
 *
 * SECURITY: nothing is logged. Result pills show only protocol discriminators
 * (`resp.type`) or fixed sanitized labels — never payload content.
 */
import { useEffect, useState } from 'react';
import { coreClient } from '../../lib/coreClient';
import { ChevronRightIcon } from '../icons';
import { getOriginalServers, type RawUserServers } from './serversConfig';
import styles from './network.module.css';

interface Result {
  kind: 'ok' | 'err';
  label: string;
}

export interface AdvancedPanelProps {
  userId: number | null;
  /** Current raw config as returned by the core (prefills the textarea). */
  raw: RawUserServers | null;
  /** Reload both the store view and the raw config after a change. */
  onReload: () => Promise<void>;
}

export default function AdvancedPanel({ userId, raw, onReload }: AdvancedPanelProps) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [applyResult, setApplyResult] = useState<Result | null>(null);
  const [netResult, setNetResult] = useState<Result | null>(null);

  useEffect(() => {
    setText(raw ? JSON.stringify(raw, null, 2) : '');
  }, [raw]);

  async function applyConfig(config: unknown): Promise<void> {
    if (userId == null || busy) return;
    setBusy(true);
    setApplyResult(null);
    try {
      const resp = await coreClient.send(`/_servers ${userId} ${JSON.stringify(config)}`);
      if (resp.type === 'cmdOk') {
        setApplyResult({ kind: 'ok', label: 'applied · cmdOk' });
        await onReload();
      } else {
        setApplyResult({ kind: 'err', label: `rejected · ${resp.type}` });
      }
    } catch {
      setApplyResult({ kind: 'err', label: 'failed · no response' });
    } finally {
      setBusy(false);
    }
  }

  function onApply(): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      setApplyResult({ kind: 'err', label: 'invalid JSON' });
      return;
    }
    void applyConfig(parsed);
  }

  function onReset(): void {
    const baseline = getOriginalServers();
    if (!baseline) {
      setApplyResult({ kind: 'err', label: 'no baseline loaded yet' });
      return;
    }
    void applyConfig(baseline);
  }

  async function onCheck(): Promise<void> {
    if (busy) return;
    setBusy(true);
    setNetResult(null);
    try {
      const resp = await coreClient.send('/_network');
      if (resp.type === 'networkConfig') setNetResult({ kind: 'ok', label: 'ok · networkConfig' });
      else setNetResult({ kind: 'err', label: `error · ${resp.type}` });
    } catch {
      setNetResult({ kind: 'err', label: 'error · no response' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={styles.card}>
      <button
        type="button"
        className={styles.advToggle}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className={styles.advToggleText}>
          Advanced
          <span className={styles.advToggleSub}>Raw servers JSON, reset and connectivity check</span>
        </span>
        <ChevronRightIcon
          size={20}
          className={open ? `${styles.advChevron} ${styles.advChevronOpen}` : styles.advChevron}
          aria-hidden="true"
        />
      </button>
      {open ? (
        <div className={styles.advBody}>
          <p className={styles.advHint}>
            Raw servers configuration, exactly as the core reports it. Edit the JSON and apply, or
            reset to the configuration loaded when this session started.
          </p>
          <textarea
            className={styles.jsonArea}
            value={text}
            onChange={(e) => setText(e.target.value)}
            spellCheck={false}
            aria-label="Servers configuration JSON"
          />
          <div className={styles.btnRow}>
            <button type="button" className="btn btn-primary" onClick={onApply} disabled={busy || userId == null}>
              Apply
            </button>
            <button type="button" className="btn" onClick={onReset} disabled={busy || userId == null}>
              Reset to preset
            </button>
            {applyResult ? (
              <span
                className={`${styles.resultPill} ${applyResult.kind === 'ok' ? styles.resultOk : styles.resultErr}`}
                role="status"
              >
                {applyResult.label}
              </span>
            ) : null}
          </div>
          <div className={styles.btnRow}>
            <button type="button" className="btn" onClick={() => void onCheck()} disabled={busy}>
              Connectivity check
            </button>
            {netResult ? (
              <span
                className={`${styles.resultPill} ${netResult.kind === 'ok' ? styles.resultOk : styles.resultErr}`}
                role="status"
              >
                {netResult.label}
              </span>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
