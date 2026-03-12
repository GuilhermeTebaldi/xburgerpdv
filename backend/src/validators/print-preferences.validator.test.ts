import assert from 'node:assert/strict';
import test from 'node:test';

import { printPreferencesUpdateSchema } from './print-preferences.validator.js';

test('printPreferencesUpdateSchema aceita presets válidos', () => {
  const parsed = printPreferencesUpdateSchema.parse({
    historyClosingPreset: '80x297',
    cashReportPreset: 'PADRAO',
    receiptHistoryPreset: '58x297',
  });

  assert.equal(parsed.historyClosingPreset, '80x297');
  assert.equal(parsed.cashReportPreset, 'PADRAO');
  assert.equal(parsed.receiptHistoryPreset, '58x297');
});

test('printPreferencesUpdateSchema rejeita preset inválido', () => {
  assert.throws(
    () =>
      printPreferencesUpdateSchema.parse({
        historyClosingPreset: '100x297',
      }),
    /Invalid enum value/i
  );
});

test('printPreferencesUpdateSchema permite limpar campo com null', () => {
  const parsed = printPreferencesUpdateSchema.parse({
    receiptHistoryPreset: null,
  });

  assert.equal(parsed.receiptHistoryPreset, null);
});
