/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Menu as MenuIcon, 
  X, 
  ShoppingBag, 
  Instagram, 
  Facebook, 
  MapPin, 
  Phone, 
  Clock,
  ChevronRight,
  Star,
  Lock
} from 'lucide-react';

const ADMIN_EMAIL = 'meu@admin.com';
const ADMIN_PASSWORD = 'ben123';
const PRODUCTION_FALLBACK_ORIGIN = 'https://lanchesdoben.com.br';

const normalizePath = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return '/';
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
};

const withPath = (origin: string, path: string) => {
  const normalizedPath = normalizePath(path);
  if (normalizedPath === '/') return origin;
  return `${origin}${normalizedPath}`;
};

const resolveAdminSystemUrl = () => {
  const systemPath = normalizePath(
    (import.meta.env.VITE_ADMIN_SYSTEM_PATH as string | undefined) || '/sistema/'
  );

  if (typeof window !== 'undefined') {
    return withPath(window.location.origin, systemPath);
  }

  return withPath(PRODUCTION_FALLBACK_ORIGIN, systemPath);
};

const MENU_ITEMS = [
  {
    id: 1,
    name: "Ben Monstro",
    description: "Pão brioche, 2 blends de 180g, muito cheddar, bacon crocante e maionese da casa.",
    price: "R$ 38,90",
    category: "Burgers",
    image: "https://picsum.photos/seed/burger1/600/400"
  },
  {
    id: 2,
    name: "Clássico do Ben",
    description: "Pão com gergelim, blend 150g, queijo prato, alface, tomate e cebola roxa.",
    price: "R$ 28,90",
    category: "Burgers",
    image: "https://picsum.photos/seed/burger2/600/400"
  },
  {
    id: 3,
    name: "Cheddar Lover",
    description: "Pão australiano, blend 150g, cebola caramelizada e piscina de cheddar.",
    price: "R$ 32,90",
    category: "Burgers",
    image: "https://picsum.photos/seed/burger3/600/400"
  },
  {
    id: 4,
    name: "Batata Suprema",
    description: "Batata frita palito com cheddar cremoso e farofa de bacon.",
    price: "R$ 22,90",
    category: "Acompanhamentos",
    image: "https://picsum.photos/seed/fries1/600/400"
  },
  {
    id: 5,
    name: "Onion Rings",
    description: "Anéis de cebola empanados e super crocantes com molho barbecue.",
    price: "R$ 18,90",
    category: "Acompanhamentos",
    image: "https://picsum.photos/seed/onions/600/400"
  },
  {
    id: 6,
    name: "Milkshake Morango",
    description: "Sorvete premium de morango, calda artesanal e chantilly.",
    price: "R$ 16,90",
    category: "Bebidas",
    image: "https://picsum.photos/seed/shake/600/400"
  }
];

export default function App() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState("Todos");
  const [isAdminModalOpen, setIsAdminModalOpen] = useState(false);
  const [isHoursOpen, setIsHoursOpen] = useState(false);
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [adminError, setAdminError] = useState('');
  const [isAdminRedirecting, setIsAdminRedirecting] = useState(false);

  const categories = ["Todos", "Burgers", "Acompanhamentos", "Bebidas"];

  const openAdminModal = () => {
    setAdminEmail('');
    setAdminPassword('');
    setAdminError('');
    setIsAdminModalOpen(true);
  };

  const closeAdminModal = () => {
    setIsAdminModalOpen(false);
    setAdminPassword('');
    setAdminError('');
    setIsAdminRedirecting(false);
  };

  const handleAdminLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (isAdminRedirecting) return;

    const normalizedEmail = adminEmail.trim().toLowerCase();

    if (normalizedEmail === ADMIN_EMAIL && adminPassword === ADMIN_PASSWORD) {
      setIsAdminRedirecting(true);
      setAdminError('');
      window.sessionStorage.setItem('lanchesdoben_admin_gate', 'authenticated');
      window.localStorage.removeItem('lanchesdoben_admin_gate');
      const targetUrl = resolveAdminSystemUrl();
      window.location.href = targetUrl;
      setIsAdminRedirecting(false);
      setIsAdminModalOpen(false);
      return;
    }

    setAdminError('E-mail ou senha inválidos.');
    setAdminPassword('');
  };

  const handleWhatsApp = () => {
    const message = encodeURIComponent("Olá! Gostaria de fazer um pedido.");
    window.open(`https://wa.me/5521983659826?text=${message}`, '_blank');
  };
  
  const filteredMenu = activeCategory === "Todos" 
    ? MENU_ITEMS 
    : MENU_ITEMS.filter(item => item.category === activeCategory);

  return (
    <div className="min-h-screen flex flex-col">
      {/* Navigation */}
      <nav className="fixed w-full z-50 bg-brand-black/95 text-white border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-20">
            <div className="flex items-center gap-3">
              <img 
                src="https://i.pinimg.com/736x/69/40/d9/6940d97853972edd36dd7e77a4a99bc9.jpg" 
                alt="Logo LANCHESDOBEN" 
                className="w-12 h-12 rounded-full object-cover border-2 border-brand-red"
                referrerPolicy="no-referrer"
              />
              <span className="font-display text-3xl tracking-tighter text-brand-red">LANCHESDOBEN</span>
            </div>
            
            <div className="hidden md:flex items-center space-x-8">
              <a href="#home" className="hover:text-brand-red transition-colors">Início</a>
              <div className="flex items-center gap-4 border-l border-white/20 pl-8">
                <a 
                  href="https://www.instagram.com/lanches.doben/" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="hover:text-brand-red transition-colors"
                >
                  <Instagram size={20} />
                </a>
                <a 
                  href="https://www.facebook.com/lanches.dobem.2025?mibextid=wwXIfr&rdid=joCIhkS38u0Amnma&share_url=https%3A%2F%2Fwww.facebook.com%2Fshare%2F1C8gGroWcL%2F%3Fmibextid%3DwwXIfr%26ref%3D1#" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="hover:text-brand-red transition-colors"
                >
                  <Facebook size={20} />
                </a>
              </div>
              <button 
                onClick={openAdminModal}
                className="hover:text-brand-red transition-colors flex items-center gap-2"
              >
                <Lock size={16} />
                Admin
              </button>
              <button 
                onClick={handleWhatsApp}
                className="bg-brand-red hover:bg-red-700 text-white px-6 py-2 rounded-full font-bold transition-all flex items-center gap-2"
              >
                <ShoppingBag size={20} />
                Pedir Agora
              </button>
            </div>

            <div className="md:hidden flex items-center">
              <button onClick={() => setIsMenuOpen(!isMenuOpen)} className="p-2">
                {isMenuOpen ? <X size={28} /> : <MenuIcon size={28} />}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Menu */}
        <AnimatePresence>
          {isMenuOpen && (
            <motion.div 
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="md:hidden bg-brand-black border-b border-white/10 overflow-hidden"
            >
              <div className="px-4 pt-2 pb-6 space-y-4">
                <a href="#home" onClick={() => setIsMenuOpen(false)} className="block text-lg font-medium">Início</a>
                <div className="flex items-center gap-6 py-2">
                  <a 
                    href="https://www.instagram.com/lanches.doben/" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-white hover:text-brand-red transition-colors"
                  >
                    <Instagram size={24} />
                  </a>
                  <a 
                    href="https://www.facebook.com/lanches.dobem.2025?mibextid=wwXIfr&rdid=joCIhkS38u0Amnma&share_url=https%3A%2F%2Fwww.facebook.com%2Fshare%2F1C8gGroWcL%2F%3Fmibextid%3DwwXIfr%26ref%3D1#" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-white hover:text-brand-red transition-colors"
                  >
                    <Facebook size={24} />
                  </a>
                </div>
                <button 
                  onClick={() => {
                    setIsMenuOpen(false);
                    openAdminModal();
                  }} 
                  className="text-lg font-medium w-full text-left flex items-center gap-2"
                >
                  <Lock size={18} />
                  Admin
                </button>
                <button 
                  onClick={() => {
                    setIsMenuOpen(false);
                    handleWhatsApp();
                  }}
                  className="w-full bg-brand-red text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2"
                >
                  <ShoppingBag size={20} />
                  Pedir Agora
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </nav>

      {/* Floating Hours Bar */}
      <div className="fixed bottom-6 left-6 z-[60]">
        <button 
          onClick={() => setIsHoursOpen(!isHoursOpen)}
          className="bg-brand-black text-white p-4 rounded-full shadow-2xl border border-white/10 flex items-center gap-3 hover:bg-brand-red transition-all group"
        >
          <Clock size={24} className="group-hover:rotate-12 transition-transform" />
          <span className="font-bold pr-2">Horários</span>
        </button>

        <AnimatePresence>
          {isHoursOpen && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8, y: 20, x: -20 }}
              animate={{ opacity: 1, scale: 1, y: 0, x: 0 }}
              exit={{ opacity: 0, scale: 0.8, y: 20, x: -20 }}
              className="absolute bottom-20 left-0 w-72 bg-white rounded-3xl shadow-2xl border border-gray-100 overflow-hidden"
            >
              <div className="bg-brand-red p-4 text-white text-center">
                <h4 className="font-display text-xl">HORÁRIO DE FUNCIONAMENTO</h4>
              </div>
              <div className="p-6 space-y-3 text-sm">
                <div className="flex justify-between items-center pb-2 border-b border-gray-50">
                  <span className="font-bold">Segunda a Quinta</span>
                  <span className="text-gray-600">18:00 – 01:00</span>
                </div>
                <div className="flex justify-between items-center pb-2 border-b border-gray-50">
                  <span className="font-bold text-brand-red">Sexta a Domingo</span>
                  <span className="text-brand-red font-bold">18:00 – 02:00</span>
                </div>
                <div className="pt-2 text-center text-xs text-gray-400 italic">
                  * Sujeito a alterações em feriados
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Admin Login Modal */}
      <AnimatePresence>
        {isAdminModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center px-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={closeAdminModal}
              className="absolute inset-0 bg-brand-black/80 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative bg-white w-full max-w-md rounded-3xl overflow-hidden shadow-2xl"
            >
              <div className="bg-brand-red p-8 text-center text-white">
                <div className="bg-white/20 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Lock size={32} />
                </div>
                <h2 className="font-display text-3xl">ÁREA DO ADMIN</h2>
                <p className="text-white/80 text-sm">Acesse para gerenciar sua hamburgueria</p>
              </div>
              <div className="p-8">
                <form className="space-y-6" onSubmit={handleAdminLogin}>
                  <div>
                    <label className="block text-xs font-bold mb-2 uppercase tracking-widest text-gray-400">Usuário</label>
                    <input 
                      type="email"
                      value={adminEmail}
                      onChange={(e) => {
                        setAdminEmail(e.target.value);
                        if (adminError) setAdminError('');
                      }}
                      autoComplete="email"
                      required
                      className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 focus:ring-2 focus:ring-brand-red outline-none transition-all" 
                      placeholder="meu@admin.com"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold mb-2 uppercase tracking-widest text-gray-400">Senha</label>
                    <input 
                      type="password" 
                      value={adminPassword}
                      onChange={(e) => {
                        setAdminPassword(e.target.value);
                        if (adminError) setAdminError('');
                      }}
                      autoComplete="current-password"
                      required
                      className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 focus:ring-2 focus:ring-brand-red outline-none transition-all" 
                      placeholder="••••••••"
                    />
                  </div>
                  {adminError && (
                    <p className="text-sm font-semibold text-red-600 text-center">
                      {adminError}
                    </p>
                  )}
                  <button
                    type="submit"
                    disabled={isAdminRedirecting}
                    className="w-full bg-brand-black text-white py-4 rounded-xl font-bold hover:bg-brand-red transition-all shadow-lg disabled:opacity-70 disabled:cursor-not-allowed"
                  >
                    {isAdminRedirecting ? 'Abrindo painel...' : 'Entrar no Painel'}
                  </button>
                  <button 
                    type="button"
                    onClick={closeAdminModal}
                    className="w-full text-gray-400 text-sm font-medium hover:text-brand-black transition-colors"
                  >
                    Voltar ao Site
                  </button>
                </form>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Hero Section */}
      <section id="home" className="relative h-screen flex items-center justify-center overflow-hidden bg-brand-black pt-20">
        <div className="absolute inset-0 z-0">
          <img 
            src="https://i.pinimg.com/736x/6b/f7/46/6bf7465d1a625ccc5c1e6d27e92e4936.jpg" 
            alt="Hero Background" 
            className="w-full h-full object-cover opacity-40"
            referrerPolicy="no-referrer"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-brand-black via-transparent to-brand-black/50" />
        </div>

        <div className="relative z-10 max-w-7xl mx-auto px-4 text-center">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
          >
            
            <h2 className="text-brand-red font-display text-2xl md:text-3xl mb-4 tracking-widest uppercase">O Melhor da Cidade</h2>
            <h1 className="text-white font-display text-6xl md:text-9xl mb-8 leading-none tracking-tighter">
              SABOR QUE <br />
              <span className="text-brand-red">SURPREENDE</span>
            </h1>
            <p className="text-white/80 text-lg md:text-xl max-w-2xl mx-auto mb-10 font-light">
              Hambúrgueres artesanais feitos com blends exclusivos, ingredientes frescos e aquele toque especial do Ben.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <button 
                onClick={handleWhatsApp}
                className="w-full sm:w-auto bg-brand-red hover:bg-red-700 text-white px-12 py-5 rounded-full font-bold text-xl transition-all transform hover:scale-105 shadow-2xl shadow-brand-red/40"
              >
                Pedir Agora
              </button>
            </div>
          </motion.div>
        </div>

        {/* Floating elements for visual interest */}
        <motion.div 
          animate={{ y: [0, -20, 0] }}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
          className="absolute bottom-20 left-10 hidden lg:block"
        >
          <div className="bg-white/5 backdrop-blur-md border border-white/10 p-4 rounded-2xl">
            <div className="flex items-center gap-3">
              <div className="bg-brand-red p-2 rounded-lg">
                <Star className="text-white fill-white" size={20} />
              </div>
              <div>
                <p className="text-white font-bold text-sm">4.9/5 Estrelas</p>
                <p className="text-white/60 text-xs">No Google Reviews</p>
              </div>
            </div>
          </div>
        </motion.div>
      </section>

      {/* Menu Section */}
      <section id="menu" className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-brand-red font-display text-2xl mb-2">Nosso Cardápio</h2>
            <h3 className="text-brand-black font-display text-5xl md:text-6xl">ESCOLHA O SEU FAVORITO</h3>
          </div>

          {/* Category Filter */}
          <div className="flex flex-wrap justify-center gap-4 mb-12">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`px-8 py-2 rounded-full font-bold transition-all ${
                  activeCategory === cat 
                    ? 'bg-brand-red text-white shadow-lg shadow-brand-red/20' 
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Grid */}
          <motion.div 
            layout
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8"
          >
            <AnimatePresence mode='popLayout'>
              {filteredMenu.map((item) => (
                <motion.div
                  key={item.id}
                  layout
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ duration: 0.3 }}
                  className="group bg-white rounded-3xl overflow-hidden border border-gray-100 hover:border-brand-red/20 hover:shadow-2xl transition-all"
                >
                  <div className="relative h-64 overflow-hidden">
                    <img 
                      src={item.image} 
                      alt={item.name} 
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                      referrerPolicy="no-referrer"
                    />
                    <div className="absolute top-4 right-4 bg-brand-black text-white px-4 py-1 rounded-full font-bold text-sm">
                      {item.price}
                    </div>
                  </div>
                  <div className="p-6">
                    <h4 className="font-display text-2xl mb-2 group-hover:text-brand-red transition-colors">{item.name}</h4>
                    <p className="text-gray-500 text-sm leading-relaxed mb-6">
                      {item.description}
                    </p>
                    <button 
                      onClick={handleWhatsApp}
                      className="w-full border-2 border-brand-black hover:bg-brand-black hover:text-white py-3 rounded-xl font-bold transition-all flex items-center justify-center gap-2"
                    >
                      Pedir via WhatsApp
                      <ChevronRight size={18} />
                    </button>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </motion.div>
        </div>
      </section>

      {/* Contact Section */}
      <section id="contact" className="py-24 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4">
          <div className="max-w-2xl mx-auto text-center">
            <h2 className="text-brand-red font-display text-2xl mb-4">Contato</h2>
            <h3 className="font-display text-5xl mb-12">VEM PRO BEN!</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">
              <a 
                href="https://maps.app.goo.gl/NsRzHNobQ5ApwU7G7" 
                target="_blank" 
                rel="noopener noreferrer"
                className="flex flex-col items-center gap-4 p-6 bg-white rounded-3xl shadow-sm border border-gray-100 hover:border-brand-red transition-all group"
              >
                <div className="bg-gray-50 p-4 rounded-2xl group-hover:bg-brand-red/10 transition-colors">
                  <MapPin className="text-brand-red" size={32} />
                </div>
                <div>
                  <p className="font-bold text-lg">Endereço</p>
                  <p className="text-gray-600">Clique para abrir o Mapa</p>
                </div>
              </a>
              <a 
                href="tel:+5521983659826"
                className="flex flex-col items-center gap-4 p-6 bg-white rounded-3xl shadow-sm border border-gray-100 hover:border-brand-red transition-all group"
              >
                <div className="bg-gray-50 p-4 rounded-2xl group-hover:bg-brand-red/10 transition-colors">
                  <Phone className="text-brand-red" size={32} />
                </div>
                <div>
                  <p className="font-bold text-lg">Telefone</p>
                  <p className="text-gray-600">(21) 98365-9826</p>
                </div>
              </a>
              <button 
                onClick={() => setIsHoursOpen(true)}
                className="flex flex-col items-center gap-4 p-6 bg-white rounded-3xl shadow-sm border border-gray-100 hover:border-brand-red transition-all group"
              >
                <div className="bg-gray-50 p-4 rounded-2xl group-hover:bg-brand-red/10 transition-colors">
                  <Clock className="text-brand-red" size={32} />
                </div>
                <div>
                  <p className="font-bold text-lg">Horário</p>
                  <p className="text-gray-600">Ver Funcionamento</p>
                </div>
              </button>
            </div>

            <div className="flex justify-center gap-6">
              <a 
                href="https://www.instagram.com/lanches.doben/" 
                target="_blank" 
                rel="noopener noreferrer"
                className="bg-brand-black text-white p-4 rounded-full hover:bg-brand-red transition-all transform hover:scale-110 shadow-lg"
              >
                <Instagram size={28} />
              </a>
              <a 
                href="https://www.facebook.com/lanches.dobem.2025?mibextid=wwXIfr&rdid=joCIhkS38u0Amnma&share_url=https%3A%2F%2Fwww.facebook.com%2Fshare%2F1C8gGroWcL%2F%3Fmibextid%3DwwXIfr%26ref%3D1#" 
                target="_blank" 
                rel="noopener noreferrer"
                className="bg-brand-black text-white p-4 rounded-full hover:bg-brand-red transition-all transform hover:scale-110 shadow-lg"
              >
                <Facebook size={28} />
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-brand-black text-white py-12 border-t border-white/10">
        <div className="max-w-7xl mx-auto px-4 text-center">
          <img 
            src="https://i.pinimg.com/736x/69/40/d9/6940d97853972edd36dd7e77a4a99bc9.jpg" 
            alt="Logo Footer" 
            className="w-20 h-20 rounded-full mx-auto mb-4 border-2 border-brand-red object-cover"
            referrerPolicy="no-referrer"
          />
          <span className="font-display text-4xl tracking-tighter text-brand-red mb-6 block">LANCHESDOBEN</span>
          <p className="text-white/40 text-sm mb-8">
            © {new Date().getFullYear()} LANCHESDOBEN. Todos os direitos reservados.
          </p>
          <div className="flex justify-center gap-8 text-white/60 text-sm">
            <a href="#" className="hover:text-white transition-colors">Privacidade</a>
            <a href="#" className="hover:text-white transition-colors">Termos de Uso</a>
            <a href="#" className="hover:text-white transition-colors">Cookies</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
