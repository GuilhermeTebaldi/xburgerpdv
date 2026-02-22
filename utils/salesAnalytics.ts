import { Sale } from '../types';

const WEEKDAY_META = [
  { index: 0, shortLabel: 'Dom', label: 'Domingo' },
  { index: 1, shortLabel: 'Seg', label: 'Segunda' },
  { index: 2, shortLabel: 'Ter', label: 'Terca' },
  { index: 3, shortLabel: 'Qua', label: 'Quarta' },
  { index: 4, shortLabel: 'Qui', label: 'Quinta' },
  { index: 5, shortLabel: 'Sex', label: 'Sexta' },
  { index: 6, shortLabel: 'Sab', label: 'Sabado' },
] as const;

const HOUR_INDICES = Array.from({ length: 24 }, (_, hour) => hour);

const MOMENT_META = [
  { key: 'madrugada', label: 'Madrugada', startHour: 0, endHour: 5 },
  { key: 'manha', label: 'Manha', startHour: 6, endHour: 11 },
  { key: 'tarde', label: 'Tarde', startHour: 12, endHour: 17 },
  { key: 'noite', label: 'Noite', startHour: 18, endHour: 23 },
] as const;

type MomentKey = (typeof MOMENT_META)[number]['key'];

const safeNumber = (value: unknown): number => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const toDate = (value: Date | string): Date | null => {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const normalizeProductKey = (name: string): string => name.trim().toLocaleLowerCase('pt-BR');

const pad2 = (value: number): string => value.toString().padStart(2, '0');

const toDayKey = (date: Date): string =>
  `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;

const toDayLabel = (date: Date): string =>
  date.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

const toHourLabel = (hour: number): string => `${pad2(hour)}h`;

const toMomentOfDay = (hour: number): MomentKey => {
  if (hour >= 0 && hour < 6) return 'madrugada';
  if (hour < 12) return 'manha';
  if (hour < 18) return 'tarde';
  return 'noite';
};

interface MutableProductStats {
  key: string;
  productId?: string;
  name: string;
  sales: number;
  revenue: number;
  byWeekday: number[];
  byHour: number[];
}

interface MutableDayStats {
  dayKey: string;
  dayLabel: string;
  sales: number;
  revenue: number;
}

export interface SalesAnalyticsChartPoint {
  key?: string;
  label: string;
  sales: number;
  revenue: number;
}

export interface SalesAnalyticsHourSlot {
  label: string;
  sales: number;
}

export interface SalesAnalyticsProductSummary {
  key: string;
  productId?: string;
  name: string;
  sales: number;
  revenue: number;
  bestWeekdayLabel: string;
  bestWeekdayShortLabel: string;
  bestWeekdaySales: number;
  bestHourLabel: string;
  bestHourSales: number;
  bestMomentLabel: string;
  bestMomentSales: number;
  topHourSlots: SalesAnalyticsHourSlot[];
}

export interface SalesAnalyticsWeekdayLeader {
  weekdayLabel: string;
  weekdayShortLabel: string;
  productName: string;
  sales: number;
}

export interface SalesAnalyticsDaySummary {
  dayKey: string;
  dayLabel: string;
  sales: number;
  revenue: number;
}

export interface SalesAnalyticsSnapshot {
  totals: {
    sales: number;
    revenue: number;
    distinctProducts: number;
    activeDays: number;
  };
  peaks: {
    bestWeekdayLabel: string;
    bestWeekdayShortLabel: string;
    bestWeekdaySales: number;
    weakestWeekdayLabel: string;
    weakestWeekdayShortLabel: string;
    weakestWeekdaySales: number;
    peakHourLabel: string;
    peakHourSales: number;
    weakestHourLabel: string;
    weakestHourSales: number;
    bestDayLabel: string;
    bestDaySales: number;
    weakestDayLabel: string;
    weakestDaySales: number;
  };
  momentsOfDay: Array<{
    label: string;
    key: MomentKey;
    sales: number;
  }>;
  charts: {
    weekday: SalesAnalyticsChartPoint[];
    hourly: SalesAnalyticsChartPoint[];
    topProducts: SalesAnalyticsChartPoint[];
  };
  topProducts: SalesAnalyticsProductSummary[];
  weekdayLeaders: SalesAnalyticsWeekdayLeader[];
  dayRanking: SalesAnalyticsDaySummary[];
}

const findPeakIndex = (values: number[]): number => {
  let index = 0;
  for (let i = 1; i < values.length; i += 1) {
    if (values[i] > values[index]) {
      index = i;
    }
  }
  return index;
};

const findWeakestActiveIndex = (values: number[]): number => {
  const activeIndices = values
    .map((value, index) => ({ value, index }))
    .filter((entry) => entry.value > 0);

  if (activeIndices.length === 0) {
    return 0;
  }

  let weakest = activeIndices[0];
  for (let i = 1; i < activeIndices.length; i += 1) {
    if (activeIndices[i].value < weakest.value) {
      weakest = activeIndices[i];
    }
  }
  return weakest.index;
};

const getTopHourSlots = (hourSeries: number[], limit = 3): SalesAnalyticsHourSlot[] =>
  hourSeries
    .map((sales, hour) => ({
      hour,
      label: toHourLabel(hour),
      sales,
    }))
    .filter((entry) => entry.sales > 0)
    .sort((a, b) => {
      if (b.sales !== a.sales) return b.sales - a.sales;
      return a.hour - b.hour;
    })
    .slice(0, limit)
    .map((entry) => ({
      label: entry.label,
      sales: entry.sales,
    }));

const getMomentTotals = (hourSeries: number[]) =>
  MOMENT_META.map((moment) => {
    let sales = 0;
    for (let hour = moment.startHour; hour <= moment.endHour; hour += 1) {
      sales += hourSeries[hour] || 0;
    }
    return {
      key: moment.key,
      label: moment.label,
      sales,
    };
  });

export const buildSalesAnalytics = (sales: Sale[]): SalesAnalyticsSnapshot => {
  const productMap = new Map<string, MutableProductStats>();
  const dayMap = new Map<string, MutableDayStats>();
  const weekdaySales = Array<number>(7).fill(0);
  const weekdayRevenue = Array<number>(7).fill(0);
  const hourSales = Array<number>(24).fill(0);
  const hourRevenue = Array<number>(24).fill(0);
  const moments = {
    madrugada: 0,
    manha: 0,
    tarde: 0,
    noite: 0,
  };

  let totalRevenue = 0;
  let validSalesCount = 0;

  sales.forEach((sale) => {
    const date = toDate(sale.timestamp);
    if (!date) {
      return;
    }

    const productName = sale.productName?.trim() || 'Produto sem nome';
    const productKey = normalizeProductKey(productName);
    const productId = typeof sale.productId === 'string' ? sale.productId.trim() : '';
    const saleTotal = safeNumber(sale.total);
    const weekdayIndex = date.getDay();
    const hour = date.getHours();
    const dayKey = toDayKey(date);

    validSalesCount += 1;
    totalRevenue += saleTotal;

    if (!productMap.has(productKey)) {
      productMap.set(productKey, {
        key: productKey,
        productId: productId || undefined,
        name: productName,
        sales: 0,
        revenue: 0,
        byWeekday: Array<number>(7).fill(0),
        byHour: Array<number>(24).fill(0),
      });
    }

    const product = productMap.get(productKey)!;
    product.sales += 1;
    product.revenue += saleTotal;
    product.byWeekday[weekdayIndex] += 1;
    product.byHour[hour] += 1;
    if (!product.productId && productId) {
      product.productId = productId;
    }

    weekdaySales[weekdayIndex] += 1;
    weekdayRevenue[weekdayIndex] += saleTotal;
    hourSales[hour] += 1;
    hourRevenue[hour] += saleTotal;

    const momentKey = toMomentOfDay(hour);
    moments[momentKey] += 1;

    if (!dayMap.has(dayKey)) {
      dayMap.set(dayKey, {
        dayKey,
        dayLabel: toDayLabel(date),
        sales: 0,
        revenue: 0,
      });
    }
    const dayStats = dayMap.get(dayKey)!;
    dayStats.sales += 1;
    dayStats.revenue += saleTotal;
  });

  const topProducts = [...productMap.values()]
    .sort((a, b) => {
      if (b.sales !== a.sales) return b.sales - a.sales;
      if (b.revenue !== a.revenue) return b.revenue - a.revenue;
      return a.name.localeCompare(b.name);
    })
    .map<SalesAnalyticsProductSummary>((product) => {
      const bestWeekdayIndex = findPeakIndex(product.byWeekday);
      const weekdayMeta = WEEKDAY_META[bestWeekdayIndex];
      const bestHourIndex = findPeakIndex(product.byHour);
      const momentTotals = getMomentTotals(product.byHour);
      const bestMoment = momentTotals.reduce((currentBest, entry) =>
        entry.sales > currentBest.sales ? entry : currentBest
      );

      return {
        key: product.key,
        productId: product.productId,
        name: product.name,
        sales: product.sales,
        revenue: product.revenue,
        bestWeekdayLabel: weekdayMeta.label,
        bestWeekdayShortLabel: weekdayMeta.shortLabel,
        bestWeekdaySales: product.byWeekday[bestWeekdayIndex],
        bestHourLabel: toHourLabel(bestHourIndex),
        bestHourSales: product.byHour[bestHourIndex],
        bestMomentLabel: bestMoment.label,
        bestMomentSales: bestMoment.sales,
        topHourSlots: getTopHourSlots(product.byHour),
      };
    });

  const dayRanking = [...dayMap.values()].sort((a, b) => {
    if (b.sales !== a.sales) return b.sales - a.sales;
    if (b.revenue !== a.revenue) return b.revenue - a.revenue;
    return a.dayKey.localeCompare(b.dayKey);
  });

  const bestDay = dayRanking[0] || {
    dayLabel: '-',
    sales: 0,
  };

  const weakestDay = dayRanking.length > 0 ? dayRanking[dayRanking.length - 1] : bestDay;

  const bestWeekdayIndex = findPeakIndex(weekdaySales);
  const weakestWeekdayIndex = findWeakestActiveIndex(weekdaySales);
  const peakHourIndex = findPeakIndex(hourSales);
  const weakestHourIndex = findWeakestActiveIndex(hourSales);

  const weekdayLeaders = WEEKDAY_META.map((weekdayMeta): SalesAnalyticsWeekdayLeader => {
    let leaderName = 'Sem vendas';
    let leaderSales = 0;

    productMap.forEach((product) => {
      const qty = product.byWeekday[weekdayMeta.index];
      if (qty > leaderSales) {
        leaderSales = qty;
        leaderName = product.name;
      }
    });

    return {
      weekdayLabel: weekdayMeta.label,
      weekdayShortLabel: weekdayMeta.shortLabel,
      productName: leaderName,
      sales: leaderSales,
    };
  });

  const snapshot: SalesAnalyticsSnapshot = {
    totals: {
      sales: validSalesCount,
      revenue: totalRevenue,
      distinctProducts: productMap.size,
      activeDays: dayMap.size,
    },
    peaks: {
      bestWeekdayLabel: WEEKDAY_META[bestWeekdayIndex].label,
      bestWeekdayShortLabel: WEEKDAY_META[bestWeekdayIndex].shortLabel,
      bestWeekdaySales: weekdaySales[bestWeekdayIndex],
      weakestWeekdayLabel: WEEKDAY_META[weakestWeekdayIndex].label,
      weakestWeekdayShortLabel: WEEKDAY_META[weakestWeekdayIndex].shortLabel,
      weakestWeekdaySales: weekdaySales[weakestWeekdayIndex],
      peakHourLabel: toHourLabel(peakHourIndex),
      peakHourSales: hourSales[peakHourIndex],
      weakestHourLabel: toHourLabel(weakestHourIndex),
      weakestHourSales: hourSales[weakestHourIndex],
      bestDayLabel: bestDay.dayLabel,
      bestDaySales: bestDay.sales,
      weakestDayLabel: weakestDay.dayLabel,
      weakestDaySales: weakestDay.sales,
    },
    momentsOfDay: [
      { key: 'madrugada', label: 'Madrugada', sales: moments.madrugada },
      { key: 'manha', label: 'Manha', sales: moments.manha },
      { key: 'tarde', label: 'Tarde', sales: moments.tarde },
      { key: 'noite', label: 'Noite', sales: moments.noite },
    ],
    charts: {
      weekday: WEEKDAY_META.map((weekdayMeta) => ({
        label: weekdayMeta.shortLabel,
        sales: weekdaySales[weekdayMeta.index],
        revenue: weekdayRevenue[weekdayMeta.index],
      })),
      hourly: HOUR_INDICES.map((hour) => ({
        label: toHourLabel(hour),
        sales: hourSales[hour],
        revenue: hourRevenue[hour],
      })),
      topProducts: topProducts.slice(0, 10).map((product) => ({
        key: product.key,
        label: product.name,
        sales: product.sales,
        revenue: product.revenue,
      })),
    },
    topProducts,
    weekdayLeaders,
    dayRanking,
  };

  return snapshot;
};
