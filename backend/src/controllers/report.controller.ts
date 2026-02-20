import type { Request, Response } from 'express';

import { ReportService } from '../services/report.service.js';
import { reportQuerySchema } from '../validators/report.validator.js';

const reportService = new ReportService();

export const reportController = {
  overview: async (req: Request, res: Response) => {
    const payload = reportQuerySchema.parse(req.query);

    const report = await reportService.overview({
      scope: payload.scope,
      sessionId: payload.sessionId,
      from: payload.from,
      to: payload.to,
    });

    res.status(200).json(report);
  },
};
