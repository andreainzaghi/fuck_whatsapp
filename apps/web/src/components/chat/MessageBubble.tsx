/**
 * A single message bubble. Outgoing bubbles sit right (accent-ink family),
 * incoming left (hairline surface). Content is rendered by kind; text is always
 * plain (pre-wrap, no linkification, no dangerouslySetInnerHTML) so it is
 * XSS-safe. Outgoing bubbles show delivery ticks via MessageStatus.
 */
import { memo } from 'react';
import type { Message } from '../../state/chatsStore';
import { timeOfDay } from './format';
import MessageStatus from './MessageStatus';
import ImageMessage from './ImageMessage';
import VideoMessage from './VideoMessage';
import FileMessage from './FileMessage';
import AudioMessage from './AudioMessage';
import type { MediaItem } from './MediaViewer';
import styles from './message.module.css';

interface Props {
  msg: Message;
  senderName: string;
  runStart: boolean;
  onOpenMedia: (item: MediaItem) => void;
}

function MessageBubble({ msg, senderName, runStart, onOpenMedia }: Props) {
  const out = msg.dir === 'out';
  const isMedia = msg.kind === 'image' || msg.kind === 'video';
  const hasText = msg.text.trim().length > 0;
  // Show the text paragraph for text messages (even if empty) and for captions
  // that accompany a media/file/voice attachment.
  const showText = msg.kind === 'text' || hasText;

  const bubbleClass = [
    styles['bubble'],
    out ? styles['bubbleOut'] : styles['bubbleIn'],
    isMedia ? styles['bubbleMedia'] : '',
  ]
    .filter(Boolean)
    .join(' ');

  const rowClass = [styles['row'], out ? styles['rowOut'] : styles['rowIn'], runStart ? styles['rowStart'] : '']
    .filter(Boolean)
    .join(' ');

  return (
    <div className={rowClass}>
      <div className={bubbleClass}>
        {msg.kind === 'image' ? <ImageMessage msg={msg} senderName={senderName} onOpen={onOpenMedia} /> : null}
        {msg.kind === 'video' ? <VideoMessage msg={msg} senderName={senderName} onOpen={onOpenMedia} /> : null}
        {msg.kind === 'file' ? <FileMessage msg={msg} /> : null}
        {msg.kind === 'voice' ? <AudioMessage msg={msg} /> : null}
        {showText ? <p className={styles['text']}>{msg.text}</p> : null}
        <span className={`${styles['meta']} ${isMedia && !hasText ? styles['metaOnMedia'] : ''}`}>
          <span className={styles['time']}>{timeOfDay(msg.ts)}</span>
          {out ? <MessageStatus status={msg.status} /> : null}
        </span>
      </div>
    </div>
  );
}

export default memo(MessageBubble);
