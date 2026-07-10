/**
 * Chat list view — the daily home surface. Quiet, WhatsApp-familiar: brand +
 * status + search + conversation rows, with a round accent "new chat" FAB.
 *
 * variant 'mobile'  : full-screen column with brand header + FAB (single-pane).
 * variant 'sidebar' : desktop rail — no brand header, no FAB, active-row state.
 *
 * Live data from chatsStore (loadChats on mount + the WS event pump). No mock
 * data, no logging of names or preview text.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useChatsStore } from '../state/chatsStore';
import IconButton from '../components/common/IconButton';
import StatusPill from '../components/common/StatusPill';
import { BrandLockup } from '../components/brand/Logo';
import { SettingsIcon, PlusIcon } from '../components/icons';
import SearchBar from '../components/chat/SearchBar';
import ChatListItem from '../components/chat/ChatListItem';
import ChatListSkeleton from '../components/chat/ChatListSkeleton';
import styles from '../components/chat/chatList.module.css';

export default function ChatList({ variant }: { variant: 'mobile' | 'sidebar' }) {
  const chats = useChatsStore((s) => s.chats);
  const wsStatus = useChatsStore((s) => s.wsStatus);
  const activeContactId = useChatsStore((s) => s.activeContactId);
  const navigate = useNavigate();

  const [query, setQuery] = useState('');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    void useChatsStore
      .getState()
      .loadChats()
      .finally(() => {
        if (alive) setLoaded(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  const visible = useMemo(() => {
    const sorted = [...chats].sort((a, b) =>
      a.lastTs < b.lastTs ? 1 : a.lastTs > b.lastTs ? -1 : 0,
    );
    const q = query.trim().toLowerCase();
    if (!q) return sorted;
    return sorted.filter(
      (c) =>
        c.displayName.toLowerCase().includes(q) || (c.lastText ?? '').toLowerCase().includes(q),
    );
  }, [chats, query]);

  const isSidebar = variant === 'sidebar';
  const showSkeleton = chats.length === 0 && !loaded;
  const showEmpty = chats.length === 0 && loaded;

  return (
    <div className={styles['wrap']}>
      {isSidebar ? null : (
        <header className={styles['header']}>
          <BrandLockup className={styles['headerBrand']} />
          <span className={styles['headerSpacer']} />
          <span className={styles['headerStatus']}>
            <StatusPill status={wsStatus} />
          </span>
          <IconButton label="Settings" onClick={() => navigate('/settings')}>
            <SettingsIcon size={22} />
          </IconButton>
        </header>
      )}

      {isSidebar ? (
        <Link to="/connect" className={styles['newChatRow']}>
          <span className={styles['newChatIcon']} aria-hidden="true">
            <PlusIcon size={20} />
          </span>
          New chat
        </Link>
      ) : null}

      <SearchBar value={query} onChange={setQuery} />

      <div className={styles['scroll']}>
        {showSkeleton ? (
          <ChatListSkeleton rows={5} />
        ) : showEmpty ? (
          <div className="empty-state">
            <h2 className="empty-state-title">No conversations yet</h2>
            <p className="empty-state-body">No contacts. No central directory. Good.</p>
            <Link to="/connect" className="btn btn-primary">
              Connect with someone
            </Link>
          </div>
        ) : visible.length === 0 ? (
          <div className="empty-state">
            <p className="empty-state-body">No conversations match your search.</p>
          </div>
        ) : (
          <ul className={styles['list']}>
            {visible.map((chat) => (
              <li key={chat.contactId}>
                <ChatListItem chat={chat} active={isSidebar && activeContactId === chat.contactId} />
              </li>
            ))}
          </ul>
        )}
      </div>

      {isSidebar ? null : (
        <Link to="/connect" className={styles['fab']} aria-label="New chat" title="New chat">
          <PlusIcon size={26} />
        </Link>
      )}
    </div>
  );
}
