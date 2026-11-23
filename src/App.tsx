import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { PageRoute } from './types/ftd';
import { PlatformProvider, usePlatform } from './context/PlatformContext';
import { Navbar } from './components/Navbar';
import { AdminLoginModal } from './components/AdminLoginModal';
import { HomePage } from './pages/HomePage';
import { BallonDorPage } from './pages/BallonDorPage';
import { LivePage } from './pages/LivePage';
import { AdminPage } from './pages/AdminPage';
import { ErrorBoundary } from './components/ErrorBoundary';

function routeFromPath(pathname: string): PageRoute {
  const clean = pathname.replace(/\/+$/, '') || '/';
  if (clean === '/ballon-dor') return 'ballon-dor';
  if (clean === '/live') return 'live';
  if (clean === '/admin') return 'admin';
  return 'home';
}

function pathFromRoute(route: PageRoute): string {
  switch (route) {
    case 'ballon-dor':
      return '/ballon-dor';
    case 'live':
      return '/live';
    case 'admin':
      return '/admin';
    default:
      return '/';
  }
}

function AppShell() {
  const { state, loading, error, refreshState } = usePlatform();
  const [route, setRoute] = useState<PageRoute>(() => routeFromPath(window.location.pathname));
  const [loginModalOpen, setLoginModalOpen] = useState(false);

  useEffect(() => {
    const onPopState = () => {
      setRoute(routeFromPath(window.location.pathname));
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const navigate = (nextRoute: PageRoute) => {
    const targetPath = pathFromRoute(nextRoute);
    if (window.location.pathname !== targetPath) {
      window.history.pushState({}, '', targetPath);
    }
    setRoute(nextRoute);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (loading && !state) {
    return (
      <div className="min-h-screen bg-[#050608] text-white flex flex-col items-center justify-center gap-5 px-4">
        <img
          src="/assets/aistudio/IMG_0674_a69c6a83.png"
          alt="FTD"
          className="h-14 w-auto object-contain animate-pulse"
        />
        <div className="w-40 h-1 rounded-full bg-white/10 overflow-hidden">
          <div className="h-full w-1/2 bg-white animate-[pulse_1.2s_ease-in-out_infinite]" />
        </div>
        <div className="text-xs text-zinc-400 tracking-widest uppercase">
          Loading FTD Matchday Arena
        </div>
      </div>
    );
  }

  if (error && !state) {
    return (
      <div className="min-h-screen bg-[#050608] text-white flex flex-col items-center justify-center gap-4 px-4 text-center">
        <h1 className="font-display text-3xl font-bold uppercase">Connection Unavailable</h1>
        <p className="text-sm text-zinc-400 max-w-md">{error}</p>
        <button
          type="button"
          onClick={refreshState}
          className="px-5 py-2.5 rounded-lg bg-white text-black text-xs font-bold uppercase cursor-pointer"
        >
          Retry Connection
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#050608] text-white">
      <Navbar
        currentRoute={route}
        onNavigate={navigate}
        onOpenAdminLogin={() => setLoginModalOpen(true)}
      />

      {state?.site.maintenanceMode && (
        <div className="bg-amber-400 text-black text-xs font-semibold py-2 px-4 text-center">
          FTD Platform Notice: Scheduled competition maintenance is currently underway.
        </div>
      )}

      <main className="flex-1">
        <AnimatePresence mode="wait">
          <motion.div
            key={route}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18 }}
          >
            {route === 'home' && <HomePage onNavigate={navigate} />}
            {route === 'ballon-dor' && <BallonDorPage />}
            {route === 'live' && <LivePage />}
            {route === 'admin' && <AdminPage onOpenLogin={() => setLoginModalOpen(true)} />}
          </motion.div>
        </AnimatePresence>
      </main>

      <footer className="border-t border-white/10 bg-[#040507] py-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <img
              src={state?.site.logoUrl || '/assets/aistudio/IMG_0674_a69c6a83.png'}
              alt="FTD Logo"
              referrerPolicy="no-referrer"
              className="h-7 w-auto object-contain"
            />
            <span className="font-display text-xl font-bold tracking-wider uppercase text-white">
              {state?.site.brandName || 'FTD'}
            </span>
            <span className="text-xs text-zinc-500">· {state?.site.seasonLabel || '2026 Season'}</span>
          </div>

          <div className="flex flex-wrap items-center gap-6 text-xs text-zinc-400">
            <button type="button" onClick={() => navigate('home')} className="hover:text-white cursor-pointer">
              Home
            </button>
            <button type="button" onClick={() => navigate('ballon-dor')} className="hover:text-white cursor-pointer">
              Ballon d&apos;Or
            </button>
            <button type="button" onClick={() => navigate('live')} className="hover:text-white cursor-pointer">
              Live Broadcasts
            </button>
            <button type="button" onClick={() => navigate('admin')} className="hover:text-white cursor-pointer">
              Admin Panel
            </button>
          </div>

          <div className="text-xs text-zinc-500">
            &copy; {new Date().getFullYear()} FTD Football Platform. All rights reserved.
          </div>
        </div>
      </footer>

      <AdminLoginModal
        open={loginModalOpen}
        onClose={() => setLoginModalOpen(false)}
        onSuccess={() => {
          setLoginModalOpen(false);
          navigate('admin');
        }}
      />
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <PlatformProvider>
        <AppShell />
      </PlatformProvider>
    </ErrorBoundary>
  );
}
