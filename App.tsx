
import React, { useState, useCallback, useMemo, useEffect } from 'react';
import Header from './components/Header';
import ProductCard from './components/ProductCard';
import InventoryManager from './components/InventoryManager';
import CleaningMaterialsManager from './components/CleaningMaterialsManager';
import SalesSummary from './components/SalesSummary';
import Notification from './components/Notification';
import AddProductModal from './components/AddProductModal';
import AddIngredientModal from './components/AddIngredientModal';
import EditIngredientModal from './components/EditIngredientModal';
import EditProductModal from './components/EditProductModal';
import AdminDashboard from './components/AdminDashboard';
import AdminLogin from './components/AdminLogin';
import {
  CleaningMaterial,
  CleaningStockEntry,
  Ingredient,
  Product,
  Sale,
  ViewMode,
  StockEntry,
  RecipeItem,
} from './types';
import { DEFAULT_APP_STATE, loadAppState, type AppState } from './data/appStorage';
import { runStateCommand, type StateCommand } from './data/stateCommandClient';

const ADMIN_GATE_KEY = 'lanchesdoben_admin_gate';
const ADMIN_SESSION_KEY = 'lanchesdoben_admin_session';
const ADMIN_SESSION_BACKUP_KEY = 'lanchesdoben_admin_session_backup';

interface AdminSessionBarrier {
  token: string;
  issuedAt: number;
  lastHeartbeatAt: number;
}

const generateAdminToken = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `admin-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
};

const parseAdminSessionBarrier = (raw: string | null): AdminSessionBarrier | null => {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<AdminSessionBarrier>;
    if (typeof parsed.token !== 'string' || parsed.token.trim() === '') return null;
    if (typeof parsed.issuedAt !== 'number' || !Number.isFinite(parsed.issuedAt)) return null;
    const lastHeartbeatAt =
      typeof parsed.lastHeartbeatAt === 'number' && Number.isFinite(parsed.lastHeartbeatAt)
        ? parsed.lastHeartbeatAt
        : parsed.issuedAt;
    return {
      token: parsed.token,
      issuedAt: parsed.issuedAt,
      lastHeartbeatAt,
    };
  } catch {
    return null;
  }
};

const loadAdminSessionBarrier = (): AdminSessionBarrier | null => {
  if (typeof window === 'undefined') return null;
  const fromLocal = parseAdminSessionBarrier(window.localStorage.getItem(ADMIN_SESSION_KEY));
  if (fromLocal) return fromLocal;
  return parseAdminSessionBarrier(window.sessionStorage.getItem(ADMIN_SESSION_BACKUP_KEY));
};

const persistAdminSessionBarrier = (session: AdminSessionBarrier) => {
  if (typeof window === 'undefined') return;
  const serialized = JSON.stringify(session);

  try {
    window.localStorage.setItem(ADMIN_SESSION_KEY, serialized);
  } catch {
    // ignore storage write failures
  }

  try {
    window.sessionStorage.setItem(ADMIN_SESSION_BACKUP_KEY, serialized);
  } catch {
    // ignore storage write failures
  }

  try {
    window.sessionStorage.setItem(ADMIN_GATE_KEY, 'authenticated');
  } catch {
    // ignore storage write failures
  }

  try {
    window.localStorage.setItem(ADMIN_GATE_KEY, 'authenticated');
  } catch {
    // ignore storage write failures
  }
};

const reinforceAdminSessionBarrier = (): AdminSessionBarrier => {
  const current = loadAdminSessionBarrier();
  const next: AdminSessionBarrier = {
    token: current?.token || generateAdminToken(),
    issuedAt: current?.issuedAt || Date.now(),
    lastHeartbeatAt: Date.now(),
  };
  persistAdminSessionBarrier(next);
  return next;
};

const resolveSiteRootUrl = () => {
  if (typeof window === 'undefined') return '/';
  const { protocol, hostname, port, origin } = window.location;
  if (port === '3001') {
    return `${protocol}//${hostname}:3000/`;
  }
  return `${origin}/`;
};

const App: React.FC = () => {
  const [view, setView] = useState<ViewMode>(ViewMode.POS);
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [isAccessVerified, setIsAccessVerified] = useState(false);
  
  const [ingredients, setIngredients] = useState<Ingredient[]>(DEFAULT_APP_STATE.ingredients);
  const [products, setProducts] = useState<Product[]>(DEFAULT_APP_STATE.products);
  const [sales, setSales] = useState<Sale[]>(DEFAULT_APP_STATE.sales);
  const [stockEntries, setStockEntries] = useState<StockEntry[]>(DEFAULT_APP_STATE.stockEntries);
  const [cleaningMaterials, setCleaningMaterials] = useState<CleaningMaterial[]>(
    DEFAULT_APP_STATE.cleaningMaterials
  );
  const [cleaningStockEntries, setCleaningStockEntries] = useState<CleaningStockEntry[]>(
    DEFAULT_APP_STATE.cleaningStockEntries
  );
  
  const [globalSales, setGlobalSales] = useState<Sale[]>(DEFAULT_APP_STATE.globalSales);
  const [globalCancelledSales, setGlobalCancelledSales] = useState<Sale[]>(DEFAULT_APP_STATE.globalCancelledSales);
  const [globalStockEntries, setGlobalStockEntries] = useState<StockEntry[]>(DEFAULT_APP_STATE.globalStockEntries);
  const [globalCleaningStockEntries, setGlobalCleaningStockEntries] = useState<CleaningStockEntry[]>(
    DEFAULT_APP_STATE.globalCleaningStockEntries
  );
  
  const [isAddProductModalOpen, setIsAddProductModalOpen] = useState(false);
  const [isAddIngredientModalOpen, setIsAddIngredientModalOpen] = useState(false);
  const [ingredientToEdit, setIngredientToEdit] = useState<Ingredient | null>(null);
  const [productToEdit, setProductToEdit] = useState<Product | null>(null);
  const [notification, setNotification] = useState<{ isVisible: boolean; message: string }>({
    isVisible: false,
    message: '',
  });

  useEffect(() => {
    if (typeof window === 'undefined') {
      setIsAccessVerified(true);
      return;
    }

    const hasSessionPortalAccess = window.sessionStorage.getItem(ADMIN_GATE_KEY) === 'authenticated';
    const hasPersistentPortalAccess = window.localStorage.getItem(ADMIN_GATE_KEY) === 'authenticated';

    if (hasPersistentPortalAccess && !hasSessionPortalAccess) {
      window.sessionStorage.setItem(ADMIN_GATE_KEY, 'authenticated');
    }

    if (hasSessionPortalAccess && !hasPersistentPortalAccess) {
      window.localStorage.setItem(ADMIN_GATE_KEY, 'authenticated');
    }

    if (!hasSessionPortalAccess && !hasPersistentPortalAccess) {
      window.location.replace(resolveSiteRootUrl());
      return;
    }

    setIsAccessVerified(true);
  }, []);

  useEffect(() => {
    if (!isAccessVerified) return;
    const session = loadAdminSessionBarrier();
    if (!session) return;
    setIsAdminAuthenticated(true);
    persistAdminSessionBarrier({
      ...session,
      lastHeartbeatAt: Date.now(),
    });
  }, [isAccessVerified]);

  useEffect(() => {
    if (!isAccessVerified) return;
    if (!isAdminAuthenticated) return;

    const reinforce = () => {
      reinforceAdminSessionBarrier();
    };

    reinforce();

    const heartbeatId = window.setInterval(reinforce, 15000);
    const handleStorage = (event: StorageEvent) => {
      if (!event.key) return;
      if (
        event.key !== ADMIN_SESSION_KEY &&
        event.key !== ADMIN_SESSION_BACKUP_KEY &&
        event.key !== ADMIN_GATE_KEY
      ) {
        return;
      }

      // Self-healing only if another context removed a barrier key.
      if (event.newValue === null) {
        reinforce();
      }
    };
    const handleVisibility = () => {
      if (!document.hidden) reinforce();
    };

    window.addEventListener('focus', reinforce);
    window.addEventListener('pageshow', reinforce);
    window.addEventListener('storage', handleStorage);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      window.clearInterval(heartbeatId);
      window.removeEventListener('focus', reinforce);
      window.removeEventListener('pageshow', reinforce);
      window.removeEventListener('storage', handleStorage);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [isAccessVerified, isAdminAuthenticated]);

  useEffect(() => {
    if (!isAccessVerified) return;

    let cancelled = false;
    loadAppState(DEFAULT_APP_STATE)
      .then((state) => {
        if (cancelled) return;
        setIngredients(state.ingredients);
        setProducts(state.products);
        setSales(state.sales);
        setStockEntries(state.stockEntries);
        setCleaningMaterials(state.cleaningMaterials);
        setCleaningStockEntries(state.cleaningStockEntries);
        setGlobalSales(state.globalSales);
        setGlobalCancelledSales(state.globalCancelledSales);
        setGlobalStockEntries(state.globalStockEntries);
        setGlobalCleaningStockEntries(state.globalCleaningStockEntries);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [isAccessVerified]);

  const showNotification = (message: string) => {
    setNotification({ isVisible: true, message });
  };

  const applyStateSnapshot = useCallback((state: AppState) => {
    setIngredients(state.ingredients);
    setProducts(state.products);
    setSales(state.sales);
    setStockEntries(state.stockEntries);
    setCleaningMaterials(state.cleaningMaterials);
    setCleaningStockEntries(state.cleaningStockEntries);
    setGlobalSales(state.globalSales);
    setGlobalCancelledSales(state.globalCancelledSales);
    setGlobalStockEntries(state.globalStockEntries);
    setGlobalCleaningStockEntries(state.globalCleaningStockEntries);
  }, []);

  const runCommandWithSync = useCallback(
    async (command: StateCommand, successMessage?: string): Promise<boolean> => {
      try {
        const nextState = await runStateCommand(command);
        applyStateSnapshot(nextState);
        if (successMessage) {
          showNotification(successMessage);
        }
        return true;
      } catch (error) {
        const message =
          error instanceof Error && error.message.trim()
            ? error.message
            : 'Falha ao sincronizar com o servidor. Tente novamente.';
        showNotification(message);
        return false;
      }
    },
    [applyStateSnapshot]
  );

  const handleAdminLogin = useCallback((success: boolean) => {
    if (!success) return;
    reinforceAdminSessionBarrier();
    setIsAdminAuthenticated(true);
  }, []);

  const handleSale = useCallback((product: Product, recipeOverride?: RecipeItem[], priceOverride?: number) => {
    void runCommandWithSync(
      {
        type: 'SALE_REGISTER',
        productId: product.id,
        recipeOverride,
        priceOverride,
      },
      `${product.name} Vendido!`
    );
  }, [runCommandWithSync]);

  const handleUndoLastSale = () => {
    if (sales.length === 0) {
      showNotification('Nenhuma venda para desfazer!');
      return;
    }

    const lastSale = sales[sales.length - 1];
    if (confirm(`Desfazer a última venda (${lastSale.productName}) e devolver insumos ao estoque?`)) {
      void runCommandWithSync({ type: 'SALE_UNDO_LAST' }, 'Venda Estornada!');
    }
  };

  const handleUpdateStock = useCallback((id: string, amount: number) => {
    void runCommandWithSync(
      {
        type: 'INGREDIENT_STOCK_MOVE',
        ingredientId: id,
        amount,
      },
      amount > 0 ? 'Estoque Atualizado!' : 'Gasto de Insumo Registrado!'
    );
  }, [runCommandWithSync]);

  const handleAddProduct = (product: Product) => {
    void runCommandWithSync({ type: 'PRODUCT_CREATE', product }, 'Produto Adicionado!');
  };

  const handleEditProduct = (product: Product) => {
    setProductToEdit(product);
  };

  const handleSaveProduct = (updated: Product) => {
    void runCommandWithSync({ type: 'PRODUCT_UPDATE', product: updated }, 'Produto Atualizado!');
  };

  const handleDeleteProduct = (productId: string) => {
    if (confirm("Deseja realmente excluir este produto permanentemente?")) {
      void runCommandWithSync({ type: 'PRODUCT_DELETE', productId }, 'Produto Excluído');
    }
  };

  const handleDeleteIngredient = (ingredientId: string) => {
    if (confirm("ATENÇÃO: Excluir este ingrediente irá impactar as receitas que o utilizam. Tem certeza que deseja remover?")) {
      void runCommandWithSync({ type: 'INGREDIENT_DELETE', ingredientId }, 'Ingrediente Removido');
    }
  };

  const handleAddIngredient = (ingredient: Ingredient) => {
    void runCommandWithSync({ type: 'INGREDIENT_CREATE', ingredient }, 'Ingrediente Adicionado!');
  };

  const handleEditIngredient = (ingredient: Ingredient) => {
    setIngredientToEdit(ingredient);
  };

  const handleSaveIngredient = (updated: Ingredient) => {
    void runCommandWithSync({ type: 'INGREDIENT_UPDATE', ingredient: updated }, 'Ingrediente Atualizado!');
  };

  const handleAddCleaningMaterial = (material: CleaningMaterial) => {
    void runCommandWithSync(
      { type: 'CLEANING_MATERIAL_CREATE', material },
      'Material de limpeza adicionado!'
    );
  };

  const handleUpdateCleaningMaterial = (updated: CleaningMaterial) => {
    void runCommandWithSync(
      { type: 'CLEANING_MATERIAL_UPDATE', material: updated },
      'Material de limpeza atualizado!'
    );
  };

  const handleDeleteCleaningMaterial = (materialId: string) => {
    void runCommandWithSync(
      { type: 'CLEANING_MATERIAL_DELETE', materialId },
      'Material de limpeza removido!'
    );
  };

  const handleUpdateCleaningStock = useCallback((id: string, amount: number) => {
    void runCommandWithSync(
      {
        type: 'CLEANING_STOCK_MOVE',
        materialId: id,
        amount,
      },
      amount > 0 ? 'Estoque de material atualizado!' : 'Baixa de material registrada!'
    );
  }, [runCommandWithSync]);

  const handleClearHistory = () => {
    if (confirm("Deseja realmente encerrar o dia? O caixa será zerado para uma nova sessão.")) {
      void runCommandWithSync({ type: 'CLEAR_HISTORY' }, 'Sessão Reiniciada!');
    }
  };

  const handleFactoryReset = async () => {
    const ok = await runCommandWithSync({ type: 'FACTORY_RESET' }, 'Sistema Resetado com Sucesso!');
    if (ok) {
      setView(ViewMode.POS);
    }
  };

  const handleClearOperationalData = () => {
    void runCommandWithSync(
      { type: 'CLEAR_OPERATIONAL_DATA' },
      'Dados operacionais limpos. Cadastros preservados.'
    );
  };

  const handleClearOnlyStock = () => {
    void runCommandWithSync(
      { type: 'CLEAR_ONLY_STOCK' },
      'Estoque zerado. Cadastros e valores preservados.'
    );
  };

  const handleDeleteArchiveByDate = (dateString: string) => {
    const saleIds = globalSales
      .filter((sale) => sale.timestamp.toLocaleDateString('pt-BR') === dateString)
      .map((sale) => sale.id);

    if (saleIds.length === 0) {
      showNotification('Nenhum arquivo encontrado para a data selecionada.');
      return;
    }

    void runCommandWithSync(
      { type: 'DELETE_ARCHIVE_SALES', saleIds },
      `Arquivos de ${dateString} Excluídos!`
    );
  };

  const handleDeleteArchiveByMonth = (monthString: string) => {
    const saleIds = globalSales
      .filter(
        (sale) =>
          sale.timestamp.toLocaleString('pt-BR', { month: 'long', year: 'numeric' }) === monthString
      )
      .map((sale) => sale.id);

    if (saleIds.length === 0) {
      showNotification('Nenhum arquivo encontrado para o mês selecionado.');
      return;
    }

    void runCommandWithSync(
      { type: 'DELETE_ARCHIVE_SALES', saleIds },
      `Arquivos de ${monthString} Excluídos!`
    );
  };

  const dailyTotal = useMemo(() => sales.reduce((acc, sale) => acc + sale.total, 0), [sales]);

  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      const matchesCategory = activeCategory === 'All' || p.category === activeCategory;
      const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesCategory && matchesSearch;
    });
  }, [products, activeCategory, searchQuery]);

  const categories = ['All', 'Snack', 'Drink', 'Side', 'Combo'];
  const categoryLabels: Record<string, string> = {
    'All': 'Todos',
    'Snack': 'Lanches',
    'Drink': 'Bebidas',
    'Side': 'Extras',
    'Combo': 'Combos',
  };

  if (!isAccessVerified) {
    return (
      <div className="min-h-screen bg-slate-900 text-slate-100 flex items-center justify-center p-6">
        <p className="font-black uppercase tracking-widest text-xs">Validando acesso...</p>
      </div>
    );
  }

  return (
    <div className="qb-app min-h-screen bg-slate-50 flex flex-col">
      <Header currentView={view} setView={setView} dailyTotal={dailyTotal} />
      
      <main className="qb-main flex-1 pb-20">
        {view === ViewMode.POS && (
          <div className="qb-pos max-w-7xl mx-auto p-4 space-y-6 animate-in fade-in duration-500">
            <div className="qb-pos-toolbar flex flex-col md:flex-row gap-4 items-center justify-between bg-white p-4 rounded-[32px] shadow-sm border border-slate-100">
              <div className="qb-pos-categories flex bg-slate-100 p-1.5 rounded-2xl gap-1 w-full md:w-auto overflow-x-auto scrollbar-hide">
                {categories.map(cat => (
                  <button
                    key={cat}
                    onClick={() => setActiveCategory(cat)}
                    className={`qb-btn-touch px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all whitespace-nowrap ${activeCategory === cat ? 'bg-red-600 text-white shadow-lg shadow-red-200' : 'text-slate-500 hover:bg-slate-200'}`}
                  >
                    {categoryLabels[cat]}
                  </button>
                ))}
              </div>

              <div className="qb-pos-actions flex gap-2 w-full md:w-auto">
                <button 
                  onClick={handleUndoLastSale}
                  disabled={sales.length === 0}
                  className="qb-btn-touch bg-slate-900 text-yellow-400 px-5 py-3 rounded-2xl font-black text-[10px] uppercase tracking-tighter shadow-xl hover:bg-black active:scale-95 transition-all disabled:opacity-30 disabled:grayscale disabled:scale-100 whitespace-nowrap flex items-center gap-2 group"
                  title="Desfazer o último pedido"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="group-hover:-rotate-45 transition-transform"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
                  Desfazer Última
                </button>

                <div className="qb-pos-search relative flex-1 md:w-64">
                  <input 
                    type="text"
                    placeholder="Buscar..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-slate-100 border-none rounded-2xl px-5 py-3 pl-11 font-bold text-slate-800 focus:ring-2 focus:ring-red-500"
                  />
                  <svg className="absolute left-4 top-3.5 text-slate-400" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
                </div>
              </div>
            </div>

            <div className="qb-product-grid grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 sm:gap-6">
              {filteredProducts.map(product => (
                <ProductCard 
                  key={product.id}
                  product={product} 
                  onSale={handleSale} 
                  allIngredients={ingredients}
                  onDelete={handleDeleteProduct}
                  onEdit={handleEditProduct}
                />
              ))}
              
              <button 
                onClick={() => setIsAddProductModalOpen(true)}
                className="qb-add-product-card qb-btn-touch group bg-white hover:bg-slate-50 border-4 border-dashed border-slate-200 rounded-[40px] flex flex-col items-center justify-center p-6 transition-all hover:scale-95 active:scale-90 aspect-square min-h-[180px]"
              >
                <div className="bg-slate-100 p-5 rounded-3xl mb-3 group-hover:bg-red-50 group-hover:scale-110 transition-all">
                   <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#b91c1c" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>
                </div>
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest group-hover:text-red-600">Novo Produto</span>
              </button>
            </div>
          </div>
        )}

        {view === ViewMode.INVENTORY && (
          <InventoryManager 
            ingredients={ingredients} 
            entries={stockEntries} 
            onUpdateStock={handleUpdateStock} 
            onOpenAddIngredient={() => setIsAddIngredientModalOpen(true)}
            onEditIngredient={handleEditIngredient}
            onDeleteIngredient={handleDeleteIngredient}
          />
        )}

        {view === ViewMode.REPORTS && (
          <SalesSummary 
            sales={sales} 
            allIngredients={ingredients} 
            stockEntries={stockEntries}
            onClearHistory={handleClearHistory}
          />
        )}

        {view === ViewMode.OTHERS && (
          <CleaningMaterialsManager
            materials={cleaningMaterials}
            entries={cleaningStockEntries}
            onAddMaterial={handleAddCleaningMaterial}
            onUpdateMaterial={handleUpdateCleaningMaterial}
            onDeleteMaterial={handleDeleteCleaningMaterial}
            onUpdateStock={handleUpdateCleaningStock}
          />
        )}

        {view === ViewMode.ADMIN && (
          !isAdminAuthenticated ? (
            <AdminLogin onLogin={handleAdminLogin} />
          ) : (
            <AdminDashboard 
              sales={globalSales} 
              cancelledSales={globalCancelledSales} 
              stockEntries={globalStockEntries} 
              allIngredients={ingredients}
              cleaningMaterials={cleaningMaterials}
              cleaningStockEntries={globalCleaningStockEntries}
              onFactoryReset={handleFactoryReset}
              onClearOperationalData={handleClearOperationalData}
              onClearOnlyStock={handleClearOnlyStock}
              onDeleteArchiveDate={handleDeleteArchiveByDate}
              onDeleteArchiveMonth={handleDeleteArchiveByMonth}
            />
          )
        )}
      </main>

      <Notification 
        isVisible={notification.isVisible} 
        message={notification.message} 
        onClose={() => setNotification({ ...notification, isVisible: false })} 
      />

      <AddProductModal 
        isOpen={isAddProductModalOpen} 
        onClose={() => setIsAddProductModalOpen(false)} 
        ingredients={ingredients} 
        products={products}
        onAdd={handleAddProduct} 
      />

      <AddIngredientModal 
        isOpen={isAddIngredientModalOpen} 
        onClose={() => setIsAddIngredientModalOpen(false)} 
        onAdd={handleAddIngredient} 
      />

      <EditIngredientModal
        isOpen={Boolean(ingredientToEdit)}
        ingredient={ingredientToEdit}
        onClose={() => setIngredientToEdit(null)}
        onSave={handleSaveIngredient}
      />

      <EditProductModal
        isOpen={Boolean(productToEdit)}
        product={productToEdit}
        ingredients={ingredients}
        products={products}
        onClose={() => setProductToEdit(null)}
        onSave={handleSaveProduct}
      />
    </div>
  );
};

export default App;
