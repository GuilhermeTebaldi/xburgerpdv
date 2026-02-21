export interface FrontIngredient {
  id: string;
  name: string;
  unit: string;
  currentStock: number;
  minStock: number;
  cost: number;
  autoReplenishEnabled?: boolean;
  autoReplenishQuantity?: number;
  imageUrl?: string;
  addonPrice?: number;
  icon?: string;
}

export interface FrontStockEntry {
  id: string;
  ingredientId: string;
  ingredientName: string;
  quantity: number;
  timestamp: Date | string;
  unitCost?: number;
  source?: 'MANUAL' | 'SALE' | 'AUTO_REPLENISH';
  saleId?: string;
}

export interface FrontCleaningMaterial {
  id: string;
  name: string;
  unit: string;
  currentStock: number;
  minStock: number;
  cost: number;
  imageUrl?: string;
}

export interface FrontCleaningStockEntry {
  id: string;
  materialId: string;
  materialName: string;
  quantity: number;
  timestamp: Date | string;
  unitCost?: number;
}

export interface FrontRecipeItem {
  ingredientId: string;
  quantity: number;
}

export interface FrontComboItem {
  productId: string;
  quantity: number;
}

export interface FrontProduct {
  id: string;
  name: string;
  price: number;
  imageUrl: string;
  category: 'Snack' | 'Drink' | 'Side' | 'Combo';
  recipe: FrontRecipeItem[];
  comboItems?: FrontComboItem[];
}

export interface FrontSale {
  id: string;
  productId: string;
  productName: string;
  timestamp: Date | string;
  total: number;
  totalCost: number;
  recipe?: FrontRecipeItem[];
  stockDebited?: FrontRecipeItem[];
  basePrice?: number;
  priceAdjustment?: number;
  baseCost?: number;
}

export interface FrontAppState {
  ingredients: FrontIngredient[];
  products: FrontProduct[];
  sales: FrontSale[];
  stockEntries: FrontStockEntry[];
  cleaningMaterials: FrontCleaningMaterial[];
  cleaningStockEntries: FrontCleaningStockEntry[];
  globalSales: FrontSale[];
  globalCancelledSales: FrontSale[];
  globalStockEntries: FrontStockEntry[];
  globalCleaningStockEntries: FrontCleaningStockEntry[];
}
