import assert from 'node:assert/strict';
import test from 'node:test';

import { addDays, toBackupDay, toDateOnlyKey } from './state-backup.utils.js';

test('toBackupDay resolves local day by timezone boundary', () => {
  const reference = new Date('2026-02-21T02:30:00.000Z');

  const saoPauloDay = toBackupDay(reference, 'America/Sao_Paulo');
  const tokyoDay = toBackupDay(reference, 'Asia/Tokyo');

  assert.equal(toDateOnlyKey(saoPauloDay), '2026-02-20');
  assert.equal(toDateOnlyKey(tokyoDay), '2026-02-21');
});

test('addDays shifts dates predictably in UTC timeline', () => {
  const base = new Date('2026-02-21T00:00:00.000Z');
  assert.equal(toDateOnlyKey(addDays(base, -7)), '2026-02-14');
  assert.equal(toDateOnlyKey(addDays(base, 10)), '2026-03-03');
});
