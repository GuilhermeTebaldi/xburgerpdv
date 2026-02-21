import { roundQuantity } from '../utils/decimal.js';

export interface RefundTargetInput {
  saleItemId: string;
  quantity: number;
}

export interface RefundIngredientSnapshotInput {
  saleItemIngredientId: string;
  ingredientId: string | null;
  ingredientNameSnapshot: string;
  quantitySold: number;
  unitCost: number;
}

export interface RefundIngredientRow {
  saleItemIngredientId: string;
  ingredientId: string | null;
  ingredientNameSnapshot: string;
  quantity: number;
  unitCost: number;
  lineCost: number;
}

export const mergeRefundTargets = (items: RefundTargetInput[]): RefundTargetInput[] => {
  const grouped = new Map<string, number>();

  items.forEach((item) => {
    grouped.set(item.saleItemId, (grouped.get(item.saleItemId) || 0) + item.quantity);
  });

  return [...grouped.entries()].map(([saleItemId, quantity]) => ({
    saleItemId,
    quantity,
  }));
};

export const buildRefundIngredientRows = (
  ingredients: RefundIngredientSnapshotInput[],
  soldQuantity: number,
  refundQuantity: number
): RefundIngredientRow[] => {
  const proportion = refundQuantity / soldQuantity;

  return ingredients.map((ingredient) => {
    const quantity = roundQuantity(ingredient.quantitySold * proportion);
    const lineCost = roundQuantity(quantity * ingredient.unitCost);

    return {
      saleItemIngredientId: ingredient.saleItemIngredientId,
      ingredientId: ingredient.ingredientId,
      ingredientNameSnapshot: ingredient.ingredientNameSnapshot,
      quantity,
      unitCost: ingredient.unitCost,
      lineCost,
    };
  });
};

export const sumRefundIngredientCost = (rows: RefundIngredientRow[]): number =>
  roundQuantity(rows.reduce((sum, row) => roundQuantity(sum + row.lineCost), 0));
