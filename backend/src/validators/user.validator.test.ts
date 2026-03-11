import test from 'node:test';
import assert from 'node:assert/strict';

import {
  COMPANY_PURGE_CONFIRMATION_PHRASE,
  companyBillingSchema,
  companyPurgeSchema,
} from './user.validator.js';

test('companyBillingSchema accepts blocked payload with message and days', () => {
  const payload = companyBillingSchema.parse({
    blocked: true,
    message: 'Regularize seu financeiro para liberar o acesso.',
    blockedDays: 15,
  });

  assert.equal(payload.blocked, true);
  assert.equal(payload.blockedDays, 15);
});

test('companyBillingSchema rejects invalid blockedDays values', () => {
  assert.throws(
    () =>
      companyBillingSchema.parse({
        blocked: true,
        blockedDays: 0,
      }),
    /greater than or equal to 1|at least 1|min/i
  );
});

test('companyPurgeSchema requires double EXCLUIRUSER confirmation', () => {
  const valid = companyPurgeSchema.parse({
    firstConfirmation: COMPANY_PURGE_CONFIRMATION_PHRASE,
    secondConfirmation: COMPANY_PURGE_CONFIRMATION_PHRASE,
  });

  assert.equal(valid.firstConfirmation, COMPANY_PURGE_CONFIRMATION_PHRASE);
  assert.throws(
    () =>
      companyPurgeSchema.parse({
        firstConfirmation: 'EXCLUIR',
        secondConfirmation: COMPANY_PURGE_CONFIRMATION_PHRASE,
      }),
    /EXCLUIRUSER/i
  );
});
