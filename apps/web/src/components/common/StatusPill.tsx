import type { WsStatus } from '../../lib/coreClient';

const LABELS: Record<WsStatus, string> = {
  open: 'Connected',
  connecting: 'Connecting…',
  closed: 'Reconnecting…',
};

export default function StatusPill({ status }: { status: WsStatus }) {
  return (
    <span className={`status-pill status-${status}`}>
      <span className="status-dot" aria-hidden="true" />
      {LABELS[status]}
    </span>
  );
}
