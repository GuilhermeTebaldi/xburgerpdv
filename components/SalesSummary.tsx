
import React, { useState, useEffect, useRef } from 'react';
import { Sale, Ingredient, StockEntry } from '../types';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { formatStockQuantityByUnit, getRecipeQuantityUnitLabel } from '../utils/recipe';

interface SalesSummaryProps {
  sales: Sale[];
  allIngredients: Ingredient[];
  stockEntries: StockEntry[];
  onClearHistory?: () => void;
}

const SalesSummary: React.FC<SalesSummaryProps> = ({ sales, allIngredients, stockEntries, onClearHistory }) => {
  const [selectedSaleId, setSelectedSaleId] = useState<string | null>(null);
  const [popoverStyle, setPopoverStyle] = useState<React.CSSProperties>({});
  const [isClosing, setIsClosing] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  const productSalesMap = sales.reduce((acc: Record<string, number>, sale: Sale) => {
    acc[sale.productName] = (acc[sale.productName] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const chartData = Object.entries(productSalesMap).map(([name, value]): { name: string; vendas: number } => ({
    name,
    vendas: value as number
  })).sort((a, b) => b.vendas - a.vendas);

  const totalRevenue = sales.reduce((sum, s) => sum + s.total, 0);
  const totalCost = sales.reduce((sum, s) => sum + (s.totalCost || 0), 0);
  const totalProfit = totalRevenue - totalCost;

  const COLORS = ['#ef4444', '#f59e0b', '#3b82f6', '#10b981', '#6366f1', '#ec4899'];

  const handleSaleClick = (e: React.MouseEvent<HTMLButtonElement>, saleId: string) => {
    if (selectedSaleId === saleId) {
      setSelectedSaleId(null);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const isMobile = window.innerWidth < 1024;
    if (isMobile) {
      setPopoverStyle({ position: 'fixed', top: `${rect.bottom + 8}px`, left: '50%', transform: 'translateX(-50%)', width: 'calc(100% - 2rem)', maxWidth: '400px' });
    } else {
      setPopoverStyle({ position: 'fixed', top: `${rect.top}px`, left: `${rect.left - 300}px`, width: '280px' });
    }
    setSelectedSaleId(saleId);
  };

  const handleRestart = () => {
    if (isClosing) return;
    
    // Pequena verificação antes da animação
    if (confirm("Deseja realmente encerrar o dia? O caixa será zerado para uma nova sessão.")) {
      setIsClosing(true);
      
      // Timer para a animação visual antes de limpar os dados
      setTimeout(() => {
        onClearHistory?.();
        setIsClosing(false);
      }, 1000);
    }
  };

  useEffect(() => {
    const handleClose = () => setSelectedSaleId(null);
    window.addEventListener('resize', handleClose);
    const listElement = listRef.current;
    if (listElement) listElement.addEventListener('scroll', handleClose);
    return () => {
      window.removeEventListener('resize', handleClose);
      if (listElement) listElement.removeEventListener('scroll', handleClose);
    };
  }, [selectedSaleId]);

  const selectedSale = sales.find(s => s.id === selectedSaleId);
  const stockOutEntries = stockEntries.filter(entry => entry.quantity < 0);
  const ingredientsById = new Map<string, Ingredient>(
    allIngredients.map((ingredient): [string, Ingredient] => [ingredient.id, ingredient])
  );
  const formatQuantity = (value: number) =>
    Number.isInteger(value) ? String(value) : value.toFixed(3).replace(/\.?0+$/, '');
  const selectedAdjustment = selectedSale?.priceAdjustment ?? (selectedSale?.basePrice !== undefined ? selectedSale.total - selectedSale.basePrice : 0);
  const hasPriceAdjustment = selectedSale !== undefined && Math.abs(selectedAdjustment) > 0.009;
  const basePrice = selectedSale?.basePrice;
  const baseCost = selectedSale?.baseCost;
  const costAdjustment = selectedSale && baseCost !== undefined ? selectedSale.totalCost - baseCost : undefined;

  return (
    <div className={`qb-sales p-4 sm:p-6 max-w-5xl mx-auto space-y-6 relative transition-all duration-700 ease-in-out ${isClosing ? 'scale-95 opacity-0 blur-xl grayscale pointer-events-none' : 'opacity-100 scale-100'}`}>
      <div className="qb-sales-header flex justify-between items-center mb-4">
         <div>
            <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tighter">RELATÓRIO DO DIA</h2>
            <p className="text-xs font-bold text-slate-400">Resumo operacional da sessão atual.</p>
         </div>
         <button 
           onClick={handleRestart}
           disabled={isClosing}
           className={`qb-btn-touch qb-sales-restart bg-slate-900 text-yellow-400 px-6 py-3 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl transition-all active:scale-95 flex items-center gap-2 group ${isClosing ? 'opacity-50' : 'hover:bg-black'}`}
         >
           <svg 
            xmlns="http://www.w3.org/2000/svg" 
            width="16" 
            height="16" 
            viewBox="0 0 24 24" 
            fill="none" 
            stroke="currentColor" 
            strokeWidth="3" 
            strokeLinecap="round" 
            strokeLinejoin="round"
            className={`${isClosing ? 'animate-spin' : 'group-hover:rotate-180 transition-transform duration-500'}`}
           >
            <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
            <path d="M3 3v5h5"/>
           </svg>
           {isClosing ? 'ENCERRANDO...' : 'Fechar Dia / Reiniciar'}
         </button>
      </div>

      <div className="qb-sales-stats grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-red-600 text-white p-6 rounded-3xl shadow-lg">
          <p className="text-[10px] font-bold uppercase tracking-widest opacity-80 mb-1">Receita</p>
          <h4 className="text-3xl font-black">R$ {totalRevenue.toFixed(2)}</h4>
        </div>
        <div className="bg-slate-800 text-white p-6 rounded-3xl shadow-lg">
          <p className="text-[10px] font-bold uppercase tracking-widest opacity-80 mb-1">Custos (Insumos)</p>
          <h4 className="text-3xl font-black">R$ {totalCost.toFixed(2)}</h4>
        </div>
        <div className="bg-green-600 text-white p-6 rounded-3xl shadow-lg">
          <p className="text-[10px] font-bold uppercase tracking-widest opacity-80 mb-1">Lucro</p>
          <h4 className="text-3xl font-black">R$ {totalProfit.toFixed(2)}</h4>
        </div>
        <div className="bg-white p-6 rounded-3xl border-2 border-slate-100 shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Pedidos</p>
          <h4 className="text-3xl font-black text-slate-800">{sales.length}</h4>
        </div>
      </div>

      <div className="qb-sales-main grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        <div className="qb-sales-chart-card bg-white p-6 rounded-3xl border-2 border-slate-100 shadow-sm">
          <h3 className="text-lg font-black text-slate-800 mb-6 uppercase tracking-tight">Vendas por Produto</h3>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} layout="vertical" margin={{ left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                <XAxis type="number" hide />
                <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fontSize: 12, fontWeight: 700, fill: '#475569' }} width={100} />
                <Tooltip cursor={{ fill: '#f8fafc' }} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                <Bar dataKey="vendas" radius={[0, 4, 4, 0]}>
                  {chartData.map((_, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="qb-sales-side space-y-6">
          <div className="qb-sales-list-card bg-white p-6 rounded-3xl border-2 border-slate-100 shadow-sm flex flex-col h-[450px]">
            <h3 className="text-lg font-black text-slate-800 mb-6 uppercase tracking-tight">Últimos Lançamentos</h3>
            <div ref={listRef} className="qb-sales-list-content flex-1 overflow-y-auto space-y-3 pr-2 scrollbar-hide">
              {sales.slice().reverse().map((sale) => (
                <button key={sale.id} onClick={(e) => handleSaleClick(e, sale.id)} className={`qb-btn-touch qb-sales-list-item w-full text-left flex items-center justify-between p-4 rounded-2xl border transition-all active:scale-[0.98] ${selectedSaleId === sale.id ? 'bg-red-600 border-red-700 shadow-lg text-white ring-4 ring-red-100' : 'bg-slate-50 border-slate-100 hover:border-red-400 hover:bg-white'}`}>
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black ${selectedSaleId === sale.id ? 'bg-white text-red-600' : 'bg-white text-red-600 shadow-sm border border-slate-100'}`}>
                      {sale.productName.charAt(0)}
                    </div>
                    <div>
                      <p className={`font-black text-sm truncate max-w-[120px] uppercase tracking-tighter ${selectedSaleId === sale.id ? 'text-white' : 'text-slate-800'}`}>{sale.productName}</p>
                      <p className={`text-[10px] font-bold uppercase tracking-widest ${selectedSaleId === sale.id ? 'text-red-200' : 'text-slate-400'}`}>{sale.timestamp.toLocaleTimeString()}</p>
                      {sale.priceAdjustment !== undefined && Math.abs(sale.priceAdjustment) > 0.009 && (
                        <p className={`text-[9px] font-black uppercase tracking-widest ${selectedSaleId === sale.id ? 'text-yellow-200' : 'text-yellow-500'}`}>
                          Ajuste {sale.priceAdjustment > 0 ? '+' : '-'}R$ {Math.abs(sale.priceAdjustment).toFixed(2)}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`font-black text-sm ${selectedSaleId === sale.id ? 'text-white' : 'text-slate-900'}`}>R$ {sale.total.toFixed(2)}</p>
                  </div>
                </button>
              ))}
              {sales.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full py-24 text-slate-300">
                  <p className="font-black uppercase tracking-widest text-xs">Caixa Aberto / Sem Vendas</p>
                </div>
              )}
            </div>
          </div>

          <div className="qb-sales-stock-card bg-white p-6 rounded-3xl border-2 border-slate-100 shadow-sm flex flex-col h-[320px]">
            <h3 className="text-lg font-black text-slate-800 mb-6 uppercase tracking-tight">Saídas de Estoque</h3>
            <div className="qb-sales-stock-content flex-1 overflow-y-auto space-y-3 pr-2 scrollbar-hide">
              {stockOutEntries.slice().reverse().map((entry) => {
                const ingredient = ingredientsById.get(entry.ingredientId);
                const unit = ingredient?.unit || '';
                const quantityLabel = formatStockQuantityByUnit(unit, Math.abs(entry.quantity));

                return (
                  <div key={entry.id} className="w-full flex items-center justify-between p-4 rounded-2xl border border-slate-100 bg-slate-50">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center font-black bg-red-100 text-red-600">
                        -
                      </div>
                      <div>
                        <p className="font-black text-sm uppercase tracking-tighter text-slate-800">{entry.ingredientName}</p>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{entry.timestamp.toLocaleTimeString()}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-black text-sm text-red-600">
                        -{quantityLabel}{unit ? ` ${unit}` : ''}
                      </p>
                    </div>
                  </div>
                );
              })}
              {stockOutEntries.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full py-16 text-slate-300">
                  <p className="font-black uppercase tracking-widest text-xs">Sem Baixas no Estoque</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {selectedSale && (
        <div style={popoverStyle} className="qb-sales-popover bg-slate-900 text-white p-5 rounded-[32px] shadow-[0_30px_60px_rgba(0,0,0,0.6)] z-[9999] animate-in fade-in zoom-in-95 slide-in-from-right-4 duration-200 border border-slate-700 border-t-red-600 border-t-4 pointer-events-auto">
          <div className="flex items-center justify-between mb-4 border-b border-slate-800 pb-3">
             <div className="flex items-center gap-2">
                <div className="bg-red-600 p-1 rounded-lg">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v10"/><path d="M18.4 6.9 12 12"/><path d="m5.6 6.9 6.4 5.1"/></svg>
                </div>
                <h4 className="text-[10px] font-black uppercase text-red-400 tracking-widest">Insumos</h4>
             </div>
             <button onClick={() => setSelectedSaleId(null)} className="text-slate-500 hover:text-white transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
             </button>
          </div>
          <div className="space-y-1.5 max-h-[160px] overflow-y-auto pr-1 scrollbar-hide">
            {selectedSale.recipe?.map(item => {
              const ing = allIngredients.find(i => i.id === item.ingredientId);
              const recipeUnitLabel = ing ? getRecipeQuantityUnitLabel(ing, item.quantity) : '';
              return (
                <div key={item.ingredientId} className="flex justify-between items-center p-2.5 bg-slate-800/80 rounded-xl border border-slate-700/30 text-[10px]">
                  <span className="font-bold text-slate-100 uppercase truncate max-w-[140px]">{ing ? ing.name : 'Insumo'}</span>
                  <span className="font-black text-yellow-400">{formatQuantity(item.quantity)} {recipeUnitLabel}</span>
                </div>
              );
            })}
          </div>
          <div className="mt-5 pt-3 border-t border-slate-800 flex justify-between items-center">
            <div><p className="text-[8px] font-bold text-slate-500 uppercase">Custo</p><p className="text-sm font-black text-slate-100">R$ {selectedSale.totalCost.toFixed(2)}</p></div>
            <div className="text-right"><p className="text-[8px] font-bold text-green-500 uppercase">Lucro</p><p className="text-sm font-black text-green-500">R$ {(selectedSale.total - selectedSale.totalCost).toFixed(2)}</p></div>
          </div>
          {(basePrice !== undefined || baseCost !== undefined || hasPriceAdjustment) && (
            <div className="mt-3 pt-3 border-t border-slate-800 space-y-1.5 text-[10px] uppercase font-bold">
              {basePrice !== undefined && (
                <div className="flex justify-between text-slate-300">
                  <span>Preço Base</span>
                  <span>R$ {basePrice.toFixed(2)}</span>
                </div>
              )}
              {hasPriceAdjustment && (
                <div className="flex justify-between text-yellow-400">
                  <span>Ajuste no Preço</span>
                  <span>{selectedAdjustment > 0 ? '+' : '-'}R$ {Math.abs(selectedAdjustment).toFixed(2)}</span>
                </div>
              )}
              {costAdjustment !== undefined && Math.abs(costAdjustment) > 0.009 && (
                <div className="flex justify-between text-slate-400">
                  <span>Ajuste de Custo</span>
                  <span>{costAdjustment > 0 ? '+' : '-'}R$ {Math.abs(costAdjustment).toFixed(2)}</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default SalesSummary;
