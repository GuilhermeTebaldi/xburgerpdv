import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_BILLING_BLOCK_MESSAGE,
  resolveBillingBlockSnapshot,
} from './billing-block.service.js';

test('resolveBillingBlockSnapshot returns active block with custom message and remaining days', () => {
  const now = new Date('2026-03-11T12:00:00.000Z');
  const until = new Date('2026-03-26T12:00:00.000Z');

  const snapshot = resolveBillingBlockSnapshot(
    {
      billingBlocked: true,
      billingBlockedMessage: 'Conta em atraso. Regularize até a data limite.',
      billingBlockedUntil: until,
    },
    now
  );

  assert.equal(snapshot.isBlocked, true);
  assert.equal(snapshot.message, 'Conta em atraso. Regularize até a data limite.');
  assert.equal(snapshot.blockedUntil?.toISOString(), until.toISOString());
  assert.equal(snapshot.daysRemaining, 15);
});

test('resolveBillingBlockSnapshot falls back to default message when custom message is blank', () => {
  const snapshot = resolveBillingBlockSnapshot({
    billingBlocked: true,
    billingBlockedMessage: '   ',
    billingBlockedUntil: null,
  });

  assert.equal(snapshot.isBlocked, true);
  assert.equal(snapshot.message, DEFAULT_BILLING_BLOCK_MESSAGE);
  assert.equal(snapshot.daysRemaining, null);
});

test('resolveBillingBlockSnapshot treats expired timed block as not blocked', () => {
  const now = new Date('2026-03-20T10:00:00.000Z');
  const snapshot = resolveBillingBlockSnapshot(
    {
      billingBlocked: true,
      billingBlockedMessage: 'Bloqueado temporariamente.',
      billingBlockedUntil: '2026-03-19T10:00:00.000Z',
    },
    now
  );

  assert.equal(snapshot.isBlocked, false);
  assert.equal(snapshot.daysRemaining, 0);
});
