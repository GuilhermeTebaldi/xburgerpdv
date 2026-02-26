import test from 'node:test';
import assert from 'node:assert/strict';

import type { FrontAppState } from '../types/frontend.js';
import { HttpError } from '../utils/http-error.js';
import { applyStateCommand } from './state-command.service.js';

const createBaseState = (): FrontAppState => ({
  ingredients: [
    { id: 'i-bread', name: 'Pao', unit: 'un', currentStock: 50, minStock: 10, cost: 1.5 },
    { id: 'i-meat', name: 'Carne', unit: 'un', currentStock: 40, minStock: 8, cost: 4.2 },
    { id: 'i-sauce', name: 'Molho', unit: 'g', currentStock: 200, minStock: 30, cost: 0.02 },
  ],
  products: [
    {
      id: 'p-burger',
      name: 'Burger',
      price: 20,
      imageUrl: 'https://example.com/burger.jpg',
      category: 'Snack',
      recipe: [
        { ingredientId: 'i-bread', quantity: 1 },
        { ingredientId: 'i-meat', quantity: 1 },
        { ingredientId: 'i-sauce', quantity: 20 },
      ],
    },
  ],
  sales: [],
  stockEntries: [],
  cleaningMaterials: [
    { id: 'cm-detergent', name: 'Detergente', unit: 'ml', currentStock: 3000, minStock: 500, cost: 0.01 },
  ],
  cleaningStockEntries: [],
  globalSales: [],
  globalCancelledSales: [],
  globalStockEntries: [],
  globalCleaningStockEntries: [],
});

test('sale register and undo keep stock and history consistent', () => {
  const base = createBaseState();
  const sold = applyStateCommand(base, {
    type: 'SALE_REGISTER',
    productId: 'p-burger',
  });

  assert.equal(sold.sales.length, 1);
  assert.equal(sold.globalSales.length, 1);
  assert.equal(sold.stockEntries.length, 3);
  assert.equal(sold.globalStockEntries.length, 3);
  assert.equal(sold.ingredients.find((entry) => entry.id === 'i-bread')?.currentStock, 49);
  assert.equal(sold.ingredients.find((entry) => entry.id === 'i-meat')?.currentStock, 39);
  assert.equal(sold.ingredients.find((entry) => entry.id === 'i-sauce')?.currentStock, 180);

  const undone = applyStateCommand(sold, {
    type: 'SALE_UNDO_LAST',
  });

  assert.equal(undone.sales.length, 0);
  assert.equal(undone.stockEntries.length, 0);
  assert.equal(undone.globalSales.length, 0);
  assert.equal(undone.globalCancelledSales.length, 1);
  assert.equal(undone.ingredients.find((entry) => entry.id === 'i-bread')?.currentStock, 50);
  assert.equal(undone.ingredients.find((entry) => entry.id === 'i-meat')?.currentStock, 40);
  assert.equal(undone.ingredients.find((entry) => entry.id === 'i-sauce')?.currentStock, 200);
});

test('sale register is idempotent when clientSaleId is retried', () => {
  const base = createBaseState();
  const command = {
    type: 'SALE_REGISTER',
    productId: 'p-burger',
    clientSaleId: 'sale-client-001',
  } as const;

  const first = applyStateCommand(base, command);
  const retried = applyStateCommand(first, command);

  assert.equal(retried.sales.length, 1);
  assert.equal(retried.globalSales.length, 1);
  assert.equal(retried.stockEntries.length, 3);
  assert.equal(retried.globalStockEntries.length, 3);
  assert.equal(retried.sales[0]?.id, 'sale-client-001');
  assert.equal(retried.ingredients.find((entry) => entry.id === 'i-bread')?.currentStock, 49);
  assert.equal(retried.ingredients.find((entry) => entry.id === 'i-meat')?.currentStock, 39);
  assert.equal(retried.ingredients.find((entry) => entry.id === 'i-sauce')?.currentStock, 180);
});

test('deleting ingredient updates products recipes without touching unrelated data', () => {
  const base = createBaseState();
  const next = applyStateCommand(base, {
    type: 'INGREDIENT_DELETE',
    ingredientId: 'i-sauce',
  });

  assert.equal(next.ingredients.some((entry) => entry.id === 'i-sauce'), false);
  assert.equal(next.products.length, 1);
  assert.deepEqual(next.products[0].recipe.map((entry) => entry.ingredientId), ['i-bread', 'i-meat']);
});

test('stress: repeated mixed operations never produce negative stocks', () => {
  let state = createBaseState();

  let seed = 42;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };

  for (let index = 0; index < 3000; index += 1) {
    const choice = Math.floor(random() * 5);

    const command =
      choice === 0
        ? ({
            type: 'SALE_REGISTER',
            productId: 'p-burger',
          } as const)
        : choice === 1
          ? ({
              type: 'SALE_UNDO_LAST',
            } as const)
          : choice === 2
            ? ({
                type: 'INGREDIENT_STOCK_MOVE',
                ingredientId: random() > 0.5 ? 'i-bread' : 'i-meat',
                amount: random() > 0.6 ? 1 : -1,
              } as const)
            : choice === 3
              ? ({
                  type: 'CLEANING_STOCK_MOVE',
                  materialId: 'cm-detergent',
                  amount: random() > 0.5 ? 200 : -200,
                } as const)
              : ({
                  type: 'CLEAR_HISTORY',
                } as const);

    try {
      state = applyStateCommand(state, command);
    } catch (error) {
      if (error instanceof HttpError && (error.statusCode === 404 || error.statusCode === 409)) {
        continue;
      }
      throw error;
    }

    state.ingredients.forEach((ingredient) => {
      assert.ok(ingredient.currentStock >= 0, `negative ingredient stock: ${ingredient.id}`);
    });
    state.cleaningMaterials.forEach((material) => {
      assert.ok(material.currentStock >= 0, `negative cleaning stock: ${material.id}`);
    });
  }
});

test('delete archive by ids only removes requested sales', () => {
  let state = createBaseState();
  state = applyStateCommand(state, { type: 'SALE_REGISTER', productId: 'p-burger' });
  state = applyStateCommand(state, { type: 'SALE_REGISTER', productId: 'p-burger' });
  const targetId = state.globalSales[0]?.id;
  assert.ok(targetId);

  const next = applyStateCommand(state, {
    type: 'DELETE_ARCHIVE_SALES',
    saleIds: [targetId as string],
  });

  assert.equal(next.globalSales.some((sale) => sale.id === targetId), false);
  assert.equal(next.sales.length, state.sales.length);
});
