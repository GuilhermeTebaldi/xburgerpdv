import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Copy,
  Lock,
  LogOut,
  RefreshCw,
} from 'lucide-react';

const DEFAULT_API_BASE_URL = 'https://xburger-saas-backend.onrender.com';
const REQUEST_TIMEOUT_MS = 12000;

const DEV_EMAIL = ((import.meta.env.VITE_DEV_CONSOLE_EMAIL as string | undefined) || 'dev@xburgerpdv.com.br')
  .trim()
  .toLowerCase();
const DEV_PASSWORD = (import.meta.env.VITE_DEV_CONSOLE_PASSWORD as string | undefined) || 'change-me-now';

const DEV_ACCESS_SESSION_KEY = 'xburger_dev_access_session';
const DEV_ACCESS_LOCAL_KEY = 'xburger_dev_access_local';
const DEV_REMEMBER_ACCESS_KEY = 'xburger_dev_access_remember';
const DEV_SAVED_EMAIL_KEY = 'xburger_dev_saved_email';

interface DeveloperRecipeItem {
  ingredientId: string;
  quantity: number;
}

interface DeveloperIngredient {
  id: string;
  name: string;
  unit: string;
  currentStock: number;
  minStock: number;
  cost: number;
}

interface DeveloperProduct {
  id: string;
  name: string;
  price: number;
  category: string;
  recipe: DeveloperRecipeItem[];
}

interface DeveloperSale {
  id: string;
  productId: string;
  productName: string;
  total: number;
  totalCost: number;
  timestamp: string;
  recipe?: DeveloperRecipeItem[];
  stockDebited?: DeveloperRecipeItem[];
  basePrice?: number;
  priceAdjustment?: number;
}

interface DeveloperStockEntry {
  id: string;
  ingredientId: string;
  quantity: number;
  unitCost: number;
  saleId?: string;
  source?: string;
  timestamp: string;
}

interface DeveloperStateSnapshot {
  ingredients: DeveloperIngredient[];
  products: DeveloperProduct[];
  sales: DeveloperSale[];
  stockEntries: DeveloperStockEntry[];
  globalSales: DeveloperSale[];
  globalStockEntries: DeveloperStockEntry[];
}

interface LoadedSnapshot {
  state: DeveloperStateSnapshot;
  version: string;
  loadedAt: string;
}

interface ProductAuditRow {
  ingredientId: string;
  ingredientName: string;
  unit: string;
  recipeQuantity: number;
  recipeUnitLabel: string;
  stockDebitQuantity: number;
  currentStock: number;
  unitCost: number;
  lineCost: number;
  isMissing: boolean;
  canMakeByIngredient: number;
}

interface ProductAuditResult {
  rows: ProductAuditRow[];
  totalCost: number;
  canMakeCount: number;
  hasMissingIngredient: boolean;
}

interface SaleAuditResult {
  movementCost: number;
  expectedCurrentCost: number;
  movementEntries: DeveloperStockEntry[];
  deltaStoredVsMovement: number;
  deltaStoredVsCurrentCost: number;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const toStringSafe = (value: unknown): string => (typeof value === 'string' ? value : '');

const toNumberSafe = (value: unknown, fallback = 0): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const normalized = value.trim().replace(',', '.');
    const parsed = Number(normalized);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
};

const roundMoney = (value: number): number => Number(value.toFixed(2));

const roundQuantity = (value: number): number => Number(value.toFixed(6));

const formatBrl = (value: number): string =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

const formatQty = (unit: string, value: number): string => {
  const normalizedUnit = unit.trim().toLowerCase();
  if (!Number.isFinite(value)) return '0';
  if (normalizedUnit.includes('kg') || normalizedUnit === 'l' || normalizedUnit.includes('litro')) {
    return value.toFixed(3);
  }
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(3).replace(/\.?0+$/, '');
};

const normalizeUnit = (value: string): string => value.trim().toLowerCase();

const hasToken = (unit: string, token: string): boolean =>
  new RegExp(`(^|[^a-z])${token}([^a-z]|$)`).test(unit);

const isKgUnit = (unit: string): boolean =>
  hasToken(unit, 'kg') || unit.includes('quilo') || unit.includes('kilogram');

const isMlUnit = (unit: string): boolean =>
  hasToken(unit, 'ml') || unit.includes('mililit');

const isLiterUnit = (unit: string): boolean =>
  !isMlUnit(unit) &&
  (hasToken(unit, 'l') || hasToken(unit, 'lt') || hasToken(unit, 'lts') || unit.includes('litro'));

const getUnitConversionRatio = (unit: string): number | null => {
  const normalized = normalizeUnit(unit);
  if (!normalized) return null;
  if (isKgUnit(normalized) || isLiterUnit(normalized)) return 1000;
  return null;
};

const isLegacyBaseQuantity = (value: number): boolean =>
  Number.isFinite(value) && value > 0 && value < 1;

const recipeQuantityToStockQuantity = (unit: string, recipeQuantity: number): number => {
  if (!Number.isFinite(recipeQuantity) || recipeQuantity <= 0) return 0;
  const ratio = getUnitConversionRatio(unit);
  if (!ratio) return recipeQuantity;
  if (isLegacyBaseQuantity(recipeQuantity)) return recipeQuantity;
  return recipeQuantity / ratio;
};

const getRecipeQuantityUnitLabel = (unit: string, recipeQuantity: number): string => {
  const ratio = getUnitConversionRatio(unit);
  if (!ratio) return unit;
  if (isLegacyBaseQuantity(recipeQuantity)) return unit;
  return isKgUnit(normalizeUnit(unit)) ? 'g' : 'ml';
};

const aggregateRecipe = (recipe: DeveloperRecipeItem[] = []): Record<string, number> => {
  return recipe.reduce<Record<string, number>>((acc, item) => {
    const ingredientId = item?.ingredientId?.trim();
    if (!ingredientId) return acc;
    const quantity = toNumberSafe(item.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) return acc;
    acc[ingredientId] = roundQuantity((acc[ingredientId] || 0) + quantity);
    return acc;
  }, {});
};

const normalizeRecipe = (value: unknown): DeveloperRecipeItem[] => {
  if (!Array.isArray(value)) return [];
  const normalized = value
    .map((item) => {
      if (!isRecord(item)) return null;
      const ingredientId = toStringSafe(item.ingredientId).trim();
      const quantity = toNumberSafe(item.quantity, NaN);
      if (!ingredientId || !Number.isFinite(quantity) || quantity <= 0) return null;
      return { ingredientId, quantity: roundQuantity(quantity) };
    })
    .filter((entry): entry is DeveloperRecipeItem => entry !== null);
  const totals = aggregateRecipe(normalized);
  return Object.entries(totals).map(([ingredientId, quantity]) => ({ ingredientId, quantity }));
};

const normalizeState = (payload: unknown): DeveloperStateSnapshot => {
  if (!isRecord(payload)) {
    return {
      ingredients: [],
      products: [],
      sales: [],
      stockEntries: [],
      globalSales: [],
      globalStockEntries: [],
    };
  }

  const normalizeIngredients = (value: unknown): DeveloperIngredient[] => {
    if (!Array.isArray(value)) return [];
    return value
      .map((item) => {
        if (!isRecord(item)) return null;
        const id = toStringSafe(item.id).trim();
        const name = toStringSafe(item.name).trim();
        const unit = toStringSafe(item.unit).trim();
        if (!id || !name || !unit) return null;
        return {
          id,
          name,
          unit,
          currentStock: toNumberSafe(item.currentStock),
          minStock: toNumberSafe(item.minStock),
          cost: toNumberSafe(item.cost),
        };
      })
      .filter((entry): entry is DeveloperIngredient => entry !== null);
  };

  const normalizeProducts = (value: unknown): DeveloperProduct[] => {
    if (!Array.isArray(value)) return [];
    return value
      .map((item) => {
        if (!isRecord(item)) return null;
        const id = toStringSafe(item.id).trim();
        const name = toStringSafe(item.name).trim();
        if (!id || !name) return null;
        return {
          id,
          name,
          category: toStringSafe(item.category).trim() || 'N/A',
          price: toNumberSafe(item.price),
          recipe: normalizeRecipe(item.recipe),
        };
      })
      .filter((entry): entry is DeveloperProduct => entry !== null);
  };

  const normalizeSales = (value: unknown): DeveloperSale[] => {
    if (!Array.isArray(value)) return [];
    const mapped = value
      .map((item) => {
        if (!isRecord(item)) return null;
        const id = toStringSafe(item.id).trim();
        if (!id) return null;
        return {
          id,
          productId: toStringSafe(item.productId).trim(),
          productName: toStringSafe(item.productName).trim(),
          total: toNumberSafe(item.total),
          totalCost: toNumberSafe(item.totalCost),
          timestamp: toStringSafe(item.timestamp),
          recipe: normalizeRecipe(item.recipe),
          stockDebited: normalizeRecipe(item.stockDebited),
          basePrice: toNumberSafe(item.basePrice, NaN),
          priceAdjustment: toNumberSafe(item.priceAdjustment, NaN),
        };
      })
      .filter((entry) => entry !== null);
    return mapped as DeveloperSale[];
  };

  const normalizeEntries = (value: unknown): DeveloperStockEntry[] => {
    if (!Array.isArray(value)) return [];
    const mapped = value
      .map((item) => {
        if (!isRecord(item)) return null;
        const id = toStringSafe(item.id).trim();
        const ingredientId = toStringSafe(item.ingredientId).trim();
        if (!id || !ingredientId) return null;
        return {
          id,
          ingredientId,
          quantity: toNumberSafe(item.quantity),
          unitCost: toNumberSafe(item.unitCost),
          saleId: toStringSafe(item.saleId).trim() || undefined,
          source: toStringSafe(item.source).trim() || undefined,
          timestamp: toStringSafe(item.timestamp),
        };
      })
      .filter((entry) => entry !== null);
    return mapped as DeveloperStockEntry[];
  };

  return {
    ingredients: normalizeIngredients(payload.ingredients),
    products: normalizeProducts(payload.products),
    sales: normalizeSales(payload.sales),
    stockEntries: normalizeEntries(payload.stockEntries),
    globalSales: normalizeSales(payload.globalSales),
    globalStockEntries: normalizeEntries(payload.globalStockEntries),
  };
};

const resolveApiBaseUrl = (): string => {
  const raw = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim();
  const normalized = raw ? raw.replace(/\/+$/, '') : '';
  return normalized || DEFAULT_API_BASE_URL;
};

const fetchWithTimeout = async (input: RequestInfo | URL, timeoutMs: number): Promise<Response> => {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
  } finally {
    window.clearTimeout(timeoutId);
  }
};

const loadSnapshot = async (): Promise<LoadedSnapshot> => {
  const response = await fetchWithTimeout(`${resolveApiBaseUrl()}/api/v1/state`, REQUEST_TIMEOUT_MS);
  if (!response.ok) {
    throw new Error(`Falha ao carregar estado da API (${response.status}).`);
  }
  const payload = (await response.json()) as unknown;
  return {
    state: normalizeState(payload),
    version: (response.headers.get('x-state-version') || '').trim(),
    loadedAt: new Date().toISOString(),
  };
};

const readRememberAccess = (): boolean => {
  try {
    return window.localStorage.getItem(DEV_REMEMBER_ACCESS_KEY) !== '0';
  } catch {
    return true;
  }
};

const persistRememberAccess = (value: boolean): void => {
  try {
    window.localStorage.setItem(DEV_REMEMBER_ACCESS_KEY, value ? '1' : '0');
  } catch {
    // ignore
  }
};

const hasDevAccess = (): boolean => {
  try {
    return (
      window.sessionStorage.getItem(DEV_ACCESS_SESSION_KEY) === 'authenticated' ||
      window.localStorage.getItem(DEV_ACCESS_LOCAL_KEY) === 'authenticated'
    );
  } catch {
    return false;
  }
};

const readSavedEmail = (): string => {
  try {
    return (window.localStorage.getItem(DEV_SAVED_EMAIL_KEY) || '').trim().toLowerCase();
  } catch {
    return '';
  }
};

const persistSavedEmail = (email: string): void => {
  try {
    if (!email) {
      window.localStorage.removeItem(DEV_SAVED_EMAIL_KEY);
      return;
    }
    window.localStorage.setItem(DEV_SAVED_EMAIL_KEY, email.trim().toLowerCase());
  } catch {
    // ignore
  }
};

const clearStoredAccess = (): void => {
  try {
    window.sessionStorage.removeItem(DEV_ACCESS_SESSION_KEY);
  } catch {
    // ignore
  }
  try {
    window.localStorage.removeItem(DEV_ACCESS_LOCAL_KEY);
  } catch {
    // ignore
  }
};

const buildProductAudit = (
  product: DeveloperProduct,
  ingredientById: Map<string, DeveloperIngredient>,
  units: number
): ProductAuditResult => {
  const totals = aggregateRecipe(product.recipe);
  const rows: ProductAuditRow[] = Object.entries(totals).map(([ingredientId, baseRecipeQty]) => {
    const ingredient = ingredientById.get(ingredientId);
    const recipeQuantity = roundQuantity(baseRecipeQty * units);
    if (!ingredient) {
      return {
        ingredientId,
        ingredientName: `Insumo ausente (${ingredientId})`,
        unit: 'N/A',
        recipeQuantity,
        recipeUnitLabel: 'N/A',
        stockDebitQuantity: 0,
        currentStock: 0,
        unitCost: 0,
        lineCost: 0,
        isMissing: true,
        canMakeByIngredient: 0,
      };
    }

    const stockDebitQuantity = roundQuantity(recipeQuantityToStockQuantity(ingredient.unit, recipeQuantity));
    const lineCost = roundMoney(stockDebitQuantity * ingredient.cost);
    const canMakeByIngredient =
      stockDebitQuantity > 0
        ? Math.floor((ingredient.currentStock + Number.EPSILON) / stockDebitQuantity)
        : Number.POSITIVE_INFINITY;

    return {
      ingredientId,
      ingredientName: ingredient.name,
      unit: ingredient.unit,
      recipeQuantity,
      recipeUnitLabel: getRecipeQuantityUnitLabel(ingredient.unit, recipeQuantity),
      stockDebitQuantity,
      currentStock: ingredient.currentStock,
      unitCost: ingredient.cost,
      lineCost,
      isMissing: false,
      canMakeByIngredient: Number.isFinite(canMakeByIngredient) ? canMakeByIngredient : 0,
    };
  });

  const totalCost = roundMoney(rows.reduce((sum, row) => sum + row.lineCost, 0));
  const hasMissingIngredient = rows.some((row) => row.isMissing);
  const limitingRows = rows.filter((row) => !row.isMissing && row.stockDebitQuantity > 0);
  const canMakeCount =
    limitingRows.length > 0
      ? Math.max(0, Math.min(...limitingRows.map((row) => row.canMakeByIngredient)))
      : 0;

  return { rows, totalCost, canMakeCount, hasMissingIngredient };
};

const buildSaleAudit = (
  sale: DeveloperSale,
  stockEntries: DeveloperStockEntry[],
  ingredientById: Map<string, DeveloperIngredient>,
  fallbackProduct?: DeveloperProduct
): SaleAuditResult => {
  const movementEntries = stockEntries.filter((entry) => entry.saleId === sale.id && entry.quantity < 0);
  const movementCost = roundMoney(
    movementEntries.reduce((sum, entry) => sum + Math.abs(entry.quantity) * entry.unitCost, 0)
  );

  const recipeReference =
    sale.stockDebited && sale.stockDebited.length > 0
      ? sale.stockDebited
      : sale.recipe && sale.recipe.length > 0
        ? sale.recipe
        : fallbackProduct?.recipe || [];

  const expectedCurrentCost = roundMoney(
    Object.entries(aggregateRecipe(recipeReference)).reduce((sum, [ingredientId, recipeQuantity]) => {
      const ingredient = ingredientById.get(ingredientId);
      if (!ingredient) return sum;
      const stockDebitQuantity = recipeQuantityToStockQuantity(ingredient.unit, recipeQuantity);
      return sum + stockDebitQuantity * ingredient.cost;
    }, 0)
  );

  return {
    movementCost,
    expectedCurrentCost,
    movementEntries,
    deltaStoredVsMovement: roundMoney(sale.totalCost - movementCost),
    deltaStoredVsCurrentCost: roundMoney(sale.totalCost - expectedCurrentCost),
  };
};

const DeveloperPortal: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => hasDevAccess());
  const [rememberAccess, setRememberAccess] = useState<boolean>(() => readRememberAccess());
  const [email, setEmail] = useState<string>(() => readSavedEmail());
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');

  const [snapshot, setSnapshot] = useState<LoadedSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState('');

  const [selectedProductId, setSelectedProductId] = useState('');
  const [selectedSaleId, setSelectedSaleId] = useState('');
  const [simulatedUnitsText, setSimulatedUnitsText] = useState('1');
  const [copied, setCopied] = useState(false);

  const loadData = async (): Promise<void> => {
    setIsLoading(true);
    setLoadError('');
    try {
      const nextSnapshot = await loadSnapshot();
      setSnapshot(nextSnapshot);
      if (!selectedProductId && nextSnapshot.state.products.length > 0) {
        setSelectedProductId(nextSnapshot.state.products[0].id);
      }
      const saleSource = nextSnapshot.state.globalSales.length > 0 ? nextSnapshot.state.globalSales : nextSnapshot.state.sales;
      if (!selectedSaleId && saleSource.length > 0) {
        setSelectedSaleId(saleSource[0].id);
      }
    } catch (error) {
      const message =
        error instanceof Error && error.message.trim()
          ? error.message
          : 'Falha ao carregar dados de cálculo.';
      setLoadError(message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!isAuthenticated) return;
    void loadData();
    const intervalId = window.setInterval(() => {
      void loadData();
    }, 20000);
    return () => window.clearInterval(intervalId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  const handleLogin = (event: React.FormEvent) => {
    event.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();
    if (normalizedEmail !== DEV_EMAIL || password !== DEV_PASSWORD) {
      setLoginError('Credenciais inválidas para o painel do desenvolvedor.');
      setPassword('');
      return;
    }

    setLoginError('');
    try {
      window.sessionStorage.setItem(DEV_ACCESS_SESSION_KEY, 'authenticated');
    } catch {
      // ignore
    }
    try {
      if (rememberAccess) {
        window.localStorage.setItem(DEV_ACCESS_LOCAL_KEY, 'authenticated');
      } else {
        window.localStorage.removeItem(DEV_ACCESS_LOCAL_KEY);
      }
    } catch {
      // ignore
    }

    persistRememberAccess(rememberAccess);
    persistSavedEmail(rememberAccess ? normalizedEmail : '');
    setPassword('');
    setIsAuthenticated(true);
  };

  const handleLogout = () => {
    clearStoredAccess();
    setIsAuthenticated(false);
    setPassword('');
  };

  const simulatedUnits = useMemo(() => {
    const parsed = Number(simulatedUnitsText.trim().replace(',', '.'));
    if (!Number.isFinite(parsed) || parsed <= 0) return 1;
    return Math.max(1, Math.floor(parsed));
  }, [simulatedUnitsText]);

  const state = snapshot?.state;

  const ingredientById = useMemo(
    () => new Map((state?.ingredients || []).map((ingredient) => [ingredient.id, ingredient])),
    [state?.ingredients]
  );
  const productById = useMemo(
    () => new Map((state?.products || []).map((product) => [product.id, product])),
    [state?.products]
  );

  const selectedProduct = useMemo(
    () => state?.products.find((product) => product.id === selectedProductId) || null,
    [state?.products, selectedProductId]
  );

  const productAudit = useMemo(() => {
    if (!selectedProduct) return null;
    return buildProductAudit(selectedProduct, ingredientById, simulatedUnits);
  }, [selectedProduct, ingredientById, simulatedUnits]);

  const allSales = useMemo(() => {
    if (!state) return [];
    const source = state.globalSales.length > 0 ? state.globalSales : state.sales;
    return [...source].sort((a, b) => {
      const aTime = Date.parse(a.timestamp || '');
      const bTime = Date.parse(b.timestamp || '');
      return (Number.isFinite(bTime) ? bTime : 0) - (Number.isFinite(aTime) ? aTime : 0);
    });
  }, [state]);

  const allStockEntries = useMemo(() => {
    if (!state) return [];
    return state.globalStockEntries.length > 0 ? state.globalStockEntries : state.stockEntries;
  }, [state]);

  const selectedSale = useMemo(
    () => allSales.find((sale) => sale.id === selectedSaleId) || null,
    [allSales, selectedSaleId]
  );

  const saleAudit = useMemo(() => {
    if (!selectedSale) return null;
    const fallbackProduct = selectedSale.productId ? productById.get(selectedSale.productId) : undefined;
    return buildSaleAudit(selectedSale, allStockEntries, ingredientById, fallbackProduct);
  }, [selectedSale, allStockEntries, ingredientById, productById]);

  const anomalousIngredients = useMemo(() => {
    return (state?.ingredients || []).filter((ingredient) => ingredient.currentStock < 0).length;
  }, [state?.ingredients]);

  const productsWithMissingRecipeIngredient = useMemo(() => {
    if (!state) return 0;
    return state.products.filter((product) =>
      product.recipe.some((item) => !ingredientById.has(item.ingredientId))
    ).length;
  }, [state, ingredientById]);

  const reportText = useMemo(() => {
    if (!state) return 'Sem dados carregados.';
    const lines: string[] = [];
    lines.push(`VERSAO_ESTADO: ${snapshot?.version || 'N/A'}`);
    lines.push(`CARREGADO_EM: ${snapshot?.loadedAt || 'N/A'}`);
    lines.push(`INGREDIENTES: ${state.ingredients.length}`);
    lines.push(`PRODUTOS: ${state.products.length}`);
    lines.push(`VENDAS: ${allSales.length}`);

    if (selectedProduct && productAudit) {
      lines.push('');
      lines.push(`PRODUTO_SELECIONADO: ${selectedProduct.name}`);
      lines.push(`UNIDADES_SIMULADAS: ${simulatedUnits}`);
      lines.push(`CUSTO_TOTAL_SIMULADO: ${formatBrl(productAudit.totalCost)}`);
      lines.push(`DISPONIVEL_PARA_PRODUCAO: ${productAudit.canMakeCount}`);
      productAudit.rows.forEach((row) => {
        lines.push(
          `- ${row.ingredientName}: receita=${formatQty(row.recipeUnitLabel, row.recipeQuantity)} ${row.recipeUnitLabel} | baixa=${formatQty(
            row.unit,
            row.stockDebitQuantity
          )} ${row.unit} | custo=${formatBrl(row.lineCost)}`
        );
      });
    }

    if (selectedSale && saleAudit) {
      lines.push('');
      lines.push(`VENDA_SELECIONADA: ${selectedSale.id} | ${selectedSale.productName}`);
      lines.push(`TOTAL_VENDA: ${formatBrl(selectedSale.total)}`);
      lines.push(`TOTAL_CUSTO_GRAVADO: ${formatBrl(selectedSale.totalCost)}`);
      lines.push(`CUSTO_POR_MOVIMENTACOES: ${formatBrl(saleAudit.movementCost)}`);
      lines.push(`DELTA_GRAVADO_X_MOV: ${formatBrl(saleAudit.deltaStoredVsMovement)}`);
      lines.push(`DELTA_GRAVADO_X_CUSTO_ATUAL: ${formatBrl(saleAudit.deltaStoredVsCurrentCost)}`);
    }

    return lines.join('\n');
  }, [state, snapshot?.version, snapshot?.loadedAt, allSales.length, selectedProduct, productAudit, simulatedUnits, selectedSale, saleAudit]);

  const handleCopyReport = async () => {
    try {
      await navigator.clipboard.writeText(reportText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      setCopied(false);
    }
  };

  if (!isAuthenticated) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-brand-black via-slate-900 to-brand-black text-white flex items-center justify-center p-6">
        <div className="w-full max-w-md rounded-3xl border border-white/10 bg-white/5 backdrop-blur p-8 shadow-2xl">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-11 h-11 rounded-2xl bg-brand-red/20 border border-brand-red/40 flex items-center justify-center">
              <Lock size={20} className="text-brand-red" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-white/60">Acesso Restrito</p>
              <h1 className="font-display text-3xl text-brand-red">Painel Desenvolvedor</h1>
            </div>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-widest text-white/60 mb-2">E-mail</label>
              <input
                type="email"
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  if (loginError) setLoginError('');
                }}
                placeholder="dev@xburgerpdv.com.br"
                autoComplete="username"
                className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 outline-none focus:border-brand-red"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-widest text-white/60 mb-2">Senha</label>
              <input
                type="password"
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value);
                  if (loginError) setLoginError('');
                }}
                autoComplete="current-password"
                className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 outline-none focus:border-brand-red"
                required
              />
            </div>

            <label className="flex items-center gap-2 text-sm text-white/70">
              <input
                type="checkbox"
                className="accent-brand-red"
                checked={rememberAccess}
                onChange={(event) => {
                  const next = event.target.checked;
                  setRememberAccess(next);
                  persistRememberAccess(next);
                  if (!next) persistSavedEmail('');
                }}
              />
              Manter acesso neste navegador
            </label>

            {loginError && <p className="text-sm font-semibold text-red-400">{loginError}</p>}

            <button
              type="submit"
              className="w-full rounded-xl bg-brand-red py-3 font-black uppercase tracking-wide hover:bg-rose-700 transition-colors"
            >
              Entrar
            </button>
            <a
              href="/"
              className="block text-center text-sm text-white/60 hover:text-white transition-colors"
            >
              Voltar ao site
            </a>
          </form>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <header className="sticky top-0 z-30 border-b border-white/10 bg-black/60 backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 py-4 flex flex-wrap items-center gap-3 justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-[0.18em] text-white/60">Área Técnica Reservada</p>
            <h1 className="font-display text-4xl text-brand-red leading-none">Desenvolvedor</h1>
          </div>
          <div className="flex items-center gap-2">
            <a
              href="/"
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-xs font-bold uppercase tracking-wide hover:border-brand-red/60"
            >
              <ArrowLeft size={14} />
              Site
            </a>
            <button
              type="button"
              onClick={() => void loadData()}
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-xs font-bold uppercase tracking-wide hover:border-brand-red/60 disabled:opacity-60"
              disabled={isLoading}
            >
              <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
              Atualizar
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex items-center gap-2 rounded-xl bg-brand-red px-3 py-2 text-xs font-black uppercase tracking-wide hover:bg-rose-700"
            >
              <LogOut size={14} />
              Sair
            </button>
          </div>
        </div>
      </header>

      <section className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {loadError && (
          <div className="rounded-2xl border border-red-500/40 bg-red-950/40 px-4 py-3 text-sm font-semibold text-red-200">
            {loadError}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <p className="text-xs uppercase tracking-widest text-white/60">Ingredientes</p>
            <p className="text-2xl font-black">{state?.ingredients.length || 0}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <p className="text-xs uppercase tracking-widest text-white/60">Produtos</p>
            <p className="text-2xl font-black">{state?.products.length || 0}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <p className="text-xs uppercase tracking-widest text-white/60">Vendas (snapshot)</p>
            <p className="text-2xl font-black">{allSales.length}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <p className="text-xs uppercase tracking-widest text-white/60">Alertas estruturais</p>
            <p className="text-2xl font-black">{productsWithMissingRecipeIngredient + anomalousIngredients}</p>
            <p className="text-[11px] text-white/60 mt-1">
              receita faltando: {productsWithMissingRecipeIngredient} | estoque negativo: {anomalousIngredients}
            </p>
          </div>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/5 p-5 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h2 className="font-display text-3xl text-brand-red">Simulador de Custo por Produto</h2>
            <div className="flex items-center gap-2">
              <label className="text-xs uppercase tracking-widest text-white/60">Unidades da venda</label>
              <input
                type="number"
                min={1}
                step={1}
                value={simulatedUnitsText}
                onChange={(event) => setSimulatedUnitsText(event.target.value)}
                className="w-24 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm font-bold outline-none focus:border-brand-red"
              />
            </div>
          </div>

          <select
            value={selectedProductId}
            onChange={(event) => setSelectedProductId(event.target.value)}
            className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm font-semibold outline-none focus:border-brand-red"
          >
            <option value="">Selecione um produto para auditar</option>
            {(state?.products || []).map((product) => (
              <option key={product.id} value={product.id}>
                {product.name} ({product.category}) - {formatBrl(product.price)}
              </option>
            ))}
          </select>

          {selectedProduct && productAudit && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                  <p className="text-xs uppercase tracking-widest text-white/60">Custo total calculado</p>
                  <p className="text-xl font-black">{formatBrl(productAudit.totalCost)}</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                  <p className="text-xs uppercase tracking-widest text-white/60">Preço de venda</p>
                  <p className="text-xl font-black">{formatBrl(selectedProduct.price * simulatedUnits)}</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                  <p className="text-xs uppercase tracking-widest text-white/60">Limite por estoque</p>
                  <p className="text-xl font-black">{productAudit.canMakeCount}</p>
                </div>
              </div>

              <div className="overflow-x-auto rounded-2xl border border-white/10">
                <table className="w-full min-w-[940px] text-sm">
                  <thead className="bg-black/40 text-white/70 uppercase tracking-widest text-[11px]">
                    <tr>
                      <th className="text-left px-4 py-3">Ingrediente</th>
                      <th className="text-left px-4 py-3">Receita</th>
                      <th className="text-left px-4 py-3">Baixa no estoque</th>
                      <th className="text-left px-4 py-3">Estoque atual</th>
                      <th className="text-left px-4 py-3">Custo unitário</th>
                      <th className="text-left px-4 py-3">Custo linha</th>
                    </tr>
                  </thead>
                  <tbody>
                    {productAudit.rows.map((row) => (
                      <tr key={row.ingredientId} className="border-t border-white/10">
                        <td className="px-4 py-3 font-semibold">
                          {row.ingredientName}
                          {row.isMissing && (
                            <span className="ml-2 inline-flex items-center gap-1 text-xs text-amber-300">
                              <AlertTriangle size={12} />
                              ausente
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {formatQty(row.recipeUnitLabel, row.recipeQuantity)} {row.recipeUnitLabel}
                        </td>
                        <td className="px-4 py-3">
                          {formatQty(row.unit, row.stockDebitQuantity)} {row.unit}
                        </td>
                        <td className="px-4 py-3">
                          {formatQty(row.unit, row.currentStock)} {row.unit}
                        </td>
                        <td className="px-4 py-3">{formatBrl(row.unitCost)} / {row.unit}</td>
                        <td className="px-4 py-3 font-black">{formatBrl(row.lineCost)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="text-xs text-white/60">
                {productAudit.hasMissingIngredient ? (
                  <span className="inline-flex items-center gap-1 text-amber-300">
                    <AlertTriangle size={12} />
                    Produto com ingrediente ausente no cadastro de estoque.
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-emerald-300">
                    <CheckCircle2 size={12} />
                    Composição íntegra: todos os ingredientes encontrados para cálculo.
                  </span>
                )}
              </div>
            </>
          )}
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/5 p-5 space-y-4">
          <h2 className="font-display text-3xl text-brand-red">Auditoria de Venda Registrada</h2>
          <select
            value={selectedSaleId}
            onChange={(event) => setSelectedSaleId(event.target.value)}
            className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm font-semibold outline-none focus:border-brand-red"
          >
            <option value="">Selecione uma venda</option>
            {allSales.map((sale) => (
              <option key={sale.id} value={sale.id}>
                {sale.productName || sale.productId || sale.id} | {formatBrl(sale.total)} | {sale.id}
              </option>
            ))}
          </select>

          {selectedSale && saleAudit && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                  <p className="text-xs uppercase tracking-widest text-white/60">Custo salvo na venda</p>
                  <p className="text-lg font-black">{formatBrl(selectedSale.totalCost)}</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                  <p className="text-xs uppercase tracking-widest text-white/60">Custo por movimentos</p>
                  <p className="text-lg font-black">{formatBrl(saleAudit.movementCost)}</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                  <p className="text-xs uppercase tracking-widest text-white/60">Delta salvo x movimentos</p>
                  <p className="text-lg font-black">{formatBrl(saleAudit.deltaStoredVsMovement)}</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                  <p className="text-xs uppercase tracking-widest text-white/60">Delta salvo x custo atual</p>
                  <p className="text-lg font-black">{formatBrl(saleAudit.deltaStoredVsCurrentCost)}</p>
                </div>
              </div>
              <p className="text-xs text-white/60">
                Delta ≈ 0 em "salvo x movimentos" indica consistência histórica da venda.
              </p>
            </>
          )}
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/5 p-5 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-display text-3xl text-brand-red">Relatório Rápido para Suporte</h2>
            <button
              type="button"
              onClick={handleCopyReport}
              className="inline-flex items-center gap-2 rounded-xl bg-brand-red px-4 py-2 text-xs font-black uppercase tracking-wide hover:bg-rose-700"
            >
              <Copy size={14} />
              {copied ? 'Copiado' : 'Copiar relatório'}
            </button>
          </div>
          <textarea
            readOnly
            value={reportText}
            className="w-full min-h-[220px] rounded-2xl border border-white/10 bg-black/30 p-4 text-xs font-mono leading-5 text-slate-200 outline-none"
          />
        </div>
      </section>
    </main>
  );
};

export default DeveloperPortal;
