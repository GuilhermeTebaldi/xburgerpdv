import test from 'node:test';
import assert from 'node:assert/strict';

import { toFrontIngredientEntry } from './mappers.service.js';

test('toFrontIngredientEntry maps sale movement metadata to frontend source', () => {
  const entry = toFrontIngredientEntry({
    id: 'st-1',
    targetType: 'INGREDIENT',
    direction: 'OUT',
    reason: 'SALE',
    quantity: 2,
    unitCost: 5,
    totalCost: 10,
    isManual: false,
    note: null,
    sessionId: 'session-1',
    saleId: 'sale-123',
    refundId: null,
    ingredientId: 'i-1',
    cleaningMaterialId: null,
    createdByUserId: null,
    createdAt: new Date('2026-03-05T10:00:00.000Z'),
    updatedAt: new Date('2026-03-05T10:00:00.000Z'),
    ingredient: { id: 'i-1', name: 'Tomate' },
  } as any);

  assert.equal(entry.source, 'SALE');
  assert.equal(entry.saleId, 'sale-123');
  assert.equal(entry.quantity, -2);
});

test('toFrontIngredientEntry keeps manual movement as MANUAL source', () => {
  const entry = toFrontIngredientEntry({
    id: 'st-2',
    targetType: 'INGREDIENT',
    direction: 'OUT',
    reason: 'MANUAL',
    quantity: 3,
    unitCost: 4,
    totalCost: 12,
    isManual: true,
    note: null,
    sessionId: null,
    saleId: null,
    refundId: null,
    ingredientId: 'i-2',
    cleaningMaterialId: null,
    createdByUserId: null,
    createdAt: new Date('2026-03-05T10:00:00.000Z'),
    updatedAt: new Date('2026-03-05T10:00:00.000Z'),
    ingredient: { id: 'i-2', name: 'Alface' },
  } as any);

  assert.equal(entry.source, 'MANUAL');
  assert.equal(entry.saleId, undefined);
  assert.equal(entry.quantity, -3);
});
