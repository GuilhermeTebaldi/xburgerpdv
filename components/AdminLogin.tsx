
import React, { useState } from 'react';

interface AdminLoginProps {
  onLogin: (success: boolean) => void;
}

const AdminLogin: React.FC<AdminLoginProps> = ({ onLogin }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (email === 'meu@admin.com' && password === 'admin123') {
      onLogin(true);
    } else {
      setError('Credenciais inválidas. Tente novamente.');
      setTimeout(() => setError(''), 3000);
    }
  };

  return (
    <div className="qb-admin-login min-h-[calc(100vh-64px)] flex items-center justify-center p-4 bg-slate-50">
      <div className="qb-admin-login-card bg-white w-full max-w-md p-8 rounded-[40px] shadow-2xl border-2 border-slate-100 animate-in fade-in zoom-in duration-300">
        <div className="text-center mb-10">
          <div className="bg-red-600 w-16 h-16 rounded-3xl flex items-center justify-center mx-auto mb-4 shadow-xl shadow-red-100">
            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          </div>
          <h2 className="text-3xl font-black text-slate-800 tracking-tighter uppercase">Painel Restrito</h2>
          <p className="text-slate-400 font-bold text-xs uppercase tracking-widest mt-1">Identifique-se para continuar</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">E-mail Administrativo</label>
            <input 
              type="email" 
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full bg-slate-100 border-none rounded-3xl px-6 py-4 font-bold text-slate-800 focus:ring-4 focus:ring-red-500/20 transition-all text-lg"
              placeholder="seu@email.com"
            />
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Senha</label>
            <div className="relative">
              <input 
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full bg-slate-100 border-none rounded-3xl px-6 py-4 pr-28 font-bold text-slate-800 focus:ring-4 focus:ring-red-500/20 transition-all text-lg"
                placeholder="••••••••"
              />
              <button
                type="button"
                onClick={() => setShowPassword(prev => !prev)}
                className="qb-btn-touch absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-black uppercase tracking-wider text-slate-500 hover:text-slate-800 transition-colors"
                aria-label={showPassword ? 'Ocultar senha' : 'Ver senha'}
              >
                {showPassword ? 'Ocultar' : 'Ver senha'}
              </button>
            </div>
          </div>

          {error && (
            <div className="bg-red-50 text-red-600 p-4 rounded-2xl border border-red-100 text-center font-bold text-xs uppercase animate-shake">
              {error}
            </div>
          )}

          <button 
            type="submit"
            className="qb-btn-touch w-full bg-slate-900 hover:bg-black text-yellow-400 py-5 rounded-[24px] font-black uppercase tracking-tighter text-xl shadow-2xl transition-all active:scale-95 flex items-center justify-center gap-3 mt-4"
          >
            ACESSAR SISTEMA
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
          </button>
        </form>
      </div>
    </div>
  );
};

export default AdminLogin;
