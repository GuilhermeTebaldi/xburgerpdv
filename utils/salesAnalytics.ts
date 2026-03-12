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
type ChannelKey = 'LOCAL' | 'IFOOD' | 'APP99' | 'KEETA';

const CHANNEL_META = [
  { key: 'LOCAL', label: 'Balcao' },
  { key: 'IFOOD', label: 'iFood' },
  { key: 'APP99', label: '99' },
  { key: 'KEETA', label: 'Keeta' },
] as const;

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

const toMonthKey = (date: Date): string => `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`;

const toMonthLabel = (date: Date): string =>
  date.toLocaleDateString('pt-BR', {
    month: 'short',
    year: 'numeric',
  });

const toWeekStart = (date: Date): Date => {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const weekday = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - weekday);
  return start;
};

const toWeekKey = (date: Date): string => toDayKey(toWeekStart(date));

const toWeekLabel = (date: Date): string => {
  const start = toWeekStart(date);
  return `Sem ${start.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}`;
};

const toMomentOfDay = (hour: number): MomentKey => {
  if (hour >= 0 && hour < 6) return 'madrugada';
  if (hour < 12) return 'manha';
  if (hour < 18) return 'tarde';
  return 'noite';
};

const toChannelKey = (origin: Sale['saleOrigin']): ChannelKey => {
  if (origin === 'IFOOD') return 'IFOOD';
  if (origin === 'APP99') return 'APP99';
  if (origin === 'KEETA') return 'KEETA';
  return 'LOCAL';
};

const roundMoney = (value: number): number => Number((Number.isFinite(value) ? value : 0).toFixed(2));

const getSaleGroupKey = (sale: Sale): string =>
  sale.saleDraftId ? `draft:${sale.saleDraftId}` : `sale:${sale.id}`;

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

interface MutableOrderStats {
  key: string;
  dayKey: string;
  dayLabel: string;
  weekKey: string;
  weekLabel: string;
  monthKey: string;
  monthLabel: string;
  channel: ChannelKey;
  fallbackRevenue: number;
  appRevenue: number | null;
  timestamp: number;
}

interface OrderStats {
  key: string;
  dayKey: string;
  dayLabel: string;
  weekKey: string;
  weekLabel: string;
  monthKey: string;
  monthLabel: string;
  channel: ChannelKey;
  revenue: number;
  timestamp: number;
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

export interface SalesAnalyticsHeatmapCell {
  hour: number;
  label: string;
  sales: number;
  revenue: number;
}

export interface SalesAnalyticsHeatmapRow {
  weekdayIndex: number;
  weekdayLabel: string;
  weekdayShortLabel: string;
  totalSales: number;
  hours: SalesAnalyticsHeatmapCell[];
}

export interface SalesAnalyticsCumulativePoint {
  hour: number;
  label: string;
  sales: number;
  revenue: number;
  accumulatedSales: number;
  accumulatedRevenue: number;
}

export interface SalesAnalyticsTicketPoint {
  key: string;
  label: string;
  orders: number;
  revenue: number;
  ticket: number;
}

export interface SalesAnalyticsChannelEfficiencyPoint {
  key: ChannelKey;
  label: string;
  orders: number;
  revenue: number;
  ticket: number;
}

export interface SalesAnalyticsDeadHour {
  hour: number;
  label: string;
  sales: number;
}

export interface SalesAnalyticsIntelligence {
  deadHours: SalesAnalyticsDeadHour[];
  productDependency: {
    productName: string;
    revenue: number;
    sharePercent: number;
    isRisk: boolean;
  };
  salesStability: {
    dailyAverage: number;
    dailyStdDev: number;
    variation: number;
    status: 'estavel' | 'moderada' | 'instavel';
    direction: 'crescimento' | 'queda' | 'estavel';
  };
  weeklyTrend: {
    status: 'crescimento' | 'queda' | 'estavel';
    changePercent: number;
    currentWeekRevenue: number;
    previousWeekRevenue: number;
  };
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
    heatmap: SalesAnalyticsHeatmapRow[];
    cumulativeDaily: SalesAnalyticsCumulativePoint[];
    ticketByPeriod: {
      day: SalesAnalyticsTicketPoint[];
      week: SalesAnalyticsTicketPoint[];
      month: SalesAnalyticsTicketPoint[];
    };
    channelEfficiency: SalesAnalyticsChannelEfficiencyPoint[];
  };
  topProducts: SalesAnalyticsProductSummary[];
  weekdayLeaders: SalesAnalyticsWeekdayLeader[];
  dayRanking: SalesAnalyticsDaySummary[];
  dayTimeline: SalesAnalyticsDaySummary[];
  intelligence: SalesAnalyticsIntelligence;
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

const average = (values: number[]): number => {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
};

const standardDeviation = (values: number[]): number => {
  if (values.length <= 1) return 0;
  const mean = average(values);
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
};

const aggregateTicketSeries = (
  orders: OrderStats[],
  period: 'day' | 'week' | 'month'
): SalesAnalyticsTicketPoint[] => {
  const map = new Map<string, SalesAnalyticsTicketPoint>();

  orders.forEach((order) => {
    const key = period === 'day' ? order.dayKey : period === 'week' ? order.weekKey : order.monthKey;
    const label =
      period === 'day' ? order.dayLabel : period === 'week' ? order.weekLabel : order.monthLabel;

    if (!map.has(key)) {
      map.set(key, {
        key,
        label,
        orders: 0,
        revenue: 0,
        ticket: 0,
      });
    }

    const current = map.get(key)!;
    current.orders += 1;
    current.revenue += order.revenue;
  });

  const sorted = [...map.values()].sort((a, b) => a.key.localeCompare(b.key));

  return sorted.map((point) => ({
    ...point,
    revenue: roundMoney(point.revenue),
    ticket: point.orders > 0 ? roundMoney(point.revenue / point.orders) : 0,
  }));
};

export const buildSalesAnalytics = (sales: Sale[]): SalesAnalyticsSnapshot => {
  const productMap = new Map<string, MutableProductStats>();
  const dayMap = new Map<string, MutableDayStats>();
  const orderMap = new Map<string, MutableOrderStats>();
  const weekdaySales = Array<number>(7).fill(0);
  const weekdayRevenue = Array<number>(7).fill(0);
  const hourSales = Array<number>(24).fill(0);
  const hourRevenue = Array<number>(24).fill(0);
  const weekdayHourSales = Array.from({ length: 7 }, () => Array<number>(24).fill(0));
  const weekdayHourRevenue = Array.from({ length: 7 }, () => Array<number>(24).fill(0));
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
    const weekKey = toWeekKey(date);
    const monthKey = toMonthKey(date);

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
    weekdayHourSales[weekdayIndex][hour] += 1;
    weekdayHourRevenue[weekdayIndex][hour] += saleTotal;

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

    const orderKey = getSaleGroupKey(sale);
    const currentOrder = orderMap.get(orderKey);

    if (!currentOrder) {
      orderMap.set(orderKey, {
        key: orderKey,
        dayKey,
        dayLabel: toDayLabel(date),
        weekKey,
        weekLabel: toWeekLabel(date),
        monthKey,
        monthLabel: toMonthLabel(date),
        channel: toChannelKey(sale.saleOrigin),
        fallbackRevenue: saleTotal,
        appRevenue: Number.isFinite(Number(sale.appOrderTotal)) && Number(sale.appOrderTotal) > 0
          ? Number(sale.appOrderTotal)
          : null,
        timestamp: date.getTime(),
      });
    } else {
      currentOrder.fallbackRevenue += saleTotal;
      if (currentOrder.channel === 'LOCAL') {
        currentOrder.channel = toChannelKey(sale.saleOrigin);
      }
      const appRevenue = Number(sale.appOrderTotal);
      if (Number.isFinite(appRevenue) && appRevenue > 0) {
        currentOrder.appRevenue = appRevenue;
      }
      if (date.getTime() < currentOrder.timestamp) {
        currentOrder.timestamp = date.getTime();
        currentOrder.dayKey = dayKey;
        currentOrder.dayLabel = toDayLabel(date);
        currentOrder.weekKey = weekKey;
        currentOrder.weekLabel = toWeekLabel(date);
        currentOrder.monthKey = monthKey;
        currentOrder.monthLabel = toMonthLabel(date);
      }
    }
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
  const dayTimeline = [...dayMap.values()].sort((a, b) => a.dayKey.localeCompare(b.dayKey));

  const bestDay = dayRanking[0] || {
    dayLabel: '-',
    sales: 0,
  };

  const weakestDay = dayRanking.length > 0 ? dayRanking[dayRanking.length - 1] : bestDay;

  const bestWeekdayIndex = findPeakIndex(weekdaySales);
  const weakestWeekdayIndex = findWeakestActiveIndex(weekdaySales);
  const peakHourIndex = findPeakIndex(hourSales);
  const weakestHourIndex = findWeakestActiveIndex(hourSales);

  const orders: OrderStats[] = [...orderMap.values()]
    .map((order) => ({
      key: order.key,
      dayKey: order.dayKey,
      dayLabel: order.dayLabel,
      weekKey: order.weekKey,
      weekLabel: order.weekLabel,
      monthKey: order.monthKey,
      monthLabel: order.monthLabel,
      channel: order.channel,
      revenue: roundMoney(order.appRevenue ?? order.fallbackRevenue),
      timestamp: order.timestamp,
    }))
    .sort((a, b) => a.timestamp - b.timestamp);

  const ticketByDayRaw = aggregateTicketSeries(orders, 'day');
  const ticketByWeekRaw = aggregateTicketSeries(orders, 'week');
  const ticketByMonthRaw = aggregateTicketSeries(orders, 'month');

  const ticketByDay = ticketByDayRaw.slice(-30);
  const ticketByWeek = ticketByWeekRaw.slice(-16);
  const ticketByMonth = ticketByMonthRaw.slice(-12);

  const channelEfficiency = CHANNEL_META.map<SalesAnalyticsChannelEfficiencyPoint>((channel) => ({
    key: channel.key,
    label: channel.label,
    orders: 0,
    revenue: 0,
    ticket: 0,
  }));

  orders.forEach((order) => {
    const channel = channelEfficiency.find((entry) => entry.key === order.channel);
    if (!channel) return;
    channel.orders += 1;
    channel.revenue = roundMoney(channel.revenue + order.revenue);
  });

  channelEfficiency.forEach((channel) => {
    channel.ticket = channel.orders > 0 ? roundMoney(channel.revenue / channel.orders) : 0;
  });

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

  const heatmap = WEEKDAY_META.map<SalesAnalyticsHeatmapRow>((weekdayMeta) => {
    const hours = HOUR_INDICES.map((hour) => ({
      hour,
      label: toHourLabel(hour),
      sales: weekdayHourSales[weekdayMeta.index][hour],
      revenue: roundMoney(weekdayHourRevenue[weekdayMeta.index][hour]),
    }));

    return {
      weekdayIndex: weekdayMeta.index,
      weekdayLabel: weekdayMeta.label,
      weekdayShortLabel: weekdayMeta.shortLabel,
      totalSales: hours.reduce((sum, cell) => sum + cell.sales, 0),
      hours,
    };
  });

  let accumulatedSales = 0;
  let accumulatedRevenue = 0;
  const cumulativeDaily = HOUR_INDICES.map((hour) => {
    accumulatedSales += hourSales[hour];
    accumulatedRevenue += hourRevenue[hour];
    return {
      hour,
      label: toHourLabel(hour),
      sales: hourSales[hour],
      revenue: roundMoney(hourRevenue[hour]),
      accumulatedSales,
      accumulatedRevenue: roundMoney(accumulatedRevenue),
    };
  });

  const activeHourSlots = hourSales
    .map((salesPerHour, hour) => ({ hour, sales: salesPerHour }))
    .filter((entry) => entry.sales > 0)
    .sort((a, b) => {
      if (a.sales !== b.sales) return a.sales - b.sales;
      return a.hour - b.hour;
    });

  const deadHours = activeHourSlots.slice(0, 3).map<SalesAnalyticsDeadHour>((entry) => ({
    hour: entry.hour,
    label: toHourLabel(entry.hour),
    sales: entry.sales,
  }));

  const topProduct = topProducts[0];
  const dependencyShare = totalRevenue > 0 && topProduct ? (topProduct.revenue / totalRevenue) * 100 : 0;

  const dailySalesSeries = dayTimeline.map((entry) => entry.sales);
  const dailyAverage = average(dailySalesSeries);
  const dailyStdDev = standardDeviation(dailySalesSeries);
  const variation = dailyAverage > 0 ? dailyStdDev / dailyAverage : 0;

  const dailyDirection: 'crescimento' | 'queda' | 'estavel' = (() => {
    if (dailySalesSeries.length < 4) return 'estavel';
    const middle = Math.floor(dailySalesSeries.length / 2);
    const firstAverage = average(dailySalesSeries.slice(0, middle));
    const secondAverage = average(dailySalesSeries.slice(middle));
    if (secondAverage > firstAverage * 1.08) return 'crescimento';
    if (secondAverage < firstAverage * 0.92) return 'queda';
    return 'estavel';
  })();

  const weeklyCurrent = ticketByWeekRaw[ticketByWeekRaw.length - 1];
  const weeklyPrevious = ticketByWeekRaw[ticketByWeekRaw.length - 2];
  const currentWeekRevenue = weeklyCurrent ? weeklyCurrent.revenue : 0;
  const previousWeekRevenue = weeklyPrevious ? weeklyPrevious.revenue : 0;
  const weeklyChangePercent =
    previousWeekRevenue > 0
      ? ((currentWeekRevenue - previousWeekRevenue) / previousWeekRevenue) * 100
      : currentWeekRevenue > 0
        ? 100
        : 0;

  const weeklyTrendStatus: 'crescimento' | 'queda' | 'estavel' =
    weeklyChangePercent > 8 ? 'crescimento' : weeklyChangePercent < -8 ? 'queda' : 'estavel';

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
      heatmap,
      cumulativeDaily,
      ticketByPeriod: {
        day: ticketByDay,
        week: ticketByWeek,
        month: ticketByMonth,
      },
      channelEfficiency,
    },
    topProducts,
    weekdayLeaders,
    dayRanking,
    dayTimeline,
    intelligence: {
      deadHours,
      productDependency: {
        productName: topProduct?.name || 'Sem produto',
        revenue: roundMoney(topProduct?.revenue || 0),
        sharePercent: Number(dependencyShare.toFixed(1)),
        isRisk: dependencyShare >= 50,
      },
      salesStability: {
        dailyAverage: Number(dailyAverage.toFixed(2)),
        dailyStdDev: Number(dailyStdDev.toFixed(2)),
        variation: Number((variation * 100).toFixed(1)),
        status: variation <= 0.18 ? 'estavel' : variation <= 0.35 ? 'moderada' : 'instavel',
        direction: dailyDirection,
      },
      weeklyTrend: {
        status: weeklyTrendStatus,
        changePercent: Number(weeklyChangePercent.toFixed(1)),
        currentWeekRevenue: roundMoney(currentWeekRevenue),
        previousWeekRevenue: roundMoney(previousWeekRevenue),
      },
    },
  };

  return snapshot;
};
