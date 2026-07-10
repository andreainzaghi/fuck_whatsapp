/**
 * One conversation row: avatar + name + preview + time + unread badge.
 * A whole-row <Link> to /chat/:contactId. Attachment-style previews get a
 * quiet leading glyph. No logging of names or preview text.
 */
import { Link } from 'react-router-dom';
import Avatar from '../common/Avatar';
import { ImageIcon, MicIcon, VideoIcon, FileIcon } from '../icons';
import styles from './chatList.module.css';

interface ChatSummary {
  contactId: number;
  displayName: string;
  lastText: string;
  lastTs: string;
  unread: number;
}

function two(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** HH:MM if today, else short weekday within the last week, else DD/MM. */
function listTime(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return `${two(d.getHours())}:${two(d.getMinutes())}`;
  }
  const days = (now.getTime() - d.getTime()) / 86_400_000;
  if (days > 0 && days < 7) return d.toLocaleDateString([], { weekday: 'short' });
  return `${two(d.getDate())}/${two(d.getMonth() + 1)}`;
}

/** A quiet leading glyph for attachment-style previews; null for plain text. */
function previewGlyph(text: string): React.ReactNode {
  if (text === 'Photo') return <ImageIcon size={15} />;
  if (text === 'Voice message') return <MicIcon size={15} />;
  if (text === 'Video') return <VideoIcon size={15} />;
  // filename-looking: no spaces, ends in a short extension.
  if (/^\S+\.[A-Za-z0-9]{1,8}$/.test(text)) return <FileIcon size={15} />;
  return null;
}

export default function ChatListItem({ chat, active }: { chat: ChatSummary; active: boolean }) {
  const time = listTime(chat.lastTs);
  const glyph = previewGlyph(chat.lastText);
  const hasUnread = chat.unread > 0;

  return (
    <Link
      to={`/chat/${chat.contactId}`}
      className={`${styles['row']} ${active ? styles['rowActive'] : ''}`}
    >
      <span className={styles['avatarWrap']}>
        <Avatar name={chat.displayName} />
      </span>
      <span className={styles['main']}>
        <span className={styles['top']}>
          <span className={styles['name']}>{chat.displayName}</span>
          {time ? (
            <span className={`${styles['time']} ${hasUnread ? styles['timeUnread'] : ''}`}>{time}</span>
          ) : null}
        </span>
        <span className={styles['bottom']}>
          <span className={styles['preview']}>
            {glyph ? (
              <span className={styles['previewIcon']} aria-hidden="true">
                {glyph}
              </span>
            ) : null}
            <span className={styles['previewText']}>{chat.lastText || ' '}</span>
          </span>
          {hasUnread ? (
            <span className={styles['badge']} aria-label={`${chat.unread} unread`}>
              {chat.unread > 99 ? '99+' : chat.unread}
            </span>
          ) : null}
        </span>
      </span>
    </Link>
  );
}
