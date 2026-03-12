import assert from 'node:assert/strict';
import test from 'node:test';

import { prisma } from '../db/prisma.js';
import { PrintPreferencesService } from './print-preferences.service.js';

type AsyncFn = (...args: unknown[]) => Promise<unknown>;

const withMockedPrintPreferenceDelegate = async (
  mocks: Partial<Record<'findUnique' | 'upsert', AsyncFn>>,
  run: () => Promise<void>
) => {
  const delegate = prisma.userPrintPreference as unknown as Record<string, AsyncFn>;
  const original = {
    findUnique: delegate.findUnique,
    upsert: delegate.upsert,
  };

  if (mocks.findUnique) delegate.findUnique = mocks.findUnique;
  if (mocks.upsert) delegate.upsert = mocks.upsert;

  try {
    await run();
  } finally {
    delegate.findUnique = original.findUnique;
    delegate.upsert = original.upsert;
  }
};

test('getByUserId retorna null quando usuário não possui preferências salvas', async () => {
  const service = new PrintPreferencesService();

  await withMockedPrintPreferenceDelegate(
    {
      findUnique: async () => null,
    },
    async () => {
      const result = await service.getByUserId('user-1');
      assert.deepEqual(result, {
        historyClosingPreset: null,
        cashReportPreset: null,
        receiptHistoryPreset: null,
      });
    }
  );
});

test('updateByUserId atualiza somente os campos enviados no PATCH', async () => {
  const service = new PrintPreferencesService();
  let upsertArgs: unknown = null;

  await withMockedPrintPreferenceDelegate(
    {
      upsert: async (args) => {
        upsertArgs = args;
        return {
          historyClosingPreset: '80x297',
          cashReportPreset: null,
          receiptHistoryPreset: null,
        };
      },
    },
    async () => {
      const result = await service.updateByUserId('user-2', {
        historyClosingPreset: '80x297',
      });

      assert.deepEqual(result, {
        historyClosingPreset: '80x297',
        cashReportPreset: null,
        receiptHistoryPreset: null,
      });
    }
  );

  const payload = upsertArgs as {
    create: Record<string, unknown>;
    update: Record<string, unknown>;
  };
  assert.deepEqual(payload.update, { historyClosingPreset: '80x297' });
  assert.deepEqual(payload.create, {
    userId: 'user-2',
    historyClosingPreset: '80x297',
    cashReportPreset: null,
    receiptHistoryPreset: null,
  });
});
