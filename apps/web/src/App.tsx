/**
 * App shell: phase gating (splash / no-session / onboarding / unlock /
 * starting / error / ready) and the responsive layout. Mobile = single column
 * + bottom tab bar; desktop (>=900px) = brand sidebar (chat list + nav) +
 * content. Each surface owns its own header. Theme/prefs + toasts live here.
 */
import { useEffect, useState } from 'react';
import { HashRouter, Navigate, NavLink, Route, Routes } from 'react-router-dom';
import { useSessionStore } from './state/sessionStore';
import { useChatsStore } from './state/chatsStore';
import { useUiStore } from './state/uiStore';
import EmptyState from './components/common/EmptyState';
import Spinner from './components/common/Spinner';
import ToastHost from './components/common/ToastHost';
import { BrandLockup, Wordmark } from './components/brand/Logo';
import { ChatsIcon, ConnectIcon, NetworkIcon, SettingsIcon } from './components/icons';
import Onboarding from './views/Onboarding';
import ChatList from './views/ChatList';
import Conversation from './views/Conversation';
import Connect from './views/Connect';
import Network from './views/Network';
import Settings from './views/Settings';

const DESKTOP_QUERY = '(min-width: 900px)';

function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(() => window.matchMedia(DESKTOP_QUERY).matches);
  useEffect(() => {
    const mq = window.matchMedia(DESKTOP_QUERY);
    const onChange = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return isDesktop;
}

function Splash({ hint }: { hint?: string }) {
  return (
    <div className="splash">
      <Wordmark stacked />
      <p className="splash-hint">Your messages. Your device. Nobody else.</p>
      <Spinner />
      {hint ? <p className="splash-hint">{hint}</p> : null}
    </div>
  );
}

const NAV_ITEMS = [
  { to: '/chats', label: 'Chats', Icon: ChatsIcon },
  { to: '/connect', label: 'Connect', Icon: ConnectIcon },
  { to: '/network', label: 'Network', Icon: NetworkIcon },
  { to: '/settings', label: 'Settings', Icon: SettingsIcon },
] as const;

function Nav({ variant }: { variant: 'tabbar' | 'sidebar' }) {
  return (
    <nav className={variant === 'tabbar' ? 'tabbar' : 'sidebar-nav'} aria-label="Main">
      {NAV_ITEMS.map(({ to, label, Icon }) => (
        <NavLink key={to} to={to} className={({ isActive }) => `nav-item${isActive ? ' nav-item-active' : ''}`}>
          <Icon size={22} />
          {label}
        </NavLink>
      ))}
    </nav>
  );
}

function MainRoutes({ desktop }: { desktop: boolean }) {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/chats" replace />} />
      <Route
        path="/chats"
        element={
          desktop ? (
            <EmptyState title="Select a chat" body="Pick a conversation from the list, or start one from Connect." />
          ) : (
            <ChatList variant="mobile" />
          )
        }
      />
      <Route path="/chat/:contactId" element={<Conversation />} />
      <Route path="/connect" element={<Connect />} />
      <Route path="/network" element={<Network />} />
      <Route path="/settings" element={<Settings />} />
      <Route path="*" element={<Navigate to="/chats" replace />} />
    </Routes>
  );
}

export default function App() {
  const phase = useSessionStore((s) => s.phase);
  const errorCode = useSessionStore((s) => s.errorCode);
  const init = useSessionStore((s) => s.init);
  const initPrefs = useUiStore((s) => s.initPrefs);
  const isDesktop = useIsDesktop();

  useEffect(() => {
    void initPrefs();
    void init();
  }, [init, initPrefs]);

  useEffect(() => {
    if (phase !== 'ready') return;
    const chats = useChatsStore.getState();
    chats.startEventPump(); // idempotent
    void chats.loadChats();
  }, [phase]);

  let content: React.ReactNode;

  if (phase === 'boot') content = <Splash />;
  else if (phase === 'starting') content = <Splash hint="Starting the encrypted core…" />;
  else if (phase === 'no-session') {
    content = (
      <div className="page-center">
        <EmptyState
          title="Session expired"
          body="Restart from the terminal (npm start) and open the printed link."
        />
      </div>
    );
  } else if (phase === 'error') {
    content = (
      <div className="page-center">
        <EmptyState title="Something went wrong" body={`Error code: ${errorCode ?? 'internal'}`}>
          <button type="button" className="btn btn-primary" onClick={() => void init()}>
            Retry
          </button>
        </EmptyState>
      </div>
    );
  } else if (phase === 'onboarding' || phase === 'unlock') {
    content = <Onboarding />;
  } else {
    // phase === 'ready'
    content = (
      <HashRouter>
        {isDesktop ? (
          <div className="shell-desktop">
            <aside className="sidebar">
              <div className="sidebar-brand">
                <BrandLockup />
              </div>
              <div className="sidebar-body">
                <ChatList variant="sidebar" />
              </div>
              <Nav variant="sidebar" />
            </aside>
            <main className="shell-content">
              <MainRoutes desktop />
            </main>
          </div>
        ) : (
          <div className="shell-mobile">
            <main className="shell-content">
              <MainRoutes desktop={false} />
            </main>
            <Nav variant="tabbar" />
          </div>
        )}
      </HashRouter>
    );
  }

  return (
    <div className="app">
      {content}
      <ToastHost />
    </div>
  );
}
