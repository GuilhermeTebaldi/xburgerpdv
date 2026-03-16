import type { DailySalesHistoryEntry, Sale } from '../types';

const roundMoney = (value: number): number => Number(value.toFixed(2));

const toDate = (value: Date | string): Date => {
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) return new Date();
  return parsed;
};

const toNonNegativeMoney = (value: unknown): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return roundMoney(parsed);
};

const getSaleOrderGroupKey = (sale: Sale): string =>
  sale.saleDraftId ? `draft:${sale.saleDraftId}` : `sale:${sale.id}`;

export const countSaleOrders = (sales: Sale[]): number => {
  if (!Array.isArray(sales) || sales.length === 0) return 0;
  return new Set(sales.map((sale) => getSaleOrderGroupKey(sale))).size;
};

export const toDailyHistoryDayKey = (value: Date | string): string =>
  toDate(value).toLocaleDateString('pt-BR');

export const buildSalesByDayMap = (sales: Sale[]): Map<string, Sale[]> => {
  const map = new Map<string, Sale[]>();
  sales.forEach((sale) => {
    const dayKey = toDailyHistoryDayKey(sale.timestamp);
    const daySales = map.get(dayKey);
    if (daySales) {
      daySales.push(sale);
      return;
    }
    map.set(dayKey, [sale]);
  });
  return map;
};

export interface DailyHistoryTotalsFromSales {
  totalRevenue: number;
  totalPurchases: number;
  totalProfit: number;
  saleCount: number;
}

export const buildDailyHistoryTotalsFromSales = (sales: Sale[]): DailyHistoryTotalsFromSales => {
  const totalRevenue = roundMoney(
    sales.reduce((sum, sale) => sum + (Number.isFinite(sale.total) ? sale.total : 0), 0)
  );
  const totalPurchases = roundMoney(
    sales.reduce((sum, sale) => sum + (Number.isFinite(sale.totalCost) ? sale.totalCost : 0), 0)
  );

  return {
    totalRevenue,
    totalPurchases,
    totalProfit: roundMoney(totalRevenue - totalPurchases),
    saleCount: countSaleOrders(sales),
  };
};

interface NormalizeDailyHistoryEntryOptions {
  salesByDay?: Map<string, Sale[]>;
}

export const normalizeDailyHistoryEntry = (
  value: unknown,
  options: NormalizeDailyHistoryEntryOptions = {}
): DailySalesHistoryEntry | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;

  const source = value as Record<string, unknown>;
  const closedAtRaw = source.closedAt;
  const closedAt =
    closedAtRaw instanceof Date || typeof closedAtRaw === 'string'
      ? closedAtRaw
      : new Date().toISOString();

  const dayKey = toDailyHistoryDayKey(closedAt);
  const daySales = options.salesByDay?.get(dayKey) || [];

  let totalRevenue = toNonNegativeMoney(source.totalRevenue);
  let totalPurchases = toNonNegativeMoney(source.totalPurchases);
  let saleCountRaw = Number(source.saleCount);
  let saleCount = Number.isFinite(saleCountRaw) && saleCountRaw >= 0 ? Math.floor(saleCountRaw) : 0;

  // Legacy fallback: when purchases were missing, derive it from legacy profit.
  if (totalPurchases === 0 && Number(source.totalPurchases) <= 0) {
    const rawProfit = Number(source.totalProfit);
    if (Number.isFinite(rawProfit)) {
      const derivedPurchases = roundMoney(totalRevenue - rawProfit);
      if (Number.isFinite(derivedPurchases) && derivedPurchases > 0) {
        totalPurchases = derivedPurchases;
      }
    }
  }

  // Preferred source of truth: archived sales totals for the closed day.
  if (daySales.length > 0) {
    const totalsFromSales = buildDailyHistoryTotalsFromSales(daySales);
    totalRevenue = totalsFromSales.totalRevenue;
    totalPurchases = totalsFromSales.totalPurchases;
    saleCount = totalsFromSales.saleCount;
  }

  return {
    id:
      typeof source.id === 'string' && source.id.trim()
        ? source.id
        : `day-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    closedAt,
    openingCash: toNonNegativeMoney(source.openingCash),
    totalRevenue,
    totalPurchases,
    totalProfit: roundMoney(totalRevenue - totalPurchases),
    saleCount,
    cashExpenses: toNonNegativeMoney(source.cashExpenses),
  };
};

export const normalizeDailyHistoryList = (
  entries: unknown[],
  options: NormalizeDailyHistoryEntryOptions = {}
): DailySalesHistoryEntry[] =>
  entries
    .map((entry) => normalizeDailyHistoryEntry(entry, options))
    .filter((entry): entry is DailySalesHistoryEntry => entry !== null);
