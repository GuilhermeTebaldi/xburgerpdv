import { ActionOrigin, Prisma, PrismaClient } from '@prisma/client';

import type { RequestContext } from '../types/request-context.js';

export interface AuditInput {
  entityName: string;
  entityId: string;
  action: string;
  origin?: ActionOrigin;
  beforeData?: Prisma.InputJsonValue;
  afterData?: Prisma.InputJsonValue;
  metadata?: Prisma.InputJsonValue;
}

export class AuditService {
  constructor(private readonly db: PrismaClient | Prisma.TransactionClient) {}

  async log(input: AuditInput, context?: RequestContext): Promise<void> {
    await this.db.auditLog.create({
      data: {
        entityName: input.entityName,
        entityId: input.entityId,
        action: input.action,
        origin: input.origin || context?.origin || ActionOrigin.API,
        actorUserId: context?.actorUserId,
        requestId: context?.requestId,
        ipAddress: context?.ipAddress,
        userAgent: context?.userAgent,
        beforeData: input.beforeData,
        afterData: input.afterData,
        metadata: input.metadata,
      },
    });
  }
}
