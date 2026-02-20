import { Router } from 'express';

import { auditController } from '../controllers/audit.controller.js';
import { authRequired } from '../middlewares/auth.middleware.js';
import { asyncHandler } from '../utils/async-handler.js';

export const auditRouter = Router();

auditRouter.get('/logs', authRequired, asyncHandler(auditController.list));
