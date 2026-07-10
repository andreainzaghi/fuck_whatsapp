/**
 * Raw `/_servers <userId>` configuration handling for the Network view.
 *
 * The networkStore keeps a simplified read-model; the Advanced panel needs the
 * REAL round-trippable JSON the core returned, so it is fetched here directly.
 * The very first successful load of the browser session is kept as the
 * pristine baseline for "Reset to preset".
 *
 * SECURITY: nothing here is ever logged; server addresses only ever come FROM
 * the core — this module never invents or hardcodes any address.
 */
import { sxCommands, type SxServerOperator, type SxUserServers } from '@fwa/shared-types';
import { coreClient } from '../../lib/coreClient';

export type RawUserServers = SxUserServers['userServers'];

/** Pristine config captured at the first successful load of this session. */
let original: RawUserServers | null = null;

/** Fetch the current raw servers config from the core (null on any failure). */
export async function fetchRawServers(userId: number): Promise<RawUserServers | null> {
  try {
    const resp = await coreClient.send(sxCommands.getServers(userId));
    if (resp.type !== 'userServers') return null;
    const raw = (resp as SxUserServers).userServers;
    if (original === null) {
      // deep copy so later in-place edits can never mutate the baseline
      original = JSON.parse(JSON.stringify(raw)) as RawUserServers;
    }
    return raw;
  } catch {
    return null;
  }
}

/** The baseline captured at first load, or null if never loaded. */
export function getOriginalServers(): RawUserServers | null {
  return original;
}

function formatRoles(r: SxServerOperator['smpRoles']): string {
  const parts = [r.storage ? 'storage' : null, r.proxy ? 'proxy' : null].filter(Boolean);
  return parts.length > 0 ? parts.join(' + ') : 'none';
}

/** Human-readable roles line for an operator card, matched by trade name. */
export function rolesForOperator(raw: RawUserServers | null, name: string): string | null {
  const op = raw?.find((g) => g.operator?.tradeName === name)?.operator;
  if (!op) return null;
  return `SMP roles: ${formatRoles(op.smpRoles)} · XFTP roles: ${formatRoles(op.xftpRoles)}`;
}
