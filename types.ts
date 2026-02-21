
export interface Ingredient {
  id: string;
  name: string;
  unit: string;
  currentStock: number;
  minStock: number;
  cost: number; // Preço de custo por unidade/unidade de medida
  imageUrl?: string;
  addonPrice?: number; // Preço cobrado por unidade/unidade de medida como adicional
  icon?: string;
}

export interface StockEntry {
  id: string;
  ingredientId: string;
  ingredientName: string;
  quantity: number;
  timestamp: Date;
  unitCost?: number; // custo do insumo no momento da movimentação
}

export interface CleaningMaterial {
  id: string;
  name: string;
  unit: string;
  currentStock: number;
  minStock: number;
  cost: number;
  imageUrl?: string;
}

export interface CleaningStockEntry {
  id: string;
  materialId: string;
  materialName: string;
  quantity: number;
  timestamp: Date;
  unitCost?: number;
}

export interface RecipeItem {
  ingredientId: string;
  quantity: number;
}

export interface ComboItem {
  productId: string;
  quantity: number;
}

export interface Product {
  id: string;
  name: string;
  price: number;
  imageUrl: string;
  category: 'Snack' | 'Drink' | 'Side' | 'Combo';
  recipe: RecipeItem[];
  comboItems?: ComboItem[];
}

export interface Sale {
  id: string;
  productId: string;
  productName: string;
  timestamp: Date;
  total: number;
  totalCost: number; // Soma dos custos dos ingredientes no momento da venda
  recipe?: RecipeItem[]; // Guardamos a receita exata usada para o estorno ser perfeito
  basePrice?: number; // Preço base do produto no momento da venda
  priceAdjustment?: number; // Ajuste aplicado no preço (customizações)
  baseCost?: number; // Custo da receita base no momento da venda
}

export enum ViewMode {
  POS = 'POS',
  INVENTORY = 'INVENTORY',
  REPORTS = 'REPORTS',
  ADMIN = 'ADMIN',
  OTHERS = 'OTHERS',
}
