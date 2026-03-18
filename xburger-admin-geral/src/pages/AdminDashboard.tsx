import React, { useState } from 'react';
import { 
  Users, 
  Building2, 
  LogOut, 
  PlusCircle, 
  Link2, 
  RefreshCw, 
  ShieldCheck, 
  UserCircle, 
  Search,
  MoreVertical,
  Ban,
  Trash2,
  CheckCircle2,
  AlertCircle,
  ChevronRight,
  LayoutDashboard
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// Types
interface UserInfo {
  name: string;
  email: string;
}

interface LinkedCompany {
  id: string;
  name: string;
  manager: UserInfo;
  operator: UserInfo;
  linkId: string;
  status: 'Ativo' | 'Bloqueado';
  pairStatus: 'VINCULADO' | 'SOLTO';
  billing: 'Em dia' | 'Atrasado';
  createdAt: string;
}

const AdminDashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'list' | 'create' | 'link'>('list');
  const [showSuccess, setShowSuccess] = useState(false);

  // Mock Data
  const [companies] = useState<LinkedCompany[]>([
    {
      id: '1',
      name: 'SISTEMA DE TESTES PDV',
      manager: { name: 'Guilherme ADMIN', email: 'pdv@admin.com' },
      operator: { name: 'Guilherme OPERADOR', email: 'pdv1@admin.com' },
      linkId: '1680360d',
      status: 'Ativo',
      pairStatus: 'VINCULADO',
      billing: 'Em dia',
      createdAt: '15/03/2026, 10:03:01'
    },
    {
      id: '2',
      name: 'eduardo teste',
      manager: { name: 'eduardo gerente', email: 'eduardo@admin.com' },
      operator: { name: 'eduardo operador', email: 'eduardo1@admin.com' },
      linkId: '094e7e48',
      status: 'Ativo',
      pairStatus: 'VINCULADO',
      billing: 'Em dia',
      createdAt: '10/03/2026, 20:43:48'
    }
  ]);

  const handleCreateCompany = (e: React.FormEvent) => {
    e.preventDefault();
    setShowSuccess(true);
    setTimeout(() => setShowSuccess(false), 5000);
  };

  return (
    <div className="min-h-screen bg-[#F8F9FA] text-[#1A1A1A] font-sans">
      {/* Sidebar / Navigation */}
      <aside className="fixed left-0 top-0 h-full w-64 bg-white border-r border-gray-200 z-50 hidden lg:flex flex-col">
        <div className="p-6 border-bottom border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-orange-500 rounded-xl flex items-center justify-center text-white shadow-lg shadow-orange-200">
              <LayoutDashboard size={24} />
            </div>
            <div>
              <h1 className="font-bold text-lg tracking-tight">xBurger</h1>
              <p className="text-xs text-gray-500 font-medium uppercase tracking-wider">Admin Geral</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-4 space-y-2">
          <button 
            onClick={() => setActiveTab('list')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === 'list' ? 'bg-orange-50 text-orange-600 font-semibold' : 'text-gray-500 hover:bg-gray-50'}`}
          >
            <Building2 size={20} />
            <span>Empresas</span>
          </button>
          <button 
            onClick={() => setActiveTab('create')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === 'create' ? 'bg-orange-50 text-orange-600 font-semibold' : 'text-gray-500 hover:bg-gray-50'}`}
          >
            <PlusCircle size={20} />
            <span>Novo Cadastro</span>
          </button>
          <button 
            onClick={() => setActiveTab('link')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === 'link' ? 'bg-orange-50 text-orange-600 font-semibold' : 'text-gray-500 hover:bg-gray-50'}`}
          >
            <Link2 size={20} />
            <span>Vincular Existentes</span>
          </button>
        </nav>

        <div className="p-4 border-t border-gray-100">
          <div className="bg-gray-50 rounded-2xl p-4 mb-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center text-orange-600">
                <ShieldCheck size={16} />
              </div>
              <div className="overflow-hidden">
                <p className="text-xs font-bold truncate">Admin Geral</p>
                <p className="text-[10px] text-gray-500 truncate">xburger.admin@geral.com</p>
              </div>
            </div>
            <button className="w-full flex items-center justify-center gap-2 py-2 text-xs font-bold text-red-500 hover:bg-red-50 rounded-lg transition-colors">
              <LogOut size={14} />
              Sair da Sessão
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="lg:ml-64 p-4 lg:p-8">
        <header className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">
              {activeTab === 'list' && 'Gerenciamento de Empresas'}
              {activeTab === 'create' && 'Cadastrar Nova Empresa'}
              {activeTab === 'link' && 'Vincular Usuários Existentes'}
            </h2>
            <p className="text-gray-500 text-sm">
              {activeTab === 'list' && 'Visualize e gerencie todas as empresas vinculadas ao sistema.'}
              {activeTab === 'create' && 'Crie simultaneamente os acessos de ADMGERENTE e OPERADOR.'}
              {activeTab === 'link' && 'Una cadastros antigos de ADMGERENTE e OPERADOR na mesma empresa.'}
            </p>
          </div>

          {activeTab === 'list' && (
            <div className="flex items-center gap-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                <input 
                  type="text" 
                  placeholder="Buscar empresa..." 
                  className="pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all w-full md:w-64 shadow-sm"
                />
              </div>
              <button className="p-2 bg-white border border-gray-200 rounded-xl text-gray-500 hover:bg-gray-50 transition-all shadow-sm">
                <RefreshCw size={20} />
              </button>
            </div>
          )}
        </header>

        <AnimatePresence mode="wait">
          {activeTab === 'list' && (
            <motion.div 
              key="list"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-8"
            >
              {/* Stats Summary */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
                  <p className="text-sm text-gray-500 font-medium mb-1">Empresas Vinculadas</p>
                  <div className="flex items-end gap-2">
                    <span className="text-3xl font-bold">02</span>
                    <span className="text-emerald-500 text-xs font-bold mb-1 flex items-center">
                      <CheckCircle2 size={12} className="mr-1" /> Tudo OK
                    </span>
                  </div>
                </div>
                <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
                  <p className="text-sm text-gray-500 font-medium mb-1">Cadastros Soltos</p>
                  <div className="flex items-end gap-2">
                    <span className="text-3xl font-bold">00</span>
                    <span className="text-gray-400 text-xs font-medium mb-1">Nenhum pendente</span>
                  </div>
                </div>
                <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
                  <p className="text-sm text-gray-500 font-medium mb-1">Status Geral</p>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                    <span className="text-sm font-bold text-emerald-600 uppercase tracking-wider">Sistema Ativo</span>
                  </div>
                </div>
              </div>

              {/* Linked Companies Table */}
              <section>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-bold text-lg flex items-center gap-2">
                    <Building2 size={20} className="text-orange-500" />
                    Empresas Vinculadas
                  </h3>
                </div>
                
                <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-gray-50/50 border-b border-gray-100">
                          <th className="px-6 py-4 text-[11px] font-bold text-gray-400 uppercase tracking-widest">Empresa</th>
                          <th className="px-6 py-4 text-[11px] font-bold text-gray-400 uppercase tracking-widest">Acessos (Gerente / Operador)</th>
                          <th className="px-6 py-4 text-[11px] font-bold text-gray-400 uppercase tracking-widest">Vínculo</th>
                          <th className="px-6 py-4 text-[11px] font-bold text-gray-400 uppercase tracking-widest text-center">Status</th>
                          <th className="px-6 py-4 text-[11px] font-bold text-gray-400 uppercase tracking-widest text-center">Cobrança</th>
                          <th className="px-6 py-4 text-[11px] font-bold text-gray-400 uppercase tracking-widest">Ações</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {companies.map((company) => (
                          <tr key={company.id} className="hover:bg-gray-50/50 transition-colors group">
                            <td className="px-6 py-5">
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center text-gray-400 group-hover:bg-orange-100 group-hover:text-orange-500 transition-colors">
                                  <Building2 size={20} />
                                </div>
                                <div>
                                  <p className="font-bold text-sm">{company.name}</p>
                                  <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wider">ID: {company.id}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-5">
                              <div className="space-y-2">
                                <div className="flex items-center gap-2">
                                  <div className="w-5 h-5 rounded-full bg-blue-50 flex items-center justify-center text-blue-600 text-[10px] font-bold">G</div>
                                  <div>
                                    <p className="text-xs font-semibold leading-none">{company.manager.name}</p>
                                    <p className="text-[10px] text-gray-400">{company.manager.email}</p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <div className="w-5 h-5 rounded-full bg-purple-50 flex items-center justify-center text-purple-600 text-[10px] font-bold">O</div>
                                  <div>
                                    <p className="text-xs font-semibold leading-none">{company.operator.name}</p>
                                    <p className="text-[10px] text-gray-400">{company.operator.email}</p>
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-5">
                              <div className="flex flex-col">
                                <span className="text-xs font-mono bg-gray-100 px-2 py-1 rounded-md w-fit text-gray-600">{company.linkId}</span>
                                <span className="text-[10px] text-gray-400 mt-1">{company.createdAt.split(',')[0]}</span>
                              </div>
                            </td>
                            <td className="px-6 py-5 text-center">
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${company.status === 'Ativo' ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
                                {company.status}
                              </span>
                            </td>
                            <td className="px-6 py-5 text-center">
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${company.billing === 'Em dia' ? 'bg-emerald-50 text-emerald-600' : 'bg-orange-50 text-orange-600'}`}>
                                {company.billing}
                              </span>
                            </td>
                            <td className="px-6 py-5">
                              <div className="flex items-center gap-2">
                                <button className="p-2 text-gray-400 hover:text-orange-500 hover:bg-orange-50 rounded-lg transition-all" title="Bloquear">
                                  <Ban size={18} />
                                </button>
                                <button className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all" title="Excluir">
                                  <Trash2 size={18} />
                                </button>
                                <button className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-all">
                                  <MoreVertical size={18} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </section>

              {/* Loose Registrations */}
              <section>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-bold text-lg flex items-center gap-2">
                    <AlertCircle size={20} className="text-gray-400" />
                    Cadastros Soltos / Incompletos
                  </h3>
                </div>
                <div className="bg-white p-12 rounded-3xl border border-dashed border-gray-200 flex flex-col items-center justify-center text-center">
                  <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center text-gray-300 mb-4">
                    <CheckCircle2 size={32} />
                  </div>
                  <h4 className="font-bold text-gray-900">Tudo em ordem!</h4>
                  <p className="text-gray-500 text-sm max-w-xs">Nenhum cadastro solto encontrado. Todos os usuários estão vinculados corretamente a uma empresa.</p>
                </div>
              </section>
            </motion.div>
          )}

          {activeTab === 'create' && (
            <motion.div 
              key="create"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              className="max-w-4xl mx-auto"
            >
              <div className="bg-white rounded-3xl border border-gray-100 shadow-xl overflow-hidden">
                <div className="bg-orange-500 p-8 text-white">
                  <h3 className="text-xl font-bold mb-2">Novo Cadastro de Empresa</h3>
                  <p className="text-orange-100 text-sm">Este formulário cria simultaneamente os acessos de ADMGERENTE e OPERADOR para uma nova empresa.</p>
                </div>

                <form onSubmit={handleCreateCompany} className="p-8 space-y-8">
                  {/* Company Info */}
                  <div className="space-y-4">
                    <label className="block">
                      <span className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2 block">Nome da Empresa</span>
                      <div className="relative">
                        <Building2 className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                        <input 
                          type="text" 
                          required
                          placeholder="Ex: Lanches São Paulo" 
                          className="w-full pl-12 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all"
                        />
                      </div>
                    </label>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {/* ADMGERENTE */}
                    <div className="space-y-4 p-6 bg-blue-50/30 rounded-3xl border border-blue-100">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white text-xs font-bold">G</div>
                        <h4 className="font-bold text-blue-900">ADMGERENTE</h4>
                      </div>
                      
                      <div className="space-y-4">
                        <label className="block">
                          <span className="text-[10px] font-bold text-blue-400 uppercase tracking-widest mb-1 block">E-mail</span>
                          <input type="email" required placeholder="gerente@empresa.com" className="w-full px-4 py-2.5 bg-white border border-blue-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm" />
                        </label>
                        <label className="block">
                          <span className="text-[10px] font-bold text-blue-400 uppercase tracking-widest mb-1 block">Nome (Opcional)</span>
                          <input type="text" placeholder="Nome do Gerente" className="w-full px-4 py-2.5 bg-white border border-blue-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm" />
                        </label>
                        <label className="block">
                          <span className="text-[10px] font-bold text-blue-400 uppercase tracking-widest mb-1 block">Senha (Mín. 6)</span>
                          <input type="password" required minLength={6} placeholder="••••••" className="w-full px-4 py-2.5 bg-white border border-blue-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm" />
                        </label>
                      </div>
                    </div>

                    {/* OPERADOR */}
                    <div className="space-y-4 p-6 bg-purple-50/30 rounded-3xl border border-purple-100">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-8 h-8 rounded-full bg-purple-500 flex items-center justify-center text-white text-xs font-bold">O</div>
                        <h4 className="font-bold text-purple-900">OPERADOR</h4>
                      </div>
                      
                      <div className="space-y-4">
                        <label className="block">
                          <span className="text-[10px] font-bold text-purple-400 uppercase tracking-widest mb-1 block">E-mail</span>
                          <input type="email" required placeholder="operador@empresa.com" className="w-full px-4 py-2.5 bg-white border border-purple-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all text-sm" />
                        </label>
                        <label className="block">
                          <span className="text-[10px] font-bold text-purple-400 uppercase tracking-widest mb-1 block">Nome (Opcional)</span>
                          <input type="text" placeholder="Nome do Operador" className="w-full px-4 py-2.5 bg-white border border-purple-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all text-sm" />
                        </label>
                        <label className="block">
                          <span className="text-[10px] font-bold text-purple-400 uppercase tracking-widest mb-1 block">Senha (Mín. 6)</span>
                          <input type="password" required minLength={6} placeholder="••••••" className="w-full px-4 py-2.5 bg-white border border-purple-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all text-sm" />
                        </label>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-4">
                    <label className="flex items-center gap-3 cursor-pointer group">
                      <div className="relative">
                        <input type="checkbox" defaultChecked className="sr-only peer" />
                        <div className="w-10 h-5 bg-gray-200 rounded-full peer peer-checked:bg-emerald-500 transition-all after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-5"></div>
                      </div>
                      <span className="text-sm font-bold text-gray-600 group-hover:text-gray-900 transition-colors">Usuário Ativo</span>
                    </label>

                    <button 
                      type="submit"
                      className="px-8 py-3 bg-orange-500 text-white font-bold rounded-2xl shadow-lg shadow-orange-200 hover:bg-orange-600 hover:-translate-y-0.5 active:translate-y-0 transition-all flex items-center gap-2"
                    >
                      <PlusCircle size={20} />
                      Criar Empresa Vinculada
                    </button>
                  </div>
                </form>

                <AnimatePresence>
                  {showSuccess && (
                    <motion.div 
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="bg-emerald-500 text-white p-4 text-center text-sm font-bold flex items-center justify-center gap-2"
                    >
                      <CheckCircle2 size={18} />
                      Empresa vinculada com ADMGERENTE + OPERADOR criada com sucesso!
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          )}

          {activeTab === 'link' && (
            <motion.div 
              key="link"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              className="max-w-2xl mx-auto"
            >
              <div className="bg-white rounded-3xl border border-gray-100 shadow-xl overflow-hidden">
                <div className="bg-blue-600 p-8 text-white">
                  <h3 className="text-xl font-bold mb-2">Vincular Usuários Existentes</h3>
                  <p className="text-blue-100 text-sm">Use este bloco para unir dois cadastros antigos (ADMGERENTE + OPERADOR) na mesma empresa.</p>
                </div>

                <form className="p-8 space-y-6">
                  <label className="block">
                    <span className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2 block">Nome da Empresa</span>
                    <input type="text" required placeholder="Nome da Empresa" className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all" />
                  </label>

                  <div className="grid grid-cols-1 gap-6">
                    <label className="block">
                      <span className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2 block">E-mail do ADMGERENTE</span>
                      <div className="relative">
                        <UserCircle className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                        <input type="email" required placeholder="gerente@email.com" className="w-full pl-12 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all" />
                      </div>
                    </label>

                    <label className="block">
                      <span className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2 block">E-mail do OPERADOR</span>
                      <div className="relative">
                        <UserCircle className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                        <input type="email" required placeholder="operador@email.com" className="w-full pl-12 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all" />
                      </div>
                    </label>
                  </div>

                  <button 
                    type="submit"
                    className="w-full py-4 bg-blue-600 text-white font-bold rounded-2xl shadow-lg shadow-blue-200 hover:bg-blue-700 hover:-translate-y-0.5 active:translate-y-0 transition-all flex items-center justify-center gap-2"
                  >
                    <Link2 size={20} />
                    Vincular Existentes
                  </button>
                </form>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Mobile Nav Overlay */}
      <div className="lg:hidden fixed bottom-6 left-1/2 -translate-x-1/2 w-[90%] bg-white border border-gray-200 rounded-2xl shadow-2xl z-50 p-2 flex items-center justify-around">
        <button onClick={() => setActiveTab('list')} className={`p-3 rounded-xl ${activeTab === 'list' ? 'bg-orange-500 text-white' : 'text-gray-400'}`}>
          <Building2 size={24} />
        </button>
        <button onClick={() => setActiveTab('create')} className={`p-3 rounded-xl ${activeTab === 'create' ? 'bg-orange-500 text-white' : 'text-gray-400'}`}>
          <PlusCircle size={24} />
        </button>
        <button onClick={() => setActiveTab('link')} className={`p-3 rounded-xl ${activeTab === 'link' ? 'bg-orange-500 text-white' : 'text-gray-400'}`}>
          <Link2 size={24} />
        </button>
        <button className="p-3 text-red-400">
          <LogOut size={24} />
        </button>
      </div>
    </div>
  );
};

export default AdminDashboard;
