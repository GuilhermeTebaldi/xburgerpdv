import assert from 'node:assert/strict';
import test from 'node:test';
import { AsyncStateCommandJobStatus } from '@prisma/client';

import { prisma } from '../db/prisma.js';
import { HttpError } from '../utils/http-error.js';

type AsyncFn = (...args: unknown[]) => Promise<unknown>;
type QueueServiceLike = {
  processDueJobs: (maxJobs?: number) => Promise<number>;
  enqueueConfirmPaid: (
    actorUserId: string,
    input: { draftId: string; commandId?: string }
  ) => Promise<{ created: boolean; job: { id: string } }>;
};

const loadQueueService = async (): Promise<QueueServiceLike> => {
  process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://user:pass@localhost:5432/xburger_test';
  const module = await import('./async-state-command-queue.service.js');
  return new module.AsyncStateCommandQueueService();
};

const createJobRow = (
  overrides: Partial<{
    id: string;
    ownerUserId: string;
    actorUserId: string | null;
    commandType: string;
    draftId: string;
    commandId: string | null;
    status: AsyncStateCommandJobStatus;
    attemptCount: number;
    maxAttempts: number;
    availableAt: Date;
    leaseUntil: Date | null;
    startedAt: Date | null;
    finishedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }> = {}
) => {
  const now = new Date('2026-03-16T10:00:00.000Z');
  return {
    id: overrides.id ?? 'job-1',
    ownerUserId: overrides.ownerUserId ?? 'owner-1',
    actorUserId: overrides.actorUserId ?? 'actor-1',
    commandType: overrides.commandType ?? 'SALE_DRAFT_CONFIRM_PAID',
    draftId: overrides.draftId ?? 'draft-1',
    commandId: overrides.commandId ?? 'cmd-1',
    status: overrides.status ?? AsyncStateCommandJobStatus.PENDING,
    attemptCount: overrides.attemptCount ?? 0,
    maxAttempts: overrides.maxAttempts ?? 8,
    availableAt: overrides.availableAt ?? now,
    leaseUntil: overrides.leaseUntil ?? null,
    lastError: null,
    lastErrorCode: null,
    lastErrorDetails: null,
    resultVersion: null,
    startedAt: overrides.startedAt ?? null,
    finishedAt: overrides.finishedAt ?? null,
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now,
  };
};

const withMockedQueuePrisma = async (
  mocks: {
    asyncStateCommandJob?: Partial<
      Record<'findFirst' | 'updateMany' | 'findUnique' | 'update' | 'create', AsyncFn>
    >;
    auditLog?: Partial<Record<'create', AsyncFn>>;
    transaction?: AsyncFn;
  },
  run: () => Promise<void>
) => {
  const jobDelegate = prisma.asyncStateCommandJob as unknown as Record<string, AsyncFn>;
  const auditDelegate = prisma.auditLog as unknown as Record<string, AsyncFn>;
  const prismaClient = prisma as unknown as Record<string, AsyncFn>;

  const original = {
    findFirst: jobDelegate.findFirst,
    updateMany: jobDelegate.updateMany,
    findUnique: jobDelegate.findUnique,
    update: jobDelegate.update,
    create: jobDelegate.create,
    auditCreate: auditDelegate.create,
    transaction: prismaClient.$transaction,
  };

  if (mocks.asyncStateCommandJob?.findFirst) jobDelegate.findFirst = mocks.asyncStateCommandJob.findFirst;
  if (mocks.asyncStateCommandJob?.updateMany) jobDelegate.updateMany = mocks.asyncStateCommandJob.updateMany;
  if (mocks.asyncStateCommandJob?.findUnique) jobDelegate.findUnique = mocks.asyncStateCommandJob.findUnique;
  if (mocks.asyncStateCommandJob?.update) jobDelegate.update = mocks.asyncStateCommandJob.update;
  if (mocks.asyncStateCommandJob?.create) jobDelegate.create = mocks.asyncStateCommandJob.create;
  if (mocks.auditLog?.create) auditDelegate.create = mocks.auditLog.create;
  if (mocks.transaction) prismaClient.$transaction = mocks.transaction;

  try {
    await run();
  } finally {
    jobDelegate.findFirst = original.findFirst;
    jobDelegate.updateMany = original.updateMany;
    jobDelegate.findUnique = original.findUnique;
    jobDelegate.update = original.update;
    jobDelegate.create = original.create;
    auditDelegate.create = original.auditCreate;
    prismaClient.$transaction = original.transaction;
  }
};

const withPatchedStateService = async (
  service: QueueServiceLike,
  patch: Partial<{
    resolveOwnerUserIdForActor: (actorUserId: string) => Promise<string>;
    applyCommandWithLatestVersion: (...args: unknown[]) => Promise<unknown>;
  }>,
  run: () => Promise<void>
) => {
  const internals = service as unknown as {
    stateService: {
      resolveOwnerUserIdForActor: (actorUserId: string) => Promise<string>;
      applyCommandWithLatestVersion: (...args: unknown[]) => Promise<unknown>;
    };
  };

  const original = {
    resolveOwnerUserIdForActor: internals.stateService.resolveOwnerUserIdForActor,
    applyCommandWithLatestVersion: internals.stateService.applyCommandWithLatestVersion,
  };

  if (patch.resolveOwnerUserIdForActor) {
    internals.stateService.resolveOwnerUserIdForActor = patch.resolveOwnerUserIdForActor;
  }
  if (patch.applyCommandWithLatestVersion) {
    internals.stateService.applyCommandWithLatestVersion = patch.applyCommandWithLatestVersion;
  }

  try {
    await run();
  } finally {
    internals.stateService.resolveOwnerUserIdForActor = original.resolveOwnerUserIdForActor;
    internals.stateService.applyCommandWithLatestVersion = original.applyCommandWithLatestVersion;
  }
};

test('processDueJobs também considera jobs PROCESSING com lease vencida', async () => {
  const service = await loadQueueService();
  let capturedWhere: unknown = null;

  await withMockedQueuePrisma(
    {
      asyncStateCommandJob: {
        findFirst: async (...args) => {
          const [query] = args as [{ where?: unknown }];
          capturedWhere = query?.where ?? null;
          return null;
        },
      },
    },
    async () => {
      const processed = await service.processDueJobs(1);
      assert.equal(processed, 0);
    }
  );

  const serialized = JSON.stringify(capturedWhere);
  assert.match(serialized, /PROCESSING/);
});

test('processDueJobs agenda retry quando a confirmação assíncrona falha temporariamente', async () => {
  const service = await loadQueueService();
  const dueJob = createJobRow({
    status: AsyncStateCommandJobStatus.PENDING,
    leaseUntil: null,
    attemptCount: 0,
    maxAttempts: 5,
  });
  const claimedJob = createJobRow({
    ...dueJob,
    status: AsyncStateCommandJobStatus.PROCESSING,
    attemptCount: 1,
    leaseUntil: new Date('2026-03-16T10:01:00.000Z'),
  });

  const updateCalls: Array<{ data?: Record<string, unknown> }> = [];

  await withMockedQueuePrisma(
    {
      asyncStateCommandJob: {
        findFirst: async () => dueJob,
        updateMany: async () => ({ count: 1 }),
        findUnique: async () => claimedJob,
        update: async (...args) => {
          const [payload] = args as [{ data?: Record<string, unknown> }];
          updateCalls.push(payload);
          return claimedJob;
        },
      },
      auditLog: {
        create: async () => ({ id: 'audit-1' }),
      },
    },
    async () => {
      await withPatchedStateService(
        service,
        {
          applyCommandWithLatestVersion: async () => {
            throw new HttpError(503, 'Falha temporária no servidor de estado.');
          },
        },
        async () => {
          const processed = await service.processDueJobs(1);
          assert.equal(processed, 1);
        }
      );
    }
  );

  const retryUpdate = updateCalls.find(
    (entry) => entry.data?.status === AsyncStateCommandJobStatus.RETRY_PENDING
  );
  assert.ok(retryUpdate);
  assert.ok(retryUpdate.data?.availableAt instanceof Date);
});

test('processDueJobs marca falha permanente ao esgotar tentativas', async () => {
  const service = await loadQueueService();
  const dueJob = createJobRow({
    status: AsyncStateCommandJobStatus.PENDING,
    leaseUntil: null,
    attemptCount: 2,
    maxAttempts: 3,
  });
  const claimedJob = createJobRow({
    ...dueJob,
    status: AsyncStateCommandJobStatus.PROCESSING,
    attemptCount: 3,
    maxAttempts: 3,
    leaseUntil: new Date('2026-03-16T10:01:00.000Z'),
  });

  const updateCalls: Array<{ data?: Record<string, unknown> }> = [];

  await withMockedQueuePrisma(
    {
      asyncStateCommandJob: {
        findFirst: async () => dueJob,
        updateMany: async () => ({ count: 1 }),
        findUnique: async () => claimedJob,
        update: async (...args) => {
          const [payload] = args as [{ data?: Record<string, unknown> }];
          updateCalls.push(payload);
          return claimedJob;
        },
      },
      auditLog: {
        create: async () => ({ id: 'audit-2' }),
      },
    },
    async () => {
      await withPatchedStateService(
        service,
        {
          applyCommandWithLatestVersion: async () => {
            throw new HttpError(422, 'Regra de negócio inválida.');
          },
        },
        async () => {
          const processed = await service.processDueJobs(1);
          assert.equal(processed, 1);
        }
      );
    }
  );

  const permanentUpdate = updateCalls.find(
    (entry) => entry.data?.status === AsyncStateCommandJobStatus.FAILED_PERMANENT
  );
  assert.ok(permanentUpdate);
  assert.ok(permanentUpdate.data?.finishedAt instanceof Date);
});

test('enqueueConfirmPaid reaproveita job ativo existente e não cria duplicado', async () => {
  const service = await loadQueueService();
  const existingJob = createJobRow({
    id: 'job-existing',
    status: AsyncStateCommandJobStatus.PENDING,
  });

  let createCalled = false;
  let auditCalled = false;

  await withMockedQueuePrisma(
    {
      transaction: async (...args) => {
        const [callback] = args as [
          (tx: {
            asyncStateCommandJob: {
              findFirst: AsyncFn;
              create: AsyncFn;
            };
            auditLog: {
              create: AsyncFn;
            };
          }) => Promise<unknown>,
        ];

        return callback({
          asyncStateCommandJob: {
            findFirst: async () => existingJob,
            create: async () => {
              createCalled = true;
              return existingJob;
            },
          },
          auditLog: {
            create: async () => {
              auditCalled = true;
              return { id: 'audit-3' };
            },
          },
        });
      },
    },
    async () => {
      await withPatchedStateService(
        service,
        {
          resolveOwnerUserIdForActor: async () => 'owner-1',
        },
        async () => {
          const result = await service.enqueueConfirmPaid('actor-1', {
            draftId: 'draft-1',
            commandId: 'cmd-1',
          });

          assert.equal(result.created, false);
          assert.equal(result.job.id, existingJob.id);
        }
      );
    }
  );

  assert.equal(createCalled, false);
  assert.equal(auditCalled, false);
});
