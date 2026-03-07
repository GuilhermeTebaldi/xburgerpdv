import { Sale, SaleOrigin } from '../types';

export type AppOrigin = 'IFOOD' | 'APP99';

export interface AppChannelOriginSummary {
  orders: number;
  revenue: number;
  reference: number;
  delta: number;
}

export interface AppChannelSummary {
  totalOrders: number;
  totalRevenue: number;
  totalReference: number;
  totalDelta: number;
  byOrigin: Record<AppOrigin, AppChannelOriginSummary>;
}

export const APP_ORIGINS: AppOrigin[] = ['IFOOD', 'APP99'];

const roundMoney = (value: number): number => Number((Number.isFinite(value) ? value : 0).toFixed(2));

const isAppOrigin = (origin: SaleOrigin | undefined): origin is AppOrigin =>
  origin === 'IFOOD' || origin === 'APP99';

const getSaleGroupKey = (sale: Sale): string =>
  sale.saleDraftId ? `draft:${sale.saleDraftId}` : `sale:${sale.id}`;

const buildEmptyAppChannelSummary = (): AppChannelSummary => ({
  totalOrders: 0,
  totalRevenue: 0,
  totalReference: 0,
  totalDelta: 0,
  byOrigin: {
    IFOOD: { orders: 0, revenue: 0, reference: 0, delta: 0 },
    APP99: { orders: 0, revenue: 0, reference: 0, delta: 0 },
  },
});

export const buildAppChannelSummary = (entries: Sale[]): AppChannelSummary => {
  const grouped = new Map<
    string,
    {
      origin: AppOrigin;
      fallbackRevenue: number;
      appRevenue: number | null;
      reference: number;
    }
  >();

  entries.forEach((sale) => {
    const origin = sale.saleOrigin || 'LOCAL';
    if (!isAppOrigin(origin)) return;

    const key = getSaleGroupKey(sale);
    const current = grouped.get(key) || {
      origin,
      fallbackRevenue: 0,
      appRevenue: null,
      reference: 0,
    };

    current.origin = origin;
    current.fallbackRevenue += Number(sale.total) || 0;
    current.reference +=
      Number.isFinite(Number(sale.basePrice)) && Number(sale.basePrice) > 0
        ? Number(sale.basePrice)
        : Number(sale.total) || 0;

    const appTotal = Number(sale.appOrderTotal);
    if (Number.isFinite(appTotal) && appTotal > 0) {
      current.appRevenue = appTotal;
    }

    grouped.set(key, current);
  });

  if (grouped.size === 0) return buildEmptyAppChannelSummary();

  const summary = buildEmptyAppChannelSummary();
  summary.totalOrders = grouped.size;

  grouped.forEach((group) => {
    const revenue = roundMoney(group.appRevenue ?? group.fallbackRevenue);
    const reference = roundMoney(group.reference);
    const delta = roundMoney(revenue - reference);
    const originSummary = summary.byOrigin[group.origin];

    originSummary.orders += 1;
    originSummary.revenue = roundMoney(originSummary.revenue + revenue);
    originSummary.reference = roundMoney(originSummary.reference + reference);
    originSummary.delta = roundMoney(originSummary.delta + delta);

    summary.totalRevenue = roundMoney(summary.totalRevenue + revenue);
    summary.totalReference = roundMoney(summary.totalReference + reference);
    summary.totalDelta = roundMoney(summary.totalDelta + delta);
  });

  return summary;
};
