import type {
  CleaningMaterial,
  Ingredient,
  Product,
  RecipeItem,
} from '../types';
import { DEFAULT_APP_STATE, type AppState } from './appStorage';

const API_TIMEOUT_MS = 12000;
const DEFAULT_API_BASE_URL = 'https://xburger-backend.onrender.com';

type BaseCommand = {
  commandId?: string;
};

interface StateCommandSyncErrorOptions {
  statusCode?: number;
  retryable?: boolean;
  cause?: unknown;
}

export class StateCommandSyncError extends Error {
  readonly statusCode?: number;
  readonly retryable: boolean;

  constructor(message: string, options: StateCommandSyncErrorOptions = {}) {
    super(message, options.cause ? { cause: options.cause } : undefined);
    this.name = 'StateCommandSyncError';
    this.statusCode = options.statusCode;
    this.retryable = options.retryable ?? false;
  }
}

export type StateCommand =
  | (BaseCommand & {
      type: 'SALE_REGISTER';
      productId: string;
      recipeOverride?: RecipeItem[];
      priceOverride?: number;
      clientSaleId?: string;
    })
  | (BaseCommand & { type: 'SALE_UNDO_LAST' })
  | (BaseCommand & { type: 'INGREDIENT_STOCK_MOVE'; ingredientId: string; amount: number })
  | (BaseCommand & { type: 'INGREDIENT_CREATE'; ingredient: Ingredient })
  | (BaseCommand & { type: 'INGREDIENT_UPDATE'; ingredient: Ingredient })
  | (BaseCommand & { type: 'INGREDIENT_DELETE'; ingredientId: string })
  | (BaseCommand & { type: 'PRODUCT_CREATE'; product: Product })
  | (BaseCommand & { type: 'PRODUCT_UPDATE'; product: Product })
  | (BaseCommand & { type: 'PRODUCT_DELETE'; productId: string })
  | (BaseCommand & { type: 'CLEANING_MATERIAL_CREATE'; material: CleaningMaterial })
  | (BaseCommand & { type: 'CLEANING_MATERIAL_UPDATE'; material: CleaningMaterial })
  | (BaseCommand & { type: 'CLEANING_MATERIAL_DELETE'; materialId: string })
  | (BaseCommand & { type: 'CLEANING_STOCK_MOVE'; materialId: string; amount: number })
  | (BaseCommand & { type: 'CLEAR_HISTORY' })
  | (BaseCommand & { type: 'FACTORY_RESET' })
  | (BaseCommand & { type: 'CLEAR_OPERATIONAL_DATA' })
  | (BaseCommand & { type: 'CLEAR_ONLY_STOCK' })
  | (BaseCommand & { type: 'DELETE_ARCHIVE_SALES'; saleIds: string[] });

interface StateWriteContext {
  version: string;
  token: string;
}

let writeContext: StateWriteContext | null = null;

const getApiBaseUrl = (): string | null => {
  const raw = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env
    ?.VITE_API_BASE_URL;
  const normalized = raw?.trim().replace(/\/+$/, '');
  if (normalized) return normalized;
  return DEFAULT_API_BASE_URL;
};

const getStateApiUrl = (): string => {
  const baseUrl = getApiBaseUrl();
  if (!baseUrl) {
    throw new Error('Base URL da API não configurada.');
  }
  return `${baseUrl}/api/v1/state`;
};

const getStateCommandsApiUrl = (): string => `${getStateApiUrl()}/commands`;

const isRetryableHttpStatus = (statusCode: number): boolean =>
  statusCode === 408 || statusCode === 425 || statusCode === 429 || statusCode >= 500;

const asRetryableNetworkError = (error: unknown): StateCommandSyncError => {
  if (error instanceof StateCommandSyncError) return error;
  const isAbortError =
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    (error as { name?: string }).name === 'AbortError';
  if (isAbortError) {
    return new StateCommandSyncError('Tempo limite ao comunicar com o servidor.', {
      retryable: true,
      cause: error,
    });
  }
  return new StateCommandSyncError('Falha de conexão com o servidor.', {
    retryable: true,
    cause: error,
  });
};

const fetchWithTimeout = async (
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs = API_TIMEOUT_MS
): Promise<Response> => {
  const controller = new AbortController();
  const timer = globalThis.setTimeout(() => controller.abort(), timeoutMs);

  try {
    try {
      return await fetch(input, {
        ...init,
        signal: controller.signal,
      });
    } catch (error) {
      throw asRetryableNetworkError(error);
    }
  } finally {
    globalThis.clearTimeout(timer);
  }
};

const normalizeVersionHeader = (value: string | null): string | null => {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.replace(/^W\//i, '').replace(/^"(.+)"$/, '$1') || null;
};

const readContextFromResponse = (response: Response): StateWriteContext => {
  const version =
    normalizeVersionHeader(response.headers.get('x-state-version')) ??
    normalizeVersionHeader(response.headers.get('etag'));
  const token = response.headers.get('x-state-token')?.trim() ?? null;

  if (!version || !token) {
    throw new Error('Falha ao obter contexto seguro de escrita de estado.');
  }

  return { version, token };
};

const toArray = <T>(value: unknown, fallback: T[]): T[] => (Array.isArray(value) ? (value as T[]) : [...fallback]);

const reviveTimestamp = <T extends { timestamp?: unknown }>(item: T): T => {
  const timestamp = item?.timestamp as unknown;
  if (timestamp && !(timestamp instanceof Date)) {
    return {
      ...item,
      timestamp: new Date(timestamp as string),
    };
  }
  return item;
};

const reviveTimestampList = <T extends { timestamp?: unknown }>(items: T[]): T[] =>
  items.map(reviveTimestamp);

const normalizeAppState = (payload: unknown): AppState => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Resposta inválida de estado da API.');
  }

  const source = payload as Record<string, unknown>;
  return {
    ingredients: toArray(source.ingredients, DEFAULT_APP_STATE.ingredients),
    products: toArray(source.products, DEFAULT_APP_STATE.products),
    sales: reviveTimestampList(toArray(source.sales, DEFAULT_APP_STATE.sales)),
    stockEntries: reviveTimestampList(toArray(source.stockEntries, DEFAULT_APP_STATE.stockEntries)),
    cleaningMaterials: toArray(source.cleaningMaterials, DEFAULT_APP_STATE.cleaningMaterials),
    cleaningStockEntries: reviveTimestampList(
      toArray(source.cleaningStockEntries, DEFAULT_APP_STATE.cleaningStockEntries)
    ),
    globalSales: reviveTimestampList(toArray(source.globalSales, DEFAULT_APP_STATE.globalSales)),
    globalCancelledSales: reviveTimestampList(
      toArray(source.globalCancelledSales, DEFAULT_APP_STATE.globalCancelledSales)
    ),
    globalStockEntries: reviveTimestampList(
      toArray(source.globalStockEntries, DEFAULT_APP_STATE.globalStockEntries)
    ),
    globalCleaningStockEntries: reviveTimestampList(
      toArray(source.globalCleaningStockEntries, DEFAULT_APP_STATE.globalCleaningStockEntries)
    ),
  };
};

const readApiErrorMessage = async (response: Response): Promise<string> => {
  try {
    const payload = (await response.json()) as { error?: string; message?: string };
    return payload.error || payload.message || `Falha na API (${response.status}).`;
  } catch {
    return `Falha na API (${response.status}).`;
  }
};

const toApiError = async (response: Response): Promise<StateCommandSyncError> => {
  const message = await readApiErrorMessage(response);
  return new StateCommandSyncError(message, {
    statusCode: response.status,
    retryable: isRetryableHttpStatus(response.status),
  });
};

const withCommandId = (command: StateCommand): StateCommand => {
  if (command.commandId && command.commandId.trim()) {
    return command;
  }
  return {
    ...command,
    commandId: `cmd-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
  };
};

const refreshWriteContext = async (): Promise<void> => {
  const response = await fetchWithTimeout(getStateApiUrl(), {
    method: 'GET',
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw await toApiError(response);
  }

  writeContext = readContextFromResponse(response);
};

export const runStateCommand = async (command: StateCommand): Promise<AppState> => {
  const payloadCommand = withCommandId(command);

  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (!writeContext) {
      await refreshWriteContext();
    }

    const context = writeContext;
    if (!context) {
      throw new StateCommandSyncError('Contexto de escrita indisponível.');
    }

    const response = await fetchWithTimeout(getStateCommandsApiUrl(), {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'If-Match': `"${context.version}"`,
        'X-State-Token': context.token,
      },
      body: JSON.stringify(payloadCommand),
    });

    if (response.ok) {
      writeContext = readContextFromResponse(response);
      const payload = (await response.json()) as unknown;
      return normalizeAppState(payload);
    }

    if ((response.status === 401 || response.status === 412 || response.status === 428) && attempt === 0) {
      writeContext = null;
      continue;
    }

    throw await toApiError(response);
  }

  throw new StateCommandSyncError('Não foi possível sincronizar o comando de estado.');
};
