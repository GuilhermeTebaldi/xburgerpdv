import type { Request, Response } from 'express';

import { AuditQueryService } from '../services/audit-query.service.js';

const auditQueryService = new AuditQueryService();

export const auditController = {
  list: async (req: Request, res: Response) => {
    const logs = await auditQueryService.list({
      entityName: typeof req.query.entityName === 'string' ? req.query.entityName : undefined,
      entityId: typeof req.query.entityId === 'string' ? req.query.entityId : undefined,
      limit: typeof req.query.limit === 'string' ? Number(req.query.limit) : undefined,
    });

    res.status(200).json(logs);
  },
};
