import React, { useState, useMemo, useEffect } from 'react';
import {
  LayoutDashboard,
  PlusCircle,
  Database,
  Users,
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  RefreshCw,
  BarChart3,
  TrendingUp,
  Settings,
  Search,
  Menu,
  X,
  Plus,
  Cloud,
  CheckCircle2,
  ArrowRightLeft,
} from 'lucide-react';
import type { GlobalSearchResult } from '../types/models.ts';

export type NavTab =
  | 'dashboard'
  | 'add-sale'
  | 'accounts'
  | 'account-sell'
  | 'clients'
  | 'active'
  | 'expiring'
  | 'expired'
  | 'replacements'
  | 'analytics'
  | 'settings';

const NAV_ITEMS: Array<{
  id: NavTab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'add-sale', label: 'Add New Sale', icon: PlusCircle },
  { id: 'accounts', label: 'All Accounts', icon: Database },
  { id: 'account-sell', label: 'Account Sell', icon: TrendingUp },
  { id: 'clients', label: 'All Clients', icon: Users },
  { id: 'active', label: 'Active Warranties', icon: ShieldCheck },
  { id: 'expiring', label: 'Expiring Soon', icon: ShieldAlert },
  { id: 'expired', label: 'Expired Warranties', icon: ShieldX },
  { id: 'replacements', label: 'Replacement History', icon: RefreshCw },
  { id: 'analytics', label: 'Sales Analytics', icon: BarChart3 },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export function AppShell({
  activeTab,
  activeEmail,
  expiringCount,
  cloudSyncing,
  searchResults,
  onSearchQueryChange,
  onSelectSearchResult,
  onOpenSwitchEmail,
  onNavigate,
  children,
}: {
  activeTab: NavTab;
  activeEmail: string;
  expiringCount: number;
  cloudSyncing?: boolean;
  searchResults: GlobalSearchResult[];
  onSearchQueryChange: (q: string) => void;
  onSelectSearchResult: (res: GlobalSearchResult) => void;
  onOpenSwitchEmail: () => void;
  onNavigate: (tab: NavTab) => void;
  children: React.ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);

  const activeTitle = useMemo(
    () => NAV_ITEMS.find((n) => n.id === activeTab)?.label || 'Dashboard',
    [activeTab]
  );

  useEffect(() => {
    setSearchText('');
  }, [activeEmail]);

  useEffect(() => {
    if (!mobileOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileOpen(false);
    };
    const handleResize = () => {
      if (window.innerWidth >= 1024) setMobileOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', handleResize);
    };
  }, [mobileOpen]);

  const handleNavClick = (tab: NavTab) => {
    onNavigate(tab);
    setMobileOpen(false);
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  };

  const renderSidebarContent = () => (
    <div className="flex flex-col h-full bg-[#0C0C0F] border-r border-zinc-800/80">
      <div className="px-5 py-5 border-b border-zinc-800/80">
        <p className="text-sm font-bold tracking-normal text-white whitespace-nowrap">
          MUSE SALES MANAGER
        </p>
        <p className="text-[11px] text-zinc-500 mt-0.5 truncate">
          Private Sales &amp; Warranty Control
        </p>
      </div>

      <nav
        aria-label="Primary navigation"
        className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 py-4 space-y-1"
      >
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => handleNavClick(item.id)}
              className={`w-full flex items-center justify-between gap-2.5 px-3 py-2.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                isActive
                  ? 'bg-red-600 text-white'
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-900/70'
              }`}
            >
              <span className="inline-flex items-center gap-2.5 truncate">
                <Icon className="w-4 h-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </span>
              {item.id === 'expiring' && expiringCount > 0 && (
                <span
                  className={`font-mono tabular-nums text-[11px] ${
                    isActive ? 'text-white' : 'text-amber-400'
                  }`}
                >
                  {expiringCount}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="p-3 border-t border-zinc-800/80 space-y-2">
        <div className="px-3 pt-1">
          <p className="text-[11px] text-zinc-500">Workspace Email</p>
          <p className="text-xs font-medium text-zinc-200 truncate" title={activeEmail}>
            {activeEmail}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setMobileOpen(false);
            onOpenSwitchEmail();
          }}
          className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 hover:text-white text-xs font-medium rounded-lg transition-colors whitespace-nowrap"
        >
          <ArrowRightLeft className="w-3.5 h-3.5 shrink-0" />
          Switch Email
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen supports-[min-height:100dvh]:min-h-dvh bg-[#09090B] text-zinc-100 flex items-start">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:block w-64 shrink-0 sticky top-0 self-start h-screen supports-[height:100dvh]:h-dvh">
        {renderSidebarContent()}
      </aside>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex overscroll-contain">
          <div
            className="fixed inset-0 bg-black/70"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          <aside className="relative w-64 max-w-[82vw] h-full supports-[height:100dvh]:h-dvh z-10 overscroll-contain">
            <button
              type="button"
              aria-label="Close navigation menu"
              onClick={() => setMobileOpen(false)}
              className="absolute top-4 right-3 p-1.5 text-zinc-400 hover:text-white rounded-md"
            >
              <X className="w-4 h-4" />
            </button>
            {renderSidebarContent()}
          </aside>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 min-h-screen supports-[min-height:100dvh]:min-h-dvh flex flex-col">
        <header className="sticky top-0 z-30 h-14 bg-[#09090B]/95 backdrop-blur-sm border-b border-zinc-800/80 px-4 sm:px-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              aria-label="Open navigation menu"
              onClick={() => setMobileOpen(true)}
              className="lg:hidden p-2 -ml-2 text-zinc-400 hover:text-white rounded-lg"
            >
              <Menu className="w-5 h-5" />
            </button>
            <h1 className="text-sm sm:text-base font-semibold text-white truncate whitespace-nowrap">
              {activeTitle}
            </h1>
          </div>

          {/* Global Search */}
          <div className="relative flex-1 max-w-md hidden sm:block">
            <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              aria-label="Global search for clients, sales, account types, or replacements"
              value={searchText}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setTimeout(() => setSearchFocused(false), 180)}
              onChange={(e) => {
                setSearchText(e.target.value);
                onSearchQueryChange(e.target.value);
              }}
              placeholder="Global search: client, email, Sale ID, REP ID, tier..."
              className="w-full bg-[#111115] border border-zinc-800 focus:border-red-500 focus:outline-none rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder-zinc-500"
            />
            {searchFocused && searchText.trim().length > 0 && (
              <div className="absolute left-0 right-0 mt-1.5 bg-[#111115] border border-zinc-800 rounded-xl shadow-2xl overflow-hidden z-40 max-h-80 overflow-y-auto overscroll-contain">
                {searchResults.length === 0 ? (
                  <p className="px-4 py-3 text-xs text-zinc-500">
                    No matching clients, sales, or replacements found.
                  </p>
                ) : (
                  <div className="divide-y divide-zinc-800/70">
                    {searchResults.map((res) => (
                      <button
                        key={`${res.type}-${res.id}`}
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          onSelectSearchResult(res);
                          setSearchFocused(false);
                        }}
                        className="w-full text-left px-4 py-2.5 hover:bg-zinc-900/70 transition-colors flex items-center justify-between gap-3"
                      >
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-white truncate">
                            {res.title}
                          </p>
                          <p className="text-[11px] text-zinc-400 truncate">{res.subtitle}</p>
                        </div>
                        <span className="text-[11px] font-mono text-zinc-400 shrink-0">
                          {res.code} · {res.meta}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onOpenSwitchEmail}
              title={`Cloud synced under ${activeEmail} — click to switch email`}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-200 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 max-w-[200px]"
            >
              {cloudSyncing ? (
                <Cloud className="w-3.5 h-3.5 text-amber-400 animate-pulse shrink-0" />
              ) : (
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              )}
              <span className="hidden md:inline truncate">
                {cloudSyncing ? 'Syncing...' : activeEmail}
              </span>
            </button>
            <button
              type="button"
              onClick={() => handleNavClick('add-sale')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">New Sale</span>
              <span className="sm:hidden">Sale</span>
            </button>
          </div>
        </header>

        {/* Mobile Global Search Bar */}
        <div className="sm:hidden px-4 py-2.5 border-b border-zinc-800/80 bg-[#09090B]">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              aria-label="Mobile global search"
              value={searchText}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setTimeout(() => setSearchFocused(false), 180)}
              onChange={(e) => {
                setSearchText(e.target.value);
                onSearchQueryChange(e.target.value);
              }}
              placeholder="Search client, Sale ID, or tier..."
              className="w-full bg-[#111115] border border-zinc-800 focus:border-red-500 focus:outline-none rounded-lg pl-8 pr-3 py-2 text-xs text-white placeholder-zinc-500"
            />
            {searchFocused && searchText.trim().length > 0 && (
              <div className="absolute left-0 right-0 mt-1.5 bg-[#111115] border border-zinc-800 rounded-xl shadow-2xl overflow-hidden z-40 max-h-64 overflow-y-auto overscroll-contain">
                {searchResults.length === 0 ? (
                  <p className="px-4 py-3 text-xs text-zinc-500">No matches found.</p>
                ) : (
                  <div className="divide-y divide-zinc-800/70">
                    {searchResults.map((res) => (
                      <button
                        key={`m-${res.type}-${res.id}`}
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          onSelectSearchResult(res);
                          setSearchFocused(false);
                        }}
                        className="w-full text-left px-4 py-2.5 hover:bg-zinc-900/70 flex items-center justify-between gap-2"
                      >
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-white truncate">{res.title}</p>
                          <p className="text-[11px] text-zinc-400 truncate">{res.subtitle}</p>
                        </div>
                        <span className="text-[11px] font-mono text-zinc-400 shrink-0">
                          {res.code}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <main className="flex-1 p-4 sm:p-6 max-w-[1600px] w-full mx-auto">{children}</main>
      </div>
    </div>
  );
}
