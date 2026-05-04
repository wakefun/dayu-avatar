import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';
import { AppShell } from './components/AppShell';
import { api } from './lib/api';
import type { SessionSummary, User } from './lib/types';
import { GalleryPage } from './pages/GalleryPage';
import { GeneratePage } from './pages/GeneratePage';
import { HistoryPage } from './pages/HistoryPage';
import { LoadingPage } from './pages/LoadingPage';
import { LoginPage } from './pages/LoginPage';
import { QueuePage } from './pages/QueuePage';
import { ResultPage } from './pages/ResultPage';
import { SettingsPage } from './pages/SettingsPage';

const titles: Record<string, string> = {
  '/': '头像生成',
  '/gallery': '我的图库',
  '/queue': '任务队列',
  '/history': '历史记录',
  '/settings': '账户设置',
};

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

export function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<SessionSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  const refreshSession = async () => {
    const response = await api.me();
    setUser(response.user);
    setSession(response.session);
    return response;
  };

  useEffect(() => {
    void (async () => {
      try {
        const response = await refreshSession();
        if (!response.user && location.pathname !== '/login') {
          navigate('/login', { replace: true });
        }
      } catch {
        setUser(null);
        setSession(null);
        if (location.pathname !== '/login') {
          navigate('/login', { replace: true });
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [location.pathname, navigate]);

  useEffect(() => {
    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  }, []);

  const title = useMemo(() => {
    if (location.pathname.startsWith('/generate/loading')) {
      return '生成中';
    }
    if (location.pathname.startsWith('/generate/result')) {
      return '生成结果';
    }
    return titles[location.pathname] ?? '大宇头像';
  }, [location.pathname]);

  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center px-6 text-sm text-[#6b5f59]">
        正在准备画廊空间...
      </div>
    );
  }

  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <AppShell
      title={title}
      user={user}
      drawerOpen={drawerOpen}
      installAvailable={Boolean(installPrompt)}
      onOpenDrawer={() => setDrawerOpen(true)}
      onCloseDrawer={() => setDrawerOpen(false)}
      onInstallApp={async () => {
        setDrawerOpen(false);
        if (!installPrompt) {
          return;
        }
        await installPrompt.prompt();
        await installPrompt.userChoice;
        setInstallPrompt(null);
      }}
    >
      <Routes>
        <Route path="/login" element={<Navigate to="/" replace />} />
        <Route path="/" element={<GeneratePage />} />
        <Route path="/generate/loading/:taskId" element={<LoadingPage />} />
        <Route path="/generate/result/:taskId" element={<ResultPage />} />
        <Route path="/gallery" element={<GalleryPage onUserUpdated={setUser} />} />
        <Route path="/queue" element={<QueuePage />} />
        <Route path="/history" element={<HistoryPage />} />
        <Route
          path="/settings"
          element={
            <SettingsPage
              user={user}
              session={session}
              onLogout={() => {
                setUser(null);
                setSession(null);
              }}
            />
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  );
}
