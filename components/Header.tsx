
import React, { useEffect, useState } from 'react';
import { ViewMode } from '../types';

interface HeaderProps {
  currentView: ViewMode;
  setView: (view: ViewMode) => void;
  dailyTotal: number;
  canAccessAdmin: boolean;
  isDailyTotalSyncing: boolean;
}

const Header: React.FC<HeaderProps> = ({
  currentView,
  setView,
  dailyTotal,
  canAccessAdmin,
  isDailyTotalSyncing,
}) => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    const closeMenuOnDesktop = () => {
      if (window.innerWidth >= 1024) {
        setIsMobileMenuOpen(false);
      }
    };

    closeMenuOnDesktop();
    window.addEventListener('resize', closeMenuOnDesktop);
    return () => window.removeEventListener('resize', closeMenuOnDesktop);
  }, []);

  useEffect(() => {
    if (!isMobileMenuOpen) return;

    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsMobileMenuOpen(false);
      }
    };

    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isMobileMenuOpen]);

  const handleChangeView = (view: ViewMode) => {
    setView(view);
    setIsMobileMenuOpen(false);
  };

  return (
    <header className="qb-header bg-red-600 text-white shadow-lg sticky top-0 z-50">
      <div className="qb-header-inner max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
        <div className="qb-header-brand flex items-center gap-2 cursor-pointer" onClick={() => handleChangeView(ViewMode.POS)}>
          <div className="bg-yellow-400 p-2 rounded-lg">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#b91c1c" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M3 11V9a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2"/><path d="M11 13h4"/><path d="M15 9h-4"/><path d="M15 17h-4"/><path d="M19 13h-4"/><path d="M19 9h-4"/><path d="M19 17h-4"/><rect x="3" y="11" width="4" height="6" rx="1"/></svg>
          </div>
          <h1 className="text-2xl font-black tracking-tighter hidden sm:block">XBURGER PDV</h1>
        </div>

        <nav className="qb-header-nav hidden lg:flex items-center bg-red-700/50 rounded-full p-1 gap-1">
          <button
            onClick={() => handleChangeView(ViewMode.POS)}
            className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all ${currentView === ViewMode.POS ? 'bg-white text-red-600 shadow-sm' : 'hover:bg-red-500'}`}
          >
            CAIXA
          </button>
          <button
            onClick={() => handleChangeView(ViewMode.INVENTORY)}
            className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all ${currentView === ViewMode.INVENTORY ? 'bg-white text-red-600 shadow-sm' : 'hover:bg-red-500'}`}
          >
            ESTOQUE
          </button>
          <button
            onClick={() => handleChangeView(ViewMode.REPORTS)}
            className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all ${currentView === ViewMode.REPORTS ? 'bg-white text-red-600 shadow-sm' : 'hover:bg-red-500'}`}
          >
            VENDAS
          </button>
          <button
            onClick={() => handleChangeView(ViewMode.OTHERS)}
            className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all ${currentView === ViewMode.OTHERS ? 'bg-white text-red-600 shadow-sm' : 'hover:bg-red-500'}`}
          >
            OUTROS
          </button>
          {canAccessAdmin && (
            <button
              onClick={() => handleChangeView(ViewMode.ADMIN)}
              className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all flex items-center gap-1.5 ${currentView === ViewMode.ADMIN ? 'bg-slate-900 text-yellow-400 shadow-sm' : 'hover:bg-red-500'}`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              ADMIN
            </button>
          )}
        </nav>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setIsMobileMenuOpen((prev) => !prev)}
            className="qb-mobile-menu-toggle lg:hidden bg-red-700/70 p-2.5 rounded-xl border border-red-500/40 active:scale-95 transition-all"
            aria-label={isMobileMenuOpen ? 'Fechar menu' : 'Abrir menu'}
            aria-expanded={isMobileMenuOpen}
          >
            {isMobileMenuOpen ? (
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
            )}
          </button>
          <div className="qb-header-total text-right">
            <p className="text-[10px] font-bold opacity-80 uppercase leading-none">Total Hoje</p>
            <p className="min-h-[1.75rem] text-lg font-black leading-tight flex items-center justify-end">
              {isDailyTotalSyncing ? (
                <span
                  className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-red-100/55 bg-red-700/55"
                  role="status"
                  aria-label="Sincronizando total de hoje"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="animate-spin text-red-50"
                    aria-hidden="true"
                  >
                    <path d="M21 12a9 9 0 1 1-2.64-6.36" />
                    <polyline points="21 3 21 9 15 9" />
                  </svg>
                </span>
              ) : (
                <>R$ {dailyTotal.toFixed(2)}</>
              )}
            </p>
          </div>
        </div>
      </div>

      {isMobileMenuOpen && (
        <div className="qb-mobile-drawer fixed inset-0 z-[60] lg:hidden" role="dialog" aria-modal="true">
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/55 backdrop-blur-[1px]"
            aria-label="Fechar menu"
            onClick={() => setIsMobileMenuOpen(false)}
          />
          <aside className="absolute right-0 top-0 h-full w-[82vw] max-w-[320px] bg-red-700 border-l border-red-500/50 shadow-2xl flex flex-col">
            <div className="flex items-center justify-between px-4 py-4 border-b border-red-500/50">
              <p className="text-xs font-black uppercase tracking-widest text-red-100">Navegação</p>
              <button
                type="button"
                onClick={() => setIsMobileMenuOpen(false)}
                className="qb-btn-touch bg-red-600/70 p-2 rounded-xl border border-red-400/40 active:scale-95 transition-all"
                aria-label="Fechar menu lateral"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
              </button>
            </div>
            <nav className="p-4 space-y-2 overflow-y-auto">
              <button
                onClick={() => handleChangeView(ViewMode.POS)}
                className={`qb-btn-touch w-full px-4 py-3 rounded-2xl text-left text-xs font-black tracking-wide transition-all ${currentView === ViewMode.POS ? 'bg-white text-red-600 shadow-sm' : 'bg-red-600/50 hover:bg-red-500'}`}
              >
                CAIXA
              </button>
              <button
                onClick={() => handleChangeView(ViewMode.INVENTORY)}
                className={`qb-btn-touch w-full px-4 py-3 rounded-2xl text-left text-xs font-black tracking-wide transition-all ${currentView === ViewMode.INVENTORY ? 'bg-white text-red-600 shadow-sm' : 'bg-red-600/50 hover:bg-red-500'}`}
              >
                ESTOQUE
              </button>
              <button
                onClick={() => handleChangeView(ViewMode.REPORTS)}
                className={`qb-btn-touch w-full px-4 py-3 rounded-2xl text-left text-xs font-black tracking-wide transition-all ${currentView === ViewMode.REPORTS ? 'bg-white text-red-600 shadow-sm' : 'bg-red-600/50 hover:bg-red-500'}`}
              >
                VENDAS
              </button>
              <button
                onClick={() => handleChangeView(ViewMode.OTHERS)}
                className={`qb-btn-touch w-full px-4 py-3 rounded-2xl text-left text-xs font-black tracking-wide transition-all ${currentView === ViewMode.OTHERS ? 'bg-white text-red-600 shadow-sm' : 'bg-red-600/50 hover:bg-red-500'}`}
              >
                OUTROS
              </button>
              {canAccessAdmin && (
                <button
                  onClick={() => handleChangeView(ViewMode.ADMIN)}
                  className={`qb-btn-touch w-full px-4 py-3 rounded-2xl text-left text-xs font-black tracking-wide transition-all flex items-center gap-2 ${currentView === ViewMode.ADMIN ? 'bg-slate-900 text-yellow-400 shadow-sm' : 'bg-red-600/50 hover:bg-red-500'}`}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                  ADMIN
                </button>
              )}
            </nav>
          </aside>
        </div>
      )}
    </header>
  );
};

export default Header;
