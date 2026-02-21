
import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
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
import { DEFAULT_APP_STATE, loadAppState, saveAppState, clearAppState } from './data/appStorage';
import { aggregateRecipe, calculateRecipeCost, getRecipeStockIssues } from './utils/recipe';

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

const toStockMap = <T extends { id: string; currentStock: number }>(items: T[]) =>
  items.reduce<Record<string, number>>((acc, item) => {
    acc[item.id] = item.currentStock;
    return acc;
  }, {});

const getAppliedStockDelta = (currentStock: number, requestedAmount: number): number => {
  if (!Number.isFinite(currentStock) || !Number.isFinite(requestedAmount) || requestedAmount === 0) {
    return 0;
  }

  const normalizedAmount = requestedAmount < 0 ? Math.max(requestedAmount, -currentStock) : requestedAmount;
  if (!Number.isFinite(normalizedAmount) || normalizedAmount === 0) {
    return 0;
  }

  return Math.max(0, currentStock + normalizedAmount) - currentStock;
};

const App: React.FC = () => {
  const [view, setView] = useState<ViewMode>(ViewMode.POS);
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [isAccessVerified, setIsAccessVerified] = useState(false);
  
  const [isHydrated, setIsHydrated] = useState(false);
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
  const ingredientStockRef = useRef<Record<string, number>>(toStockMap(DEFAULT_APP_STATE.ingredients));
  const cleaningMaterialStockRef = useRef<Record<string, number>>(
    toStockMap(DEFAULT_APP_STATE.cleaningMaterials)
  );

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
        setIsHydrated(true);
      })
      .catch(() => {
        if (!cancelled) {
          setIsHydrated(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isAccessVerified]);

  useEffect(() => {
    if (!isAccessVerified) return;
    if (!isHydrated) return;
    void saveAppState({
      ingredients,
      products,
      sales,
      stockEntries,
      cleaningMaterials,
      cleaningStockEntries,
      globalSales,
      globalCancelledSales,
      globalStockEntries,
      globalCleaningStockEntries,
    });
  }, [
    isHydrated,
    ingredients,
    products,
    sales,
    stockEntries,
    cleaningMaterials,
    cleaningStockEntries,
    globalSales,
    globalCancelledSales,
    globalStockEntries,
    globalCleaningStockEntries,
  ]);

  useEffect(() => {
    ingredientStockRef.current = toStockMap(ingredients);
  }, [ingredients]);

  useEffect(() => {
    cleaningMaterialStockRef.current = toStockMap(cleaningMaterials);
  }, [cleaningMaterials]);

  const showNotification = (message: string) => {
    setNotification({ isVisible: true, message });
  };

  const handleAdminLogin = useCallback((success: boolean) => {
    if (!success) return;
    reinforceAdminSessionBarrier();
    setIsAdminAuthenticated(true);
  }, []);

  const handleSale = useCallback((product: Product, recipeOverride?: RecipeItem[], priceOverride?: number) => {
    const recipeToUse = recipeOverride || product.recipe;
    const finalPrice = priceOverride !== undefined ? priceOverride : product.price;

    const { totalCost, missingIngredientIds, totals } = calculateRecipeCost(ingredients, recipeToUse);
    if (Object.keys(totals).length === 0) {
      showNotification('Receita inválida. Verifique os ingredientes.');
      return;
    }
    if (missingIngredientIds.length > 0) {
      showNotification('Receita com insumos ausentes. Atualize o produto.');
      return;
    }

    const stockIssues = getRecipeStockIssues(ingredients, totals);
    if (stockIssues.length > 0) {
      const firstIssue = stockIssues[0];
      showNotification(
        `Estoque insuficiente: ${firstIssue.ingredientName} (${firstIssue.available.toFixed(2)} / ${firstIssue.required.toFixed(2)} ${firstIssue.unit})`
      );
      return;
    }

    const baseCostInfo = calculateRecipeCost(ingredients, product.recipe);
    const baseCost = baseCostInfo.missingIngredientIds.length > 0 ? undefined : baseCostInfo.totalCost;
    const basePrice = product.price;
    const priceAdjustment = finalPrice - basePrice;
    const stockDebited = Object.entries(totals).map(([ingredientId, quantity]) => ({
      ingredientId,
      quantity,
    }));

    const newSale: Sale = {
      id: 's-' + Date.now(),
      productId: product.id,
      productName: product.name,
      timestamp: new Date(),
      total: finalPrice,
      totalCost,
      recipe: recipeToUse,
      stockDebited,
      basePrice,
      priceAdjustment,
      baseCost,
    };

    const saleStockEntries: StockEntry[] = Object.entries(totals).map(([ingredientId, quantity]) => {
      const ingredient = ingredients.find(item => item.id === ingredientId);
      return {
        id: `st-sale-${newSale.id}-${ingredientId}`,
        ingredientId,
        ingredientName: ingredient?.name || 'Insumo',
        quantity: -quantity,
        unitCost: ingredient?.cost,
        timestamp: newSale.timestamp,
        source: 'SALE',
        saleId: newSale.id,
      };
    });

    const ingredientsAfterSale = ingredients.map(ing => {
      const quantity = totals[ing.id];
      if (quantity) {
        return { ...ing, currentStock: Math.max(0, ing.currentStock - quantity) };
      }
      return ing;
    });
    ingredientStockRef.current = toStockMap(ingredientsAfterSale);
    setIngredients(ingredientsAfterSale);
    setStockEntries(prev => [...prev, ...saleStockEntries]);
    setGlobalStockEntries(prev => [...prev, ...saleStockEntries]);
    setSales(prev => [...prev, newSale]);
    setGlobalSales(prev => [...prev, newSale]);
    showNotification(`${product.name} Vendido!`);
  }, [ingredients]);

  const handleUndoLastSale = () => {
    if (sales.length === 0) {
      showNotification('Nenhuma venda para desfazer!');
      return;
    }

    const lastSale = sales[sales.length - 1];
    if (confirm(`Desfazer a última venda (${lastSale.productName}) e devolver insumos ao estoque?`)) {
      const recipeToRestore = lastSale.stockDebited || lastSale.recipe;
      const totals = recipeToRestore ? aggregateRecipe(recipeToRestore) : {};
      const autoReplenishmentTotals = stockEntries.reduce<Record<string, number>>((acc, entry) => {
        if (entry.saleId !== lastSale.id || entry.source !== 'AUTO_REPLENISH') {
          return acc;
        }
        acc[entry.ingredientId] = (acc[entry.ingredientId] || 0) + entry.quantity;
        return acc;
      }, {});

      if (Object.keys(totals).length > 0 || Object.keys(autoReplenishmentTotals).length > 0) {
        const restoredIngredients = ingredients.map(ing => {
          const restoredQuantity = totals[ing.id] || 0;
          const autoReplenished = autoReplenishmentTotals[ing.id] || 0;
          if (restoredQuantity !== 0 || autoReplenished !== 0) {
            return {
              ...ing,
              currentStock: Math.max(0, ing.currentStock + restoredQuantity - autoReplenished),
            };
          }
          return ing;
        });
        ingredientStockRef.current = toStockMap(restoredIngredients);
        setIngredients(restoredIngredients);
      }
      setSales(prev => prev.slice(0, -1));
      setStockEntries(prev => prev.filter(entry => entry.saleId !== lastSale.id));
      setGlobalStockEntries(prev => prev.filter(entry => entry.saleId !== lastSale.id));
      setGlobalSales(prev => {
        const indexToRemove = prev.map((sale) => sale.id).lastIndexOf(lastSale.id);
        if (indexToRemove === -1) return prev;
        return prev.filter((_sale, index) => index !== indexToRemove);
      });
      setGlobalCancelledSales(prev => [...prev, lastSale]);
      showNotification('Venda Estornada!');
    }
  };

  const handleUpdateStock = useCallback((id: string, amount: number) => {
    const ing = ingredients.find(i => i.id === id);
    if (!ing) return;

    if (!Number.isFinite(amount) || amount === 0) {
      showNotification('Quantidade inválida!');
      return;
    }

    const currentStock = ingredientStockRef.current[id] ?? ing.currentStock;
    const appliedAmount = getAppliedStockDelta(currentStock, amount);
    if (appliedAmount === 0) {
      showNotification('Estoque insuficiente para a baixa!');
      return;
    }

    ingredientStockRef.current[id] = currentStock + appliedAmount;
    const timestamp = new Date();

    const newEntry: StockEntry = {
      id: 'st-' + Date.now(),
      ingredientId: id,
      ingredientName: ing.name,
      quantity: appliedAmount,
      unitCost: ing.cost,
      timestamp,
      source: 'MANUAL',
    };

    setIngredients(prev => prev.map(i =>
      i.id === id ? { ...i, currentStock: Math.max(0, i.currentStock + appliedAmount) } : i
    ));
    setStockEntries(prev => [...prev, newEntry]);
    setGlobalStockEntries(prev => [...prev, newEntry]);

    showNotification(appliedAmount > 0 ? 'Estoque Atualizado!' : 'Gasto de Insumo Registrado!');
  }, [ingredients]);

  const handleAddProduct = (product: Product) => {
    setProducts(prev => [...prev, product]);
    showNotification('Produto Adicionado!');
  };

  const handleEditProduct = (product: Product) => {
    setProductToEdit(product);
  };

  const handleSaveProduct = (updated: Product) => {
    setProducts(prev => prev.map(p => (p.id === updated.id ? updated : p)));
    showNotification('Produto Atualizado!');
  };

  const handleDeleteProduct = (productId: string) => {
    if (confirm("Deseja realmente excluir este produto permanentemente?")) {
      setProducts(prev => prev.filter(p => p.id !== productId));
      showNotification('Produto Excluído');
    }
  };

  const handleDeleteIngredient = (ingredientId: string) => {
    if (confirm("ATENÇÃO: Excluir este ingrediente irá impactar as receitas que o utilizam. Tem certeza que deseja remover?")) {
      setIngredients(prev => prev.filter(i => i.id !== ingredientId));
      const nextRef = { ...ingredientStockRef.current };
      delete nextRef[ingredientId];
      ingredientStockRef.current = nextRef;
      // Limpa receitas de produtos que usavam esse ingrediente para evitar erros
      setProducts(prev => prev.map(p => ({
        ...p,
        recipe: p.recipe.filter(r => r.ingredientId !== ingredientId)
      })));
      showNotification('Ingrediente Removido');
    }
  };

  const handleAddIngredient = (ingredient: Ingredient) => {
    ingredientStockRef.current = {
      ...ingredientStockRef.current,
      [ingredient.id]: ingredient.currentStock,
    };
    setIngredients(prev => [...prev, ingredient]);
    showNotification('Ingrediente Adicionado!');
  };

  const handleEditIngredient = (ingredient: Ingredient) => {
    setIngredientToEdit(ingredient);
  };

  const handleSaveIngredient = (updated: Ingredient) => {
    ingredientStockRef.current = {
      ...ingredientStockRef.current,
      [updated.id]: updated.currentStock,
    };
    setIngredients(prev => prev.map(ing => (ing.id === updated.id ? updated : ing)));
    showNotification('Ingrediente Atualizado!');
  };

  const handleAddCleaningMaterial = (material: CleaningMaterial) => {
    cleaningMaterialStockRef.current = {
      ...cleaningMaterialStockRef.current,
      [material.id]: material.currentStock,
    };
    setCleaningMaterials(prev => [...prev, material]);
    showNotification('Material de limpeza adicionado!');
  };

  const handleUpdateCleaningMaterial = (updated: CleaningMaterial) => {
    cleaningMaterialStockRef.current = {
      ...cleaningMaterialStockRef.current,
      [updated.id]: updated.currentStock,
    };
    setCleaningMaterials(prev => prev.map(material => (material.id === updated.id ? updated : material)));
    showNotification('Material de limpeza atualizado!');
  };

  const handleDeleteCleaningMaterial = (materialId: string) => {
    const nextRef = { ...cleaningMaterialStockRef.current };
    delete nextRef[materialId];
    cleaningMaterialStockRef.current = nextRef;
    setCleaningMaterials(prev => prev.filter(material => material.id !== materialId));
    showNotification('Material de limpeza removido!');
  };

  const handleUpdateCleaningStock = useCallback((id: string, amount: number) => {
    const material = cleaningMaterials.find(m => m.id === id);
    if (!material) return;

    if (!Number.isFinite(amount) || amount === 0) {
      showNotification('Quantidade inválida para material!');
      return;
    }

    const currentStock = cleaningMaterialStockRef.current[id] ?? material.currentStock;
    const appliedAmount = getAppliedStockDelta(currentStock, amount);
    if (appliedAmount === 0) {
      showNotification('Estoque de material insuficiente para baixa!');
      return;
    }

    cleaningMaterialStockRef.current[id] = currentStock + appliedAmount;

    const newEntry: CleaningStockEntry = {
      id: `cst-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      materialId: id,
      materialName: material.name,
      quantity: appliedAmount,
      unitCost: material.cost,
      timestamp: new Date(),
    };

    setCleaningMaterials(prev =>
      prev.map(m =>
        m.id === id ? { ...m, currentStock: Math.max(0, m.currentStock + appliedAmount) } : m
      )
    );
    setCleaningStockEntries(prev => [...prev, newEntry]);
    setGlobalCleaningStockEntries(prev => [...prev, newEntry]);
    showNotification(appliedAmount > 0 ? 'Estoque de material atualizado!' : 'Baixa de material registrada!');
  }, [cleaningMaterials]);

  const handleClearHistory = () => {
    if (confirm("Deseja realmente encerrar o dia? O caixa será zerado para uma nova sessão.")) {
      setSales([]);
      setStockEntries([]);
      showNotification('Sessão Reiniciada!');
    }
  };

  const handleFactoryReset = async () => {
    await clearAppState();
    ingredientStockRef.current = toStockMap(DEFAULT_APP_STATE.ingredients);
    cleaningMaterialStockRef.current = toStockMap(DEFAULT_APP_STATE.cleaningMaterials);
    setIngredients(DEFAULT_APP_STATE.ingredients);
    setProducts(DEFAULT_APP_STATE.products);
    setSales(DEFAULT_APP_STATE.sales);
    setStockEntries(DEFAULT_APP_STATE.stockEntries);
    setCleaningMaterials(DEFAULT_APP_STATE.cleaningMaterials);
    setCleaningStockEntries(DEFAULT_APP_STATE.cleaningStockEntries);
    setGlobalSales(DEFAULT_APP_STATE.globalSales);
    setGlobalCancelledSales(DEFAULT_APP_STATE.globalCancelledSales);
    setGlobalStockEntries(DEFAULT_APP_STATE.globalStockEntries);
    setGlobalCleaningStockEntries(DEFAULT_APP_STATE.globalCleaningStockEntries);
    showNotification('Sistema Resetado com Sucesso!');
    setView(ViewMode.POS);
  };

  const handleClearOperationalData = () => {
    setSales([]);
    setStockEntries([]);
    setCleaningStockEntries([]);
    setGlobalSales([]);
    setGlobalCancelledSales([]);
    setGlobalStockEntries([]);
    setGlobalCleaningStockEntries([]);
    showNotification('Dados operacionais limpos. Cadastros preservados.');
  };

  const handleClearOnlyStock = () => {
    ingredientStockRef.current = ingredients.reduce<Record<string, number>>((acc, ingredient) => {
      acc[ingredient.id] = 0;
      return acc;
    }, {});
    cleaningMaterialStockRef.current = cleaningMaterials.reduce<Record<string, number>>((acc, material) => {
      acc[material.id] = 0;
      return acc;
    }, {});

    setIngredients(prev =>
      prev.map(ingredient => ({
        ...ingredient,
        currentStock: 0,
      }))
    );
    setCleaningMaterials(prev =>
      prev.map(material => ({
        ...material,
        currentStock: 0,
      }))
    );
    showNotification('Estoque zerado. Cadastros e valores preservados.');
  };

  const handleDeleteArchiveByDate = (dateString: string) => {
    setGlobalSales(prev => prev.filter(s => s.timestamp.toLocaleDateString('pt-BR') !== dateString));
    showNotification(`Arquivos de ${dateString} Excluídos!`);
  };

  const handleDeleteArchiveByMonth = (monthString: string) => {
    setGlobalSales(prev => prev.filter(s => 
      s.timestamp.toLocaleString('pt-BR', { month: 'long', year: 'numeric' }) !== monthString
    ));
    showNotification(`Arquivos de ${monthString} Excluídos!`);
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
