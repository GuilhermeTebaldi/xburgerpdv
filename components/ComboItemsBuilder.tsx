import React, { useMemo } from 'react';

import { ComboItem, Product } from '../types';

interface ComboItemsBuilderProps {
  products: Product[];
  comboItems: ComboItem[];
  onChange: (items: ComboItem[]) => void;
  currentProductId?: string;
}

const ComboItemsBuilder: React.FC<ComboItemsBuilderProps> = ({
  products,
  comboItems,
  onChange,
  currentProductId,
}) => {
  const selectableProducts = useMemo(
    () => products.filter((product) => product.id !== currentProductId),
    [products, currentProductId]
  );

  const productsById = useMemo(
    () => new Map<string, Product>(selectableProducts.map((product): [string, Product] => [product.id, product])),
    [selectableProducts]
  );

  const normalizedItems = useMemo(() => {
    return comboItems.filter((item) => {
      return item.quantity > 0 && productsById.has(item.productId);
    });
  }, [comboItems, productsById]);

  const selectedUnits = useMemo(() => {
    return normalizedItems.reduce((sum, item) => sum + item.quantity, 0);
  }, [normalizedItems]);

  const estimatedBasePrice = useMemo(() => {
    return normalizedItems.reduce((sum, item) => {
      const product = productsById.get(item.productId);
      if (!product) return sum;
      return sum + product.price * item.quantity;
    }, 0);
  }, [normalizedItems, productsById]);

  const updateItemQuantity = (productId: string, delta: number) => {
    const nextById = new Map<string, number>(
      normalizedItems.map((item): [string, number] => [item.productId, item.quantity])
    );
    const nextQuantity = Math.max(0, (nextById.get(productId) || 0) + delta);

    if (nextQuantity === 0) {
      nextById.delete(productId);
    } else {
      nextById.set(productId, nextQuantity);
    }

    const nextItems: ComboItem[] = [...nextById.entries()].map(([id, quantity]) => ({
      productId: id,
      quantity,
    }));

    nextItems.sort((a, b) => {
      const aName = productsById.get(a.productId)?.name || '';
      const bName = productsById.get(b.productId)?.name || '';
      return aName.localeCompare(bName);
    });

    onChange(nextItems);
  };

  const getSelectedQuantity = (productId: string) => {
    return normalizedItems.find((item) => item.productId === productId)?.quantity || 0;
  };

  if (selectableProducts.length === 0) {
    return (
      <div className="rounded-3xl border-2 border-dashed border-slate-200 bg-white p-6 text-center">
        <p className="text-xs font-black uppercase tracking-widest text-slate-500">
          Cadastre produtos antes de montar um combo.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
          Selecione os produtos e quantidades do combo
        </p>
        <div className="flex flex-wrap items-center gap-2 text-[10px] font-black uppercase tracking-widest">
          <span className="rounded-xl bg-slate-100 px-2 py-1 text-slate-500">
            Itens: {normalizedItems.length}
          </span>
          <span className="rounded-xl bg-slate-100 px-2 py-1 text-slate-500">
            Unidades: {selectedUnits}
          </span>
          <span className="rounded-xl bg-red-50 px-2 py-1 text-red-600">
            Base: R$ {estimatedBasePrice.toFixed(2)}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {selectableProducts.map((product) => {
          const quantity = getSelectedQuantity(product.id);
          const isSelected = quantity > 0;

          return (
            <div
              key={product.id}
              className={`p-3 rounded-2xl border-2 transition-all flex items-center justify-between ${
                isSelected ? 'border-red-500 bg-red-50/30' : 'border-slate-100 bg-white'
              }`}
            >
              <div className="flex-1 min-w-0 pr-2">
                <p className="font-extrabold text-slate-800 text-sm truncate uppercase">{product.name}</p>
                <p className="text-[9px] font-bold text-slate-400 uppercase">
                  {product.category} • R$ {product.price.toFixed(2)}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => updateItemQuantity(product.id, -1)}
                  className="qb-btn-touch w-8 h-8 rounded-xl bg-slate-100 text-slate-500 flex items-center justify-center font-black"
                >
                  -
                </button>
                <span className="font-black text-slate-800 min-w-[15px] text-center">{quantity}</span>
                <button
                  type="button"
                  onClick={() => updateItemQuantity(product.id, 1)}
                  className="qb-btn-touch w-8 h-8 rounded-xl bg-red-600 text-white flex items-center justify-center font-black"
                >
                  +
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ComboItemsBuilder;
