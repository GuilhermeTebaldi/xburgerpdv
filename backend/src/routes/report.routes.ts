import { Router } from 'express';

import { reportController } from '../controllers/report.controller.js';
import { authRequired } from '../middlewares/auth.middleware.js';
import { asyncHandler } from '../utils/async-handler.js';

export const reportRouter = Router();

reportRouter.get('/overview', authRequired, asyncHandler(reportController.overview));
