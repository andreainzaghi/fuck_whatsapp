/**
 * Conversation view. Orchestrates the sticky header, the day-grouped message
 * timeline, the full-screen media viewer and the composer. Lifecycle: openChat
 * on mount and whenever the contact changes; unread counting resumes when the
 * view unmounts. The composer is disabled while the core socket is not open.
 */
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useChatsStore } from '../state/chatsStore';
import Composer from '../components/chat/Composer';
import ConversationHeader from '../components/chat/ConversationHeader';
import MessageTimeline from '../components/chat/MessageTimeline';
import MediaViewer, { type MediaItem } from '../components/chat/MediaViewer';
import styles from '../components/chat/conversation.module.css';

export default function Conversation() {
  const params = useParams<{ contactId: string }>();
  const contactId = Number(params.contactId);
  const valid = Number.isInteger(contactId) && contactId > 0;
  const navigate = useNavigate();

  const wsStatus = useChatsStore((s) => s.wsStatus);
  const displayName = useChatsStore((s) => s.chats.find((c) => c.contactId === contactId)?.displayName);

  const [media, setMedia] = useState<MediaItem | null>(null);

  // Unknown / malformed contact id: bounce back to the chat list.
  useEffect(() => {
    if (!valid) navigate('/chats', { replace: true });
  }, [valid, navigate]);

  // Load history + mark read on entry and on every contact change.
  useEffect(() => {
    if (valid) void useChatsStore.getState().openChat(contactId);
  }, [contactId, valid]);

  // Leaving the conversation: unread counting must resume for this contact.
  useEffect(
    () => () => {
      useChatsStore.setState({ activeContactId: null });
    },
    [],
  );

  if (!valid) return null;

  const name = displayName ?? `Contact ${contactId}`;

  return (
    <div className={styles['wrap']}>
      <ConversationHeader contactId={contactId} displayName={displayName} />
      <MessageTimeline contactId={contactId} senderName={name} onOpenMedia={setMedia} />
      <Composer contactId={contactId} disabled={wsStatus !== 'open'} />
      {media ? <MediaViewer item={media} onClose={() => setMedia(null)} /> : null}
    </div>
  );
}
