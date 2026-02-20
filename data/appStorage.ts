import {
  CleaningMaterial,
  CleaningStockEntry,
  Ingredient,
  Product,
  Sale,
  StockEntry,
} from '../types';
import { clearStore } from './localDb';

export interface AppState {
  ingredients: Ingredient[];
  products: Product[];
  sales: Sale[];
  stockEntries: StockEntry[];
  cleaningMaterials: CleaningMaterial[];
  cleaningStockEntries: CleaningStockEntry[];
  globalSales: Sale[];
  globalCancelledSales: Sale[];
  globalStockEntries: StockEntry[];
  globalCleaningStockEntries: CleaningStockEntry[];
}

const API_TIMEOUT_MS = 4000;
const DEFAULT_API_BASE_URL = 'https://xburger-backend.onrender.com';
let hasRemoteHydratedState = false;

const STORAGE_KEYS = {
  ingredients: 'qb_ingredients',
  products: 'qb_products',
  sales: 'qb_session_sales',
  stockEntries: 'qb_session_stock',
  cleaningMaterials: 'qb_cleaning_materials',
  cleaningStockEntries: 'qb_cleaning_stock',
  globalSales: 'qb_global_sales',
  globalCancelledSales: 'qb_global_cancelled',
  globalStockEntries: 'qb_global_stock_entries',
  globalCleaningStockEntries: 'qb_global_cleaning_stock_entries',
  metaVersion: 'qb_meta_version',
};

const LEGACY_INGREDIENT_IDS = new Set([
  'i1',
  'i2',
  'i3',
  'i4',
  'i5',
  'i6',
  'i7',
  'i8',
  'i9',
  'i10',
  'i11',
]);

const LEGACY_PRODUCT_IDS = new Set(['p1', 'p2', 'p3', 'p4', 'p5', 'p6']);

export const DEFAULT_APP_STATE: AppState = {
  ingredients: [],
  products: [],
  sales: [],
  stockEntries: [],
  cleaningMaterials: [],
  cleaningStockEntries: [],
  globalSales: [],
  globalCancelledSales: [],
  globalStockEntries: [],
  globalCleaningStockEntries: [],
};

const DATA_KEYS = [
  STORAGE_KEYS.ingredients,
  STORAGE_KEYS.products,
  STORAGE_KEYS.sales,
  STORAGE_KEYS.stockEntries,
  STORAGE_KEYS.cleaningMaterials,
  STORAGE_KEYS.cleaningStockEntries,
  STORAGE_KEYS.globalSales,
  STORAGE_KEYS.globalCancelledSales,
  STORAGE_KEYS.globalStockEntries,
  STORAGE_KEYS.globalCleaningStockEntries,
];

const getApiBaseUrl = (): string | null => {
  const raw = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env
    ?.VITE_API_BASE_URL;
  const normalized = raw?.trim().replace(/\/+$/, '');
  if (normalized) return normalized;
  return DEFAULT_API_BASE_URL;
};

const getStateApiUrl = (): string | null => {
  const baseUrl = getApiBaseUrl();
  return baseUrl ? `${baseUrl}/api/v1/state` : null;
};

const fetchWithTimeout = async (
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs = API_TIMEOUT_MS
): Promise<Response> => {
  const controller = new AbortController();
  const timer = globalThis.setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    globalThis.clearTimeout(timer);
  }
};

const toArray = <T>(value: unknown, fallback: T[]): T[] => {
  if (Array.isArray(value)) return value as T[];
  return [...fallback];
};

const reviveTimestamp = <T extends { timestamp?: unknown }>(item: T): T => {
  const timestamp = item?.timestamp as unknown;
  if (timestamp && !(timestamp instanceof Date)) {
    return { ...item, timestamp: new Date(timestamp as string) };
  }
  return item;
};

const reviveListWithDates = <T extends { timestamp?: unknown }>(items: T[]): T[] =>
  items.map(reviveTimestamp);

const normalizeStateRecord = (
  source: Record<string, unknown>,
  defaults: AppState
): AppState => ({
  ingredients: toArray<Ingredient>(source.ingredients, defaults.ingredients),
  products: toArray<Product>(source.products, defaults.products),
  sales: reviveListWithDates(toArray<Sale>(source.sales, defaults.sales)),
  stockEntries: reviveListWithDates(toArray<StockEntry>(source.stockEntries, defaults.stockEntries)),
  cleaningMaterials: toArray<CleaningMaterial>(source.cleaningMaterials, defaults.cleaningMaterials),
  cleaningStockEntries: reviveListWithDates(
    toArray<CleaningStockEntry>(source.cleaningStockEntries, defaults.cleaningStockEntries)
  ),
  globalSales: reviveListWithDates(toArray<Sale>(source.globalSales, defaults.globalSales)),
  globalCancelledSales: reviveListWithDates(
    toArray<Sale>(source.globalCancelledSales, defaults.globalCancelledSales)
  ),
  globalStockEntries: reviveListWithDates(
    toArray<StockEntry>(source.globalStockEntries, defaults.globalStockEntries)
  ),
  globalCleaningStockEntries: reviveListWithDates(
    toArray<CleaningStockEntry>(
      source.globalCleaningStockEntries,
      defaults.globalCleaningStockEntries
    )
  ),
});

const tryLoadRemoteState = async (defaults: AppState): Promise<AppState | null> => {
  const apiUrl = getStateApiUrl();
  if (!apiUrl) return null;

  try {
    const response = await fetchWithTimeout(apiUrl, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    });
    if (!response.ok) return null;

    const payload = (await response.json()) as unknown;
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return null;
    }

    const normalized = normalizeStateRecord(payload as Record<string, unknown>, defaults);
    return sanitizeLegacySeeds(normalized);
  } catch {
    return null;
  }
};

const trySaveRemoteState = async (state: AppState): Promise<boolean> => {
  const apiUrl = getStateApiUrl();
  if (!apiUrl) return false;

  try {
    const response = await fetchWithTimeout(apiUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(state),
    });
    return response.ok;
  } catch {
    return false;
  }
};

const tryClearRemoteState = async (): Promise<boolean> => {
  const apiUrl = getStateApiUrl();
  if (!apiUrl) return false;

  try {
    const response = await fetchWithTimeout(apiUrl, {
      method: 'DELETE',
    });
    return response.ok;
  } catch {
    return false;
  }
};

const sanitizeLegacySeeds = (state: AppState): AppState => {
  const products = state.products.filter((product) => !LEGACY_PRODUCT_IDS.has(product.id));
  const usedIngredientIds = new Set(
    products.flatMap((product) => product.recipe.map((item) => item.ingredientId))
  );

  const ingredients = state.ingredients.filter(
    (ing) => !LEGACY_INGREDIENT_IDS.has(ing.id) || usedIngredientIds.has(ing.id)
  );

  return {
    ...state,
    ingredients,
    products,
  };
};

const clearLegacyStorage = () => {
  if (typeof localStorage === 'undefined') return;
  DATA_KEYS.forEach((key) => localStorage.removeItem(key));
  localStorage.removeItem(STORAGE_KEYS.metaVersion);
};

export const loadAppState = async (defaults: AppState = DEFAULT_APP_STATE): Promise<AppState> => {
  const remoteState = await tryLoadRemoteState(defaults);
  if (remoteState) {
    hasRemoteHydratedState = true;
    return remoteState;
  }

  // Sem fallback local: Render é a fonte única de verdade.
  hasRemoteHydratedState = false;
  console.warn('[appStorage] Falha ao carregar estado remoto. Mantendo estado em memória.');
  return sanitizeLegacySeeds(defaults);
};

export const saveAppState = async (state: AppState): Promise<void> => {
  if (!hasRemoteHydratedState) {
    console.warn('[appStorage] Persistência remota ignorada até carga inicial do backend.');
    return;
  }

  const remoteSaved = await trySaveRemoteState(state);
  if (!remoteSaved) {
    console.warn('[appStorage] Falha ao persistir no backend remoto.');
  }
};

export const clearAppState = async (): Promise<void> => {
  const remoteCleared = await tryClearRemoteState();
  if (!remoteCleared) {
    console.warn('[appStorage] Falha ao limpar estado no backend remoto.');
  }

  try {
    await clearStore();
  } catch {
    // ignore db cleanup failures
  }
  clearLegacyStorage();
};
