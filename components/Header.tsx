
import React from 'react';
import { ViewMode } from '../types';

interface HeaderProps {
  currentView: ViewMode;
  setView: (view: ViewMode) => void;
  dailyTotal: number;
}

const Header: React.FC<HeaderProps> = ({ currentView, setView, dailyTotal }) => {
  return (
    <header className="bg-red-600 text-white shadow-lg sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
        <div className="flex items-center gap-2 cursor-pointer" onClick={() => setView(ViewMode.POS)}>
          <div className="bg-yellow-400 p-2 rounded-lg">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#b91c1c" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M3 11V9a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2"/><path d="M11 13h4"/><path d="M15 9h-4"/><path d="M15 17h-4"/><path d="M19 13h-4"/><path d="M19 9h-4"/><path d="M19 17h-4"/><rect x="3" y="11" width="4" height="6" rx="1"/></svg>
          </div>
          <h1 className="text-2xl font-black tracking-tighter hidden sm:block">LANCHESDOBEN</h1>
        </div>

        <nav className="flex items-center bg-red-700/50 rounded-full p-1 gap-1">
          <button
            onClick={() => setView(ViewMode.POS)}
            className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all ${currentView === ViewMode.POS ? 'bg-white text-red-600 shadow-sm' : 'hover:bg-red-500'}`}
          >
            CAIXA
          </button>
          <button
            onClick={() => setView(ViewMode.INVENTORY)}
            className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all ${currentView === ViewMode.INVENTORY ? 'bg-white text-red-600 shadow-sm' : 'hover:bg-red-500'}`}
          >
            ESTOQUE
          </button>
          <button
            onClick={() => setView(ViewMode.REPORTS)}
            className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all ${currentView === ViewMode.REPORTS ? 'bg-white text-red-600 shadow-sm' : 'hover:bg-red-500'}`}
          >
            VENDAS
          </button>
          <button
            onClick={() => setView(ViewMode.OTHERS)}
            className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all ${currentView === ViewMode.OTHERS ? 'bg-white text-red-600 shadow-sm' : 'hover:bg-red-500'}`}
          >
            OUTROS
          </button>
          <button
            onClick={() => setView(ViewMode.ADMIN)}
            className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all flex items-center gap-1.5 ${currentView === ViewMode.ADMIN ? 'bg-slate-900 text-yellow-400 shadow-sm' : 'hover:bg-red-500'}`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            ADMIN
          </button>
        </nav>

        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-[10px] font-bold opacity-80 uppercase leading-none">Total Hoje</p>
            <p className="text-lg font-black leading-tight">R$ {dailyTotal.toFixed(2)}</p>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
