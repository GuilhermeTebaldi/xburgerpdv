import { readAdminAuthToken } from './adminAuthToken';
import { isPrintPresetId, type UserPrintPreferences } from './printPreferences';

const API_TIMEOUT_MS = 12000;
const DEFAULT_API_BASE_URL = 'https://xburger-saas-backend.onrender.com';

const getApiBaseUrl = (): string => {
  const raw = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env
    ?.VITE_API_BASE_URL;
  const normalized = raw?.trim().replace(/\/+$/, '');
  return normalized || DEFAULT_API_BASE_URL;
};

const getPrintPreferencesApiUrl = (): string => `${getApiBaseUrl()}/api/v1/print-preferences`;

const normalizePrintPreferences = (value: unknown): UserPrintPreferences => {
  const source =
    value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  return {
    historyClosingPreset: isPrintPresetId(source.historyClosingPreset) ? source.historyClosingPreset : null,
    cashReportPreset: isPrintPresetId(source.cashReportPreset) ? source.cashReportPreset : null,
    receiptHistoryPreset: isPrintPresetId(source.receiptHistoryPreset) ? source.receiptHistoryPreset : null,
  };
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
      cache: init.cache ?? 'no-store',
      signal: controller.signal,
    });
  } finally {
    globalThis.clearTimeout(timer);
  }
};

const getAuthorizationHeader = (): string => {
  const token = readAdminAuthToken();
  if (!token) {
    throw new Error('Sessão expirada. Faça login novamente para continuar.');
  }
  return `Bearer ${token}`;
};

const assertResponseOk = async (response: Response, fallbackMessage: string): Promise<void> => {
  if (response.ok) return;
  try {
    const payload = (await response.json()) as { error?: unknown; message?: unknown };
    const message =
      (typeof payload.error === 'string' && payload.error.trim()) ||
      (typeof payload.message === 'string' && payload.message.trim()) ||
      fallbackMessage;
    throw new Error(message);
  } catch (error) {
    if (error instanceof Error && error.message.trim()) {
      throw error;
    }
    throw new Error(fallbackMessage);
  }
};

export const fetchPrintPreferences = async (): Promise<UserPrintPreferences> => {
  const response = await fetchWithTimeout(getPrintPreferencesApiUrl(), {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      Authorization: getAuthorizationHeader(),
    },
  });

  await assertResponseOk(response, 'Falha ao carregar preferências de impressão.');
  const payload = await response.json();
  return normalizePrintPreferences(payload);
};

export const updatePrintPreferences = async (
  patch: Partial<UserPrintPreferences>
): Promise<UserPrintPreferences> => {
  const response = await fetchWithTimeout(getPrintPreferencesApiUrl(), {
    method: 'PUT',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: getAuthorizationHeader(),
    },
    body: JSON.stringify(patch),
  });

  await assertResponseOk(response, 'Falha ao salvar preferências de impressão.');
  const payload = await response.json();
  return normalizePrintPreferences(payload);
};
