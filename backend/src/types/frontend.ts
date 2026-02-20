export interface FrontIngredient {
  id: string;
  name: string;
  unit: string;
  currentStock: number;
  minStock: number;
  cost: number;
  imageUrl?: string;
  addonPrice?: number;
}

export interface FrontStockEntry {
  id: string;
  ingredientId: string;
  ingredientName: string;
  quantity: number;
  timestamp: Date;
  unitCost?: number;
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
  timestamp: Date;
  unitCost?: number;
}

export interface FrontRecipeItem {
  ingredientId: string;
  quantity: number;
}

export interface FrontProduct {
  id: string;
  name: string;
  price: number;
  imageUrl: string;
  category: 'Snack' | 'Drink' | 'Side';
  recipe: FrontRecipeItem[];
}

export interface FrontSale {
  id: string;
  productId: string;
  productName: string;
  timestamp: Date;
  total: number;
  totalCost: number;
  recipe?: FrontRecipeItem[];
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
