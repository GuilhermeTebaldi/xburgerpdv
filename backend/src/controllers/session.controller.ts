import type { Request, Response } from 'express';

import { SessionService } from '../services/session.service.js';
import { closeSessionSchema } from '../validators/session.validator.js';

const sessionService = new SessionService();

export const sessionController = {
  current: async (_req: Request, res: Response) => {
    const session = await sessionService.getCurrentSession();
    res.status(200).json(session);
  },

  closeCurrent: async (req: Request, res: Response) => {
    const payload = closeSessionSchema.parse(req.body || {});
    const result = await sessionService.closeCurrentSession(payload.nextSession, req.context);
    res.status(200).json(result);
  },
};
