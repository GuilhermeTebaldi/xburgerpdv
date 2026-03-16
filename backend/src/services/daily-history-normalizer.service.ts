import type {
  FrontDailySalesHistoryEntry,
  FrontSale,
} from '../types/frontend.js';

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

const toSaleDayKey = (value: Date | string): string => toDate(value).toISOString().slice(0, 10);

export const buildSalesByDayMap = (sales: FrontSale[]): Map<string, FrontSale[]> => {
  const map = new Map<string, FrontSale[]>();
  sales.forEach((sale) => {
    const dayKey = toSaleDayKey(sale.timestamp);
    const daySales = map.get(dayKey);
    if (daySales) {
      daySales.push(sale);
      return;
    }
    map.set(dayKey, [sale]);
  });
  return map;
};

interface DailyTotalsFromSales {
  totalRevenue: number;
  totalPurchases: number;
  totalProfit: number;
  saleCount: number;
}

const buildDailyTotalsFromSales = (sales: FrontSale[]): DailyTotalsFromSales => {
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
    saleCount: sales.length,
  };
};

interface NormalizeDailyHistoryEntryOptions {
  salesByDay?: Map<string, FrontSale[]>;
}

export const normalizeDailySalesHistoryEntry = (
  value: unknown,
  options: NormalizeDailyHistoryEntryOptions = {}
): FrontDailySalesHistoryEntry | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;

  const source = value as Record<string, unknown>;
  const closedAtRaw = source.closedAt;
  const closedAt =
    closedAtRaw instanceof Date || typeof closedAtRaw === 'string'
      ? closedAtRaw
      : new Date().toISOString();
  const dayKey = toSaleDayKey(closedAt);
  const daySales = options.salesByDay?.get(dayKey) || [];

  let totalRevenue = toNonNegativeMoney(source.totalRevenue);
  let totalPurchases = toNonNegativeMoney(source.totalPurchases);
  let saleCountRaw = Number(source.saleCount);
  let saleCount = Number.isFinite(saleCountRaw) && saleCountRaw >= 0 ? Math.floor(saleCountRaw) : 0;

  // Legacy fallback when purchases were not persisted but profit was.
  if (totalPurchases === 0 && Number(source.totalPurchases) <= 0) {
    const rawProfit = Number(source.totalProfit);
    if (Number.isFinite(rawProfit)) {
      const derivedPurchases = roundMoney(totalRevenue - rawProfit);
      if (Number.isFinite(derivedPurchases) && derivedPurchases > 0) {
        totalPurchases = derivedPurchases;
      }
    }
  }

  if (daySales.length > 0) {
    const totalsFromSales = buildDailyTotalsFromSales(daySales);
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

export const normalizeDailySalesHistoryList = (
  entries: unknown[],
  options: NormalizeDailyHistoryEntryOptions = {}
): FrontDailySalesHistoryEntry[] =>
  entries
    .map((entry) => normalizeDailySalesHistoryEntry(entry, options))
    .filter((entry): entry is FrontDailySalesHistoryEntry => entry !== null);
