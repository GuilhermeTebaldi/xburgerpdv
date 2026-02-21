import { ComboItem, Ingredient, Product, RecipeItem } from '../types';

// Aggregates recipe quantities per ingredient to keep stock debits consistent.
export const aggregateRecipe = (recipe: RecipeItem[] = []): Record<string, number> => {
  const totals: Record<string, number> = {};

  recipe.forEach((item) => {
    if (!item?.ingredientId) return;
    const qty = Number(item.quantity);
    if (!Number.isFinite(qty) || qty <= 0) return;
    totals[item.ingredientId] = (totals[item.ingredientId] || 0) + qty;
  });

  return totals;
};

export const calculateRecipeCost = (
  ingredients: Ingredient[],
  recipe: RecipeItem[] = []
): { totalCost: number; missingIngredientIds: string[]; totals: Record<string, number> } => {
  const totals = aggregateRecipe(recipe);
  let totalCost = 0;
  const missingIngredientIds: string[] = [];

  Object.entries(totals).forEach(([ingredientId, quantity]) => {
    const ing = ingredients.find((i) => i.id === ingredientId);
    if (!ing) {
      missingIngredientIds.push(ingredientId);
      return;
    }
    totalCost += ing.cost * quantity;
  });

  return { totalCost, missingIngredientIds, totals };
};

export interface RecipeStockIssue {
  ingredientId: string;
  ingredientName: string;
  required: number;
  available: number;
  unit: string;
}

export const getRecipeStockIssues = (
  ingredients: Ingredient[],
  totals: Record<string, number>
): RecipeStockIssue[] => {
  const ingredientById = new Map(ingredients.map((ingredient) => [ingredient.id, ingredient]));

  return Object.entries(totals)
    .map(([ingredientId, required]) => {
      const ingredient = ingredientById.get(ingredientId);
      if (!ingredient) return null;

      const available = Number(ingredient.currentStock);
      if (available + Number.EPSILON >= required) return null;

      return {
        ingredientId,
        ingredientName: ingredient.name,
        required,
        available,
        unit: ingredient.unit,
      };
    })
    .filter((issue): issue is RecipeStockIssue => issue !== null);
};

export const buildRecipeFromComboItems = (
  products: Pick<Product, 'id' | 'recipe'>[],
  comboItems: ComboItem[] = []
): RecipeItem[] => {
  const productsById = new Map(products.map((product) => [product.id, product]));
  const totals: Record<string, number> = {};

  comboItems.forEach((item) => {
    const comboQty = Number(item.quantity);
    if (!Number.isFinite(comboQty) || comboQty <= 0) return;

    const sourceProduct = productsById.get(item.productId);
    if (!sourceProduct) return;

    const sourceTotals = aggregateRecipe(sourceProduct.recipe);
    Object.entries(sourceTotals).forEach(([ingredientId, quantity]) => {
      totals[ingredientId] = (totals[ingredientId] || 0) + quantity * comboQty;
    });
  });

  return Object.entries(totals)
    .map(([ingredientId, quantity]) => ({ ingredientId, quantity }))
    .sort((a, b) => a.ingredientId.localeCompare(b.ingredientId));
};
