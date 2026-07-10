/**
 * Day-grouped message timeline with a scroll container that autoscrolls to the
 * bottom on open and on new messages — but only while the reader is already
 * near the bottom. When suppressed, a scroll-to-bottom FAB appears with the
 * count of unseen incoming messages. Media loads never shift layout because the
 * inline preview reserves the box.
 */
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useChatsStore, type Message } from '../../state/chatsStore';
import { ChevronRightIcon, ShieldIcon } from '../icons';
import { dayKey } from './format';
import DateSeparator from './DateSeparator';
import MessageBubble from './MessageBubble';
import type { MediaItem } from './MediaViewer';
import styles from './conversation.module.css';

const EMPTY: Message[] = [];
const NEAR_BOTTOM_PX = 80;

export default function MessageTimeline({
  contactId,
  senderName,
  onOpenMedia,
}: {
  contactId: number;
  senderName: string;
  onOpenMedia: (item: MediaItem) => void;
}) {
  const msgs = useChatsStore((s) => s.messages[contactId] ?? EMPTY);

  const listRef = useRef<HTMLDivElement | null>(null);
  const nearBottomRef = useRef(true);
  const prevRef = useRef<{ cid: number; len: number }>({ cid: -1, len: 0 });
  const [unseen, setUnseen] = useState(0);

  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const prev = prevRef.current;
    const isNewChat = prev.cid !== contactId;
    const added = isNewChat ? 0 : Math.max(0, msgs.length - prev.len);
    prevRef.current = { cid: contactId, len: msgs.length };

    const last = msgs[msgs.length - 1];
    const lastIsIncoming = last?.dir === 'in';

    // Own sends always follow to the bottom; incoming respects reading position.
    if (isNewChat || nearBottomRef.current || (added > 0 && !lastIsIncoming)) {
      el.scrollTop = el.scrollHeight;
      nearBottomRef.current = true;
      setUnseen(0);
    } else if (added > 0) {
      setUnseen((n) => n + added);
    }
  }, [msgs, contactId]);

  function onScroll(): void {
    const el = listRef.current;
    if (!el) return;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
    nearBottomRef.current = near;
    if (near) setUnseen(0);
  }

  function jumpToBottom(): void {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    nearBottomRef.current = true;
    setUnseen(0);
  }

  if (msgs.length === 0) {
    return (
      <div className={styles['scroll']} ref={listRef}>
        <div className={styles['emptyChat']}>
          <ShieldIcon size={28} className={styles['emptyIcon']} />
          <p className={styles['emptyText']}>No messages yet. Say something.</p>
        </div>
      </div>
    );
  }

  const rows: ReactNode[] = [];
  let lastDay = '';
  let lastDir: Message['dir'] | null = null;
  for (const m of msgs) {
    const k = dayKey(m.ts);
    if (k && k !== lastDay) {
      rows.push(<DateSeparator key={`day-${k}`} iso={m.ts} />);
      lastDay = k;
      lastDir = null;
    }
    const runStart = m.dir !== lastDir;
    lastDir = m.dir;
    rows.push(
      <MessageBubble key={m.itemId} msg={m} senderName={senderName} runStart={runStart} onOpenMedia={onOpenMedia} />,
    );
  }

  return (
    <div className={styles['scroll']} ref={listRef} onScroll={onScroll}>
      <div className={styles['timeline']}>{rows}</div>

      {unseen > 0 ? (
        <button
          type="button"
          className={styles['fab']}
          onClick={jumpToBottom}
          aria-label={`Scroll to latest, ${unseen} new`}
        >
          <ChevronRightIcon size={18} style={{ transform: 'rotate(90deg)' }} />
          <span className={styles['fabBadge']}>{unseen}</span>
        </button>
      ) : null}
    </div>
  );
}
