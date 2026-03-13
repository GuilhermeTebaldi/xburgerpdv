import { getScopedAuthStorageKey } from '../data/authScope';

export type SalesReportPrintMode = 'SUMMARY' | 'FULL';

export interface SalesReportPrintRow {
  label: string;
  value: string;
}

export interface SalesReportPrintPayload {
  id: string;
  mode: SalesReportPrintMode;
  paperWidthMm: number;
  summaryRows: SalesReportPrintRow[];
  paymentRows: SalesReportPrintRow[];
  channelRows: SalesReportPrintRow[];
  hasDetailedSales: boolean;
  summarySectionTitle: string;
  paymentSectionTitle: string;
  channelSectionTitle: string;
  missingPaymentDetailsMessage: string;
  missingChannelDetailsMessage: string;
  missingDetailsMessage: string;
  printedAtLabel: string;
}

const STORAGE_PREFIX = 'xburger_sales_report_print_payload_v1';
const WINDOW_NAME_PREFIX = `${STORAGE_PREFIX}:`;
const HASH_PARAM = 'srp';
const DEFAULT_HASH_MAX_LENGTH = 3200;

const toStorageKey = (payloadId: string): string => `${getScopedAuthStorageKey(STORAGE_PREFIX)}:${payloadId}`;

const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const normalizeRow = (value: unknown): SalesReportPrintRow | null => {
  if (!isObjectRecord(value)) return null;

  const label = typeof value.label === 'string' ? value.label.trim() : '';
  const rawRowValue = typeof value.value === 'string' ? value.value : '';
  if (!label) return null;

  return {
    label,
    value: rawRowValue,
  };
};

const normalizeRows = (value: unknown): SalesReportPrintRow[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => normalizeRow(entry))
    .filter((entry): entry is SalesReportPrintRow => entry !== null);
};

const normalizePayload = (value: unknown): SalesReportPrintPayload | null => {
  if (!isObjectRecord(value)) return null;

  const id = typeof value.id === 'string' ? value.id.trim() : '';
  const mode = value.mode === 'SUMMARY' || value.mode === 'FULL' ? value.mode : null;
  const paperWidthRaw = Number(value.paperWidthMm);
  const paperWidthMm = Number.isFinite(paperWidthRaw) ? Math.max(48, Math.round(paperWidthRaw)) : 58;

  if (!id || !mode) return null;

  const summarySectionTitle =
    typeof value.summarySectionTitle === 'string' && value.summarySectionTitle.trim()
      ? value.summarySectionTitle.trim()
      : 'RESUMO GERAL';
  const paymentSectionTitle =
    typeof value.paymentSectionTitle === 'string' && value.paymentSectionTitle.trim()
      ? value.paymentSectionTitle.trim()
      : 'VALORES INFORMADOS';
  const channelSectionTitle =
    typeof value.channelSectionTitle === 'string' && value.channelSectionTitle.trim()
      ? value.channelSectionTitle.trim()
      : 'CANAIS DE VENDA';

  return {
    id,
    mode,
    paperWidthMm,
    summaryRows: normalizeRows(value.summaryRows),
    paymentRows: normalizeRows(value.paymentRows),
    channelRows: normalizeRows(value.channelRows),
    hasDetailedSales: value.hasDetailedSales !== false,
    summarySectionTitle,
    paymentSectionTitle,
    channelSectionTitle,
    missingPaymentDetailsMessage:
      typeof value.missingPaymentDetailsMessage === 'string' && value.missingPaymentDetailsMessage.trim()
        ? value.missingPaymentDetailsMessage.trim()
        : 'Sem detalhamento por pagamento para este fechamento.',
    missingChannelDetailsMessage:
      typeof value.missingChannelDetailsMessage === 'string' && value.missingChannelDetailsMessage.trim()
        ? value.missingChannelDetailsMessage.trim()
        : 'Sem detalhamento por canal para este fechamento.',
    missingDetailsMessage:
      typeof value.missingDetailsMessage === 'string' && value.missingDetailsMessage.trim()
        ? value.missingDetailsMessage.trim()
        : 'Fechamento salvo sem itens detalhados de venda para impressão.',
    printedAtLabel:
      typeof value.printedAtLabel === 'string' && value.printedAtLabel.trim() ? value.printedAtLabel.trim() : '--',
  };
};

const encodeToBase64Url = (value: string): string | null => {
  try {
    const utf8 = unescape(encodeURIComponent(value));
    return btoa(utf8).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  } catch {
    return null;
  }
};

const decodeFromBase64Url = (value: string): string | null => {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));

  try {
    const decoded = atob(`${normalized}${padding}`);
    return decodeURIComponent(escape(decoded));
  } catch {
    return null;
  }
};

const serializePayload = (payload: SalesReportPrintPayload): string | null => {
  try {
    const raw = JSON.stringify(payload);
    return encodeToBase64Url(raw);
  } catch {
    return null;
  }
};

const deserializePayload = (serialized: string): SalesReportPrintPayload | null => {
  const decoded = decodeFromBase64Url(serialized);
  if (!decoded) return null;

  try {
    const parsed = JSON.parse(decoded) as unknown;
    return normalizePayload(parsed);
  } catch {
    return null;
  }
};

const readFromLocalStorage = (payloadId: string): SalesReportPrintPayload | null => {
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.localStorage.getItem(toStorageKey(payloadId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    const normalized = normalizePayload(parsed);
    return normalized?.id === payloadId ? normalized : null;
  } catch {
    return null;
  }
};

const readFromWindowName = (windowName: string | null | undefined): SalesReportPrintPayload | null => {
  if (!windowName || !windowName.startsWith(WINDOW_NAME_PREFIX)) return null;

  const serialized = windowName.slice(WINDOW_NAME_PREFIX.length).trim();
  if (!serialized) return null;

  return deserializePayload(serialized);
};

const readFromHash = (hashValue: string | null | undefined): SalesReportPrintPayload | null => {
  if (!hashValue) return null;

  const normalizedHash = hashValue.startsWith('#') ? hashValue.slice(1) : hashValue;
  if (!normalizedHash) return null;

  const params = new URLSearchParams(normalizedHash);
  const serialized = params.get(HASH_PARAM);
  if (!serialized) return null;

  try {
    const normalizedSerialized = decodeURIComponent(serialized);
    return deserializePayload(normalizedSerialized);
  } catch {
    return null;
  }
};

export const createSalesReportPrintPayloadId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `srp-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

export const persistSalesReportPrintPayload = (payload: SalesReportPrintPayload): void => {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(toStorageKey(payload.id), JSON.stringify(payload));
  } catch {
    // ignore storage failures
  }
};

export const removeSalesReportPrintPayload = (payloadId: string): void => {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.removeItem(toStorageKey(payloadId));
  } catch {
    // ignore storage failures
  }
};

export const buildSalesReportPrintWindowName = (payload: SalesReportPrintPayload): string | null => {
  const serialized = serializePayload(payload);
  if (!serialized) return null;
  return `${WINDOW_NAME_PREFIX}${serialized}`;
};

export const buildSalesReportPrintHash = (
  payload: SalesReportPrintPayload,
  maxLength: number = DEFAULT_HASH_MAX_LENGTH
): string => {
  const serialized = serializePayload(payload);
  if (!serialized) return '';

  const encoded = encodeURIComponent(serialized);
  const hash = `#${HASH_PARAM}=${encoded}`;
  return hash.length <= Math.max(0, maxLength) ? hash : '';
};

export const readSalesReportPrintPayload = (
  payloadId: string,
  sources?: { windowName?: string | null; hash?: string | null }
): SalesReportPrintPayload | null => {
  const normalizedId = payloadId.trim();
  if (!normalizedId) return null;

  const fromStorage = readFromLocalStorage(normalizedId);
  if (fromStorage) return fromStorage;

  const windowName =
    sources?.windowName !== undefined
      ? sources.windowName
      : typeof window !== 'undefined'
        ? window.name
        : null;
  const fromWindowName = readFromWindowName(windowName);
  if (fromWindowName?.id === normalizedId) {
    return fromWindowName;
  }

  const hashValue =
    sources?.hash !== undefined
      ? sources.hash
      : typeof window !== 'undefined'
        ? window.location.hash
        : null;
  const fromHash = readFromHash(hashValue);
  if (fromHash?.id === normalizedId) {
    return fromHash;
  }

  return null;
};
