import { AsyncStateCommandJobStatus, Prisma, type AsyncStateCommandJob } from '@prisma/client';

import { env } from '../config/env.js';
import { prisma } from '../db/prisma.js';
import type { RequestContext } from '../types/request-context.js';
import { HttpError } from '../utils/http-error.js';
import { AuditService } from './audit.service.js';
import { StateService } from './state.service.js';

const CONFIRM_PAID_COMMAND_TYPE = 'SALE_DRAFT_CONFIRM_PAID';
const RETRYABLE_DB_PRISMA_CODES = new Set(['P1001', 'P1002', 'P1017', 'P2034']);
const RETRYABLE_DB_MESSAGE_HINTS = [
  'database system is starting up',
  'database system is shutting down',
  'database system is in recovery mode',
  "can't reach database server",
  'failed to connect',
  'connection refused',
  'connect timeout',
  'server closed the connection unexpectedly',
  'terminating connection',
  'too many clients',
  'remaining connection slots',
  'connection reset',
  'timeout',
  'timed out',
];

const ACTIVE_JOB_STATUSES: AsyncStateCommandJobStatus[] = [
  AsyncStateCommandJobStatus.PENDING,
  AsyncStateCommandJobStatus.PROCESSING,
  AsyncStateCommandJobStatus.RETRY_PENDING,
];

export interface AsyncConfirmPaidJobSnapshot {
  id: string;
  draftId: string;
  status: AsyncStateCommandJobStatus;
  attemptCount: number;
  maxAttempts: number;
  availableAt: Date;
  createdAt: Date;
  updatedAt: Date;
  finishedAt: Date | null;
  lastError: string | null;
  lastErrorCode: number | null;
  resultVersion: string | null;
}

export interface AsyncConfirmPaidEnqueueResult {
  created: boolean;
  job: AsyncConfirmPaidJobSnapshot;
}

interface NormalizedQueueError {
  message: string;
  statusCode: number | null;
  retryable: boolean;
  details?: unknown;
}

export class AsyncStateCommandQueueService {
  private readonly stateService = new StateService();

  isEnabled(): boolean {
    return env.ASYNC_STATE_COMMAND_QUEUE_ENABLED;
  }

  async enqueueConfirmPaid(
    actorUserId: string,
    input: { draftId: string; commandId?: string },
    context?: RequestContext
  ): Promise<AsyncConfirmPaidEnqueueResult> {
    if (!this.isEnabled()) {
      throw new HttpError(503, 'Fila assíncrona indisponível no servidor.');
    }

    const ownerUserId = await this.stateService.resolveOwnerUserIdForActor(actorUserId);

    return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const existing = await tx.asyncStateCommandJob.findFirst({
        where: {
          ownerUserId,
          draftId: input.draftId,
          commandType: CONFIRM_PAID_COMMAND_TYPE,
          status: { in: ACTIVE_JOB_STATUSES },
        },
        orderBy: { createdAt: 'desc' },
      });

      if (existing) {
        return {
          created: false,
          job: this.toSnapshot(existing),
        };
      }

      const createdJob = await tx.asyncStateCommandJob.create({
        data: {
          ownerUserId,
          actorUserId,
          commandType: CONFIRM_PAID_COMMAND_TYPE,
          draftId: input.draftId,
          commandId: input.commandId?.trim() || null,
          status: AsyncStateCommandJobStatus.PENDING,
          maxAttempts: env.ASYNC_STATE_COMMAND_QUEUE_MAX_ATTEMPTS,
          availableAt: new Date(),
        },
      });

      await new AuditService(tx).log(
        {
          entityName: 'async_state_command_jobs',
          entityId: createdJob.id,
          action: 'ASYNC_STATE_COMMAND_JOB_ENQUEUED',
          metadata: {
            commandType: CONFIRM_PAID_COMMAND_TYPE,
            draftId: input.draftId,
            maxAttempts: env.ASYNC_STATE_COMMAND_QUEUE_MAX_ATTEMPTS,
          },
        },
        context
      );

      return {
        created: true,
        job: this.toSnapshot(createdJob),
      };
    });
  }

  async getJobForActor(actorUserId: string, jobId: string): Promise<AsyncConfirmPaidJobSnapshot> {
    const ownerUserId = await this.stateService.resolveOwnerUserIdForActor(actorUserId);
    const job = await prisma.asyncStateCommandJob.findFirst({
      where: {
        id: jobId,
        ownerUserId,
      },
    });

    if (!job) {
      throw new HttpError(404, 'Job de confirmação assíncrona não encontrado.');
    }

    return this.toSnapshot(job);
  }

  async processDueJobs(maxJobs = env.ASYNC_STATE_COMMAND_QUEUE_BATCH_SIZE): Promise<number> {
    if (!this.isEnabled()) return 0;

    let processed = 0;
    for (let index = 0; index < maxJobs; index += 1) {
      const claimed = await this.claimNextDueJob();
      if (!claimed) {
        break;
      }

      processed += 1;
      await this.processClaimedJob(claimed);
    }

    return processed;
  }

  private async claimNextDueJob() {
    const now = new Date();
    const due = await prisma.asyncStateCommandJob.findFirst({
      where: {
        OR: [
          {
            status: {
              in: [AsyncStateCommandJobStatus.PENDING, AsyncStateCommandJobStatus.RETRY_PENDING],
            },
            availableAt: { lte: now },
            OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }],
          },
          // Recovery path: if a worker crashes after claiming, allow lease-expired jobs to be reclaimed.
          {
            status: AsyncStateCommandJobStatus.PROCESSING,
            leaseUntil: { lt: now },
          },
        ],
      },
      orderBy: [{ availableAt: 'asc' }, { createdAt: 'asc' }],
    });

    if (!due) return null;

    const claimLeaseCondition: Prisma.AsyncStateCommandJobWhereInput =
      due.status === AsyncStateCommandJobStatus.PROCESSING
        ? { leaseUntil: { lt: now } }
        : { OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }] };

    const leaseUntil = new Date(now.getTime() + env.ASYNC_STATE_COMMAND_QUEUE_LEASE_MS);
    const claimed = await prisma.asyncStateCommandJob.updateMany({
      where: {
        id: due.id,
        status: due.status,
        ...claimLeaseCondition,
      },
      data: {
        status: AsyncStateCommandJobStatus.PROCESSING,
        leaseUntil,
        attemptCount: { increment: 1 },
        startedAt: due.startedAt ?? now,
        lastError: null,
        lastErrorCode: null,
        lastErrorDetails: Prisma.JsonNull,
      },
    });

    if (claimed.count === 0) {
      return null;
    }

    return prisma.asyncStateCommandJob.findUnique({ where: { id: due.id } });
  }

  private async processClaimedJob(
    job: AsyncStateCommandJob | null
  ): Promise<void> {
    if (!job) return;

    if (job.commandType !== CONFIRM_PAID_COMMAND_TYPE) {
      await this.failJobPermanently(job.id, {
        message: `Tipo de comando assíncrono não suportado: ${job.commandType}`,
        statusCode: 400,
        retryable: false,
      });
      return;
    }

    const actorUserId = job.actorUserId?.trim();
    if (!actorUserId) {
      await this.failJobPermanently(job.id, {
        message: 'Job sem usuário autor para processar confirmação.',
        statusCode: 401,
        retryable: false,
      });
      return;
    }

    try {
      const snapshot = await this.stateService.applyCommandWithLatestVersion(
        actorUserId,
        {
          type: 'SALE_DRAFT_CONFIRM_PAID',
          draftId: job.draftId,
          commandId: job.commandId || undefined,
        },
        this.toJobContext(job.id, actorUserId)
      );

      await prisma.asyncStateCommandJob.update({
        where: { id: job.id },
        data: {
          status: AsyncStateCommandJobStatus.SUCCEEDED,
          resultVersion: snapshot.version,
          finishedAt: new Date(),
          leaseUntil: null,
          lastError: null,
          lastErrorCode: null,
          lastErrorDetails: Prisma.JsonNull,
        },
      });

      await new AuditService(prisma).log({
        entityName: 'async_state_command_jobs',
        entityId: job.id,
        action: 'ASYNC_STATE_COMMAND_JOB_SUCCEEDED',
        origin: 'SYSTEM',
        metadata: {
          commandType: job.commandType,
          draftId: job.draftId,
          resultVersion: snapshot.version,
          attempts: job.attemptCount,
        },
      });
    } catch (error) {
      const normalized = this.normalizeQueueError(error);
      const canRetry = normalized.retryable && job.attemptCount < job.maxAttempts;

      if (canRetry) {
        const delayMs = this.computeRetryDelay(job.attemptCount);
        const nextAttemptAt = new Date(Date.now() + delayMs);
        await prisma.asyncStateCommandJob.update({
          where: { id: job.id },
          data: {
            status: AsyncStateCommandJobStatus.RETRY_PENDING,
            availableAt: nextAttemptAt,
            leaseUntil: null,
            lastError: normalized.message,
            lastErrorCode: normalized.statusCode,
            lastErrorDetails: this.toInputJsonValue(normalized.details),
          },
        });

        await new AuditService(prisma).log({
          entityName: 'async_state_command_jobs',
          entityId: job.id,
          action: 'ASYNC_STATE_COMMAND_JOB_RETRY_SCHEDULED',
          origin: 'SYSTEM',
          metadata: {
            commandType: job.commandType,
            draftId: job.draftId,
            attempts: job.attemptCount,
            maxAttempts: job.maxAttempts,
            retryAfterMs: delayMs,
            lastError: normalized.message,
            lastErrorCode: normalized.statusCode,
          },
        });
        return;
      }

      await this.failJobPermanently(job.id, normalized, job);
    }
  }

  private async failJobPermanently(
    jobId: string,
    normalized: NormalizedQueueError,
    job?: { commandType: string; draftId: string; attemptCount: number; maxAttempts: number }
  ): Promise<void> {
    await prisma.asyncStateCommandJob.update({
      where: { id: jobId },
      data: {
        status: AsyncStateCommandJobStatus.FAILED_PERMANENT,
        finishedAt: new Date(),
        leaseUntil: null,
        lastError: normalized.message,
        lastErrorCode: normalized.statusCode,
        lastErrorDetails: this.toInputJsonValue(normalized.details),
      },
    });

    await new AuditService(prisma).log({
      entityName: 'async_state_command_jobs',
      entityId: jobId,
      action: 'ASYNC_STATE_COMMAND_JOB_FAILED_PERMANENT',
      origin: 'SYSTEM',
      metadata: {
        commandType: job?.commandType,
        draftId: job?.draftId,
        attempts: job?.attemptCount,
        maxAttempts: job?.maxAttempts,
        lastError: normalized.message,
        lastErrorCode: normalized.statusCode,
      },
    });
  }

  private computeRetryDelay(attemptCount: number): number {
    const safeAttempt = Math.max(1, Math.floor(attemptCount));
    const baseDelay = env.ASYNC_STATE_COMMAND_QUEUE_RETRY_BASE_MS * 2 ** (safeAttempt - 1);
    const cappedDelay = Math.min(baseDelay, env.ASYNC_STATE_COMMAND_QUEUE_RETRY_MAX_MS);
    const jitterWindow = Math.min(800, Math.floor(cappedDelay * 0.2));
    const jitter = jitterWindow > 0 ? Math.floor(Math.random() * (jitterWindow + 1)) : 0;
    return Math.min(cappedDelay + jitter, env.ASYNC_STATE_COMMAND_QUEUE_RETRY_MAX_MS);
  }

  private normalizeQueueError(error: unknown): NormalizedQueueError {
    if (error instanceof HttpError) {
      const retryableStatuses = new Set([408, 412, 425, 429]);
      const detailsPrismaCode = this.readPrismaCode(error.details);
      const retryableByCode = detailsPrismaCode ? RETRYABLE_DB_PRISMA_CODES.has(detailsPrismaCode) : false;
      const retryableByMessage = this.hasRetryableDbHint(error.message) || this.hasRetryableDbHint(error.details);
      const retryable =
        retryableStatuses.has(error.statusCode) ||
        error.statusCode >= 500 ||
        retryableByCode ||
        retryableByMessage;
      const statusCode = retryableByCode || retryableByMessage ? 503 : error.statusCode;
      return {
        message: this.normalizeErrorMessage(error.message),
        statusCode,
        details: this.mergeErrorDetails(error.details, detailsPrismaCode),
        retryable,
      };
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      const prismaCode = this.readPrismaCode(error);
      const isDbUnavailable = prismaCode ? RETRYABLE_DB_PRISMA_CODES.has(prismaCode) : false;
      const retryableByMessage = this.hasRetryableDbHint(error.message);
      return {
        message: this.normalizeErrorMessage(`Erro de banco (${error.code}) ao processar job assíncrono.`),
        statusCode: isDbUnavailable || retryableByMessage ? 503 : 500,
        details: this.mergeErrorDetails(error.meta, prismaCode),
        retryable: true,
      };
    }

    if (error instanceof Prisma.PrismaClientInitializationError) {
      return {
        message: this.normalizeErrorMessage(error.message || 'Banco indisponível temporariamente.'),
        statusCode: 503,
        retryable: true,
      };
    }

    if (error instanceof Error) {
      const retryableByMessage = this.hasRetryableDbHint(error.message);
      return {
        message: this.normalizeErrorMessage(error.message || 'Falha inesperada ao processar job assíncrono.'),
        statusCode: retryableByMessage ? 503 : 500,
        retryable: true,
      };
    }

    return {
      message: 'Falha inesperada ao processar job assíncrono.',
      statusCode: 500,
      retryable: true,
    };
  }

  private readPrismaCode(value: unknown): string | null {
    if (!value || typeof value !== 'object') return null;
    const source = value as { code?: unknown; prismaCode?: unknown };
    const candidate =
      typeof source.prismaCode === 'string'
        ? source.prismaCode
        : typeof source.code === 'string'
          ? source.code
          : '';
    const normalized = candidate.trim().toUpperCase();
    return normalized || null;
  }

  private hasRetryableDbHint(value: unknown): boolean {
    const normalizedMessage =
      typeof value === 'string'
        ? value.trim().toLowerCase()
        : value instanceof Error
          ? value.message.trim().toLowerCase()
          : '';
    if (!normalizedMessage) return false;
    return RETRYABLE_DB_MESSAGE_HINTS.some((hint) => normalizedMessage.includes(hint));
  }

  private mergeErrorDetails(details: unknown, prismaCode: string | null): unknown {
    if (!prismaCode) return details;
    if (!details || typeof details !== 'object' || Array.isArray(details)) {
      return { prismaCode };
    }

    return {
      ...(details as Record<string, unknown>),
      prismaCode,
    };
  }

  private normalizeErrorMessage(value: string): string {
    const normalized = value.trim();
    if (!normalized) return 'Falha ao processar job assíncrono.';
    return normalized.slice(0, 600);
  }

  private toJobContext(jobId: string, actorUserId: string): RequestContext {
    return {
      requestId: `async-state-command-job:${jobId}`,
      origin: 'SYSTEM',
      actorUserId,
    };
  }

  private toSnapshot(
    job: Pick<
      AsyncStateCommandJob,
      | 'id'
      | 'draftId'
      | 'status'
      | 'attemptCount'
      | 'maxAttempts'
      | 'availableAt'
      | 'createdAt'
      | 'updatedAt'
      | 'finishedAt'
      | 'lastError'
      | 'lastErrorCode'
      | 'resultVersion'
    >
  ): AsyncConfirmPaidJobSnapshot {
    return {
      id: job.id,
      draftId: job.draftId,
      status: job.status,
      attemptCount: job.attemptCount,
      maxAttempts: job.maxAttempts,
      availableAt: job.availableAt,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      finishedAt: job.finishedAt,
      lastError: job.lastError,
      lastErrorCode: job.lastErrorCode,
      resultVersion: job.resultVersion,
    };
  }

  private toInputJsonValue(value: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull {
    if (value === undefined || value === null) {
      return Prisma.JsonNull;
    }

    try {
      const normalized = JSON.parse(JSON.stringify(value)) as unknown;
      if (normalized === undefined || normalized === null) {
        return Prisma.JsonNull;
      }
      if (
        typeof normalized === 'string' ||
        typeof normalized === 'number' ||
        typeof normalized === 'boolean' ||
        Array.isArray(normalized) ||
        typeof normalized === 'object'
      ) {
        return normalized as Prisma.InputJsonValue;
      }
    } catch {
      return Prisma.JsonNull;
    }

    return Prisma.JsonNull;
  }
}
