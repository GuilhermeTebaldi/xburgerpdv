import {
  CleaningMaterial,
  CleaningStockEntry,
  Ingredient,
  Product,
  Sale,
  StockEntry,
} from '../types';
import { clearStore, getItem, getMany, setItem, setMany } from './localDb';

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

const STORAGE_VERSION = 2;

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

const hasValue = (value: unknown) => value !== undefined && value !== null;

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

const serializeState = (state: AppState): Record<string, unknown> => ({
  [STORAGE_KEYS.ingredients]: state.ingredients,
  [STORAGE_KEYS.products]: state.products,
  [STORAGE_KEYS.sales]: state.sales,
  [STORAGE_KEYS.stockEntries]: state.stockEntries,
  [STORAGE_KEYS.cleaningMaterials]: state.cleaningMaterials,
  [STORAGE_KEYS.cleaningStockEntries]: state.cleaningStockEntries,
  [STORAGE_KEYS.globalSales]: state.globalSales,
  [STORAGE_KEYS.globalCancelledSales]: state.globalCancelledSales,
  [STORAGE_KEYS.globalStockEntries]: state.globalStockEntries,
  [STORAGE_KEYS.globalCleaningStockEntries]: state.globalCleaningStockEntries,
});

const readLegacyStorage = (): Record<string, unknown> => {
  if (typeof localStorage === 'undefined') return {};
  const legacy: Record<string, unknown> = {};
  DATA_KEYS.forEach((key) => {
    const raw = localStorage.getItem(key);
    if (!raw) return;
    try {
      legacy[key] = JSON.parse(raw);
    } catch {
      // ignore malformed legacy data
    }
  });
  return legacy;
};

const clearLegacyStorage = () => {
  if (typeof localStorage === 'undefined') return;
  DATA_KEYS.forEach((key) => localStorage.removeItem(key));
  localStorage.removeItem(STORAGE_KEYS.metaVersion);
};

const safeGetVersion = async (): Promise<number> => {
  try {
    const version = await getItem<number>(STORAGE_KEYS.metaVersion);
    return typeof version === 'number' ? version : 0;
  } catch {
    return 0;
  }
};

export const loadAppState = async (defaults: AppState = DEFAULT_APP_STATE): Promise<AppState> => {
  let stored: Record<string, unknown> = {};
  let usedLegacy = false;
  let migratedToDb = false;

  try {
    stored = await getMany(DATA_KEYS);
  } catch {
    stored = {};
  }

  const hasDbData = DATA_KEYS.some((key) => hasValue(stored[key]));
  if (!hasDbData) {
    const legacy = readLegacyStorage();
    const hasLegacy = DATA_KEYS.some((key) => hasValue(legacy[key]));
    if (hasLegacy) {
      stored = legacy;
      usedLegacy = true;
      try {
        await setMany(legacy);
        migratedToDb = true;
      } catch {
        // ignore db migration failures
      }
    }
  }

  const loadedState: AppState = {
    ingredients: toArray<Ingredient>(stored[STORAGE_KEYS.ingredients], defaults.ingredients),
    products: toArray<Product>(stored[STORAGE_KEYS.products], defaults.products),
    sales: reviveListWithDates(toArray<Sale>(stored[STORAGE_KEYS.sales], defaults.sales)),
    stockEntries: reviveListWithDates(
      toArray<StockEntry>(stored[STORAGE_KEYS.stockEntries], defaults.stockEntries)
    ),
    cleaningMaterials: toArray<CleaningMaterial>(
      stored[STORAGE_KEYS.cleaningMaterials],
      defaults.cleaningMaterials
    ),
    cleaningStockEntries: reviveListWithDates(
      toArray<CleaningStockEntry>(
        stored[STORAGE_KEYS.cleaningStockEntries],
        defaults.cleaningStockEntries
      )
    ),
    globalSales: reviveListWithDates(
      toArray<Sale>(stored[STORAGE_KEYS.globalSales], defaults.globalSales)
    ),
    globalCancelledSales: reviveListWithDates(
      toArray<Sale>(stored[STORAGE_KEYS.globalCancelledSales], defaults.globalCancelledSales)
    ),
    globalStockEntries: reviveListWithDates(
      toArray<StockEntry>(stored[STORAGE_KEYS.globalStockEntries], defaults.globalStockEntries)
    ),
    globalCleaningStockEntries: reviveListWithDates(
      toArray<CleaningStockEntry>(
        stored[STORAGE_KEYS.globalCleaningStockEntries],
        defaults.globalCleaningStockEntries
      )
    ),
  };

  const sanitized = sanitizeLegacySeeds(loadedState);
  const didSanitize =
    sanitized.ingredients.length !== loadedState.ingredients.length ||
    sanitized.products.length !== loadedState.products.length;

  const version = await safeGetVersion();
  const shouldPersist = usedLegacy || didSanitize || version < STORAGE_VERSION;

  if (shouldPersist) {
    try {
      await setMany(serializeState(sanitized));
      await setItem(STORAGE_KEYS.metaVersion, STORAGE_VERSION);
      migratedToDb = true;
    } catch {
      // ignore persistence failures
    }
  }

  if (usedLegacy && migratedToDb) {
    clearLegacyStorage();
  }

  return sanitized;
};

export const saveAppState = async (state: AppState): Promise<void> => {
  const payload = serializeState(state);
  try {
    await setMany(payload);
    await setItem(STORAGE_KEYS.metaVersion, STORAGE_VERSION);
  } catch {
    if (typeof localStorage === 'undefined') return;
    Object.entries(payload).forEach(([key, value]) => {
      localStorage.setItem(key, JSON.stringify(value));
    });
    localStorage.setItem(STORAGE_KEYS.metaVersion, String(STORAGE_VERSION));
  }
};

export const clearAppState = async (): Promise<void> => {
  try {
    await clearStore();
  } catch {
    // ignore db cleanup failures
  }
  clearLegacyStorage();
};
