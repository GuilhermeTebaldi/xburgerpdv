import { Router } from 'express';

import { reportController } from '../controllers/report.controller.js';
import { asyncHandler } from '../utils/async-handler.js';

export const reportRouter = Router();

reportRouter.get('/overview', asyncHandler(reportController.overview));
