import {
  CleaningMaterial,
  CleaningStockEntry,
  DailySalesHistoryEntry,
  Ingredient,
  Product,
  Sale,
  SaleDraft,
  StockEntry,
} from '../types';
import { clearStore } from './localDb';
import { readAdminAuthToken } from './adminAuthToken';

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
  saleDrafts: SaleDraft[];
  cashRegisterAmount: number;
  dailySalesHistory: DailySalesHistoryEntry[];
}

interface LocalMirrorSnapshot {
  state: AppState;
  savedAtMs: number;
}

export interface LoadAppStateOptions {
  preferLocalMirrorWhenNewer?: boolean;
}

const API_TIMEOUT_MS = 12000;
const DEFAULT_API_BASE_URL = 'https://xburger-saas-backend.onrender.com';
let hasRemoteHydratedState = false;
let remoteStateVersion: string | null = null;
let remoteStateToken: string | null = null;
let remoteSaveQueue: Promise<void> = Promise.resolve();
let isDefaultFallbackBootstrap = false;
let activeAuthSubject: string | null = null;
let authScopeHint: string | null = null;

const STORAGE_KEYS = {
  ingredients: 'xburger_ingredients',
  products: 'xburger_products',
  sales: 'xburger_session_sales',
  stockEntries: 'xburger_session_stock',
  cleaningMaterials: 'xburger_cleaning_materials',
  cleaningStockEntries: 'xburger_cleaning_stock',
  globalSales: 'xburger_global_sales',
  globalCancelledSales: 'xburger_global_cancelled',
  globalStockEntries: 'xburger_global_stock_entries',
  globalCleaningStockEntries: 'xburger_global_cleaning_stock_entries',
  saleDrafts: 'xburger_sale_drafts',
  remoteStateMirror: 'xburger_remote_state_mirror_v1',
  metaVersion: 'xburger_meta_version',
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
  saleDrafts: [],
  cashRegisterAmount: 0,
  dailySalesHistory: [],
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
  STORAGE_KEYS.saleDrafts,
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

const getAuthorizationHeader = (): string | null => {
  const token = readAdminAuthToken();
  if (!token) return null;
  return `Bearer ${token}`;
};

const decodeBase64Url = (value: string): string | null => {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padLength = (4 - (normalized.length % 4)) % 4;
  const padded = `${normalized}${'='.repeat(padLength)}`;
  try {
    if (typeof atob === 'function') {
      return atob(padded);
    }
    return null;
  } catch {
    return null;
  }
};

const readTokenSubject = (token: string | null): string | null => {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length < 2) return null;

  const payloadRaw = decodeBase64Url(parts[1]);
  if (!payloadRaw) return null;

  try {
    const payload = JSON.parse(payloadRaw) as { sub?: unknown };
    return typeof payload.sub === 'string' && payload.sub.trim() ? payload.sub.trim() : null;
  } catch {
    return null;
  }
};

const ensureAuthScope = (): string | null => {
  const currentToken = readAdminAuthToken();
  const tokenSubject = readTokenSubject(currentToken);
  const currentSubject = tokenSubject || authScopeHint;
  if (tokenSubject && authScopeHint) {
    authScopeHint = null;
  }
  if (activeAuthSubject !== currentSubject) {
    activeAuthSubject = currentSubject;
    hasRemoteHydratedState = false;
    remoteStateVersion = null;
    remoteStateToken = null;
    remoteSaveQueue = Promise.resolve();
    isDefaultFallbackBootstrap = false;
  }
  return activeAuthSubject;
};

export const setAuthScopeHint = (subject: string | null): void => {
  const normalized = typeof subject === 'string' ? subject.trim() : '';
  authScopeHint = normalized || null;
};

const getScopedStorageKey = (baseKey: string): string => {
  const scope = ensureAuthScope();
  if (!scope) return baseKey;
  return `${baseKey}:${scope}`;
};

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    globalThis.setTimeout(resolve, ms);
  });

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
      cache: init.cache ?? 'no-store',
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

const normalizeStockEntryMetadata = (entry: StockEntry): StockEntry => {
  if (entry.source) return entry;
  if (typeof entry.saleId === 'string' && entry.saleId.trim()) {
    return { ...entry, source: 'SALE' };
  }
  if (typeof entry.id === 'string' && entry.id.startsWith('st-sale-')) {
    return { ...entry, source: 'SALE' };
  }
  return entry;
};

const normalizeStockEntryList = (items: StockEntry[]): StockEntry[] =>
  items.map(normalizeStockEntryMetadata);

const reviveDailySalesHistory = (items: DailySalesHistoryEntry[]): DailySalesHistoryEntry[] =>
  items.map((item) => {
    if (item.closedAt && !(item.closedAt instanceof Date)) {
      return {
        ...item,
        closedAt: new Date(item.closedAt as string),
      };
    }
    return item;
  });

const toNonNegativeNumber = (value: unknown, fallback = 0): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return parsed;
};

const normalizeStateRecord = (
  source: Record<string, unknown>,
  defaults: AppState
): AppState => ({
  ingredients: toArray<Ingredient>(source.ingredients, defaults.ingredients),
  products: toArray<Product>(source.products, defaults.products),
  sales: reviveListWithDates(toArray<Sale>(source.sales, defaults.sales)),
  stockEntries: normalizeStockEntryList(
    reviveListWithDates(toArray<StockEntry>(source.stockEntries, defaults.stockEntries))
  ),
  cleaningMaterials: toArray<CleaningMaterial>(source.cleaningMaterials, defaults.cleaningMaterials),
  cleaningStockEntries: reviveListWithDates(
    toArray<CleaningStockEntry>(source.cleaningStockEntries, defaults.cleaningStockEntries)
  ),
  globalSales: reviveListWithDates(toArray<Sale>(source.globalSales, defaults.globalSales)),
  globalCancelledSales: reviveListWithDates(
    toArray<Sale>(source.globalCancelledSales, defaults.globalCancelledSales)
  ),
  globalStockEntries: normalizeStockEntryList(
    reviveListWithDates(toArray<StockEntry>(source.globalStockEntries, defaults.globalStockEntries))
  ),
  globalCleaningStockEntries: reviveListWithDates(
    toArray<CleaningStockEntry>(
      source.globalCleaningStockEntries,
      defaults.globalCleaningStockEntries
    )
  ),
  saleDrafts: toArray<SaleDraft>(source.saleDrafts, defaults.saleDrafts),
  cashRegisterAmount: toNonNegativeNumber(source.cashRegisterAmount, defaults.cashRegisterAmount),
  dailySalesHistory: reviveDailySalesHistory(
    toArray<DailySalesHistoryEntry>(source.dailySalesHistory, defaults.dailySalesHistory)
  ),
});

const normalizeVersionHeader = (value: string | null): string | null => {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const unquoted = trimmed.replace(/^W\//i, '').replace(/^"(.+)"$/, '$1');
  return unquoted || null;
};

const syncStateMetaFromResponse = (response: Response): void => {
  const version =
    normalizeVersionHeader(response.headers.get('x-state-version')) ??
    normalizeVersionHeader(response.headers.get('etag'));

  if (version) {
    remoteStateVersion = version;
  }

  const token = response.headers.get('x-state-token')?.trim();
  if (token) {
    remoteStateToken = token;
  }
};

export const readCachedRemoteStateVersion = (): string | null => {
  ensureAuthScope();
  return remoteStateVersion;
};

export const getRemoteStateVersion = async (): Promise<string | null> => {
  ensureAuthScope();
  const apiUrl = getStateApiUrl();
  if (!apiUrl) return null;
  const authorization = getAuthorizationHeader();
  if (!authorization) return null;

  try {
    const headResponse = await fetchWithTimeout(apiUrl, {
      method: 'HEAD',
      headers: {
        Authorization: authorization,
      },
    });

    if (headResponse.ok) {
      syncStateMetaFromResponse(headResponse);
      return remoteStateVersion;
    }

    if (headResponse.status !== 404 && headResponse.status !== 405) {
      return null;
    }

    const getResponse = await fetchWithTimeout(apiUrl, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: authorization,
      },
    });

    if (!getResponse.ok) return null;
    syncStateMetaFromResponse(getResponse);
    return remoteStateVersion;
  } catch {
    return null;
  }
};

const tryLoadRemoteState = async (defaults: AppState): Promise<AppState | null> => {
  const apiUrl = getStateApiUrl();
  if (!apiUrl) return null;
  const authorization = getAuthorizationHeader();
  if (!authorization) return null;

  try {
    const response = await fetchWithTimeout(apiUrl, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: authorization,
      },
    });
    if (!response.ok) return null;
    syncStateMetaFromResponse(response);

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

const tryLoadRemoteStateWithRetry = async (
  defaults: AppState,
  attempts = 3,
  retryDelayMs = 600
): Promise<AppState | null> => {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const loaded = await tryLoadRemoteState(defaults);
    if (loaded) {
      return loaded;
    }

    if (attempt < attempts - 1) {
      await delay(retryDelayMs);
    }
  }

  return null;
};

const trySaveRemoteState = async (state: AppState): Promise<boolean> => {
  const apiUrl = getStateApiUrl();
  if (!apiUrl) return false;
  if (!remoteStateVersion || !remoteStateToken) return false;
  const authorization = getAuthorizationHeader();
  if (!authorization) return false;

  try {
    const response = await fetchWithTimeout(apiUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'If-Match': `"${remoteStateVersion}"`,
        'X-State-Token': remoteStateToken,
        Authorization: authorization,
      },
      body: JSON.stringify(state),
    });
    if (response.ok) {
      syncStateMetaFromResponse(response);
      return true;
    }

    if (response.status === 401 || response.status === 412 || response.status === 428) {
      remoteStateToken = null;
      remoteStateVersion = null;
    }
    return false;
  } catch {
    return false;
  }
};

const tryClearRemoteState = async (): Promise<boolean> => {
  const apiUrl = getStateApiUrl();
  if (!apiUrl) return false;
  if (!remoteStateVersion || !remoteStateToken) return false;
  const authorization = getAuthorizationHeader();
  if (!authorization) return false;

  try {
    const response = await fetchWithTimeout(apiUrl, {
      method: 'DELETE',
      headers: {
        'If-Match': `"${remoteStateVersion}"`,
        'X-State-Token': remoteStateToken,
        Authorization: authorization,
      },
    });
    if (response.ok) {
      syncStateMetaFromResponse(response);
      return true;
    }

    if (response.status === 401 || response.status === 412 || response.status === 428) {
      remoteStateToken = null;
      remoteStateVersion = null;
    }
    return false;
  } catch {
    return false;
  }
};

const ensureRemoteWriteContext = async (): Promise<boolean> => {
  if (isDefaultFallbackBootstrap && !hasRemoteHydratedState) {
    return false;
  }

  if (remoteStateVersion && remoteStateToken) {
    return true;
  }

  const refreshed = await tryLoadRemoteStateWithRetry(DEFAULT_APP_STATE, 2, 400);
  if (!refreshed) {
    return false;
  }

  hasRemoteHydratedState = true;
  isDefaultFallbackBootstrap = false;
  saveLocalMirrorState(refreshed);
  return Boolean(remoteStateVersion && remoteStateToken);
};

const persistRemoteStateWithRetry = async (state: AppState): Promise<boolean> => {
  const remoteSaved = await trySaveRemoteState(state);
  if (remoteSaved) return true;

  const refreshed = await tryLoadRemoteStateWithRetry(DEFAULT_APP_STATE, 2, 400);
  if (!refreshed) {
    return false;
  }

  return trySaveRemoteState(state);
};

const loadLocalMirrorState = (defaults: AppState): LocalMirrorSnapshot | null => {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(getScopedStorageKey(STORAGE_KEYS.remoteStateMirror));
    if (!raw) return null;

    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;

    const mirrorRecord = parsed as Record<string, unknown>;
    const hasWrappedState = Object.prototype.hasOwnProperty.call(mirrorRecord, 'state');
    const source = hasWrappedState ? mirrorRecord.state : mirrorRecord;
    if (!source || typeof source !== 'object' || Array.isArray(source)) {
      return null;
    }

    const normalized = normalizeStateRecord(source as Record<string, unknown>, defaults);
    const savedAtRaw = mirrorRecord.savedAt;
    const savedAtMs =
      typeof savedAtRaw === 'string' ? Date.parse(savedAtRaw) : Number.NaN;

    return {
      state: sanitizeLegacySeeds(normalized),
      savedAtMs: Number.isFinite(savedAtMs) ? savedAtMs : 0,
    };
  } catch {
    return null;
  }
};

const saveLocalMirrorState = (state: AppState): void => {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(
      getScopedStorageKey(STORAGE_KEYS.remoteStateMirror),
      JSON.stringify({
        savedAt: new Date().toISOString(),
        state,
      })
    );
  } catch {
    // ignore storage write failures
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
  localStorage.removeItem(STORAGE_KEYS.remoteStateMirror);
  localStorage.removeItem(getScopedStorageKey(STORAGE_KEYS.remoteStateMirror));
  localStorage.removeItem(STORAGE_KEYS.metaVersion);
};

export const loadAppState = async (
  defaults: AppState = DEFAULT_APP_STATE,
  options: LoadAppStateOptions = {}
): Promise<AppState> => {
  ensureAuthScope();
  const preferLocalMirrorWhenNewer = options.preferLocalMirrorWhenNewer !== false;
  const remoteState = await tryLoadRemoteStateWithRetry(defaults);
  const localMirror = loadLocalMirrorState(defaults);

  if (remoteState && localMirror && preferLocalMirrorWhenNewer) {
    const remoteVersionMs = remoteStateVersion ? Date.parse(remoteStateVersion) : Number.NaN;
    const shouldPreferLocal =
      Number.isFinite(localMirror.savedAtMs) &&
      Number.isFinite(remoteVersionMs) &&
      localMirror.savedAtMs > remoteVersionMs;

    if (shouldPreferLocal) {
      hasRemoteHydratedState = true;
      isDefaultFallbackBootstrap = false;
      saveLocalMirrorState(localMirror.state);
      return localMirror.state;
    }
  }

  if (remoteState) {
    hasRemoteHydratedState = true;
    isDefaultFallbackBootstrap = false;
    saveLocalMirrorState(remoteState);
    return remoteState;
  }

  if (localMirror) {
    hasRemoteHydratedState = false;
    isDefaultFallbackBootstrap = false;
    remoteStateVersion = null;
    remoteStateToken = null;
    console.warn('[appStorage] Backend indisponível. Carregando espelho local seguro.');
    return localMirror.state;
  }

  // Sem backend e sem espelho local: usa memória local até reidratação remota.
  hasRemoteHydratedState = false;
  isDefaultFallbackBootstrap = true;
  remoteStateVersion = null;
  remoteStateToken = null;
  console.warn('[appStorage] Falha ao carregar estado remoto. Mantendo estado em memória.');
  return sanitizeLegacySeeds(defaults);
};

export const saveAppState = async (state: AppState): Promise<void> => {
  ensureAuthScope();
  saveLocalMirrorState(state);

  if (isDefaultFallbackBootstrap && !hasRemoteHydratedState) {
    console.warn('[appStorage] Persistência remota bloqueada até primeira carga confiável do backend.');
    return;
  }

  remoteSaveQueue = remoteSaveQueue
    .catch(() => undefined)
    .then(async () => {
      const remoteReady = await ensureRemoteWriteContext();
      if (!remoteReady) {
        console.warn('[appStorage] Persistência remota indisponível no momento.');
        return;
      }

      const saved = await persistRemoteStateWithRetry(state);
      if (!saved) {
        console.warn(
          '[appStorage] Falha ao persistir no backend remoto. Tentará novamente na próxima alteração.'
        );
      }
    });

  await remoteSaveQueue;
};

export const clearAppState = async (): Promise<void> => {
  ensureAuthScope();
  if (!remoteStateVersion || !remoteStateToken) {
    await tryLoadRemoteState(DEFAULT_APP_STATE);
  }

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
