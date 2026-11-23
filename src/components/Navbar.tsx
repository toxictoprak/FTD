import { useState } from 'react';
import { Menu, X } from 'lucide-react';
import type { PageRoute } from '../types/ftd';
import { usePlatform } from '../context/PlatformContext';

interface NavbarProps {
  currentRoute: PageRoute;
  onNavigate: (route: PageRoute) => void;
  onOpenAdminLogin: () => void;
}

const navItems: Array<{ route: PageRoute; label: string }> = [
  { route: 'home', label: 'Home' },
  { route: 'ballon-dor', label: "Ballon d'Or" },
  { route: 'live', label: 'Live' },
  { route: 'admin', label: 'Admin Panel' },
];

export function Navbar({ currentRoute, onNavigate, onOpenAdminLogin }: NavbarProps) {
  const { state, isAdmin } = usePlatform();
  const [mobileOpen, setMobileOpen] = useState(false);

  const logoUrl = state?.site.logoUrl || '/assets/aistudio/IMG_0674_a69c6a83.png';
  const brandName = state?.site.brandName || 'FTD';

  const handleNav = (route: PageRoute) => {
    setMobileOpen(false);
    onNavigate(route);
  };

  return (
    <header className="sticky top-0 z-40 bg-[#050608]/95 backdrop-blur-md border-b border-white/10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-8">
        {/* Zone 1: Brand Title + FTD Logo */}
        <button
          type="button"
          onClick={() => handleNav('home')}
          className="flex items-center gap-3 text-left whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-white rounded-sm"
        >
          <img
            src={logoUrl}
            alt={`${brandName} Official Logo`}
            referrerPolicy="no-referrer"
            className="h-8 w-auto object-contain"
          />
          <span className="font-display text-2xl font-extrabold tracking-wider text-white uppercase">
            {brandName}
          </span>
        </button>

        {/* Zone 2: 4 Clean Single-Line Nav Links */}
        <nav className="hidden md:flex items-center gap-8" aria-label="Main navigation">
          {navItems.map((item) => {
            const active = currentRoute === item.route;
            return (
              <button
                key={item.route}
                type="button"
                onClick={() => handleNav(item.route)}
                className={`relative py-2 text-sm font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-white ${
                  active ? 'text-white' : 'text-zinc-400 hover:text-white'
                }`}
              >
                <span>{item.label}</span>
                {active && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-white" />
                )}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: 1 Primary CTA Action + Mobile Menu Button */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => {
              if (isAdmin) {
                handleNav('admin');
              } else {
                onOpenAdminLogin();
              }
            }}
            className="px-4 py-2 text-xs font-semibold tracking-wide bg-white text-black hover:bg-zinc-200 transition-colors rounded-md whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-white"
          >
            {isAdmin ? 'Admin Console' : 'Admin Login'}
          </button>

          <button
            type="button"
            onClick={() => setMobileOpen((v) => !v)}
            className="md:hidden p-2 text-zinc-300 hover:text-white rounded-md border border-white/10 cursor-pointer"
            aria-label={mobileOpen ? 'Close navigation menu' : 'Open navigation menu'}
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Responsive Mobile Navigation Drawer */}
      {mobileOpen && (
        <div className="md:hidden border-t border-white/10 bg-[#080A0F] px-4 py-3 space-y-1">
          {navItems.map((item) => {
            const active = currentRoute === item.route;
            return (
              <button
                key={item.route}
                type="button"
                onClick={() => handleNav(item.route)}
                className={`w-full text-left px-3 py-2.5 rounded-md text-sm font-medium transition-colors cursor-pointer ${
                  active ? 'bg-white text-black font-semibold' : 'text-zinc-300 hover:bg-white/5 hover:text-white'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      )}
    </header>
  );
}
