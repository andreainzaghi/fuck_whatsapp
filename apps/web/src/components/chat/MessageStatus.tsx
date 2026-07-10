/**
 * Outgoing delivery status ticks. Never relies on colour alone: failed states
 * pair the danger icon with the words "Not sent".
 *   sndNew            -> ClockIcon (pending)
 *   sndSent           -> CheckIcon (sent)
 *   sndRcvd           -> DoubleCheckIcon in accent (received)
 *   sndError/AuthErr  -> AlertIcon in danger + "Not sent"
 */
import { AlertIcon, CheckIcon, ClockIcon, DoubleCheckIcon } from '../icons';
import styles from './message.module.css';

const TICK = 15;

export default function MessageStatus({ status }: { status: string }) {
  if (status === 'sndError' || status === 'sndErrorAuth') {
    return (
      <span className={styles['ticksError']}>
        <AlertIcon size={13} />
        Not sent
      </span>
    );
  }
  if (status === 'sndRcvd' || status === 'rcvRead') {
    return (
      <span className={`${styles['ticks']} ${styles['ticksRead']}`} aria-label="Read">
        <DoubleCheckIcon size={TICK} />
      </span>
    );
  }
  if (status === 'sndSent') {
    return (
      <span className={styles['ticks']} aria-label="Sent">
        <CheckIcon size={TICK} />
      </span>
    );
  }
  // sndNew and any other pending state.
  return (
    <span className={styles['ticks']} aria-label="Sending">
      <ClockIcon size={TICK} />
    </span>
  );
}
