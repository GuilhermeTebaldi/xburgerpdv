import React, { useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { Product, Sale } from '../types';
import { APP_ORIGINS, buildAppChannelSummary } from '../utils/appChannelSummary';
import { DASHBOARD_CHART_COLORS, DASHBOARD_TOOLTIP_STYLE } from '../utils/chartTheme';
import { buildSalesAnalytics } from '../utils/salesAnalytics';

interface AdminSalesAnalyticsTabProps {
  sales: Sale[];
  products: Product[];
}

const CURRENCY_FORMATTER = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

const APP_ORIGIN_LABELS = {
  IFOOD: 'iFood',
  APP99: '99',
  KEETA: 'Keeta',
} as const;

const TICKET_PERIOD_OPTIONS = [
  { key: 'day', label: 'Dia' },
  { key: 'week', label: 'Semana' },
  { key: 'month', label: 'Mes' },
] as const;

type TicketPeriod = (typeof TICKET_PERIOD_OPTIONS)[number]['key'];
type EfficiencyMetric = 'orders' | 'revenue' | 'ticket';

const truncateLabel = (value: string, max = 18): string =>
  value.length > max ? `${value.slice(0, Math.max(0, max - 3))}...` : value;

const formatCurrency = (value: number): string => CURRENCY_FORMATTER.format(value || 0);
const formatInt = (value: number): string => `${Math.round(value || 0)}`;
const formatPercent = (value: number): string => `${(Number.isFinite(value) ? value : 0).toFixed(1)}%`;

const axisTick = { fill: DASHBOARD_CHART_COLORS.axis, fontSize: 11, fontWeight: 700 };

const resolveProductImage = (
  productKey: string,
  productId: string | undefined,
  productsById: Map<string, string>,
  productsByKey: Map<string, string>
): string | null => {
  if (productId && productsById.has(productId)) {
    return productsById.get(productId) || null;
  }
  if (productsByKey.has(productKey)) {
    return productsByKey.get(productKey) || null;
  }
  return null;
};

const getHeatmapColor = (sales: number, maxSales: number): string => {
  if (maxSales <= 0 || sales <= 0) return '#f1f5f9';
  const intensity = Math.min(1, sales / maxSales);
  const alpha = 0.2 + intensity * 0.8;
  return `rgba(37, 99, 235, ${alpha.toFixed(2)})`;
};

const SectionHeader = ({ title, subtitle }: { title: string; subtitle: string }) => (
  <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2 mb-5">
    <div>
      <h4 className="text-sm font-black text-slate-900 uppercase tracking-widest">{title}</h4>
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mt-1">{subtitle}</p>
    </div>
  </div>
);

const StatCard = ({
  title,
  value,
  helper,
  tone = 'slate',
}: {
  title: string;
  value: string;
  helper?: string;
  tone?: 'blue' | 'green' | 'amber' | 'slate' | 'red';
}) => {
  const toneByStyle = {
    blue: 'from-blue-500 to-blue-600 text-white border-blue-300',
    green: 'from-emerald-500 to-emerald-600 text-white border-emerald-300',
    amber: 'from-amber-500 to-amber-600 text-white border-amber-300',
    slate: 'from-slate-700 to-slate-900 text-white border-slate-400',
    red: 'from-red-500 to-rose-600 text-white border-red-300',
  }[tone];

  return (
    <div className={`rounded-3xl border bg-gradient-to-br p-5 shadow-sm ${toneByStyle}`}>
      <p className="text-[10px] font-black uppercase tracking-widest opacity-80">{title}</p>
      <p className="mt-2 text-3xl font-black tracking-tight">{value}</p>
      {helper ? <p className="mt-2 text-[10px] font-black uppercase tracking-wider opacity-80">{helper}</p> : null}
    </div>
  );
};

const AdminSalesAnalyticsTab: React.FC<AdminSalesAnalyticsTabProps> = ({ sales, products }) => {
  const analytics = useMemo(() => buildSalesAnalytics(sales), [sales]);
  const appChannelSummary = useMemo(() => buildAppChannelSummary(sales), [sales]);
  const [selectedProductKey, setSelectedProductKey] = useState<string | null>(null);
  const [ticketPeriod, setTicketPeriod] = useState<TicketPeriod>('day');
  const [efficiencyMetric, setEfficiencyMetric] = useState<EfficiencyMetric>('revenue');

  const productsById = useMemo(() => {
    const map = new Map<string, string>();
    products.forEach((product) => {
      if (!product.imageUrl) return;
      map.set(product.id, product.imageUrl);
    });
    return map;
  }, [products]);

  const productsByKey = useMemo(() => {
    const map = new Map<string, string>();
    products.forEach((product) => {
      if (!product.imageUrl) return;
      map.set(product.name.trim().toLocaleLowerCase('pt-BR'), product.imageUrl);
    });
    return map;
  }, [products]);

  useEffect(() => {
    if (analytics.topProducts.length === 0) {
      if (selectedProductKey !== null) {
        setSelectedProductKey(null);
      }
      return;
    }

    const stillExists = selectedProductKey
      ? analytics.topProducts.some((product) => product.key === selectedProductKey)
      : false;

    if (!stillExists) {
      setSelectedProductKey(analytics.topProducts[0].key);
    }
  }, [analytics.topProducts, selectedProductKey]);

  const selectedProduct =
    analytics.topProducts.find((product) => product.key === selectedProductKey) ||
    analytics.topProducts[0];

  const selectedProductImage = selectedProduct
    ? resolveProductImage(selectedProduct.key, selectedProduct.productId, productsById, productsByKey)
    : null;

  const heatmapMaxSales = useMemo(() => {
    let maxSales = 0;
    analytics.charts.heatmap.forEach((row) => {
      row.hours.forEach((cell) => {
        if (cell.sales > maxSales) {
          maxSales = cell.sales;
        }
      });
    });
    return maxSales;
  }, [analytics.charts.heatmap]);

  const ticketSeries = analytics.charts.ticketByPeriod[ticketPeriod];
  const productRankingData = analytics.topProducts.slice(0, 12);
  const efficiencyData = analytics.charts.channelEfficiency.map((entry) => ({
    ...entry,
    color:
      entry.key === 'IFOOD'
        ? DASHBOARD_CHART_COLORS.ifood
        : entry.key === 'APP99'
          ? DASHBOARD_CHART_COLORS.app99
          : entry.key === 'KEETA'
            ? DASHBOARD_CHART_COLORS.keeta
            : DASHBOARD_CHART_COLORS.local,
  }));
  const efficiencyMetricLabel =
    efficiencyMetric === 'orders'
      ? 'Pedidos'
      : efficiencyMetric === 'ticket'
        ? 'Ticket medio'
        : 'Faturamento';

  if (analytics.totals.sales === 0) {
    return (
      <div className="qb-admin-panel qb-admin-analytics bg-gradient-to-br from-slate-100 via-white to-cyan-50 p-8 rounded-[40px] border-2 border-slate-200 min-h-[600px]">
        <div className="qb-admin-panel-head flex items-center gap-3 mb-8">
          <div className="bg-gradient-to-br from-emerald-500 to-cyan-600 p-3 rounded-2xl shadow-lg">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="white"
              strokeWidth="2"
            >
              <path d="M3 3v18h18" />
              <path d="m7 15 3-3 3 3 5-5" />
            </svg>
          </div>
          <div>
            <h3 className="text-2xl font-black text-slate-800 uppercase tracking-tighter">
              Inteligencia de Vendas
            </h3>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
              Aguardando dados de vendas para gerar os indicadores.
            </p>
          </div>
        </div>

        <div className="bg-white rounded-3xl border border-slate-200 py-24 text-center">
          <p className="text-xs font-black uppercase tracking-widest text-slate-400">
            Sem vendas historicas para analisar.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="qb-admin-panel qb-admin-analytics bg-gradient-to-br from-slate-100 via-white to-cyan-50 p-6 md:p-8 rounded-[40px] border-2 border-slate-200 min-h-[600px] space-y-6">
      <div className="qb-admin-panel-head flex items-center gap-3">
        <div className="bg-gradient-to-br from-emerald-500 to-cyan-600 p-3 rounded-2xl shadow-lg">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="white"
            strokeWidth="2"
          >
            <path d="M3 3v18h18" />
            <path d="m7 15 3-3 3 3 5-5" />
          </svg>
        </div>
        <div>
          <h3 className="text-2xl font-black text-slate-800 uppercase tracking-tighter">
            Inteligencia de Vendas
          </h3>
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1">
            Painel completo para leitura rapida da operacao por periodo, produto, horario e canal.
          </p>
        </div>
      </div>

      <div className="bg-white rounded-3xl border border-slate-200 p-5 md:p-6">
        <SectionHeader
          title="Bloco 1 · Indicadores Rapidos"
          subtitle="Resumo executivo com volume, faturamento, dias e horarios extremos"
        />
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          <StatCard
            title="Vendas Analisadas"
            value={formatInt(analytics.totals.sales)}
            helper={`${analytics.totals.activeDays} dias ativos`}
            tone="blue"
          />
          <StatCard
            title="Faturamento Historico"
            value={formatCurrency(analytics.totals.revenue)}
            helper={`${analytics.totals.distinctProducts} produtos vendidos`}
            tone="green"
          />
          <StatCard
            title="Melhor Dia"
            value={analytics.peaks.bestWeekdayLabel}
            helper={`${formatInt(analytics.peaks.bestWeekdaySales)} vendas`}
            tone="amber"
          />
          <StatCard
            title="Pior Dia"
            value={analytics.peaks.weakestWeekdayLabel}
            helper={`${formatInt(analytics.peaks.weakestWeekdaySales)} vendas`}
            tone="slate"
          />
          <StatCard
            title="Horario Pico"
            value={analytics.peaks.peakHourLabel}
            helper={`${formatInt(analytics.peaks.peakHourSales)} vendas`}
            tone="blue"
          />
          <StatCard
            title="Horario Menor"
            value={analytics.peaks.weakestHourLabel}
            helper={`${formatInt(analytics.peaks.weakestHourSales)} vendas`}
            tone="red"
          />
        </div>
      </div>

      <div className="bg-white rounded-3xl border border-slate-200 p-5 md:p-6 space-y-5">
        <SectionHeader
          title="Bloco 2 · Comportamento de Vendas"
          subtitle="Dia da semana, horario, heatmap e curva acumulada para detectar padroes"
        />
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <div className="bg-slate-50 rounded-2xl border border-slate-200 p-4">
            <h5 className="text-[11px] font-black text-slate-800 uppercase tracking-widest mb-3">
              Vendas por Dia da Semana
            </h5>
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={analytics.charts.weekday}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={DASHBOARD_CHART_COLORS.grid} />
                  <XAxis dataKey="label" tick={axisTick} />
                  <YAxis allowDecimals={false} tick={axisTick} />
                  <Tooltip
                    contentStyle={DASHBOARD_TOOLTIP_STYLE}
                    formatter={(value: number, key: string) =>
                      key === 'revenue' ? formatCurrency(value) : formatInt(value)
                    }
                    labelFormatter={(label) => `Dia: ${label}`}
                  />
                  <Bar dataKey="sales" name="vendas" fill={DASHBOARD_CHART_COLORS.revenue} radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-slate-50 rounded-2xl border border-slate-200 p-4">
            <h5 className="text-[11px] font-black text-slate-800 uppercase tracking-widest mb-3">Vendas por Hora</h5>
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={analytics.charts.hourly}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={DASHBOARD_CHART_COLORS.grid} />
                  <XAxis
                    dataKey="label"
                    interval={1}
                    tickFormatter={(value: string) => value.slice(0, 2)}
                    tick={{ ...axisTick, fontSize: 10 }}
                  />
                  <YAxis allowDecimals={false} tick={axisTick} />
                  <Tooltip
                    contentStyle={DASHBOARD_TOOLTIP_STYLE}
                    formatter={(value: number, key: string) =>
                      key === 'revenue' ? formatCurrency(value) : formatInt(value)
                    }
                    labelFormatter={(label) => `Hora: ${label}`}
                  />
                  <Line
                    type="monotone"
                    dataKey="sales"
                    name="vendas"
                    stroke={DASHBOARD_CHART_COLORS.estimate}
                    strokeWidth={3}
                    dot={false}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        <div className="bg-slate-50 rounded-2xl border border-slate-200 p-4">
          <div className="flex items-center justify-between gap-3 mb-3">
            <h5 className="text-[11px] font-black text-slate-800 uppercase tracking-widest">
              Heatmap por Dia e Hora
            </h5>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
              Cor = intensidade de vendas
            </p>
          </div>
          <div className="overflow-x-auto">
            <div className="min-w-[900px]">
              <div
                className="grid gap-1 mb-1"
                style={{
                  gridTemplateColumns: '80px repeat(24, minmax(28px, 1fr)) 70px',
                }}
              >
                <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 px-1 py-1">Dia</div>
                {analytics.charts.heatmap[0]?.hours.map((hour) => (
                  <div
                    key={`header-${hour.hour}`}
                    className="text-[9px] font-black uppercase text-slate-400 text-center py-1"
                  >
                    {hour.label.slice(0, 2)}
                  </div>
                ))}
                <div className="text-[9px] font-black uppercase text-slate-400 text-right py-1">Total</div>
              </div>

              <div className="space-y-1">
                {analytics.charts.heatmap.map((row) => (
                  <div
                    key={row.weekdayIndex}
                    className="grid gap-1"
                    style={{
                      gridTemplateColumns: '80px repeat(24, minmax(28px, 1fr)) 70px',
                    }}
                  >
                    <div className="text-[10px] font-black uppercase text-slate-700 px-1 py-2">{row.weekdayShortLabel}</div>
                    {row.hours.map((cell) => (
                      <div
                        key={`${row.weekdayIndex}-${cell.hour}`}
                        className="h-7 rounded-lg border border-slate-200/70"
                        style={{ backgroundColor: getHeatmapColor(cell.sales, heatmapMaxSales) }}
                        title={`${row.weekdayLabel} ${cell.label}: ${cell.sales} vendas`}
                      />
                    ))}
                    <div className="text-[10px] font-black text-slate-700 text-right py-2">{row.totalSales}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <div className="bg-slate-50 rounded-2xl border border-slate-200 p-4">
            <h5 className="text-[11px] font-black text-slate-800 uppercase tracking-widest mb-3">
              Curva Acumulada do Dia
            </h5>
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={analytics.charts.cumulativeDaily}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={DASHBOARD_CHART_COLORS.grid} />
                  <XAxis
                    dataKey="label"
                    interval={1}
                    tickFormatter={(value: string) => value.slice(0, 2)}
                    tick={{ ...axisTick, fontSize: 10 }}
                  />
                  <YAxis yAxisId="sales" allowDecimals={false} tick={axisTick} />
                  <YAxis
                    yAxisId="revenue"
                    orientation="right"
                    tick={axisTick}
                    tickFormatter={(value: number) => `R$${Math.round(value)}`}
                  />
                  <Tooltip
                    contentStyle={DASHBOARD_TOOLTIP_STYLE}
                    formatter={(value: number, key: string) =>
                      key === 'accumulatedRevenue' ? formatCurrency(value) : formatInt(value)
                    }
                    labelFormatter={(label) => `Hora: ${label}`}
                  />
                  <Legend />
                  <Line
                    yAxisId="sales"
                    type="monotone"
                    dataKey="accumulatedSales"
                    name="Vendas acumuladas"
                    stroke={DASHBOARD_CHART_COLORS.revenue}
                    strokeWidth={3}
                    dot={false}
                  />
                  <Line
                    yAxisId="revenue"
                    type="monotone"
                    dataKey="accumulatedRevenue"
                    name="Faturamento acumulado"
                    stroke={DASHBOARD_CHART_COLORS.profit}
                    strokeWidth={3}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-slate-50 rounded-2xl border border-slate-200 p-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
              <h5 className="text-[11px] font-black text-slate-800 uppercase tracking-widest">
                Ticket Medio por Periodo
              </h5>
              <div className="bg-white border border-slate-200 rounded-xl p-1 inline-flex gap-1">
                {TICKET_PERIOD_OPTIONS.map((option) => (
                  <button
                    key={option.key}
                    onClick={() => setTicketPeriod(option.key)}
                    className={`qb-btn-touch px-2.5 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                      ticketPeriod === option.key
                        ? 'bg-slate-900 text-white'
                        : 'text-slate-500 hover:bg-slate-100'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={ticketSeries}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={DASHBOARD_CHART_COLORS.grid} />
                  <XAxis dataKey="label" tick={{ ...axisTick, fontSize: 10 }} />
                  <YAxis
                    tick={axisTick}
                    tickFormatter={(value: number) => `R$${Math.round(value)}`}
                  />
                  <Tooltip
                    contentStyle={DASHBOARD_TOOLTIP_STYLE}
                    formatter={(value: number, key: string) => {
                      if (key === 'orders') return formatInt(value);
                      return formatCurrency(value);
                    }}
                    labelFormatter={(label) => `Periodo: ${label}`}
                  />
                  <Line
                    type="monotone"
                    dataKey="ticket"
                    name="Ticket medio"
                    stroke={DASHBOARD_CHART_COLORS.estimate}
                    strokeWidth={3}
                    dot={{ r: 3 }}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {analytics.momentsOfDay.map((moment) => (
            <div key={moment.key} className="bg-white border border-slate-200 rounded-2xl p-3">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">{moment.label}</p>
              <p className="text-xl font-black text-slate-900">{moment.sales}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-3xl border border-slate-200 p-5 md:p-6 space-y-5">
        <SectionHeader
          title="Bloco 3 · Produtos"
          subtitle="Ranking por quantidade, lider por dia e leitura detalhada do item selecionado"
        />
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <div className="bg-slate-50 rounded-2xl border border-slate-200 p-4">
            <h5 className="text-[11px] font-black text-slate-800 uppercase tracking-widest mb-3">
              Ranking de Produtos (Qtd + Receita)
            </h5>
            <div className="h-[330px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={productRankingData}
                  layout="vertical"
                  margin={{ top: 4, right: 12, bottom: 4, left: 10 }}
                >
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                  <XAxis type="number" allowDecimals={false} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={130}
                    tickFormatter={(value) => truncateLabel(value)}
                    tick={axisTick}
                  />
                  <Tooltip
                    contentStyle={DASHBOARD_TOOLTIP_STYLE}
                    formatter={(value: number, key: string) =>
                      key === 'revenue' ? formatCurrency(value) : formatInt(value)
                    }
                    labelFormatter={(label) => `Produto: ${label}`}
                  />
                  <Bar dataKey="sales" name="vendas" radius={[0, 8, 8, 0]}>
                    {productRankingData.map((entry) => (
                      <Cell
                        key={entry.key}
                        fill={DASHBOARD_CHART_COLORS.revenue}
                        fillOpacity={!selectedProduct || selectedProduct.key === entry.key ? 1 : 0.35}
                        stroke={selectedProduct?.key === entry.key ? DASHBOARD_CHART_COLORS.axisStrong : 'transparent'}
                        strokeWidth={selectedProduct?.key === entry.key ? 1.5 : 0}
                        className="cursor-pointer"
                        onClick={() => setSelectedProductKey(entry.key)}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-slate-50 rounded-2xl border border-slate-200 p-4">
            <h5 className="text-[11px] font-black text-slate-800 uppercase tracking-widest mb-3">
              Produto Selecionado
            </h5>
            {selectedProduct ? (
              <div className="grid grid-cols-1 md:grid-cols-[140px_1fr] gap-4">
                <div className="bg-white border border-slate-200 rounded-2xl p-3 flex items-center justify-center">
                  {selectedProductImage ? (
                    <img
                      src={selectedProductImage}
                      alt={selectedProduct.name}
                      className="w-full h-[120px] object-cover rounded-xl"
                    />
                  ) : (
                    <div className="w-full h-[120px] rounded-xl bg-slate-200 text-slate-500 flex items-center justify-center text-[10px] font-black uppercase tracking-widest">
                      Sem imagem
                    </div>
                  )}
                </div>
                <div className="space-y-3">
                  <div>
                    <p className="text-xs font-black text-slate-800 uppercase">{selectedProduct.name}</p>
                    <p className="text-[10px] font-bold text-slate-500 uppercase">
                      {selectedProduct.sales} vendas | {formatCurrency(selectedProduct.revenue)}
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-blue-50 border border-blue-100 rounded-xl px-3 py-2">
                      <p className="text-[10px] font-black uppercase tracking-wider text-blue-700">Melhor Dia</p>
                      <p className="text-xs font-black text-blue-900">{selectedProduct.bestWeekdayLabel}</p>
                    </div>
                    <div className="bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2">
                      <p className="text-[10px] font-black uppercase tracking-wider text-emerald-700">
                        Melhor Momento
                      </p>
                      <p className="text-xs font-black text-emerald-900">{selectedProduct.bestMomentLabel}</p>
                    </div>
                  </div>
                  <div className="bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
                    <p className="text-[10px] font-black uppercase tracking-wider text-amber-700">
                      Melhor Horario
                    </p>
                    <p className="text-xs font-black text-amber-900">
                      {selectedProduct.bestHourLabel} ({selectedProduct.bestHourSales} vendas)
                    </p>
                  </div>
                  <div className="bg-white border border-slate-200 rounded-xl p-3">
                    <p className="text-[10px] font-black uppercase tracking-wider text-slate-500 mb-2">
                      Horarios de maior saida
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {selectedProduct.topHourSlots.length > 0 ? (
                        selectedProduct.topHourSlots.map((slot) => (
                          <div key={`${selectedProduct.key}-${slot.label}`} className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                            <p className="text-[10px] font-black text-slate-700">{slot.label}</p>
                            <p className="text-[10px] font-bold text-slate-500 uppercase">{slot.sales} vendas</p>
                          </div>
                        ))
                      ) : (
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                          Sem horario dominante
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-white border border-slate-200 rounded-2xl p-5 text-[10px] font-black uppercase tracking-widest text-slate-400">
                Nenhum produto com historico.
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <div className="bg-slate-50 rounded-2xl border border-slate-200 p-4">
            <h5 className="text-[11px] font-black text-slate-800 uppercase tracking-widest mb-3">
              Produto Lider por Dia da Semana
            </h5>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[420px] text-left">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="px-2 py-2 text-[10px] font-black uppercase text-slate-400">Dia</th>
                    <th className="px-2 py-2 text-[10px] font-black uppercase text-slate-400">Produto lider</th>
                    <th className="px-2 py-2 text-[10px] font-black uppercase text-slate-400 text-right">Qtd</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {analytics.weekdayLeaders.map((entry) => (
                    <tr key={entry.weekdayLabel}>
                      <td className="px-2 py-3 text-xs font-black text-slate-700">{entry.weekdayLabel}</td>
                      <td className="px-2 py-3 text-xs font-bold text-slate-800 uppercase">{entry.productName}</td>
                      <td className="px-2 py-3 text-xs font-black text-slate-700 text-right">{entry.sales}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-slate-50 rounded-2xl border border-slate-200 p-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
              <div className="bg-green-50 border border-green-100 rounded-2xl p-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-green-600">Melhor Dia</p>
                <p className="text-xl font-black text-green-700 mt-1">{analytics.peaks.bestDayLabel}</p>
                <p className="text-[10px] font-bold uppercase tracking-wider text-green-700">
                  {analytics.peaks.bestDaySales} vendas
                </p>
              </div>
              <div className="bg-rose-50 border border-rose-100 rounded-2xl p-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-rose-600">Pior Dia</p>
                <p className="text-xl font-black text-rose-700 mt-1">{analytics.peaks.weakestDayLabel}</p>
                <p className="text-[10px] font-bold uppercase tracking-wider text-rose-700">
                  {analytics.peaks.weakestDaySales} vendas
                </p>
              </div>
            </div>
            <div className="space-y-2 max-h-[225px] overflow-y-auto pr-1 scrollbar-hide">
              {analytics.topProducts.slice(0, 10).map((product) => (
                <div key={product.name} className="flex items-center justify-between gap-2 bg-white border border-slate-200 rounded-2xl px-3 py-3">
                  <div className="min-w-0">
                    <p className="text-xs font-black text-slate-800 uppercase truncate">{product.name}</p>
                    <p className="text-[10px] font-bold text-slate-500 uppercase">
                      Melhor dia: {product.bestWeekdayLabel} ({product.bestWeekdaySales} vendas)
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-xs font-black text-slate-900">{product.sales} vendas</p>
                    <p className="text-[10px] font-bold text-green-700">{formatCurrency(product.revenue)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-3xl border border-slate-200 p-5 md:p-6 space-y-5">
        <SectionHeader
          title="Bloco 4 · Aplicativos e Canais"
          subtitle="Comparacao entre iFood, 99, Keeta e balcao com foco em eficiencia operacional"
        />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-2">
          <div className="bg-amber-50 border border-amber-100 rounded-2xl p-3">
            <p className="text-[10px] font-black uppercase tracking-wider text-amber-700">Faturamento Apps</p>
            <p className="text-xl font-black text-amber-800">{formatCurrency(appChannelSummary.totalRevenue)}</p>
          </div>
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3">
            <p className="text-[10px] font-black uppercase tracking-wider text-slate-600">Referencia Balcao</p>
            <p className="text-xl font-black text-slate-900">{formatCurrency(appChannelSummary.totalReference)}</p>
          </div>
          <div className="bg-blue-50 border border-blue-100 rounded-2xl p-3">
            <p className="text-[10px] font-black uppercase tracking-wider text-blue-700">Diferenca Apps</p>
            <p className={`text-xl font-black ${appChannelSummary.totalDelta >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
              {formatCurrency(appChannelSummary.totalDelta)}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {APP_ORIGINS.map((origin) => {
            const originSummary = appChannelSummary.byOrigin[origin];
            return (
              <div key={origin} className="bg-slate-50 border border-slate-200 rounded-2xl p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-black uppercase text-slate-800">{APP_ORIGIN_LABELS[origin]}</p>
                  <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                    Pedidos: {originSummary.orders}
                  </p>
                </div>
                <p className="text-xs font-black text-slate-700 mt-2">
                  Faturamento: {formatCurrency(originSummary.revenue)}
                </p>
                <p
                  className={`text-[10px] font-black uppercase tracking-wider mt-1 ${
                    originSummary.delta >= 0 ? 'text-emerald-700' : 'text-red-700'
                  }`}
                >
                  Diferenca: {formatCurrency(originSummary.delta)}
                </p>
              </div>
            );
          })}
        </div>

        <div className="bg-slate-50 rounded-2xl border border-slate-200 p-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
            <h5 className="text-[11px] font-black text-slate-800 uppercase tracking-widest">
              Eficiencia por Canal
            </h5>
            <div className="bg-white border border-slate-200 rounded-xl p-1 inline-flex gap-1">
              {[
                { key: 'orders' as const, label: 'Pedidos' },
                { key: 'revenue' as const, label: 'Faturamento' },
                { key: 'ticket' as const, label: 'Ticket medio' },
              ].map((option) => (
                <button
                  key={option.key}
                  onClick={() => setEfficiencyMetric(option.key)}
                  className={`qb-btn-touch px-2.5 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                    efficiencyMetric === option.key
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-500 hover:bg-slate-100'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={efficiencyData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={DASHBOARD_CHART_COLORS.grid} />
                <XAxis dataKey="label" tick={axisTick} />
                <YAxis
                  tick={axisTick}
                  tickFormatter={(value: number) =>
                    efficiencyMetric === 'orders' ? `${Math.round(value)}` : `R$${Math.round(value)}`
                  }
                />
                <Tooltip
                  contentStyle={DASHBOARD_TOOLTIP_STYLE}
                  formatter={(value: number, key: string) => {
                    if (key === 'orders') return formatInt(value);
                    return formatCurrency(value);
                  }}
                  labelFormatter={(label) => `Canal: ${label}`}
                />
                <Bar dataKey={efficiencyMetric} name={efficiencyMetricLabel} radius={[8, 8, 0, 0]}>
                  {efficiencyData.map((entry) => (
                    <Cell key={entry.key} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="overflow-x-auto mt-2">
            <table className="w-full min-w-[420px] text-left">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="px-2 py-2 text-[10px] font-black uppercase text-slate-400">Canal</th>
                  <th className="px-2 py-2 text-[10px] font-black uppercase text-slate-400 text-right">Pedidos</th>
                  <th className="px-2 py-2 text-[10px] font-black uppercase text-slate-400 text-right">Faturamento</th>
                  <th className="px-2 py-2 text-[10px] font-black uppercase text-slate-400 text-right">Ticket</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {efficiencyData.map((entry) => (
                  <tr key={entry.key}>
                    <td className="px-2 py-3 text-xs font-black text-slate-700">{entry.label}</td>
                    <td className="px-2 py-3 text-xs font-black text-slate-700 text-right">{entry.orders}</td>
                    <td className="px-2 py-3 text-xs font-black text-slate-900 text-right">{formatCurrency(entry.revenue)}</td>
                    <td className="px-2 py-3 text-xs font-black text-slate-900 text-right">{formatCurrency(entry.ticket)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-3xl border border-slate-200 p-5 md:p-6 space-y-5">
        <SectionHeader
          title="Bloco 5 · Inteligencia Comercial"
          subtitle="Horas mortas, dependencia de produto, estabilidade e tendencia semanal automatizadas"
        />

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <div className="bg-slate-50 rounded-2xl border border-slate-200 p-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-3">Horas Mortas</p>
            {analytics.intelligence.deadHours.length > 0 ? (
              <div className="space-y-2">
                {analytics.intelligence.deadHours.map((hour) => (
                  <div
                    key={hour.hour}
                    className="bg-white border border-slate-200 rounded-xl px-3 py-2 flex items-center justify-between"
                  >
                    <p className="text-xs font-black text-slate-800">{hour.label}</p>
                    <p className="text-[10px] font-black uppercase tracking-widest text-rose-600">
                      {hour.sales} vendas
                    </p>
                  </div>
                ))}
                <p className="text-[10px] font-black uppercase tracking-widest text-amber-700">
                  Oportunidade: considerar promocao nos horarios destacados.
                </p>
              </div>
            ) : (
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                Ainda sem volume para detectar horarios fracos.
              </p>
            )}
          </div>

          <div className="bg-slate-50 rounded-2xl border border-slate-200 p-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-3">
              Dependencia de Produto
            </p>
            <p className="text-xl font-black text-slate-900">
              {analytics.intelligence.productDependency.productName}
            </p>
            <p className="text-sm font-black text-slate-700 mt-1">
              {formatPercent(analytics.intelligence.productDependency.sharePercent)} do faturamento
            </p>
            <p className="text-xs font-black text-slate-700 mt-1">
              {formatCurrency(analytics.intelligence.productDependency.revenue)}
            </p>
            <p
              className={`mt-3 text-[10px] font-black uppercase tracking-widest ${
                analytics.intelligence.productDependency.isRisk ? 'text-red-600' : 'text-emerald-700'
              }`}
            >
              {analytics.intelligence.productDependency.isRisk
                ? 'Risco: negocio muito dependente de um unico item.'
                : 'Distribuicao de produtos mais equilibrada.'}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <div className="bg-slate-50 rounded-2xl border border-slate-200 p-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-3">
              Estabilidade de Vendas
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white border border-slate-200 rounded-xl p-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Media diaria</p>
                <p className="text-lg font-black text-slate-900">{analytics.intelligence.salesStability.dailyAverage.toFixed(1)}</p>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Desvio padrao</p>
                <p className="text-lg font-black text-slate-900">{analytics.intelligence.salesStability.dailyStdDev.toFixed(1)}</p>
              </div>
            </div>
            <div className="mt-3 bg-white border border-slate-200 rounded-xl p-3">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                Variacao: {formatPercent(analytics.intelligence.salesStability.variation)}
              </p>
              <p className="text-sm font-black text-slate-900 mt-1">
                {analytics.intelligence.salesStability.status.toUpperCase()} • {analytics.intelligence.salesStability.direction.toUpperCase()}
              </p>
            </div>
          </div>

          <div className="bg-slate-50 rounded-2xl border border-slate-200 p-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-3">
              Tendencia Semanal
            </p>
            <div
              className={`rounded-xl border p-3 ${
                analytics.intelligence.weeklyTrend.status === 'crescimento'
                  ? 'bg-emerald-50 border-emerald-200'
                  : analytics.intelligence.weeklyTrend.status === 'queda'
                    ? 'bg-rose-50 border-rose-200'
                    : 'bg-slate-100 border-slate-200'
              }`}
            >
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Direcao</p>
              <p className="text-lg font-black text-slate-900 mt-1">
                {analytics.intelligence.weeklyTrend.status.toUpperCase()}
              </p>
              <p className="text-sm font-black text-slate-700">
                {formatPercent(analytics.intelligence.weeklyTrend.changePercent)}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 mt-3">
              <div className="bg-white border border-slate-200 rounded-xl p-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Semana atual</p>
                <p className="text-sm font-black text-slate-900">
                  {formatCurrency(analytics.intelligence.weeklyTrend.currentWeekRevenue)}
                </p>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Semana anterior</p>
                <p className="text-sm font-black text-slate-900">
                  {formatCurrency(analytics.intelligence.weeklyTrend.previousWeekRevenue)}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-slate-50 rounded-2xl border border-slate-200 p-4">
          <h5 className="text-[11px] font-black text-slate-800 uppercase tracking-widest mb-3">
            Historico de Dias (Top 10 por volume)
          </h5>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] text-left">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="px-2 py-2 text-[10px] font-black uppercase text-slate-400">Dia</th>
                  <th className="px-2 py-2 text-[10px] font-black uppercase text-slate-400 text-right">Vendas</th>
                  <th className="px-2 py-2 text-[10px] font-black uppercase text-slate-400 text-right">Faturamento</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {analytics.dayRanking.slice(0, 10).map((entry) => (
                  <tr key={entry.dayKey}>
                    <td className="px-2 py-3 text-xs font-black text-slate-700">{entry.dayLabel}</td>
                    <td className="px-2 py-3 text-xs font-black text-slate-700 text-right">{entry.sales}</td>
                    <td className="px-2 py-3 text-xs font-black text-slate-900 text-right">{formatCurrency(entry.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminSalesAnalyticsTab;
