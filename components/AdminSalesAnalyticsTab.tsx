import React, { useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { Product, Sale } from '../types';
import { APP_ORIGINS, buildAppChannelSummary } from '../utils/appChannelSummary';
import { buildSalesAnalytics } from '../utils/salesAnalytics';

interface AdminSalesAnalyticsTabProps {
  sales: Sale[];
  products: Product[];
}

const CURRENCY_FORMATTER = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

const COLORS = ['#2563eb', '#0891b2', '#14b8a6', '#16a34a', '#eab308', '#f97316', '#ef4444'];
const APP_ORIGIN_LABELS = {
  IFOOD: 'iFood',
  APP99: '99',
  KEETA: 'Keeta',
} as const;

const truncateLabel = (value: string, max = 18): string =>
  value.length > max ? `${value.slice(0, Math.max(0, max - 3))}...` : value;

const formatCurrency = (value: number): string => CURRENCY_FORMATTER.format(value || 0);

const formatInt = (value: number): string => `${Math.round(value || 0)}`;

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

const StatCard = ({
  title,
  value,
  helper,
  tone = 'slate',
}: {
  title: string;
  value: string;
  helper?: string;
  tone?: 'blue' | 'green' | 'amber' | 'slate';
}) => {
  const toneByStyle = {
    blue: 'bg-blue-50 border-blue-100 text-blue-700',
    green: 'bg-green-50 border-green-100 text-green-700',
    amber: 'bg-amber-50 border-amber-100 text-amber-700',
    slate: 'bg-slate-50 border-slate-100 text-slate-700',
  }[tone];

  return (
    <div className={`rounded-3xl border p-5 ${toneByStyle}`}>
      <p className="text-[10px] font-black uppercase tracking-widest opacity-75">{title}</p>
      <p className="mt-1 text-3xl font-black">{value}</p>
      {helper ? <p className="mt-1 text-[10px] font-bold uppercase tracking-wider opacity-70">{helper}</p> : null}
    </div>
  );
};

const AdminSalesAnalyticsTab: React.FC<AdminSalesAnalyticsTabProps> = ({ sales, products }) => {
  const analytics = useMemo(() => buildSalesAnalytics(sales), [sales]);
  const appChannelSummary = useMemo(() => buildAppChannelSummary(sales), [sales]);
  const [selectedProductKey, setSelectedProductKey] = useState<string | null>(null);

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

  if (analytics.totals.sales === 0) {
    return (
      <div className="qb-admin-panel qb-admin-analytics bg-slate-100 p-8 rounded-[40px] border-2 border-slate-200 min-h-[600px]">
        <div className="qb-admin-panel-head flex items-center gap-3 mb-8">
          <div className="bg-emerald-600 p-3 rounded-2xl shadow-lg">
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
    <div className="qb-admin-panel qb-admin-analytics bg-slate-100 p-8 rounded-[40px] border-2 border-slate-200 min-h-[600px] space-y-6">
      <div className="qb-admin-panel-head flex items-center gap-3">
        <div className="bg-emerald-600 p-3 rounded-2xl shadow-lg">
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
            Historico por produto, dia da semana, hora e dias com melhor/menor saida.
          </p>
        </div>
      </div>

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
          title="Dia Mais Forte"
          value={analytics.peaks.bestWeekdayLabel}
          helper={`${formatInt(analytics.peaks.bestWeekdaySales)} vendas`}
          tone="amber"
        />
        <StatCard
          title="Dia Mais Fraco"
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
          tone="slate"
        />
      </div>

      <div className="bg-white rounded-3xl border border-slate-200 p-6">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div>
            <h4 className="text-sm font-black text-slate-900 uppercase tracking-widest">Canais de App</h4>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mt-1">
              Indicadores de iFood, 99 e Keeta no período analisado
            </p>
          </div>
          <div className="bg-slate-100 border border-slate-200 rounded-xl px-3 py-2">
            <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">Pedidos App</p>
            <p className="text-lg font-black text-slate-900">{appChannelSummary.totalOrders}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
          <div className="bg-amber-50 border border-amber-100 rounded-2xl p-3">
            <p className="text-[10px] font-black uppercase tracking-wider text-amber-700">Faturamento Apps</p>
            <p className="text-xl font-black text-amber-800">{formatCurrency(appChannelSummary.totalRevenue)}</p>
          </div>
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3">
            <p className="text-[10px] font-black uppercase tracking-wider text-slate-600">Referência Balcão</p>
            <p className="text-xl font-black text-slate-900">{formatCurrency(appChannelSummary.totalReference)}</p>
          </div>
          <div className="bg-blue-50 border border-blue-100 rounded-2xl p-3">
            <p className="text-[10px] font-black uppercase tracking-wider text-blue-700">Diferença Apps</p>
            <p
              className={`text-xl font-black ${
                appChannelSummary.totalDelta >= 0 ? 'text-emerald-700' : 'text-red-700'
              }`}
            >
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
                  Diferença: {formatCurrency(originSummary.delta)}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="bg-white rounded-3xl border border-slate-200 p-6">
          <h4 className="text-sm font-black text-slate-900 uppercase tracking-widest mb-4">
            Vendas por Dia da Semana
          </h4>
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={analytics.charts.weekday}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="label" tick={{ fill: '#475569', fontSize: 11, fontWeight: 700 }} />
                <YAxis allowDecimals={false} tick={{ fill: '#64748b', fontSize: 11, fontWeight: 700 }} />
                <Tooltip
                  formatter={(value: number, key: string) =>
                    key === 'revenue' ? formatCurrency(value) : formatInt(value)
                  }
                  labelFormatter={(label) => `Dia: ${label}`}
                />
                <Bar dataKey="sales" name="vendas" radius={[8, 8, 0, 0]}>
                  {analytics.charts.weekday.map((entry, index) => (
                    <Cell
                      key={entry.label}
                      fill={COLORS[index % COLORS.length]}
                      fillOpacity={entry.sales > 0 ? 1 : 0.35}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white rounded-3xl border border-slate-200 p-6">
          <h4 className="text-sm font-black text-slate-900 uppercase tracking-widest mb-4">
            Vendas por Hora
          </h4>
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={analytics.charts.hourly}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis
                  dataKey="label"
                  interval={1}
                  tickFormatter={(value: string) => value.slice(0, 2)}
                  tick={{ fill: '#475569', fontSize: 10, fontWeight: 700 }}
                />
                <YAxis allowDecimals={false} tick={{ fill: '#64748b', fontSize: 11, fontWeight: 700 }} />
                <Tooltip
                  formatter={(value: number, key: string) =>
                    key === 'revenue' ? formatCurrency(value) : formatInt(value)
                  }
                  labelFormatter={(label) => `Hora: ${label}`}
                />
                <Line
                  type="monotone"
                  dataKey="sales"
                  name="vendas"
                  stroke="#0f766e"
                  strokeWidth={3}
                  dot={false}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="bg-white rounded-3xl border border-slate-200 p-6">
          <h4 className="text-sm font-black text-slate-900 uppercase tracking-widest mb-4">
            Produtos Mais Vendidos
          </h4>
          <div className="h-[340px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={analytics.charts.topProducts}
                layout="vertical"
                margin={{ top: 4, right: 12, bottom: 4, left: 10 }}
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                <XAxis type="number" allowDecimals={false} />
                <YAxis
                  type="category"
                  dataKey="label"
                  width={130}
                  tickFormatter={(value) => truncateLabel(value)}
                  tick={{ fill: '#475569', fontSize: 11, fontWeight: 700 }}
                />
                <Tooltip
                  formatter={(value: number, key: string) =>
                    key === 'revenue' ? formatCurrency(value) : formatInt(value)
                  }
                  labelFormatter={(label) => `Produto: ${label}`}
                />
                <Bar dataKey="sales" name="vendas" radius={[0, 8, 8, 0]}>
                  {analytics.charts.topProducts.map((entry, index) => (
                    <Cell
                      key={entry.key || entry.label}
                      fill={COLORS[index % COLORS.length]}
                      fillOpacity={!selectedProduct || selectedProduct.key === entry.key ? 1 : 0.4}
                      stroke={selectedProduct?.key === entry.key ? '#0f172a' : 'transparent'}
                      strokeWidth={selectedProduct?.key === entry.key ? 1.5 : 0}
                      className="cursor-pointer"
                      onClick={() => {
                        if (entry.key) {
                          setSelectedProductKey(entry.key);
                        }
                      }}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {selectedProduct ? (
            <div className="mt-5 border-t border-slate-100 pt-5">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">
                Produto Selecionado
              </p>
              <div className="grid grid-cols-1 md:grid-cols-[140px_1fr] gap-4">
                <div className="bg-slate-50 border border-slate-100 rounded-2xl p-3 flex items-center justify-center">
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
                  <div className="bg-slate-50 border border-slate-100 rounded-xl p-3">
                    <p className="text-[10px] font-black uppercase tracking-wider text-slate-500 mb-2">
                      Horarios que mais vende
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {selectedProduct.topHourSlots.length > 0 ? (
                        selectedProduct.topHourSlots.map((slot) => (
                          <div
                            key={`${selectedProduct.key}-${slot.label}`}
                            className="bg-white border border-slate-200 rounded-xl px-3 py-2"
                          >
                            <p className="text-[10px] font-black text-slate-700">{slot.label}</p>
                            <p className="text-[10px] font-bold text-slate-500 uppercase">
                              {slot.sales} vendas
                            </p>
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
            </div>
          ) : null}
        </div>

        <div className="bg-white rounded-3xl border border-slate-200 p-6">
          <h4 className="text-sm font-black text-slate-900 uppercase tracking-widest mb-4">
            Produto Lider por Dia da Semana
          </h4>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] text-left">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="px-2 py-2 text-[10px] font-black uppercase text-slate-400">Dia</th>
                  <th className="px-2 py-2 text-[10px] font-black uppercase text-slate-400">Produto Lider</th>
                  <th className="px-2 py-2 text-[10px] font-black uppercase text-slate-400 text-right">
                    Qtd
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {analytics.weekdayLeaders.map((entry) => (
                  <tr key={entry.weekdayLabel}>
                    <td className="px-2 py-3 text-xs font-black text-slate-700">{entry.weekdayLabel}</td>
                    <td className="px-2 py-3 text-xs font-bold text-slate-800 uppercase">
                      {entry.productName}
                    </td>
                    <td className="px-2 py-3 text-xs font-black text-slate-700 text-right">{entry.sales}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid grid-cols-2 gap-3 mt-6">
            {analytics.momentsOfDay.map((moment) => (
              <div key={moment.key} className="bg-slate-50 border border-slate-100 rounded-2xl p-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{moment.label}</p>
                <p className="text-xl font-black text-slate-900">{moment.sales}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="bg-white rounded-3xl border border-slate-200 p-6">
          <h4 className="text-sm font-black text-slate-900 uppercase tracking-widest mb-4">
            Top Produtos e Melhor Dia
          </h4>
          <div className="space-y-2 max-h-[320px] overflow-y-auto pr-2 scrollbar-hide">
            {analytics.topProducts.slice(0, 10).map((product) => (
              <div
                key={product.name}
                className="flex items-center justify-between gap-2 bg-slate-50 border border-slate-100 rounded-2xl px-3 py-3"
              >
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

        <div className="bg-white rounded-3xl border border-slate-200 p-6">
          <h4 className="text-sm font-black text-slate-900 uppercase tracking-widest mb-4">
            Melhores e Piores Dias (Calendario)
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-5">
            <div className="bg-green-50 border border-green-100 rounded-2xl p-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-green-600">Melhor Dia</p>
              <p className="text-xl font-black text-green-700 mt-1">{analytics.peaks.bestDayLabel}</p>
              <p className="text-[10px] font-bold uppercase tracking-wider text-green-700">
                {analytics.peaks.bestDaySales} vendas
              </p>
            </div>
            <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-600">Dia Menor</p>
              <p className="text-xl font-black text-slate-800 mt-1">{analytics.peaks.weakestDayLabel}</p>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-700">
                {analytics.peaks.weakestDaySales} vendas
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] text-left">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="px-2 py-2 text-[10px] font-black uppercase text-slate-400">Dia</th>
                  <th className="px-2 py-2 text-[10px] font-black uppercase text-slate-400 text-right">
                    Vendas
                  </th>
                  <th className="px-2 py-2 text-[10px] font-black uppercase text-slate-400 text-right">
                    Faturamento
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {analytics.dayRanking.slice(0, 10).map((entry) => (
                  <tr key={entry.dayKey}>
                    <td className="px-2 py-3 text-xs font-black text-slate-700">{entry.dayLabel}</td>
                    <td className="px-2 py-3 text-xs font-black text-slate-700 text-right">{entry.sales}</td>
                    <td className="px-2 py-3 text-xs font-black text-slate-900 text-right">
                      {formatCurrency(entry.revenue)}
                    </td>
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
