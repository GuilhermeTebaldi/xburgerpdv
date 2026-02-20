import {
  ProductCategory,
  StockDirection,
  type CleaningMaterial,
  type Ingredient,
  type Product,
  type ProductIngredient,
  type Sale,
  type SaleItem,
  type SaleItemIngredient,
  type StockMovement,
} from '@prisma/client';

import type {
  FrontCleaningMaterial,
  FrontCleaningStockEntry,
  FrontIngredient,
  FrontProduct,
  FrontRecipeItem,
  FrontSale,
  FrontStockEntry,
} from '../types/frontend.js';
import { roundMoney, roundQuantity, toNumber } from '../utils/decimal.js';

const categoryMap: Record<ProductCategory, FrontProduct['category']> = {
  SNACK: 'Snack',
  DRINK: 'Drink',
  SIDE: 'Side',
};

export const toFrontIngredient = (row: Ingredient): FrontIngredient => ({
  id: row.id,
  name: row.name,
  unit: row.unit,
  currentStock: roundQuantity(toNumber(row.currentStock)),
  minStock: roundQuantity(toNumber(row.minStock)),
  cost: roundMoney(toNumber(row.cost)),
  imageUrl: row.imageUrl || undefined,
  addonPrice: row.addonPrice ? roundMoney(toNumber(row.addonPrice)) : undefined,
});

export const toFrontCleaningMaterial = (row: CleaningMaterial): FrontCleaningMaterial => ({
  id: row.id,
  name: row.name,
  unit: row.unit,
  currentStock: roundQuantity(toNumber(row.currentStock)),
  minStock: roundQuantity(toNumber(row.minStock)),
  cost: roundMoney(toNumber(row.cost)),
  imageUrl: row.imageUrl || undefined,
});

export const toFrontRecipe = (rows: Pick<ProductIngredient, 'ingredientId' | 'quantity'>[]): FrontRecipeItem[] => {
  return rows
    .map((item) => ({
      ingredientId: item.ingredientId,
      quantity: roundQuantity(toNumber(item.quantity)),
    }))
    .sort((a, b) => a.ingredientId.localeCompare(b.ingredientId));
};

export const toFrontProduct = (
  row: Product & { recipeItems: Pick<ProductIngredient, 'ingredientId' | 'quantity'>[] }
): FrontProduct => ({
  id: row.id,
  name: row.name,
  price: roundMoney(toNumber(row.price)),
  imageUrl: row.imageUrl,
  category: categoryMap[row.category],
  recipe: toFrontRecipe(row.recipeItems),
});

const toFrontSaleRecipe = (
  saleItemIngredients: Pick<SaleItemIngredient, 'ingredientId' | 'quantity'>[]
): FrontRecipeItem[] => {
  return saleItemIngredients
    .filter((ingredient) => Boolean(ingredient.ingredientId))
    .map((ingredient) => ({
      ingredientId: ingredient.ingredientId as string,
      quantity: roundQuantity(toNumber(ingredient.quantity)),
    }));
};

export const toFrontSale = (
  sale: Sale & {
    items: Array<
      SaleItem & {
        ingredients: Pick<SaleItemIngredient, 'ingredientId' | 'quantity'>[];
      }
    >;
  }
): FrontSale => {
  const firstItem = sale.items[0];
  const recipe = firstItem ? toFrontSaleRecipe(firstItem.ingredients) : [];

  return {
    id: sale.id,
    productId: firstItem?.productId || '',
    productName: firstItem?.productNameSnapshot || 'Venda sem item',
    timestamp: sale.createdAt,
    total: roundMoney(toNumber(sale.totalNet)),
    totalCost: roundMoney(toNumber(sale.totalCost)),
    recipe,
    basePrice: firstItem?.baseUnitPrice ? roundMoney(toNumber(firstItem.baseUnitPrice)) : undefined,
    priceAdjustment: firstItem?.priceAdjustment
      ? roundMoney(toNumber(firstItem.priceAdjustment))
      : undefined,
    baseCost: firstItem?.baseUnitCost ? roundMoney(toNumber(firstItem.baseUnitCost)) : undefined,
  };
};

export const toFrontIngredientEntry = (
  movement: StockMovement & {
    ingredient: { id: string; name: string } | null;
  }
): FrontStockEntry => ({
  id: movement.id,
  ingredientId: movement.ingredient?.id || movement.ingredientId || '',
  ingredientName: movement.ingredient?.name || 'Insumo removido',
  quantity:
    movement.direction === StockDirection.OUT
      ? -roundQuantity(toNumber(movement.quantity))
      : roundQuantity(toNumber(movement.quantity)),
  timestamp: movement.createdAt,
  unitCost: roundMoney(toNumber(movement.unitCost)),
});

export const toFrontCleaningEntry = (
  movement: StockMovement & {
    cleaningMaterial: { id: string; name: string } | null;
  }
): FrontCleaningStockEntry => ({
  id: movement.id,
  materialId: movement.cleaningMaterial?.id || movement.cleaningMaterialId || '',
  materialName: movement.cleaningMaterial?.name || 'Material removido',
  quantity:
    movement.direction === StockDirection.OUT
      ? -roundQuantity(toNumber(movement.quantity))
      : roundQuantity(toNumber(movement.quantity)),
  timestamp: movement.createdAt,
  unitCost: roundMoney(toNumber(movement.unitCost)),
});
