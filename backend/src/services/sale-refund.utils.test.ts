import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildRefundIngredientRows,
  mergeRefundTargets,
  sumRefundIngredientCost,
} from './sale-refund.utils.js';

test('mergeRefundTargets consolidates duplicated sale items', () => {
  const merged = mergeRefundTargets([
    { saleItemId: 'item-a', quantity: 1 },
    { saleItemId: 'item-b', quantity: 2 },
    { saleItemId: 'item-a', quantity: 3 },
  ]);

  assert.deepEqual(merged, [
    { saleItemId: 'item-a', quantity: 4 },
    { saleItemId: 'item-b', quantity: 2 },
  ]);
});

test('buildRefundIngredientRows calculates proportional quantities and line costs', () => {
  const rows = buildRefundIngredientRows(
    [
      {
        saleItemIngredientId: 'row-1',
        ingredientId: 'ing-1',
        ingredientNameSnapshot: 'Pao',
        quantitySold: 0.6,
        unitCost: 10,
      },
      {
        saleItemIngredientId: 'row-2',
        ingredientId: 'ing-2',
        ingredientNameSnapshot: 'Carne',
        quantitySold: 0.4,
        unitCost: 7.5,
      },
    ],
    2,
    1
  );

  assert.deepEqual(rows, [
    {
      saleItemIngredientId: 'row-1',
      ingredientId: 'ing-1',
      ingredientNameSnapshot: 'Pao',
      quantity: 0.3,
      unitCost: 10,
      lineCost: 3,
    },
    {
      saleItemIngredientId: 'row-2',
      ingredientId: 'ing-2',
      ingredientNameSnapshot: 'Carne',
      quantity: 0.2,
      unitCost: 7.5,
      lineCost: 1.5,
    },
  ]);
});

test('sumRefundIngredientCost sums with quantity precision', () => {
  const total = sumRefundIngredientCost([
    {
      saleItemIngredientId: 'row-1',
      ingredientId: 'ing-1',
      ingredientNameSnapshot: 'Queijo',
      quantity: 0.3333,
      unitCost: 3,
      lineCost: 0.9999,
    },
    {
      saleItemIngredientId: 'row-2',
      ingredientId: 'ing-2',
      ingredientNameSnapshot: 'Molho',
      quantity: 0.3333,
      unitCost: 3,
      lineCost: 0.9999,
    },
  ]);

  assert.equal(total, 1.9998);
});
