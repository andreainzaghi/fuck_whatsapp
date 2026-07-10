/**
 * Configured SMP/XFTP servers per operator, straight from the core
 * (`/_servers <userId>`). Read-only view for the Network panel.
 */
import { create } from 'zustand';
import { sxCommands, type SxResponse, type SxUserServer, type SxUserServers } from '@fwa/shared-types';
import { coreClient } from '../lib/coreClient';
import { useSessionStore } from './sessionStore';

export interface NetworkServer {
  server: string;
  preset: boolean;
  enabled: boolean;
}

export interface NetworkOperator {
  name: string;
  enabled: boolean;
  smp: NetworkServer[];
  xftp: NetworkServer[];
}

export interface NetworkState {
  operators: NetworkOperator[];
  load(): Promise<void>;
}

function mapServers(servers: SxUserServer[] | undefined): NetworkServer[] {
  return (servers ?? [])
    .filter((s) => !s.deleted)
    .map((s) => ({ server: s.server, preset: s.preset, enabled: s.enabled }));
}

export const useNetworkStore = create<NetworkState>((set) => ({
  operators: [],

  async load(): Promise<void> {
    const userId = useSessionStore.getState().user?.userId;
    if (userId == null) return;
    let resp: SxResponse;
    try {
      resp = await coreClient.send(sxCommands.getServers(userId));
    } catch {
      return;
    }
    if (resp.type !== 'userServers') return;
    const groups = (resp as SxUserServers).userServers;
    set({
      operators: groups.map((g) => ({
        name: g.operator?.tradeName ?? 'Custom servers',
        enabled: g.operator?.enabled ?? true,
        smp: mapServers(g.smpServers),
        xftp: mapServers(g.xftpServers),
      })),
    });
  },
}));
