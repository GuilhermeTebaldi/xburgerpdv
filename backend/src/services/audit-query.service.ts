import { prisma } from '../db/prisma.js';

interface AuditListFilters {
  entityName?: string;
  entityId?: string;
  limit?: number;
}

export class AuditQueryService {
  async list(filters: AuditListFilters) {
    const limit = Math.min(Math.max(filters.limit || 50, 1), 500);

    return prisma.auditLog.findMany({
      where: {
        entityName: filters.entityName,
        entityId: filters.entityId,
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }
}
