import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence, useScroll, useTransform } from 'framer-motion';
import { 
  LayoutDashboard, 
  Package, 
  TrendingUp, 
  ShoppingCart, 
  Users, 
  ChevronRight, 
  Menu, 
  X, 
  ArrowRight,
  BarChart3,
  Calendar,
  Clock,
  ShieldCheck,
  Smartphone,
  Monitor,
  Zap
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  LineChart, 
  Line,
  AreaChart,
  Area
} from 'recharts';
import heroMainImage from '../34256273-84a8-40b6-acaf-01d17bbc945a-2.png';

const DEFAULT_API_BASE_URL = 'https://xburger-saas-backend.onrender.com';
const ADMIN_AUTH_TOKEN_KEY = 'xburger_admin_auth_token';
const ADMIN_GATE_KEY = 'xburger_admin_gate';
const ADMIN_SESSION_KEY = 'xburger_admin_session';
const ADMIN_SESSION_BACKUP_KEY = 'xburger_admin_session_backup';

type AuthLoginRole = 'ADMIN' | 'OPERATOR' | 'AUDITOR';

const resolveApiBaseUrl = (): string => {
  const raw = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim();
  const normalized = raw ? raw.replace(/\/+$/, '') : '';
  return normalized || DEFAULT_API_BASE_URL;
};

const normalizeSystemPath = (value?: string): string => {
  const trimmed = (value || '').trim();
  if (!trimmed) return '/sistema/';
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
};

const resolveSystemUrl = (): string => {
  const explicitSystemUrl = (import.meta.env.VITE_ADMIN_SYSTEM_URL || '').trim();
  if (explicitSystemUrl) {
    return explicitSystemUrl;
  }

  const systemPath = normalizeSystemPath(import.meta.env.VITE_ADMIN_SYSTEM_PATH);
  if (typeof window === 'undefined') return systemPath;
  return new URL(systemPath, window.location.origin).toString();
};

const extractApiError = async (response: Response): Promise<string | null> => {
  try {
    const payload = (await response.json()) as unknown;
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
    const record = payload as Record<string, unknown>;
    if (typeof record.error === 'string' && record.error.trim()) return record.error.trim();
    if (typeof record.message === 'string' && record.message.trim()) return record.message.trim();
    return null;
  } catch {
    return null;
  }
};

const generateSessionToken = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `session-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
};

const persistSystemAccessSession = (authToken: string, rememberMe: boolean) => {
  if (typeof window === 'undefined') return;

  const sessionBarrier = JSON.stringify({
    token: generateSessionToken(),
    issuedAt: Date.now(),
    lastHeartbeatAt: Date.now(),
  });

  try {
    window.sessionStorage.setItem(ADMIN_AUTH_TOKEN_KEY, authToken);
    window.sessionStorage.setItem(ADMIN_GATE_KEY, 'authenticated');
    window.sessionStorage.setItem(ADMIN_SESSION_BACKUP_KEY, sessionBarrier);
  } catch {
    // ignore storage failures
  }

  try {
    window.localStorage.setItem(ADMIN_GATE_KEY, 'authenticated');
    window.localStorage.setItem(ADMIN_SESSION_KEY, sessionBarrier);
    if (rememberMe) {
      window.localStorage.setItem(ADMIN_AUTH_TOKEN_KEY, authToken);
    } else {
      window.localStorage.removeItem(ADMIN_AUTH_TOKEN_KEY);
    }
  } catch {
    // ignore storage failures
  }
};
// Mock data for the dashboard preview
const weeklyData = [
  { name: 'Dom', vendas: 25 },
  { name: 'Seg', vendas: 70 },
  { name: 'Ter', vendas: 10 },
  { name: 'Qua', vendas: 15 },
  { name: 'Qui', vendas: 18 },
  { name: 'Sex', vendas: 20 },
  { name: 'Sab', vendas: 22 },
];

const hourlyData = [
  { time: '00', val: 18 },
  { time: '02', val: 38 },
  { time: '04', val: 15 },
  { time: '06', val: 0 },
  { time: '08', val: 0 },
  { time: '10', val: 0 },
  { time: '12', val: 0 },
  { time: '14', val: 0 },
  { time: '16', val: 0 },
  { time: '18', val: 0 },
  { time: '20', val: 0 },
  { time: '22', val: 12 },
];

const products = [
  { id: 1, name: 'X JUNIOR', price: 7.50, img: 'https://i.pinimg.com/736x/67/54/2d/67542d5f476d6504046007f1d5637b74.jpg' },
  { id: 2, name: 'X SALADA', price: 10.00, img: 'https://i.pinimg.com/1200x/f5/4f/a5/f54fa5870b64bd23ecb51f3496c68c7c.jpg' },
  { id: 3, name: 'X EGG', price: 12.00, img: 'https://i.pinimg.com/736x/26/04/b9/2604b97e2529953e481f9f627cc9c93d.jpg' },
  { id: 4, name: 'COMBO 1', price: 12.00, img: 'https://i.pinimg.com/736x/5d/45/c6/5d45c6588040f0a4d5f2adeee27e86ae.jpg' },
  { id: 5, name: 'COMBO 2', price: 30.00, img: 'https://i.pinimg.com/736x/ea/67/65/ea6765461880b0f9738358db9e3a65bc.jpg' },
  { id: 6, name: 'X DUPLO', price: 20.00, img: 'https://i.pinimg.com/736x/2d/c8/b5/2dc8b56f3c06f6201cc118d95cce56cd.jpg' },
];

export default function App() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('geral');
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [loginError, setLoginError] = useState('');
  const [isLoginSubmitting, setIsLoginSubmitting] = useState(false);
  const { scrollYProgress } = useScroll();
  const opacity = useTransform(scrollYProgress, [0, 0.05], [1, 0.8]);
  const scale = useTransform(scrollYProgress, [0, 0.05], [1, 0.95]);
  const systemUrl = resolveSystemUrl();
  const redirectToSystem = () => {
    if (typeof window !== 'undefined') {
      window.location.assign(systemUrl);
    }
  };

  const handleLoginSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isLoginSubmitting) return;

    setIsLoginSubmitting(true);
    setLoginError('');

    try {
      const response = await fetch(`${resolveApiBaseUrl()}/api/v1/auth/login`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: loginEmail.trim().toLowerCase(),
          password: loginPassword,
        }),
      });

      if (!response.ok) {
        const apiError = await extractApiError(response);
        setLoginError(apiError || 'Não foi possível autenticar. Confira e-mail e senha.');
        return;
      }

      const payload = (await response.json()) as { token?: unknown; user?: { role?: unknown } };
      const token = typeof payload?.token === 'string' ? payload.token.trim() : '';
      const role =
        payload?.user?.role === 'ADMIN' || payload?.user?.role === 'OPERATOR' || payload?.user?.role === 'AUDITOR'
          ? (payload.user.role as AuthLoginRole)
          : null;

      if (!token || !role) {
        setLoginError('Resposta inválida do servidor de autenticação.');
        return;
      }

      persistSystemAccessSession(token, rememberMe);
      setLoginPassword('');
      redirectToSystem();
    } catch {
      setLoginError('Falha de conexão com o backend.');
    } finally {
      setIsLoginSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F5F5F5] font-sans text-slate-900 overflow-x-hidden">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-md border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 bg-red-600 rounded-lg flex items-center justify-center shadow-lg shadow-red-200">
                <LayoutDashboard className="text-white w-6 h-6" />
              </div>
              <span className="text-xl font-black tracking-tighter text-red-600">
                XBURGER<span className="text-amber-500">PDV</span>
              </span>
            </div>

            {/* Desktop Menu */}
            <div className="hidden md:flex items-center gap-8">
              <a href="#funcionalidades" className="text-sm font-medium hover:text-red-600 transition-colors">Funcionalidades</a>
             
              <a href="#pdv" className="text-sm font-medium hover:text-red-600 transition-colors">PDV</a>
              <button 
                type="button"
                onClick={redirectToSystem}
                className="bg-red-600 text-white px-6 py-2 rounded-full text-sm font-bold hover:bg-red-700 transition-all shadow-lg shadow-red-200 active:scale-95"
              >
                ENTRAR NO SISTEMA
              </button>
            </div>

            {/* Mobile Menu Button */}
            <div className="md:hidden">
              <button onClick={() => setIsMenuOpen(!isMenuOpen)} className="p-2">
                {isMenuOpen ? <X /> : <Menu />}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Menu */}
        <AnimatePresence>
          {isMenuOpen && (
            <motion.div 
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="md:hidden bg-white border-b border-slate-200 p-4 space-y-4"
            >
              <a href="#funcionalidades" className="block text-sm font-medium" onClick={() => setIsMenuOpen(false)}>Funcionalidades</a>
              <a href="#dashboard" className="block text-sm font-medium" onClick={() => setIsMenuOpen(false)}>Relatórios</a>
              <a href="#pdv" className="block text-sm font-medium" onClick={() => setIsMenuOpen(false)}>PDV</a>
              <button
                type="button"
                onClick={() => {
                  setIsMenuOpen(false);
                  redirectToSystem();
                }}
                className="w-full bg-red-600 text-white px-6 py-3 rounded-xl text-sm font-bold"
              >
                ENTRAR NO SISTEMA
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-32 pb-20 lg:pt-48 lg:pb-32 overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full -z-10">
          <div className="absolute top-0 left-1/4 w-96 h-96 bg-red-100 rounded-full blur-3xl opacity-50 animate-pulse" />
          <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-amber-100 rounded-full blur-3xl opacity-50 animate-pulse delay-1000" />
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
          >
            <span className="inline-block px-4 py-1.5 mb-6 text-xs font-bold tracking-widest text-red-600 uppercase bg-red-50 rounded-full border border-red-100">
              O Sistema Mais Completo do Brasil
            </span>
            <h1 className="text-5xl md:text-7xl lg:text-8xl font-black tracking-tighter leading-[0.9] mb-8">
              GESTÃO <span className="text-red-600">INTELIGENTE</span> <br />
              PARA <span className="text-amber-500 underline decoration-red-600/30">SEU NEGÓCIO</span>
            </h1>
            <p className="max-w-2xl mx-auto text-lg text-slate-600 mb-10 leading-relaxed">
              Controle total de estoque, administração financeira detalhada e o PDV mais rápido do mercado. 
              Tudo o que você precisa para escalar seu negócio de lanches.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <button className="group relative bg-red-600 text-white px-8 py-4 rounded-2xl text-lg font-bold hover:bg-red-700 transition-all shadow-xl shadow-red-200 flex items-center gap-2 overflow-hidden">
                <span className="relative z-10">Começar Agora</span>
                <ArrowRight className="relative z-10 w-5 h-5 group-hover:translate-x-1 transition-transform" />
                <motion.div 
                  className="absolute inset-0 bg-gradient-to-r from-red-500 to-red-700 opacity-0 group-hover:opacity-100 transition-opacity"
                  initial={false}
                />
              </button>
              <button className="bg-white text-slate-900 border border-slate-200 px-8 py-4 rounded-2xl text-lg font-bold hover:bg-slate-50 transition-all flex items-center gap-2">
                Ver Demonstração
              </button>
            </div>
          </motion.div>

          {/* 3D Floating Elements Mockup */}
          <motion.div 
            className="mt-20 relative max-w-5xl mx-auto"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.4, duration: 1 }}
          >
            <div className="relative z-10">
              <div className="bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden aspect-[16/9] flex items-center justify-center">
                <img 
                  src={heroMainImage} 
                  alt="Dashboard Preview" 
                  className="w-full h-full object-cover opacity-90"
                  referrerPolicy="no-referrer"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-white/20 to-transparent" />
              </div>
              
              {/* Floating 3D Cards */}
              <motion.div 
                className="absolute -top-6 -left-4 sm:-top-10 sm:-left-10 bg-white p-2 sm:p-4 rounded-xl sm:rounded-2xl shadow-2xl border border-slate-100 z-20"
                animate={{ y: [0, -15, 0] }}
                transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
              >
                <div className="flex items-center gap-2 sm:gap-3">
                  <div className="w-8 h-8 sm:w-10 sm:h-10 bg-green-100 rounded-full flex items-center justify-center">
                    <TrendingUp className="text-green-600 w-4 h-4 sm:w-5 sm:h-5" />
                  </div>
                  <div>
                    <p className="text-[8px] sm:text-[10px] uppercase font-bold text-slate-400 leading-none mb-1">Vendas Hoje</p>
                    <p className="text-sm sm:text-xl font-black text-slate-900 leading-none">R$ 1.247,16</p>
                  </div>
                </div>
              </motion.div>

              <motion.div 
                className="absolute -bottom-6 -right-4 sm:-bottom-10 sm:-right-10 bg-white p-2 sm:p-4 rounded-xl sm:rounded-2xl shadow-2xl border border-slate-100 z-20"
                animate={{ y: [0, 15, 0] }}
                transition={{ duration: 5, repeat: Infinity, ease: "easeInOut", delay: 1 }}
              >
                <div className="flex items-center gap-2 sm:gap-3">
                  <div className="w-8 h-8 sm:w-10 sm:h-10 bg-amber-100 rounded-full flex items-center justify-center">
                    <Package className="text-amber-600 w-4 h-4 sm:w-5 sm:h-5" />
                  </div>
                  <div>
                    <p className="text-[8px] sm:text-[10px] uppercase font-bold text-slate-400 leading-none mb-1">Estoque Baixo</p>
                    <p className="text-sm sm:text-xl font-black text-slate-900 leading-none">5 Itens</p>
                  </div>
                </div>
              </motion.div>
            </div>
            
            {/* Decorative 3D Burger (CSS Art or Image) */}
            <motion.div 
              className="absolute -z-10 -top-20 -right-20 w-64 h-64 bg-amber-400/20 rounded-full blur-3xl"
              animate={{ scale: [1, 1.2, 1] }}
              transition={{ duration: 6, repeat: Infinity }}
            />
          </motion.div>
        </div>
      </section>
      {/* Dashboard Preview Section */}
      <section id="dashboard-preview" className="py-24 bg-white overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div>
              <h2 className="text-4xl md:text-5xl font-black text-slate-900 mb-8 leading-tight uppercase">
                DASHBOARD <span className="text-amber-500">PODEROSA</span> PARA DECISÕES RÁPIDAS.
              </h2>
              <div className="space-y-6">
                {[
                  { title: "Vendas por Hora", desc: "Identifique seus horários de pico e otimize sua equipe." },
                  { title: "Produtos Líderes", desc: "Saiba quais itens trazem mais lucro para seu negócio." },
                  { title: "Análise de Lucro", desc: "Cálculo automático descontando insumos e custos fixos." }
                ].map((item, i) => (
                  <div key={i} className="flex gap-4">
                    <div className="bg-red-600/10 p-2 rounded-lg h-fit">
                      <ChevronRight className="text-red-600" />
                    </div>
                    <div>
                      <h4 className="text-lg font-bold text-slate-900">{item.title}</h4>
                      <p className="text-slate-600">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <motion.div 
              initial={{ opacity: 0, x: 50 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              className="bg-slate-900 p-8 rounded-[3rem] shadow-2xl border-8 border-slate-800 relative"
            >
              <div className="absolute -top-4 -left-4 bg-red-600 text-white px-6 py-2 rounded-full font-bold shadow-xl z-20">
                LIVE PREVIEW
              </div>
              
              <div className="space-y-8">
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-slate-800 p-4 rounded-2xl border border-slate-700">
                    <p className="text-[10px] text-slate-400 uppercase font-bold mb-1">Vendas Hoje</p>
                    <p className="text-2xl font-black text-white">R$ 1.247,16</p>
                    <div className="h-1 bg-red-600 w-2/3 mt-2 rounded-full" />
                  </div>
                  <div className="bg-slate-800 p-4 rounded-2xl border border-slate-700">
                    <p className="text-[10px] text-slate-400 uppercase font-bold mb-1">Pedidos</p>
                    <p className="text-2xl font-black text-white">35</p>
                    <div className="h-1 bg-amber-500 w-1/2 mt-2 rounded-full" />
                  </div>
                </div>

                <div className="bg-slate-800 p-6 rounded-3xl border border-slate-700 h-64">
                  <p className="text-xs font-bold text-slate-400 mb-4 uppercase">Vendas por Dia da Semana</p>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={weeklyData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                      <XAxis dataKey="name" stroke="#666" fontSize={10} tickLine={false} axisLine={false} />
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '12px', color: '#fff' }}
                        itemStyle={{ color: '#fbbf24' }}
                      />
                      <Bar dataKey="vendas" fill="#e11d48" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div className="bg-slate-800 p-6 rounded-3xl border border-slate-700 h-48">
                  <p className="text-xs font-bold text-slate-400 mb-4 uppercase">Vendas por Hora</p>
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={hourlyData}>
                      <defs>
                        <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#fbbf24" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#fbbf24" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <Area type="monotone" dataKey="val" stroke="#fbbf24" fillOpacity={1} fill="url(#colorValue)" strokeWidth={3} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section id="funcionalidades" className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-5xl font-black tracking-tight mb-4">Tudo o que você precisa</h2>
            <p className="text-slate-500 max-w-2xl mx-auto">Um ecossistema completo desenhado para a realidade das lanchonetes brasileiras.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="group p-8 rounded-3xl bg-slate-50 border border-slate-100 hover:bg-white hover:shadow-2xl hover:shadow-red-100 transition-all duration-500">
              <div className="w-14 h-14 bg-red-100 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <Package className="text-red-600 w-7 h-7" />
              </div>
              <h3 className="text-xl font-bold mb-3">Controle de Estoque</h3>
              <p className="text-slate-500 text-sm leading-relaxed">
                Gestão automatizada de insumos. Saiba exatamente quando repor pães, carnes e bebidas com alertas inteligentes.
              </p>
            </div>

            <div className="group p-8 rounded-3xl bg-slate-50 border border-slate-100 hover:bg-white hover:shadow-2xl hover:shadow-amber-100 transition-all duration-500">
              <div className="w-14 h-14 bg-amber-100 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <BarChart3 className="text-amber-600 w-7 h-7" />
              </div>
              <h3 className="text-xl font-bold mb-3">Adm. Financeira</h3>
              <p className="text-slate-500 text-sm leading-relaxed">
                Relatórios semanais, mensais e anuais. Controle de gastos, lucro real e fluxo de caixa em tempo real.
              </p>
            </div>

            <div className="group p-8 rounded-3xl bg-slate-50 border border-slate-100 hover:bg-white hover:shadow-2xl hover:shadow-blue-100 transition-all duration-500">
              <div className="w-14 h-14 bg-blue-100 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <ShoppingCart className="text-blue-600 w-7 h-7" />
              </div>
              <h3 className="text-xl font-bold mb-3">PDV Ultra Rápido</h3>
              <p className="text-slate-500 text-sm leading-relaxed">
                Sistema de vendas otimizado para agilidade. Interface intuitiva que reduz o tempo de atendimento em até 40%.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* POS (PDV) Showcase */}
      <section id="pdv" className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-black tracking-tight mb-4">O PDV MAIS <span className="text-red-600">BONITO</span> DO MUNDO</h2>
            <p className="text-slate-500 max-w-2xl mx-auto">Interface limpa, rápida e totalmente visual. Seus funcionários vão amar trabalhar com ele.</p>
          </div>

          <div className="relative bg-slate-900 rounded-[3rem] p-4 md:p-8 shadow-3xl overflow-hidden">
            {/* Screen Header */}
            <div className="flex items-center justify-between mb-8 px-4">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-red-600 rounded-xl flex items-center justify-center">
                  <LayoutDashboard className="text-white" />
                </div>
                <h4 className="text-white font-black text-xl hidden sm:block">XBURGERPDV</h4>
              </div>
              <div className="flex gap-2">
                <button className="bg-red-600 text-white px-4 py-2 rounded-lg text-xs font-bold">CAIXA</button>
                <button className="bg-slate-800 text-white px-4 py-2 rounded-lg text-xs font-bold">ESTOQUE</button>
                <button className="bg-slate-800 text-white px-4 py-2 rounded-lg text-xs font-bold">VENDAS</button>
              </div>
            </div>

            {/* Product Grid Mockup */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {products.map((product) => (
                <motion.div 
                  key={product.id}
                  className="bg-white rounded-2xl p-3 shadow-lg"
                  whileHover={{ scale: 1.02 }}
                >
                  <div className="aspect-square rounded-xl overflow-hidden mb-3 bg-slate-100">
                    <img src={product.img} alt={product.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  </div>
                  <h5 className="font-black text-slate-900 text-sm mb-1">{product.name}</h5>
                  <p className="text-red-600 font-black">R$ {product.price.toFixed(2)}</p>
                  <div className="mt-2 flex justify-between items-center">
                    <span className="text-[10px] font-bold text-green-600 bg-green-50 px-2 py-0.5 rounded">DISP: 94</span>
                    <button className="w-6 h-6 bg-slate-100 rounded-full flex items-center justify-center text-slate-400 hover:bg-red-600 hover:text-white transition-colors">
                      +
                    </button>
                  </div>
                </motion.div>
              ))}
              {/* Cart Preview */}
              <div className="col-span-2 lg:col-span-1 bg-slate-800 rounded-2xl p-6 flex flex-col justify-between">
                <div>
                  <h6 className="text-white font-black mb-4 flex items-center gap-2">
                    <ShoppingCart className="w-4 h-4 text-red-500" /> CARRINHO
                  </h6>
                  <div className="space-y-3">
                    <div className="flex justify-between text-xs text-slate-400">
                      <span>1x X SALADA</span>
                      <span className="text-white">R$ 10,00</span>
                    </div>
                    <div className="flex justify-between text-xs text-slate-400">
                      <span>1x COMBO 2</span>
                      <span className="text-white">R$ 30,00</span>
                    </div>
                  </div>
                </div>
                <div className="mt-6 pt-6 border-t border-slate-700">
                  <div className="flex justify-between items-end mb-4">
                    <span className="text-slate-400 text-xs font-bold">TOTAL</span>
                    <span className="text-2xl font-black text-white">R$ 40,00</span>
                  </div>
                  <button className="w-full bg-red-600 text-white py-3 rounded-xl font-black text-sm hover:bg-red-700 transition-colors shadow-lg shadow-red-900/20">
                    FINALIZAR VENDA
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Responsive Section */}
      <section className="py-24 bg-red-600 text-white overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col lg:flex-row items-center gap-16">
            <div className="flex-1">
              <h2 className="text-4xl md:text-6xl font-black tracking-tight mb-8 leading-[0.9]">
                SEU NEGÓCIO <br />
                NA PALMA DA <span className="text-amber-400">MÃO</span>
              </h2>
              <p className="text-red-100 text-lg mb-10">
                Acesse de qualquer lugar. Seja no tablet da lanchonete, no computador do escritório 
                ou no seu celular enquanto descansa. O sistema se adapta perfeitamente a qualquer tela.
              </p>
              <div className="flex gap-6">
                <div className="flex flex-col items-center gap-2">
                  <div className="w-16 h-16 bg-white/10 rounded-2xl backdrop-blur-md flex items-center justify-center border border-white/20">
                    <Smartphone className="w-8 h-8" />
                  </div>
                  <span className="text-xs font-bold uppercase tracking-widest">Mobile</span>
                </div>
                <div className="flex flex-col items-center gap-2">
                  <div className="w-16 h-16 bg-white/10 rounded-2xl backdrop-blur-md flex items-center justify-center border border-white/20">
                    <Monitor className="w-8 h-8" />
                  </div>
                  <span className="text-xs font-bold uppercase tracking-widest">Desktop</span>
                </div>
                <div className="flex flex-col items-center gap-2">
                  <div className="w-16 h-16 bg-white/10 rounded-2xl backdrop-blur-md flex items-center justify-center border border-white/20">
                    <Zap className="w-8 h-8" />
                  </div>
                  <span className="text-xs font-bold uppercase tracking-widest">Cloud</span>
                </div>
              </div>
            </div>
            
            <div className="flex-1 relative">
              <motion.div 
                className="relative z-10"
                animate={{ y: [0, -20, 0] }}
                transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
              >
                <div className="w-64 h-[500px] bg-slate-900 rounded-[3rem] border-[8px] border-slate-800 shadow-3xl overflow-hidden relative mx-auto">
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 w-24 h-6 bg-slate-800 rounded-b-2xl z-20" />
                  <img src="https://picsum.photos/seed/mobile-app/400/800" alt="Mobile App" className="w-full h-full object-cover opacity-80" referrerPolicy="no-referrer" />
                  <div className="absolute bottom-10 left-4 right-4 bg-white/10 backdrop-blur-md p-4 rounded-2xl border border-white/20">
                    <p className="text-[10px] font-bold uppercase text-white/60">Vendas de Hoje</p>
                    <p className="text-xl font-black">R$ 906,98</p>
                  </div>
                </div>
              </motion.div>
              
              {/* Decorative circles */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[120%] h-[120%] border border-white/10 rounded-full -z-10" />
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[150%] h-[150%] border border-white/5 rounded-full -z-10" />
            </div>
          </div>
        </div>
      </section>

      {/* Login Section */}
      <section id="login" className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-md mx-auto">
            <div className="text-center mb-10">
              <div className="w-20 h-20 bg-red-600 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-2xl shadow-red-200">
                <ShieldCheck className="text-white w-10 h-10" />
              </div>
              <h2 className="text-3xl font-black text-slate-900 mb-2">Acesse sua Conta</h2>
              <p className="text-slate-500">Bem-vindo de volta ao xburgerpdv</p>
            </div>

            <form
              className="space-y-6"
              onSubmit={handleLoginSubmit}
            >
              <div>
                <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">E-mail ou Usuário</label>
                <input 
                  type="email"
                  required
                  autoComplete="username"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl focus:outline-none focus:ring-2 focus:ring-red-600/20 focus:border-red-600 transition-all font-medium"
                  placeholder="seu@email.com"
                />
              </div>
              <div>
                <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Senha</label>
                <input 
                  type="password"
                  required
                  autoComplete="current-password"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl focus:outline-none focus:ring-2 focus:ring-red-600/20 focus:border-red-600 transition-all font-medium"
                  placeholder="••••••••"
                />
              </div>
              <div className="flex items-center justify-between text-sm">
                <label className="flex items-center gap-2 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 text-red-600 focus:ring-red-600"
                  />
                  <span className="text-slate-500 group-hover:text-slate-900 transition-colors">Lembrar de mim</span>
                </label>
                <a href="#" className="text-red-600 font-bold hover:underline">Esqueceu a senha?</a>
              </div>
              {loginError && <p className="text-sm font-semibold text-red-600">{loginError}</p>}
              <button
                type="submit"
                disabled={isLoginSubmitting}
                className="w-full bg-red-600 text-white py-5 rounded-2xl font-black text-lg hover:bg-red-700 transition-all shadow-xl shadow-red-200 active:scale-95 disabled:opacity-60"
              >
                {isLoginSubmitting ? 'VALIDANDO...' : 'ENTRAR NO SISTEMA'}
              </button>
            </form>
            
            <p className="mt-8 text-center text-sm text-slate-500">
              Ainda não tem o sistema? <a href="#" className="text-red-600 font-black hover:underline">Fale com um consultor</a>
            </p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-slate-900 text-white py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-16">
            <div className="col-span-1 md:col-span-2">
              <div className="flex items-center gap-2 mb-6">
                <div className="w-10 h-10 bg-red-600 rounded-lg flex items-center justify-center">
                  <LayoutDashboard className="text-white w-6 h-6" />
                </div>
                <span className="text-2xl font-black tracking-tighter">
                  XBURGER<span className="text-amber-500">PDV</span>
                </span>
              </div>
              <p className="text-slate-400 max-w-sm leading-relaxed mb-8">
                Transformando a gestão de lanchonetes em todo o Brasil com tecnologia de ponta e design intuitivo.
              </p>
              <div className="flex gap-4">
                {/* Social Icons Placeholder */}
                <div className="w-10 h-10 bg-white/5 rounded-full flex items-center justify-center hover:bg-red-600 transition-colors cursor-pointer">
                  <Users className="w-5 h-5" />
                </div>
                <div className="w-10 h-10 bg-white/5 rounded-full flex items-center justify-center hover:bg-red-600 transition-colors cursor-pointer">
                  <TrendingUp className="w-5 h-5" />
                </div>
              </div>
            </div>
            
            <div>
              <h5 className="font-black text-sm uppercase tracking-widest mb-6">Produto</h5>
              <ul className="space-y-4 text-slate-400 text-sm">
                <li><a href="#" className="hover:text-white transition-colors">Funcionalidades</a></li>
                <li><a href="#" className="hover:text-white transition-colors">PDV</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Estoque</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Relatórios</a></li>
              </ul>
            </div>

            <div>
              <h5 className="font-black text-sm uppercase tracking-widest mb-6">Suporte</h5>
              <ul className="space-y-4 text-slate-400 text-sm">
                <li><a href="#" className="hover:text-white transition-colors">Central de Ajuda</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Contato</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Status do Sistema</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Privacidade</a></li>
              </ul>
            </div>
          </div>
          
          <div className="pt-8 border-t border-white/5 flex flex-col md:flex-row justify-between items-center gap-4 text-slate-500 text-xs font-bold uppercase tracking-widest">
            <p>© 2026 XBURGERPDV - TODOS OS DIREITOS RESERVADOS</p>
            <p>FEITO COM ❤️ PARA O BRASIL</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
