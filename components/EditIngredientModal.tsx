import React, { useEffect, useState } from 'react';
import { Ingredient } from '../types';

interface EditIngredientModalProps {
  isOpen: boolean;
  ingredient: Ingredient | null;
  onClose: () => void;
  onSave: (ingredient: Ingredient) => void;
}

const EditIngredientModal: React.FC<EditIngredientModalProps> = ({
  isOpen,
  ingredient,
  onClose,
  onSave,
}) => {
  const [name, setName] = useState('');
  const [unit, setUnit] = useState('un');
  const [minStock, setMinStock] = useState('');
  const [cost, setCost] = useState('');
  const [addonPrice, setAddonPrice] = useState('');
  const [imageUrl, setImageUrl] = useState('');

  useEffect(() => {
    if (!ingredient) return;
    setName(ingredient.name);
    setUnit(ingredient.unit);
    setMinStock(String(ingredient.minStock));
    setCost(String(ingredient.cost));
    setAddonPrice(ingredient.addonPrice !== undefined ? String(ingredient.addonPrice) : '');
    setImageUrl(ingredient.imageUrl ?? '');
  }, [ingredient]);

  if (!isOpen || !ingredient) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !minStock || !cost) {
      alert('Por favor, preencha todos os campos!');
      return;
    }

    const updated: Ingredient = {
      ...ingredient,
      name: name.trim(),
      unit,
      currentStock: ingredient.currentStock,
      minStock: parseFloat(minStock),
      cost: parseFloat(cost),
      addonPrice: addonPrice.trim() ? parseFloat(addonPrice) : undefined,
      imageUrl: imageUrl.trim() ? imageUrl.trim() : undefined,
    };

    onSave(updated);
    onClose();
  };

  return (
    <div className="qb-modal-overlay fixed inset-0 bg-slate-900/90 backdrop-blur-md z-[250] flex items-center justify-center p-4">
      <div className="qb-ingredient-modal bg-white w-full max-w-lg rounded-[40px] shadow-2xl overflow-hidden flex flex-col animate-in zoom-in duration-200">
        <div className="qb-modal-head p-6 bg-slate-800 text-white flex justify-between items-center">
          <div>
            <h3 className="text-2xl font-black tracking-tight uppercase">Editar Ingrediente</h3>
            <p className="text-xs font-bold opacity-60 uppercase tracking-widest">Atualize os dados do estoque</p>
          </div>
          <button 
            onClick={onClose}
            className="qb-btn-touch bg-slate-700 p-2 rounded-full hover:bg-slate-600 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="qb-ingredient-form p-8 space-y-6">
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Nome do Ingrediente</label>
            <input 
              type="text" 
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Ex: Queijo Cheddar"
              className="w-full bg-slate-100 border-none rounded-2xl px-4 py-3 font-bold text-slate-800 focus:ring-2 focus:ring-red-500"
            />
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Unidade de Medida</label>
            <select 
              value={unit}
              onChange={e => setUnit(e.target.value)}
              className="w-full bg-slate-100 border-none rounded-2xl px-4 py-3 font-bold text-slate-800 focus:ring-2 focus:ring-red-500 appearance-none cursor-pointer"
            >
              <option value="un">Unidade (un)</option>
              <option value="kg">Quilo (kg)</option>
              <option value="l">Litro (L)</option>
              <option value="g">Grama (g)</option>
              <option value="fatias">Fatias</option>
              <option value="porções">Porções</option>
              <option value="lata">Lata</option>
              <option value="ml">Mililitros (ml)</option>
            </select>
          </div>

          <div className="qb-ingredient-grid grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Preço de Custo (R$)</label>
              <input 
                type="number" 
                step="0.01"
                value={cost}
                onChange={e => setCost(e.target.value)}
                placeholder="0.00"
                className="w-full bg-slate-100 border-none rounded-2xl px-4 py-3 font-bold text-slate-800 focus:ring-2 focus:ring-red-500"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Estoque Mínimo</label>
              <input 
                type="number" 
                value={minStock}
                onChange={e => setMinStock(e.target.value)}
                placeholder="Ex: 10"
                className="w-full bg-slate-100 border-none rounded-2xl px-4 py-3 font-bold text-slate-800 focus:ring-2 focus:ring-red-500"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Preço de Adicional (R$) por Unidade (opcional)</label>
            <input 
              type="number" 
              step="0.01"
              value={addonPrice}
              onChange={e => setAddonPrice(e.target.value)}
              placeholder="Ex: 2.00"
              className="w-full bg-slate-100 border-none rounded-2xl px-4 py-3 font-bold text-slate-800 focus:ring-2 focus:ring-red-500"
            />
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Link da Foto (opcional)</label>
            <input 
              type="text" 
              value={imageUrl}
              onChange={e => setImageUrl(e.target.value)}
              placeholder="https://imagem.jpg"
              className="w-full bg-slate-100 border-none rounded-2xl px-4 py-3 font-bold text-slate-800 focus:ring-2 focus:ring-red-500"
            />
          </div>

          <div className="pt-4">
            <button 
              type="submit"
              className="qb-btn-touch w-full bg-green-600 hover:bg-green-700 text-white py-5 rounded-3xl font-black uppercase tracking-tighter text-xl shadow-xl shadow-green-200 transition-all active:scale-95 flex items-center justify-center gap-3"
            >
              SALVAR ALTERAÇÕES
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default EditIngredientModal;
