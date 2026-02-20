import type { NextFunction, Request, Response } from 'express';

import { randomUUID } from 'node:crypto';

const parseOrigin = (value?: string): 'API' | 'SYSTEM' | 'IMPORT' => {
  if (value === 'SYSTEM') return 'SYSTEM';
  if (value === 'IMPORT') return 'IMPORT';
  return 'API';
};

export const requestContextMiddleware = (req: Request, _res: Response, next: NextFunction) => {
  const requestId = req.header('x-request-id')?.trim() || randomUUID();
  const actorUserId = req.header('x-user-id')?.trim() || undefined;
  req.context = {
    requestId,
    origin: parseOrigin(req.header('x-origin')?.trim()),
    actorUserId,
    ipAddress: req.ip,
    userAgent: req.header('user-agent') || undefined,
  };
  next();
};
