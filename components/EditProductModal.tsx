import React, { useEffect, useState } from 'react';
import { Ingredient, Product, RecipeItem } from '../types';

interface EditProductModalProps {
  isOpen: boolean;
  product: Product | null;
  ingredients: Ingredient[];
  onClose: () => void;
  onSave: (product: Product) => void;
}

const EditProductModal: React.FC<EditProductModalProps> = ({
  isOpen,
  product,
  ingredients,
  onClose,
  onSave,
}) => {
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [category, setCategory] = useState<'Snack' | 'Drink' | 'Side'>('Snack');
  const [imageUrl, setImageUrl] = useState('');
  const [recipe, setRecipe] = useState<RecipeItem[]>([]);

  useEffect(() => {
    if (!product) return;
    setName(product.name);
    setPrice(product.price.toString());
    setCategory(product.category);
    setImageUrl(product.imageUrl);
    setRecipe(product.recipe);
  }, [product]);

  if (!isOpen || !product) return null;

  const handleUpdateRecipe = (ingredientId: string, delta: number) => {
    setRecipe(prev => {
      const existing = prev.find(item => item.ingredientId === ingredientId);
      if (existing) {
        const newQty = Math.max(0, existing.quantity + delta);
        if (newQty === 0) {
          return prev.filter(item => item.ingredientId !== ingredientId);
        }
        return prev.map(item => item.ingredientId === ingredientId ? { ...item, quantity: newQty } : item);
      } else if (delta > 0) {
        return [...prev, { ingredientId, quantity: delta }];
      }
      return prev;
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !price || !imageUrl || recipe.length === 0) {
      alert("Preencha todos os campos e adicione pelo menos um ingrediente à receita!");
      return;
    }

    const updated: Product = {
      ...product,
      name,
      price: parseFloat(price),
      category,
      imageUrl,
      recipe,
    };

    onSave(updated);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-md z-[250] flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-2xl rounded-[40px] shadow-2xl overflow-hidden flex flex-col animate-in zoom-in duration-200 max-h-[90vh]">
        <div className="p-6 bg-slate-900 text-white flex justify-between items-center">
          <div>
            <h3 className="text-2xl font-black tracking-tight uppercase">Editar Produto</h3>
            <p className="text-xs font-bold opacity-60 uppercase tracking-widest">Atualizar item do cardápio</p>
          </div>
          <button 
            onClick={onClose}
            className="bg-slate-800 p-2 rounded-full hover:bg-slate-700 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-8 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Nome do Produto</label>
              <input 
                type="text" 
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Ex: X-Mega Bacon"
                className="w-full bg-slate-100 border-none rounded-2xl px-4 py-3 font-bold text-slate-800 focus:ring-2 focus:ring-red-500"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Preço de Venda (R$)</label>
              <input 
                type="number" 
                step="0.01"
                value={price}
                onChange={e => setPrice(e.target.value)}
                placeholder="0.00"
                className="w-full bg-slate-100 border-none rounded-2xl px-4 py-3 font-bold text-slate-800 focus:ring-2 focus:ring-red-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Categoria</label>
              <select 
                value={category}
                onChange={e => setCategory(e.target.value as any)}
                className="w-full bg-slate-100 border-none rounded-2xl px-4 py-3 font-bold text-slate-800 focus:ring-2 focus:ring-red-500 appearance-none cursor-pointer"
              >
                <option value="Snack">Lanche (Burguer)</option>
                <option value="Drink">Bebida</option>
                <option value="Side">Acompanhamento</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">URL da Imagem</label>
              <input 
                type="text" 
                value={imageUrl}
                onChange={e => setImageUrl(e.target.value)}
                placeholder="https://imagem.jpg"
                className="w-full bg-slate-100 border-none rounded-2xl px-4 py-3 font-bold text-slate-800 focus:ring-2 focus:ring-red-500"
              />
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Montagem da Receita (Ingredientes)</label>
              <span className="text-[10px] font-black text-red-500 uppercase">{recipe.length} Itens Selecionados</span>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {ingredients.map(ing => {
                const qty = recipe.find(r => r.ingredientId === ing.id)?.quantity || 0;
                return (
                  <div key={ing.id} className={`p-3 rounded-2xl border-2 transition-all flex items-center justify-between ${qty > 0 ? 'border-red-500 bg-red-50/30' : 'border-slate-100 bg-white'}`}>
                    <div className="flex-1 min-w-0 pr-2">
                      <p className="font-extrabold text-slate-800 text-sm truncate uppercase">{ing.name}</p>
                      <p className="text-[9px] font-bold text-slate-400 uppercase">{ing.unit}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <button 
                        type="button"
                        onClick={() => handleUpdateRecipe(ing.id, -1)}
                        className="w-8 h-8 rounded-xl bg-slate-100 text-slate-500 flex items-center justify-center font-black"
                      >
                        -
                      </button>
                      <span className="font-black text-slate-800 min-w-[15px] text-center">{qty}</span>
                      <button 
                        type="button"
                        onClick={() => handleUpdateRecipe(ing.id, 1)}
                        className="w-8 h-8 rounded-xl bg-red-600 text-white flex items-center justify-center font-black"
                      >
                        +
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="pt-4">
            <button 
              type="submit"
              className="w-full bg-green-600 hover:bg-green-700 text-white py-5 rounded-3xl font-black uppercase tracking-tighter text-xl shadow-xl shadow-green-200 transition-all active:scale-95 flex items-center justify-center gap-3"
            >
              SALVAR ALTERAÇÕES
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default EditProductModal;
