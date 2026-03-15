import { getScopedAuthStorageKey } from '../data/authScope';
import type { SaleBasePaymentMethod } from '../types';

export interface ReceiptPrintPayloadLine {
  id: string;
  qty: number;
  name: string;
  unitPrice: number;
  subtotal: number;
  note?: string;
}

export interface ReceiptPrintPayload {
  id: string;
  createdAt: string;
  expiresAt: number;
  restaurantName: string;
  orderNumber: number | null;
  orderId: string;
  paidAt: string | null;
  lines: ReceiptPrintPayloadLine[];
  itemsTotal: number;
  total: number;
  paymentMethodLabel: string;
  paymentCashReceived: number | null;
  paymentChange: number | null;
  paymentSplits: {
    sequence: number;
    label: string;
    method: SaleBasePaymentMethod;
    amount: number;
    cashReceived: number | null;
    change: number | null;
  }[];
  saleOriginLabel: string | null;
  saleOriginShortLabel: string | null;
  appOrderTotal: number | null;
  isAppSale: boolean;
  observations: string[];
}

const STORAGE_PREFIX = 'qb_receipt_print_payload_v1';
const WINDOW_NAME_PREFIX = `${STORAGE_PREFIX}:`;
const DEFAULT_TTL_MS = 20 * 60 * 1000;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const roundMoney = (value: number): number => Number((Number.isFinite(value) ? value : 0).toFixed(2));

const toStorageKey = (payloadId: string): string =>
  `${getScopedAuthStorageKey(STORAGE_PREFIX)}:${payloadId}`;

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

const isBasePaymentMethod = (value: unknown): value is SaleBasePaymentMethod =>
  value === 'PIX' || value === 'DEBITO' || value === 'CREDITO' || value === 'DINHEIRO';

const normalizeLine = (value: unknown): ReceiptPrintPayloadLine | null => {
  if (!isRecord(value)) return null;
  const id = typeof value.id === 'string' ? value.id.trim() : '';
  const name = typeof value.name === 'string' ? value.name.trim() : '';
  if (!id || !name) return null;

  const qtyRaw = Number(value.qty);
  const unitPriceRaw = Number(value.unitPrice);
  const subtotalRaw = Number(value.subtotal);
  const note = typeof value.note === 'string' && value.note.trim() ? value.note.trim() : undefined;

  return {
    id,
    qty: Number.isFinite(qtyRaw) ? Math.max(1, Math.floor(qtyRaw)) : 1,
    name,
    unitPrice: roundMoney(unitPriceRaw),
    subtotal: roundMoney(subtotalRaw),
    note,
  };
};

const normalizePayload = (value: unknown): ReceiptPrintPayload | null => {
  if (!isRecord(value)) return null;

  const id = typeof value.id === 'string' ? value.id.trim() : '';
  const createdAt =
    typeof value.createdAt === 'string' && !Number.isNaN(Date.parse(value.createdAt))
      ? value.createdAt
      : new Date().toISOString();
  const expiresAtRaw = Number(value.expiresAt);
  const expiresAt = Number.isFinite(expiresAtRaw) ? Math.max(0, Math.floor(expiresAtRaw)) : Date.now() + DEFAULT_TTL_MS;
  const restaurantName =
    typeof value.restaurantName === 'string' && value.restaurantName.trim()
      ? value.restaurantName.trim()
      : 'XBURGER PDV';
  const orderId = typeof value.orderId === 'string' ? value.orderId.trim() : '';
  if (!id || !orderId) return null;

  const orderNumberRaw = Number(value.orderNumber);
  const orderNumber =
    Number.isFinite(orderNumberRaw) && orderNumberRaw > 0 ? Math.floor(orderNumberRaw) : null;
  const paidAt =
    typeof value.paidAt === 'string' && !Number.isNaN(Date.parse(value.paidAt)) ? value.paidAt : null;

  const lines = Array.isArray(value.lines)
    ? value.lines.map((line) => normalizeLine(line)).filter((line): line is ReceiptPrintPayloadLine => line !== null)
    : [];
  if (lines.length === 0) return null;

  const paymentSplits = Array.isArray(value.paymentSplits)
    ? value.paymentSplits
        .map((entry, index) => {
          if (!isRecord(entry) || !isBasePaymentMethod(entry.method)) return null;
          const sequenceRaw = Number(entry.sequence);
          const amountRaw = Number(entry.amount);
          const cashReceivedRaw = Number(entry.cashReceived);
          const changeRaw = Number(entry.change);
          return {
            sequence: Number.isInteger(sequenceRaw) && sequenceRaw > 0 ? sequenceRaw : index + 1,
            label:
              typeof entry.label === 'string' && entry.label.trim()
                ? entry.label.trim()
                : `Parcela ${index + 1}`,
            method: entry.method,
            amount: roundMoney(amountRaw),
            cashReceived:
              entry.method === 'DINHEIRO' && Number.isFinite(cashReceivedRaw)
                ? roundMoney(cashReceivedRaw)
                : null,
            change:
              entry.method === 'DINHEIRO' && Number.isFinite(changeRaw)
                ? roundMoney(changeRaw)
                : null,
          };
        })
        .filter(
          (
            entry
          ): entry is {
            sequence: number;
            label: string;
            method: SaleBasePaymentMethod;
            amount: number;
            cashReceived: number | null;
            change: number | null;
          } => entry !== null
        )
    : [];

  const observations = Array.isArray(value.observations)
    ? value.observations
        .filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
        .map((entry) => entry.trim())
    : [];

  return {
    id,
    createdAt,
    expiresAt,
    restaurantName,
    orderNumber,
    orderId,
    paidAt,
    lines,
    itemsTotal: roundMoney(Number(value.itemsTotal)),
    total: roundMoney(Number(value.total)),
    paymentMethodLabel:
      typeof value.paymentMethodLabel === 'string' && value.paymentMethodLabel.trim()
        ? value.paymentMethodLabel.trim()
        : 'NAO INFORMADO',
    paymentCashReceived: Number.isFinite(Number(value.paymentCashReceived))
      ? roundMoney(Number(value.paymentCashReceived))
      : null,
    paymentChange: Number.isFinite(Number(value.paymentChange)) ? roundMoney(Number(value.paymentChange)) : null,
    paymentSplits,
    saleOriginLabel:
      typeof value.saleOriginLabel === 'string' && value.saleOriginLabel.trim()
        ? value.saleOriginLabel.trim()
        : null,
    saleOriginShortLabel:
      typeof value.saleOriginShortLabel === 'string' && value.saleOriginShortLabel.trim()
        ? value.saleOriginShortLabel.trim()
        : null,
    appOrderTotal: Number.isFinite(Number(value.appOrderTotal)) ? roundMoney(Number(value.appOrderTotal)) : null,
    isAppSale: value.isAppSale === true,
    observations,
  };
};

const serializePayload = (payload: ReceiptPrintPayload): string | null => {
  try {
    const raw = JSON.stringify(payload);
    return encodeToBase64Url(raw);
  } catch {
    return null;
  }
};

const deserializePayload = (serialized: string): ReceiptPrintPayload | null => {
  const decoded = decodeFromBase64Url(serialized);
  if (!decoded) return null;
  try {
    const parsed = JSON.parse(decoded) as unknown;
    return normalizePayload(parsed);
  } catch {
    return null;
  }
};

const readFromWindowName = (windowName: string | null | undefined): ReceiptPrintPayload | null => {
  if (!windowName || !windowName.startsWith(WINDOW_NAME_PREFIX)) return null;
  const serialized = windowName.slice(WINDOW_NAME_PREFIX.length).trim();
  if (!serialized) return null;
  return deserializePayload(serialized);
};

const isPayloadExpired = (payload: ReceiptPrintPayload, now: number = Date.now()): boolean => {
  if (payload.expiresAt > 0) {
    return payload.expiresAt <= now;
  }
  const createdAtMs = Date.parse(payload.createdAt);
  if (!Number.isFinite(createdAtMs)) return false;
  return createdAtMs + DEFAULT_TTL_MS <= now;
};

export const createReceiptPrintPayloadId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `rpp-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

export const saveReceiptPrintPayload = (payload: ReceiptPrintPayload): void => {
  if (typeof window === 'undefined') return;
  const normalized = normalizePayload(payload);
  if (!normalized) return;

  try {
    window.localStorage.setItem(toStorageKey(normalized.id), JSON.stringify(normalized));
  } catch {
    // fallback to window.name via setReceiptPrintPayloadOnWindow when opening the print window
  }
};

export const setReceiptPrintPayloadOnWindow = (
  targetWindow: Window,
  payload: ReceiptPrintPayload
): void => {
  const normalized = normalizePayload(payload);
  if (!normalized) return;
  const serialized = serializePayload(normalized);
  if (!serialized) return;
  try {
    targetWindow.name = `${WINDOW_NAME_PREFIX}${serialized}`;
  } catch {
    // ignore window assignment failures
  }
};

export const consumeReceiptPrintPayload = (
  receiptId: string,
  sources?: { windowName?: string | null }
): ReceiptPrintPayload | null => {
  const normalizedId = receiptId.trim();
  if (!normalizedId) return null;

  if (typeof window !== 'undefined') {
    try {
      const raw = window.localStorage.getItem(toStorageKey(normalizedId));
      if (raw) {
        const parsed = JSON.parse(raw) as unknown;
        const fromStorage = normalizePayload(parsed);
        if (fromStorage && fromStorage.id === normalizedId && !isPayloadExpired(fromStorage)) {
          return fromStorage;
        }
      }
    } catch {
      // ignore storage read errors
    }
  }

  const windowName =
    sources?.windowName !== undefined
      ? sources.windowName
      : typeof window !== 'undefined'
        ? window.name
        : null;
  const fromWindowName = readFromWindowName(windowName);
  if (fromWindowName && fromWindowName.id === normalizedId && !isPayloadExpired(fromWindowName)) {
    return fromWindowName;
  }

  return null;
};

export const removeReceiptPrintPayload = (payloadId: string): void => {
  const normalizedId = payloadId.trim();
  if (!normalizedId || typeof window === 'undefined') return;

  try {
    window.localStorage.removeItem(toStorageKey(normalizedId));
  } catch {
    // ignore storage remove failures
  }

  try {
    const windowPayload = readFromWindowName(window.name);
    if (windowPayload?.id === normalizedId) {
      window.name = '';
    }
  } catch {
    // ignore window cleanup failures
  }
};

export const cleanupExpiredReceiptPrintPayloads = (): void => {
  if (typeof window === 'undefined') return;
  const now = Date.now();
  const scopedPrefix = `${getScopedAuthStorageKey(STORAGE_PREFIX)}:`;
  const keysToRemove: string[] = [];

  try {
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (!key || !key.startsWith(scopedPrefix)) continue;
      const raw = window.localStorage.getItem(key);
      if (!raw) {
        keysToRemove.push(key);
        continue;
      }

      try {
        const payload = normalizePayload(JSON.parse(raw) as unknown);
        if (!payload || isPayloadExpired(payload, now)) {
          keysToRemove.push(key);
        }
      } catch {
        keysToRemove.push(key);
      }
    }
  } catch {
    return;
  }

  keysToRemove.forEach((key) => {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // ignore individual cleanup failures
    }
  });
};
