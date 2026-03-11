import assert from 'node:assert/strict';
import test from 'node:test';
import { UserRole } from '@prisma/client';

import { prisma } from '../db/prisma.js';
import { UserService } from './user.service.js';

type AsyncFn = (...args: unknown[]) => Promise<unknown>;

const withMockedUserDelegate = async (
  mocks: Partial<Record<'findUnique' | 'findMany' | 'updateMany', AsyncFn>>,
  run: () => Promise<void>
) => {
  const userDelegate = prisma.user as unknown as Record<string, AsyncFn>;
  const original = {
    findUnique: userDelegate.findUnique,
    findMany: userDelegate.findMany,
    updateMany: userDelegate.updateMany,
  };

  if (mocks.findUnique) userDelegate.findUnique = mocks.findUnique;
  if (mocks.findMany) userDelegate.findMany = mocks.findMany;
  if (mocks.updateMany) userDelegate.updateMany = mocks.updateMany;

  try {
    await run();
  } finally {
    userDelegate.findUnique = original.findUnique;
    userDelegate.findMany = original.findMany;
    userDelegate.updateMany = original.updateMany;
  }
};

const adminActor = {
  id: 'actor-admin',
  isActive: true,
  role: UserRole.ADMIN,
};

const companyUsers = [
  {
    id: 'owner-id',
    email: 'manager@empresa.com',
    stateOwnerUserId: 'owner-id',
  },
  {
    id: 'operator-id',
    email: 'operator@empresa.com',
    stateOwnerUserId: 'owner-id',
  },
];

test('setCompanyBilling reactivates users when unblocking company billing', async () => {
  const service = new UserService();
  let updateManyArgs: unknown = null;

  await withMockedUserDelegate(
    {
      findUnique: async () => adminActor,
      findMany: async () => companyUsers,
      updateMany: async (args) => {
        updateManyArgs = args;
        return { count: 2 };
      },
    },
    async () => {
      await service.setCompanyBilling('actor-admin', {
        stateOwnerUserId: 'owner-id',
        blocked: false,
      });
    }
  );

  const payload = updateManyArgs as {
    where: { id: { in: string[] } };
    data: Record<string, unknown>;
  };

  assert.deepEqual(payload.where, { id: { in: ['owner-id', 'operator-id'] } });
  assert.deepEqual(payload.data, {
    billingBlocked: false,
    billingBlockedMessage: null,
    billingBlockedUntil: null,
    isActive: true,
  });
});

test('setCompanyBilling keeps account activity unchanged when applying billing block', async () => {
  const service = new UserService();
  let updateManyArgs: unknown = null;

  await withMockedUserDelegate(
    {
      findUnique: async () => adminActor,
      findMany: async () => companyUsers,
      updateMany: async (args) => {
        updateManyArgs = args;
        return { count: 2 };
      },
    },
    async () => {
      await service.setCompanyBilling('actor-admin', {
        stateOwnerUserId: 'owner-id',
        blocked: true,
        blockedDays: 10,
        message: 'Mensagem de bloqueio de teste.',
      });
    }
  );

  const payload = updateManyArgs as {
    data: {
      billingBlocked: boolean;
      billingBlockedMessage: string;
      billingBlockedUntil: unknown;
      isActive?: boolean;
    };
  };

  assert.equal(payload.data.billingBlocked, true);
  assert.equal(payload.data.billingBlockedMessage, 'Mensagem de bloqueio de teste.');
  assert.ok(payload.data.billingBlockedUntil instanceof Date);
  assert.equal('isActive' in payload.data, false);
});
